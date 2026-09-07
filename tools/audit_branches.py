"""Every branch unit's words with their glosses and the sense that placed them, for
a human to read. Coverage is not the objective (CLAUDE.md §28); a word in the
wrong unit is worse than a word on the spine, and only a reader can tell that
театр does not belong in Home. Findings become OVERRIDES in build_topics.py.

    python tools/audit_branches.py            # everything
    python tools/audit_branches.py food home  # some units
"""

import argparse
import io
import sqlite3
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("units", nargs="*")
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    args = ap.parse_args()

    t = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    t.execute("attach database ? as lx", (str(args.lexicon),))
    units = [r for r in t.execute(
        "select id, name from topics where kind='branch' order by ord")
        if not args.units or r[0] in args.units]
    total = 0
    for tid, name in units:
        rows = t.execute("""
            select l.bare, l.pos, l.en, u.reason from unit_words u
            join lx.lemmas l on l.id = u.lemma_id
            where u.topic_id = ? order by u.ord""", (tid,)).fetchall()
        total += len(rows)
        print(f"\n== {tid} ({name}) — {len(rows)} words")
        for bare, pos, en, why in rows:
            gloss = (en or "").replace("\n", " ")
            print(f"  {bare:<16} {pos or '':<10} [{why}]  {gloss[:70]}")
    print(f"\n{len(units)} units, {total} words")


if __name__ == "__main__":
    main()
