"""Ingest an Anki collection into data/corpus.db.

Reads a *copy* of the collection — never the live file. Idempotent: rebuilds the
corpus from scratch each run, so it is safe to re-run after every Anki sync.

Usage:
    python tools/ingest_anki.py                      # read the live desktop collection
    python tools/ingest_anki.py --collection X.anki2 # read an exported/unpacked collection
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COLLECTION = Path(os.environ["APPDATA"]) / "Anki2" / "User 1" / "collection.anki2"

FS = "\x1f"  # Anki's field / deck-component separator

TAG_RE = re.compile(r"<[^>]+>")
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
# Keep internal hyphens so кто-то / как-то stay one token.
TOKEN_RE = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")
CLOZE_RE = re.compile(r"\{\{c\d+::(.*?)(?:::[^}]*?)?\}\}", re.S)
NBSP = " "


# --------------------------------------------------------------------------- text

def strip_accents(s: str) -> str:
    """Drop combining stress marks. Core-5000 headwords are stress-marked (а́втор);
    sentence text is not, so nothing matches across decks until these are removed."""
    d = unicodedata.normalize("NFD", s)
    d = d.replace("́", "").replace("̀", "")
    return unicodedata.normalize("NFC", d)


def plain(s: str) -> str:
    """HTML -> readable text."""
    s = SOUND_RE.sub(" ", s)
    s = s.replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ")
    s = TAG_RE.sub(" ", s)
    s = s.replace(NBSP, " ").replace("&nbsp;", " ")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
          .replace("&quot;", '"').replace("&#39;", "'"))
    return re.sub(r"\s+", " ", s).strip()


def fold(form: str) -> str:
    """Lookup key: accent-free, lowercase, ё folded to е (decks are inconsistent about ё)."""
    return strip_accents(form).lower().replace("ё", "е")


def tokenize(text: str):
    """-> [(idx, raw_form, folded_form)] over the Cyrillic tokens of a string."""
    out = []
    for i, m in enumerate(TOKEN_RE.finditer(text)):
        raw = m.group(0)
        out.append((i, raw, fold(raw)))
    return out


def has_cyrillic(s: str) -> bool:
    return TOKEN_RE.search(s) is not None


def first_sound(s: str) -> str | None:
    m = SOUND_RE.search(s or "")
    return m.group(1) if m else None


# ------------------------------------------------------- lingo llama dict blobs

DIV_OPEN_RE = re.compile(r"<div\b", re.I)
DIV_CLOSE_RE = re.compile(r"</div\s*>", re.I)
WORD_DIV_RE = re.compile(r"<div\s+class=['\"]word['\"]\s*>", re.I)
DICT_DIV_RE = re.compile(r"<div\s+class=['\"]dict['\"]\s*>", re.I)
# <p><strong>том</strong> from <strong>тот</strong> — det m<br>
ENTRY_RE = re.compile(
    r"<strong>([^<]+)</strong>"
    r"(?:\s*from\s*<strong>([^<]+)</strong>)?"
    r"\s*(?:—|&mdash;|-)\s*([^<]*)",
    re.I,
)


def split_word_divs(html: str):
    """Pull (token, dict_html) pairs out of a lingo llama sNdict blob.

    The blob is a flat run of <div class="word">TOKEN<div class="dict">…</div></div>.
    Depth-counting rather than regex, because the dict payload contains its own divs.
    """
    pairs = []
    for m in WORD_DIV_RE.finditer(html):
        start = m.end()
        depth, pos = 1, start
        while depth > 0:
            nxt_open = DIV_OPEN_RE.search(html, pos)
            nxt_close = DIV_CLOSE_RE.search(html, pos)
            if not nxt_close:
                break
            if nxt_open and nxt_open.start() < nxt_close.start():
                depth += 1
                pos = nxt_open.end()
            else:
                depth -= 1
                pos = nxt_close.end()
        body = html[start:pos]
        dm = DICT_DIV_RE.search(body)
        if dm:
            token = plain(body[:dm.start()])
            inner = body[dm.end():]
            inner = re.sub(r"</div\s*>\s*$", "", inner, flags=re.I)
        else:
            token, inner = plain(body), ""
        if token:
            pairs.append((token, inner.strip()))
    return pairs


def parse_dict_entries(dict_html: str):
    """-> [(headword, lemma_or_None, pos)] for one token's dictionary payload."""
    entries = []
    for m in ENTRY_RE.finditer(dict_html):
        head = plain(m.group(1))
        lemma = plain(m.group(2)) if m.group(2) else None
        pos = plain(m.group(3))
        if head:
            entries.append((head, lemma, pos))
    return entries


