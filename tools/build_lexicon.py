"""Build data/lexicon.db from the OpenRussian dumps.

Source: https://github.com/Badestrand/russian-dictionary (data behind openrussian.org),
CC BY-SA 4.0. Attribution is required wherever this data is displayed.

Produces three things the app needs:
  lemmas    — headword, POS, gender/aspect/animacy, aspect partner, translations
  paradigm  — every inflected slot of every lemma, stress-marked
  forms     — folded form -> lemma index; this is what makes clicking себе work

    python tools/build_lexicon.py
"""

import argparse
import csv
import re
import sqlite3
import sys
import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "openrussian"

csv.field_size_limit(10_000_000)

VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ"
ACUTE = "́"
# Hand-marked stress for headwords the dump leaves bare (ROADMAP P8.5).
_STRESS_PATH = ROOT / "data" / "curated" / "stress.json"
STRESS = {k: v for k, v in json.loads(_STRESS_PATH.read_text(encoding="utf-8")).items()
          if not k.startswith("_")} if _STRESS_PATH.exists() else {}
# Hand-written English where OpenRussian's is wrong first, garbled or a stub:
# keyed on the bare form, or "bare|pos" when two rows share the spelling. The
# first sense is the quiz prompt, so its order is content.
_GLOSS_PATH = ROOT / "data" / "curated" / "gloss_overrides.json"
GLOSS = {k: v for k, v in json.loads(_GLOSS_PATH.read_text(encoding="utf-8")).items()
         if not k.startswith("_")} if _GLOSS_PATH.exists() else {}
# Words the dump files under the wrong part of speech (ROADMAP P11.5): «справа»
# is an adverb sitting in nouns.csv with an invented feminine declension. Same
# key convention as the glosses.
_POS_PATH = ROOT / "data" / "curated" / "pos_overrides.json"
POS = {k: v for k, v in json.loads(_POS_PATH.read_text(encoding="utf-8")).items()
       if not k.startswith("_")} if _POS_PATH.exists() else {}
POS_USED = set()


def gloss_for(bare, pos, en):
    return GLOSS.get(f"{bare}|{pos}", GLOSS.get(bare, en))


def pos_for(bare, pos):
    """The word's real class, and whether this file's inflection survives.

    It does not: a paradigm read out of nouns.csv is a noun's paradigm, so once
    the word is not a noun the thirteen cells are invented. «справа» is an adverb
    and none of «справы», «справе», «справу» occurs anywhere in the collection.
    """
    for k in (f"{bare}|{pos}", bare):
        if k in POS:
            POS_USED.add(k)
            return POS[k], POS[k] == pos
    return pos, True


def clean_partner(p):
    """OpenRussian joins several partners with ";" and marks stress with an
    apostrophe in them too ("поплы'ть"); one clean list, "; "-joined."""
    parts = [deapostrophe(x.strip()) for x in (p or "").split(";") if x.strip()]
    return "; ".join(parts) or None


def deapostrophe(s: str) -> str:
    """OpenRussian marks stress with an apostrophe after the stressed vowel
    (челове'к). Convert to a real combining acute so it renders as челове́к."""
    out = []
    for ch in s:
        if ch == "'" and out and out[-1] in VOWELS:
            out.append(ACUTE)
        else:
            out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def fold(s: str) -> str:
    """Lookup key — must match tools/ingest_anki.py exactly."""
    d = unicodedata.normalize("NFD", s).replace(ACUTE, "").replace("̀", "")
    return unicodedata.normalize("NFC", d).lower().replace("ё", "е").strip()


CLEAN_RE = re.compile(r"[* ]")


def variants(cell: str):
    """A paradigm cell may hold several accepted forms: 'то'т, того''."""
    cell = CLEAN_RE.sub("", cell or "").strip()
    if not cell or cell == "-":
        return []
    return [v.strip() for v in re.split(r"[,/]", cell) if v.strip()]


SCHEMA = """
drop table if exists lemmas;
drop table if exists paradigm;
drop table if exists forms;
drop table if exists meta;

create table lemmas (
  id        integer primary key,
  bare      text not null,        -- unstressed headword
  key       text not null,        -- folded headword
  accented  text,                 -- stress-marked headword
  pos       text not null,        -- noun | verb | adjective | other
  gender    text,
  animate   integer,
  aspect    text,                 -- imperfective | perfective
  partner   text,                 -- aspect partner (verbs) / counterpart (nouns)
  indeclinable integer,
  sg_only   integer,
  pl_only   integer,
  en        text,
  de        text
);

create table paradigm (
  lemma_id integer not null references lemmas(id),
  slot     text not null,         -- sg_nom, pl_gen, presfut_sg1, decl_f_dat, short_m …
  accented text not null,
  bare     text not null,
  key      text not null
);

create table forms (
  key      text not null,         -- folded inflected form
  lemma_id integer not null references lemmas(id),
  slot     text not null
);

create table meta (k text primary key, v text);

create index idx_forms_key on forms(key);
create index idx_forms_lemma on forms(lemma_id);
create index idx_paradigm_lemma on paradigm(lemma_id);
create index idx_lemmas_key on lemmas(key);
"""

