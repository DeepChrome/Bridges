"""Look up a Russian word: lemma, paradigm tables, and your own example sentences.

    python tools/lookup.py себе
    python tools/lookup.py книгу --examples 5
    python tools/lookup.py быть --json
"""

import argparse
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import Panel  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent


def render_table(t, indent="    "):
    cells = [[c if isinstance(c, str) else " / ".join(c) for c in row] for row in t["rows"]]
    widths = [max(len(t["columns"][i]), max((len(r[i]) for r in cells), default=0))
              for i in range(len(t["columns"]))]
    line = indent + "  ".join(h.ljust(w) for h, w in zip(t["columns"], widths))
    print(f"\n{indent}{t['title']}")
    print(line.rstrip())
    print(indent + "  ".join("─" * w for w in widths))
    for r in cells:
        print(indent + "  ".join(c.ljust(w) for c, w in zip(r, widths)).rstrip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("word")
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--examples", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    res = Panel(args.lexicon, args.corpus).resolve(args.word, example_limit=args.examples)

    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return

    print(f"\n═══ {args.word}")
    if not res["candidates"]:
        print("\n  not found in the lexicon\n")
        return

    for i, c in enumerate(res["candidates"]):
        tag = "" if i == 0 else "   (also possible)"
        bits = [b for b in (c["pos"], c["gender"], c["aspect"]) if b]
        print(f"\n  ▸ {c['accented']}  [{', '.join(bits)}]{tag}")
        if c["en"]:
            print(f"      {c['en']}")
        if c["partner"]:
            print(f"      aspect partner: {c['partner']}")
        if not c["is_headword"]:
            print(f"      you typed the {', '.join(c['matched'])} form")
        if i == 0:
            for t in c["tables"]:
                render_table(t)
        elif c["tables"]:
            print(f"      ({c['n_forms']} forms — pass this lemma to see its tables)")

    for v in res.get("in_decks", []):
        rank = f"#{v['rank']}" if v["rank"] else "?"
        ipm = f", {v['ipm']} per million" if v["ipm"] else ""
        print(f"\n  [{v['deck']}] frequency entry {rank}{ipm}: {v['ru']} — {v['en']}")

    ex = res["examples"]
    print(f"\n  ── {len(ex)} sentence(s) from your own decks using this word:")
    for e in ex:
        print(f"\n    [{e['deck']}]  {e['ru']}")
        print(f"      {e['en'] or '(no translation)'}")
        if e["audio"]:
            print(f"      🔊 {e['audio']}")
    print()


if __name__ == "__main__":
    main()