# ------------------------------------------------------------------- translations

TRANS_MAIN_RE = re.compile(r"class=['\"]transMain['\"][^>]*>(.*?)(?:</li>|<li|$)", re.I | re.S)
TRANS_SEC_RE = re.compile(r"class=['\"]transSecondary['\"][^>]*>(.*?)(?:</li>|<li|$)", re.I | re.S)
FOOTNOTE_RE = re.compile(r"<span\s+class=['\"]footnote['\"].*?(?:</span>|$)", re.I | re.S)


def parse_translations(html: str):
    """lingo llama sNtrans -> (main, [secondary…]). Source footnotes are dropped."""
    def clean(chunk: str) -> str:
        return plain(FOOTNOTE_RE.sub(" ", chunk)).strip(" []")

    main = [clean(m.group(1)) for m in TRANS_MAIN_RE.finditer(html)]
    sec = [clean(m.group(1)) for m in TRANS_SEC_RE.finditer(html)]
    main = [m for m in main if m]
    sec = [s for s in sec if s]
    if not main and sec:
        main, sec = sec[:1], sec[1:]
    return (main[0] if main else None), (main[1:] + sec)


# ------------------------------------------------------------------------ schema

SCHEMA = """
drop table if exists decks;
drop table if exists notes;
drop table if exists items;
drop table if exists item_tokens;
drop table if exists llama_dict;
drop table if exists lessons;
drop table if exists paradigms_seed;

create table decks (
  id       integer primary key,
  name     text not null,
  card_count integer not null default 0
);

create table notes (
  id       integer primary key,   -- Anki note id
  guid     text not null,
  notetype text not null,
  deck_id  integer,
  tags     text
);

create table items (
  id        integer primary key,
  kind      text not null,        -- 'vocab' | 'sentence'
  note_id   integer not null references notes(id),
  deck_id   integer,
  slot      text,                 -- which field group this came from: 's1', 'ex2', 'word'
  ru        text not null,        -- Russian, as authored (may carry stress marks)
  ru_plain  text not null,        -- accent-stripped, tag-free
  ru_key    text not null,        -- folded lookup key (matters for stress-marked headwords)
  en        text,                 -- primary translation / meaning
  en_alt    text,                 -- remaining translations, ' | '-joined
  audio     text,                 -- collection.media filename
  parent_id integer references items(id),   -- vocab item an example belongs to
  freq_rank integer,              -- frequency-list position
  ipm       real,                 -- occurrences per million (Core 5000 corpus stat)
  extra     text,                 -- json: etymology, german, verb forms, vocab notes
  dict_html text                  -- original lingo llama payload, kept for reference
);

-- Paradigm tables that shipped inside the Languages on Fire deck. Small, but they
-- show the target rendering, and they seed Phase 2 verification.
create table paradigms_seed (
  note_id  integer not null references notes(id),
  kind     text not null,         -- 'conjugation' | 'declension'
  headword text,
  html     text not null
);

create table item_tokens (
  item_id integer not null references items(id),
  idx     integer not null,
  form    text not null,          -- as it appears
  key     text not null,          -- folded lookup key
  primary key (item_id, idx)
);

create table llama_dict (
  item_id  integer not null references items(id),
  idx      integer not null,
  token    text not null,
  key      text not null,
  headword text not null,
  lemma    text,                  -- set when the blob said "X from Y"
  pos      text
);

create table lessons (
  note_id integer primary key references notes(id),
  step    text,
  kind    text,                   -- 'letter', 'grammar', …
  label   text,
  html    text
);

create index idx_tokens_key on item_tokens(key);
create index idx_items_note on items(note_id);
create index idx_items_kind on items(kind);
create index idx_items_rukey on items(ru_key);
create index idx_items_parent on items(parent_id);
create index idx_llama_key on llama_dict(key);
"""