# Which columns of each file are paradigm slots rather than metadata.
NOUN_META = {"bare", "accented", "translations_en", "translations_de", "gender",
             "partner", "animate", "indeclinable", "sg_only", "pl_only"}
VERB_META = {"bare", "accented", "translations_en", "translations_de", "aspect", "partner"}
ADJ_META = {"bare", "accented", "translations_en", "translations_de"}


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class Builder:
    def __init__(self, db):
        self.db = db
        self.next_id = 0
        self.stats = {}

    def load(self, filename, file_pos, meta_cols):
        path = RAW / filename
        if not path.exists():
            print(f"  !! missing {path}")
            return
        n_lemmas = n_forms = n_retyped = 0
        with path.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh, delimiter="\t"):
                bare = CLEAN_RE.sub("", (row.get("bare") or "")).strip()
                if not bare:
                    continue
                pos, keep_paradigm = pos_for(bare, file_pos)
                n_retyped += pos != file_pos
                self.next_id += 1
                lid = self.next_id
                accented = deapostrophe(CLEAN_RE.sub("", row.get("accented") or bare))
                # OpenRussian leaves some headwords unmarked (pronouns, names);
                # data/curated/stress.json fills the ones the curriculum teaches.
                if ACUTE not in unicodedata.normalize("NFD", accented) and "ё" not in accented:
                    accented = STRESS.get(fold(bare), accented)
                self.db.execute(
                    "insert into lemmas (id, bare, key, accented, pos, gender, animate,"
                    " aspect, partner, indeclinable, sg_only, pl_only, en, de)"
                    " values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (lid, bare, fold(bare), accented, pos,
                     row.get("gender") or None, as_int(row.get("animate")),
                     row.get("aspect") or None, clean_partner(row.get("partner")),
                     as_int(row.get("indeclinable")), as_int(row.get("sg_only")),
                     as_int(row.get("pl_only")),
                     gloss_for(bare, pos, (row.get("translations_en") or "").strip() or None),
                     (row.get("translations_de") or "").strip() or None))
                n_lemmas += 1

                # The headword itself is a lookup target.
                seen = set()
                rows_p, rows_f = [], []
                for key_, slot in ((fold(bare), "lemma"),):
                    rows_f.append((key_, lid, slot))
                    seen.add((key_, slot))

                for col, cell in row.items():
                    if col in meta_cols or col is None or not keep_paradigm:
                        continue
                    for v in variants(cell):
                        acc = deapostrophe(v)
                        bare_v = unicodedata.normalize(
                            "NFC", unicodedata.normalize("NFD", acc).replace(ACUTE, ""))
                        k = fold(acc)   # fold the de-apostrophised form, not the raw cell
                        if not k:
                            continue
                        rows_p.append((lid, col, acc, bare_v, k))
                        if (k, col) not in seen:
                            rows_f.append((k, lid, col))
                            seen.add((k, col))
                if rows_p:
                    self.db.executemany(
                        "insert into paradigm (lemma_id, slot, accented, bare, key)"
                        " values (?,?,?,?,?)", rows_p)
                self.db.executemany(
                    "insert into forms (key, lemma_id, slot) values (?,?,?)", rows_f)
                n_forms += len(rows_f)
        self.stats[file_pos] = (n_lemmas, n_forms)
        retyped = f"  ({n_retyped} re-typed)" if n_retyped else ""
        print(f"  {file_pos:<11} {n_lemmas:>7,} lemmas  {n_forms:>9,} form entries{retyped}")


    def load_curated(self, path):
        """Merge hand-authored closed-class paradigms.

        OpenRussian ships pronouns, possessives and preposition variants without
        inflection, which is the entire remaining coverage gap — and it is the most
        frequent vocabulary in the language, so it matters far more than its size.
        """
        if not path.exists():
            print(f"  !! missing {path}")
            return
        import json
        data = json.loads(path.read_text(encoding="utf-8"))
        n_new = n_attached = n_forms = 0

        for e in data["entries"]:
            if "attach_to" in e:
                row = self.db.execute(
                    "select id from lemmas where key=? and pos=? limit 1",
                    (fold(e["attach_to"]), e["pos"])).fetchone()
                if row is None:
                    print(f"  !! attach_to target not found: {e['attach_to']} ({e['pos']})")
                    continue
                lid = row[0]
                n_attached += 1
            else:
                self.next_id += 1
                lid = self.next_id
                bare = unicodedata.normalize(
                    "NFC", unicodedata.normalize("NFD", e["lemma"]).replace(ACUTE, ""))
                accented = e.get("accented", e["lemma"])
                if ACUTE not in unicodedata.normalize("NFD", accented) and "ё" not in accented:
                    accented = STRESS.get(fold(bare), accented)
                self.db.execute(
                    "insert into lemmas (id, bare, key, accented, pos, en)"
                    " values (?,?,?,?,?,?)",
                    (lid, bare, fold(bare), accented, e["pos"],
                     gloss_for(bare, e["pos"], e.get("en"))))
                self.db.execute("insert into forms (key, lemma_id, slot) values (?,?,?)",
                                (fold(bare), lid, "lemma"))
                n_new += 1

            for slot, vals in e["forms"].items():
                for acc in vals:
                    bare_v = unicodedata.normalize(
                        "NFC", unicodedata.normalize("NFD", acc).replace(ACUTE, ""))
                    k = fold(acc)
                    self.db.execute(
                        "insert into paradigm (lemma_id, slot, accented, bare, key)"
                        " values (?,?,?,?,?)", (lid, slot, acc, bare_v, k))
                    if not self.db.execute(
                            "select 1 from forms where key=? and lemma_id=? and slot=?",
                            (k, lid, slot)).fetchone():
                        self.db.execute(
                            "insert into forms (key, lemma_id, slot) values (?,?,?)",
                            (k, lid, slot))
                        n_forms += 1
        print(f"  {'curated':<11} {n_new:>7,} new lemmas, {n_attached} merged"
              f"  {n_forms:>9,} form entries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        args.out.unlink()
    db = sqlite3.connect(args.out)
    db.executescript(SCHEMA)

    b = Builder(db)
    print("building lexicon from OpenRussian…")
    b.load("nouns.csv", "noun", NOUN_META)
    b.load("verbs.csv", "verb", VERB_META)
    b.load("adjectives.csv", "adjective", ADJ_META)
    b.load("others.csv", "other", ADJ_META)
    b.load_curated(ROOT / "data" / "curated" / "function_words.json")

    # A curated decision that no longer matches anything is not harmless: it reads
    # as a fix that is still in force while the word has quietly gone back to its
    # old class. Say so loudly rather than shipping a lie in the comments.
    stale = sorted(set(POS) - POS_USED)
    if stale:
        # Nothing is committed, and the half-built file is removed: a later tool
        # reading a lexicon that stopped half way is worse than no lexicon.
        db.close()
        args.out.unlink(missing_ok=True)
        print(f"\n  !! pos_overrides.json: {len(stale)} entries matched no lemma: "
              + ", ".join(stale))
        return 1

    db.execute("insert into meta (k, v) values (?,?)",
               ("source", "OpenRussian (github.com/Badestrand/russian-dictionary)"))
    db.execute("insert into meta (k, v) values (?,?)", ("license", "CC BY-SA 4.0"))
    db.commit()

    total_l = db.execute("select count(*) from lemmas").fetchone()[0]
    total_f = db.execute("select count(distinct key) from forms").fetchone()[0]
    print(f"\n  total: {total_l:,} lemmas, {total_f:,} distinct lookup forms")

    # Coverage: how much of the actual collection can this resolve?
    if args.corpus.exists():
        db.execute("attach database ? as corpus", (str(args.corpus),))
        covered, total, tok_cov, tok_tot = db.execute("""
            select
              (select count(*) from (select distinct key from corpus.item_tokens
                                     where key in (select key from forms))),
              (select count(distinct key) from corpus.item_tokens),
              (select count(*) from corpus.item_tokens
                 where key in (select key from forms)),
              (select count(*) from corpus.item_tokens)
        """).fetchone()
        print(f"\n  coverage of your collection:")
        print(f"    distinct word forms: {covered:,}/{total:,}  ({covered/total:.1%})")
        print(f"    running text tokens: {tok_cov:,}/{tok_tot:,}  ({tok_cov/tok_tot:.1%})")

    db.close()
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
