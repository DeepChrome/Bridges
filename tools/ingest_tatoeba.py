"""Tatoeba sentences for the dictionary words his own decks never use.

His collection reaches 7,488 of the 45,987 glossed lemmas. The other 38,499 are in
the lexicon with a meaning and a paradigm but no sentence, because they simply do not
occur in his cards. Tatoeba is human-written and human-translated, so it fills that
gap with attested Russian rather than invented Russian.

    python tools/ingest_tatoeba.py              # fetch if needed, then build
    python tools/ingest_tatoeba.py --dry-run    # report coverage, write nothing

Writes data/examples.db, and deliberately NOT data/corpus.db. Both build_topics.py
and build_site.py rank the curriculum by counting rows in corpus.db's item_tokens
with no filter on kind, so a foreign sentence landing there would silently change
which 4,000 lemmas the curriculum is built from and reshuffle the path. The corpus is
his; this is a reference shelf beside it.

Sentences are picked for the target lemma, shortest first, preferring sentences built
from words he has already met — an attested sentence can still be a bad one to show if
it is a long clause of unknown vocabulary.

Sentence text on Tatoeba is CC BY 2.0 FR, which is an attribution obligation, not a
free hand: the credit shipped in the page is required. (Tatoeba *audio* is licensed
per recording and includes NC and ND terms — that is a separate matter handled by
tools/fetch_tatoeba_audio.py, and those terms do not apply here.)
"""

import argparse
import bz2
import sqlite3
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest_anki import fold, tokenize  # noqa: E402

RAW = ROOT / "data" / "raw" / "tatoeba"
BASE = "https://downloads.tatoeba.org/exports/per_language"
DUMPS = {
    "rus_sentences.tsv.bz2": f"{BASE}/rus/rus_sentences.tsv.bz2",
    "rus-eng_links.tsv.bz2": f"{BASE}/rus/rus-eng_links.tsv.bz2",
    "eng_sentences.tsv.bz2": f"{BASE}/eng/eng_sentences.tsv.bz2",
}
SOURCE = "Tatoeba"
LICENCE = "CC BY 2.0 FR"


def ensure_dumps():
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in DUMPS.items():
        dest = RAW / name
        if dest.exists():
            print(f"  have {name}")
            continue
        print(f"  fetching {name} …")
        urllib.request.urlretrieve(url, dest)
        print(f"  got  {name}  {dest.stat().st_size/1_048_576:.1f} MB")


def read_links(path):
    """rus id -> first eng id. Two id columns, many translations per sentence."""
    out = {}
    with bz2.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            a, _, b = line.rstrip("\n").partition("\t")
            if b and a not in out:
                out[a] = b
    return out