# ------------------------------------------------------------------------ ingest

class Ingester:
    def __init__(self, src: sqlite3.Connection, out: sqlite3.Connection):
        self.src, self.out = src, out
        self.item_id = 0
        self.stats = {
            "vocab": 0, "sentence": 0, "skipped_no_cyrillic": 0,
            "tokens": 0, "dict_entries": 0, "lessons": 0, "paradigm_seeds": 0,
        }

    # -- helpers ----------------------------------------------------------

    def add_item(self, *, kind, note_id, deck_id, slot, ru, en=None, en_alt=None,
                 audio=None, parent_id=None, freq_rank=None, ipm=None, extra=None,
                 dict_html=None):
        ru_plain = plain(strip_accents(ru))
        if not has_cyrillic(ru_plain):
            self.stats["skipped_no_cyrillic"] += 1
            return None
        self.item_id += 1
        iid = self.item_id
        self.out.execute(
            "insert into items (id, kind, note_id, deck_id, slot, ru, ru_plain, ru_key, en,"
            " en_alt, audio, parent_id, freq_rank, ipm, extra, dict_html)"
            " values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (iid, kind, note_id, deck_id, slot, plain(ru), ru_plain, fold(ru_plain), en,
             " | ".join(en_alt) if en_alt else None, audio, parent_id, freq_rank, ipm,
             json.dumps(extra, ensure_ascii=False) if extra else None, dict_html),
        )
        toks = tokenize(ru_plain)
        self.out.executemany(
            "insert or ignore into item_tokens (item_id, idx, form, key) values (?,?,?,?)",
            [(iid, i, raw, key) for i, raw, key in toks],
        )
        self.stats["tokens"] += len(toks)
        self.stats[kind] += 1
        return iid

    def add_dict(self, item_id, dict_html):
        rows = []
        for idx, (token, payload) in enumerate(split_word_divs(dict_html)):
            key = fold(token)
            for head, lemma, pos in parse_dict_entries(payload):
                rows.append((item_id, idx, token, key, head, lemma, pos))
        if rows:
            self.out.executemany(
                "insert into llama_dict (item_id, idx, token, key, headword, lemma, pos)"
                " values (?,?,?,?,?,?,?)", rows)
            self.stats["dict_entries"] += len(rows)

    # -- notetype adapters -------------------------------------------------

    def do_llama(self, nid, deck_id, f):
        """LlamaNote: 11 sentence slots + an optional grammar/letter lesson."""
        if f.get("infocontent", "").strip():
            self.out.execute(
                "insert or replace into lessons (note_id, step, kind, label, html)"
                " values (?,?,?,?,?)",
                (nid, f.get("step"), f.get("infotype"), plain(f.get("infolabel", "")),
                 f["infocontent"]))
            self.stats["lessons"] += 1

        for n in range(1, 12):
            raw = f.get(f"s{n}raw", "").strip()
            if not raw:
                continue
            main, alts = parse_translations(f.get(f"s{n}trans", ""))
            dict_html = f.get(f"s{n}dict", "").strip()
            iid = self.add_item(
                kind="sentence", note_id=nid, deck_id=deck_id, slot=f"s{n}",
                ru=raw, en=main, en_alt=alts,
                audio=first_sound(f.get(f"s{n}audio", "")),
                dict_html=dict_html or None)
            if iid and dict_html:
                self.add_dict(iid, dict_html)

    def do_vocab(self, nid, deck_id, f):
        """Russian Vocabulary (Core 5000): a headword plus up to four examples."""
        word = f.get("Word", "").strip()
        if not word:
            return
        try:
            freq = int(plain(f.get("Frequency", "")) or 0) or None
        except ValueError:
            freq = None
        parent = self.add_item(
            kind="vocab", note_id=nid, deck_id=deck_id, slot="word",
            ru=word, en=plain(f.get("Meaning", "")) or None,
            audio=first_sound(f.get("Audio", "")), freq_rank=freq)
        if parent is None:
            return
        for n, (exf, traf, audf) in enumerate(
            [("First Exs", "First Tra", "1st Audio"),
             ("Second Exs", "Second Tra", "2nd Audio"),
             ("Third Exs", "Third Tra", "3rd Audio"),
             ("Fourth Exs", "Fourth Tra", "4th Audio")], start=1):
            ex = f.get(exf, "").strip()
            if not ex:
                continue
            self.add_item(
                kind="sentence", note_id=nid, deck_id=deck_id, slot=f"ex{n}",
                ru=ex, en=plain(f.get(traf, "")) or None,
                audio=first_sound(f.get(audf, "")), parent_id=parent, freq_rank=freq)

    def do_core5000(self, nid, deck_id, f):
        """Russian Core 5000: the richest source in the collection.

        Carries a real corpus frequency (IPM), stress-marked and plain variants of
        every string, audio for the headword and all four examples, plus etymology
        and present/future verb forms worth keeping for the word panel.
        """
        word = f.get("Word", "").strip()
        if not word:
            return
        try:
            rank = int(plain(f.get("Index", "")) or 0) or None
        except ValueError:
            rank = None
        try:
            ipm = float(plain(f.get("IPM", "")) or 0) or None
        except ValueError:
            ipm = None

        verb_forms = [f.get(k, "").strip() for k in
                      ("verb_presfut_sg1", "verb_presfut_sg2", "verb_presfut_pl3")]
        extra = {k: v for k, v in {
            "etymology": plain(f.get("Etymology", "")),
            "german": plain(f.get("German", "")),
            "dispersion": plain(f.get("Dispersion", "")),
            "verb_presfut": [v for v in verb_forms if v],
        }.items() if v}

        parent = self.add_item(
            kind="vocab", note_id=nid, deck_id=deck_id, slot="word",
            ru=word, en=plain(f.get("Translation", "")) or None,
            audio=first_sound(f.get("Audio Word", "")),
            freq_rank=rank, ipm=ipm, extra=extra or None)
        if parent is None:
            return
        for n in range(1, 5):
            ex = f.get(f"Sentence {n}", "").strip()
            if not ex:
                continue
            self.add_item(
                kind="sentence", note_id=nid, deck_id=deck_id, slot=f"ex{n}",
                ru=ex, en=plain(f.get(f"Sentence {n} Translation", "")) or None,
                audio=first_sound(f.get(f"Audio Sentence {n}", "")),
                parent_id=parent, freq_rank=rank, ipm=ipm)

    def do_lof(self, nid, deck_id, f, ntname):
        """Languages on Fire: sentence decks that ship their own paradigm tables."""
        if ntname == "LoF Info":
            return
        if ntname == "LoF Alphabet":
            self.out.execute(
                "insert or replace into lessons (note_id, step, kind, label, html)"
                " values (?,?,?,?,?)",
                (nid, f.get("ID"), "letter", plain(f.get("Front", "")),
                 f.get("Pronunciation", "") + f.get("IPA", "")))
            self.stats["lessons"] += 1
            return

        if ntname == "LoF Cloze":
            ru = CLOZE_RE.sub(r"\1", f.get("Text", ""))
            en = f.get("Back", "")
        else:                                   # LoF Standard / Listening / 2 sides
            ru = f.get("Sentence", "")
            en = f.get("Translation", "") or f.get("Back", "")

        for kind, field in (("conjugation", "Conjugation"), ("declension", "Declension")):
            html = f.get(field, "").strip()
            if html:
                self.out.execute(
                    "insert into paradigms_seed (note_id, kind, headword, html)"
                    " values (?,?,?,?)", (nid, kind, plain(html)[:60], html))
                self.stats["paradigm_seeds"] += 1

        extra = {}
        if plain(f.get("Vocabulary", "")):
            extra["vocabulary"] = plain(f.get("Vocabulary", ""))
        if plain(f.get("Comments", "")):
            extra["comments"] = plain(f.get("Comments", ""))

        self.add_item(kind="sentence", note_id=nid, deck_id=deck_id,
                      slot=ntname.replace("LoF ", "lof_").lower().replace(" ", "_"),
                      ru=ru, en=plain(en) or None,
                      audio=first_sound(f.get("Audio", "")), extra=extra or None)

    def do_basic(self, nid, deck_id, f, names):
        """Basic-family notes. Whichever side is Russian becomes the item."""
        front = f.get(names[0], "")
        back = f.get(names[1], "") if len(names) > 1 else ""
        ru, en = (front, back) if has_cyrillic(plain(front)) else (back, front)
        if not has_cyrillic(plain(ru)):
            self.stats["skipped_no_cyrillic"] += 1
            return
        self.add_item(kind="sentence", note_id=nid, deck_id=deck_id, slot="front",
                      ru=ru, en=plain(en) or None, audio=first_sound(front + back))

    # -- driver -----------------------------------------------------------

    def run(self):
        self.out.executescript(SCHEMA)

        for did, name in self.src.execute("select id, name from decks"):
            n = self.src.execute("select count(*) from cards where did=?", (did,)).fetchone()[0]
            self.out.execute("insert into decks (id, name, card_count) values (?,?,?)",
                             (did, name.replace(FS, "::"), n))

        notetypes = dict(self.src.execute("select id, name from notetypes").fetchall())
        fieldnames = {
            ntid: [r[0] for r in self.src.execute(
                "select name from fields where ntid=? order by ord", (ntid,))]
            for ntid in notetypes
        }
        # A note can have cards in several decks; attribute it to its lowest deck id.
        deck_of = dict(self.src.execute("select nid, min(did) from cards group by nid").fetchall())

        for nid, guid, mid, tags, flds in self.src.execute(
                "select id, guid, mid, tags, flds from notes"):
            ntname = notetypes[mid]
            names = fieldnames[mid]
            deck_id = deck_of.get(nid)
            f = dict(zip(names, flds.split(FS)))
            self.out.execute(
                "insert into notes (id, guid, notetype, deck_id, tags) values (?,?,?,?,?)",
                (nid, guid, ntname, deck_id, tags.strip()))

            if ntname == "LlamaNote":
                self.do_llama(nid, deck_id, f)
            elif ntname == "Russian Vocabulary":
                self.do_vocab(nid, deck_id, f)
            elif ntname == "Russian Core 5000":
                self.do_core5000(nid, deck_id, f)
            elif ntname.startswith("LoF "):
                self.do_lof(nid, deck_id, f, ntname)
            elif len(names) >= 2:
                self.do_basic(nid, deck_id, f, names)

        self.out.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", type=Path, default=DEFAULT_COLLECTION)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--media", type=Path, default=None,
                    help="collection.media dir, to report missing audio")
    args = ap.parse_args()

    if not args.collection.exists():
        sys.exit(f"collection not found: {args.collection}")

    # Work on a copy. The live collection may have an open WAL; bring it along.
    work = ROOT / "data" / "_work"
    work.mkdir(parents=True, exist_ok=True)
    copy = work / "collection.anki2"
    shutil.copy2(args.collection, copy)
    for suffix in ("-wal", "-shm"):
        side = args.collection.with_name(args.collection.name + suffix)
        if side.exists():
            shutil.copy2(side, copy.with_name(copy.name + suffix))

    src = sqlite3.connect(copy)
    src.create_collation(
        "unicase", lambda a, b: (a.lower() > b.lower()) - (a.lower() < b.lower()))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        args.out.unlink()
    out = sqlite3.connect(args.out)

    ing = Ingester(src, out)
    ing.run()

    media = args.media or (args.collection.parent / "collection.media")
    missing = 0
    if media.exists():
        have = {p.name for p in media.iterdir()}
        for (fn,) in out.execute("select audio from items where audio is not null"):
            if fn not in have:
                missing += 1

    print(f"wrote {args.out}")
    for k, v in ing.stats.items():
        print(f"  {k:22} {v:>8,}")
    uniq = out.execute("select count(distinct key) from item_tokens").fetchone()[0]
    withaudio = out.execute("select count(*) from items where audio is not null").fetchone()[0]
    print(f"  {'unique token keys':22} {uniq:>8,}")
    print(f"  {'items with audio':22} {withaudio:>8,}  (missing files: {missing:,})")
    out.close()


if __name__ == "__main__":
    main()