def read_sentences(path, wanted=None):
    """id -> text, keeping only ids in `wanted` when given — the English dump is
    2 million rows and we need 700 thousand of them."""
    out = {}
    with bz2.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            if wanted is None or parts[0] in wanted:
                out[parts[0]] = parts[2]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "examples.db")
    ap.add_argument("--max-tokens", type=int, default=14,
                    help="longest sentence to accept (default: 14)")
    ap.add_argument("--min-known", type=float, default=0.5,
                    help="least fraction of tokens that must be words he has met")
    ap.add_argument("--per-lemma", type=int, default=1,
                    help="sentences kept per word (default: 1)")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    print("dumps:")
    ensure_dumps()

    db = sqlite3.connect(f"file:{args.lexicon}?mode=ro", uri=True)
    db.execute("attach database ? as c", (str(args.corpus),))

    glossed = {r[0] for r in db.execute(
        "select id from lemmas where en is not null and en <> ''")}
    reached = {r[0] for r in db.execute("""
        select distinct f.lemma_id from forms f
        join c.item_tokens tk on tk.key = f.key
        join c.items i on i.id = tk.item_id
        where i.kind='sentence' and i.en is not null
    """)}
    targets = glossed - reached

    # Words he has already met, so a candidate sentence can be judged for difficulty.
    studied = {r[0] for r in db.execute("""
        select distinct f.lemma_id from forms f
        join c.item_tokens tk on tk.key = f.key
    """)}

    key_to_lemmas = defaultdict(list)
    for lid, k in db.execute("select lemma_id, key from forms"):
        if lid in glossed:
            key_to_lemmas[k].append(lid)

    print(f"\nglossed lemmas       : {len(glossed):,}")
    print(f"  reached by his decks: {len(glossed & reached):,}")
    print(f"  needing a sentence  : {len(targets):,}")

    print("\nreading dumps …")
    links = read_links(RAW / "rus-eng_links.tsv.bz2")
    eng = read_sentences(RAW / "eng_sentences.tsv.bz2", wanted=set(links.values()))
    rus = read_sentences(RAW / "rus_sentences.tsv.bz2", wanted=set(links))
    print(f"  russian-english pairs: {len(rus):,}")

    # Best sentences per target lemma: shortest first, then most familiar wording.
    best = defaultdict(list)
    considered = 0
    for rid, text in rus.items():
        en_text = eng.get(links.get(rid, ""))
        if not en_text:
            continue
        toks = tokenize(text)
        if not toks or len(toks) > args.max_tokens:
            continue
        lemma_sets = [key_to_lemmas.get(f, ()) for _, _, f in toks]
        known = sum(1 for ls in lemma_sets if any(x in studied for x in ls))
        frac = known / len(toks)
        if frac < args.min_known:
            continue
        considered += 1
        hit = {x for ls in lemma_sets for x in ls if x in targets}
        for lid in hit:
            best[lid].append((len(toks), -frac, rid, text, en_text))

    chosen, seen_ids = {}, {}
    for lid, cands in best.items():
        cands.sort()
        for c in cands[:args.per_lemma]:
            seen_ids[c[2]] = (c[3], c[4], c[0], -c[1])
        chosen[lid] = cands[:args.per_lemma]

    covered = len(chosen)
    text_bytes = sum(len(v[0]) + len(v[1]) for v in seen_ids.values())
    print(f"\n  candidate sentences  : {considered:,}")
    print(f"  words gaining an example: {covered:,} "
          f"({100*covered/len(targets):.1f}% of {len(targets):,})")
    print(f"  sentences kept       : {len(seen_ids):,}")
    print(f"  text                 : {text_bytes/1_048_576:.2f} MB")
    print(f"  dictionary coverage  : {len(glossed & reached):,} -> "
          f"{len(glossed & reached) + covered:,} of {len(glossed):,} "
          f"({100*(len(glossed & reached)+covered)/len(glossed):.1f}%)")

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    if args.out.exists():
        args.out.unlink()
    out = sqlite3.connect(args.out)
    out.executescript("""
        create table items (
            id integer primary key, ru text not null, en text not null,
            ru_key text not null, source text not null, licence text not null,
            tokens integer not null, known real not null);
        create table item_tokens (key text not null, item_id integer not null);
        create table meta (k text primary key, v text not null);
    """)
    rows = []
    for rid, (ru_text, en_text, ntok, frac) in seen_ids.items():
        rows.append((int(rid), ru_text, en_text, fold(ru_text), SOURCE, LICENCE,
                     ntok, round(frac, 3)))
    out.executemany("insert into items values (?,?,?,?,?,?,?,?)", rows)

    tok_rows = []
    for rid, (ru_text, _, _, _) in seen_ids.items():
        for _, _, f in tokenize(ru_text):
            tok_rows.append((f, int(rid)))
    out.executemany("insert into item_tokens values (?,?)", tok_rows)
    out.executescript("create index ix_tok on item_tokens(key);")
    out.executemany("insert into meta values (?,?)", [
        ("source", SOURCE), ("licence", LICENCE),
        ("url", "https://tatoeba.org"),
        ("max_tokens", str(args.max_tokens)),
        ("min_known", str(args.min_known)),
        ("per_lemma", str(args.per_lemma)),
    ])
    out.commit()
    out.close()

    print(f"\nwrote {args.out}")
    print(f"  sentences  : {len(rows):,}")
    print(f"  token rows : {len(tok_rows):,}")
    print(f"  size       : {args.out.stat().st_size/1_048_576:.2f} MB")
    print(f"  licence    : {LICENCE} — attribution is required in the page")


if __name__ == "__main__":
    main()
