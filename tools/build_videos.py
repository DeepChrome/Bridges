"""Match Easy Russian videos to study units.

Reuses the topic keyword sets from build_topics.py so a video and a vocabulary unit
are judged against the same vocabulary of ideas — there is no second taxonomy to keep
in sync.

Scoring is deliberately conservative: a video is attached only when its title matches
a unit's keywords clearly. Units with no confident match get no video rather than a
loose one, and the report says how many.

    python tools/build_videos.py
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

# reconfigure, not a fresh TextIOWrapper: build_topics wraps sys.stdout at import
# time, and wrapping the same buffer twice closes it out from under the first.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_topics import RULES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Series aimed at beginners, used for the frequency-ordered Core stages which have no
# topic of their own.
BEGINNER_RE = re.compile(r"super easy russian", re.I)

# Titles that are channel business rather than teaching material.
SKIP_RE = re.compile(r"\b(trailer|announcement|q&a|behind the scenes|patreon|"
                     r"livestream|shorts)\b", re.I)

# Keyword matching gets these wrong: "city" pulled a video about a Latvian city
# rather than town vocabulary, and "photos" pulled a family album into Technology.
# Same convention as OVERRIDES in build_topics.py — curate the misses, don't bend
# the rules around them.
OVERRIDES = {
    "city": "TBI1dEe_X5E",   # Learn to Talk About Your Neighbourhood in Russian
    "tech": "p9XNf1EFz98",   # Laptop, App and Other Words Russians Call Differently
}

STOP = set("""the a an and or of in on at to for with about from is are was were be
been being this that these those it its as by how why what when where who russian
russia russians people easy super vs your you we our my""".split())


def tokens(text):
    return [w for w in re.findall(r"[a-z']+", text.lower()) if w not in STOP and len(w) > 2]


def score_title(title, keywords):
    """How strongly a title matches one topic's keyword set."""
    words = tokens(title)
    if not words:
        return 0
    hits = sum(1 for w in words if w in keywords)
    # Also catch singular/plural drift ("jobs" vs "job").
    hits += sum(1 for w in words if w.endswith("s") and w[:-1] in keywords)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", type=Path,
                    default=ROOT / "data" / "raw" / "youtube" / "easyrussian.tsv")
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "videos.json")
    ap.add_argument("--min-score", type=int, default=1)
    args = ap.parse_args()

    rows = []
    for line in args.videos.read_text(encoding="utf-8").splitlines():
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2 or not parts[0].strip():
            continue
        vid, title = parts[0].strip(), parts[1].strip()
        dur = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        if SKIP_RE.search(title):
            continue
        rows.append({"id": vid, "title": title, "dur": dur})
    print(f"{len(rows)} teaching videos considered")

    kw = {tid: set(words) for tid, _, words in RULES}

    db = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    units = db.execute("select id, name, kind, ord from topics order by ord").fetchall()
    db.close()

    # Rank every (video, topic) pair once, then hand each unit its best unused video so
    # two units never advertise the same clip.
    ranked = []
    for v in rows:
        for tid, words in kw.items():
            s = score_title(v["title"], words)
            if s >= args.min_score:
                ranked.append((s, tid, v))
    ranked.sort(key=lambda x: (-x[0], x[2]["title"]))

    by_id = {v["id"]: v for v in rows}
    taken, assigned = set(), {}
    for tid, vid in OVERRIDES.items():
        v = by_id.get(vid)
        if v:
            assigned[tid] = dict(v, score=99)
            taken.add(vid)
        else:
            print(f"  !! override video not in the listing: {vid} ({tid})")

    for s, tid, v in ranked:
        if tid in assigned or v["id"] in taken:
            continue
        assigned[tid] = dict(v, score=s)
        taken.add(v["id"])

    # Core stages get the beginner series, in the channel's own order (newest first,
    # so reverse for a gentle-to-harder progression).
    beginner = [v for v in reversed(rows)
                if BEGINNER_RE.search(v["title"]) and v["id"] not in taken]
    cores = [u for u in units if u[2] == "spine"]
    for i, (tid, name, kind, _) in enumerate(cores):
        if i < len(beginner):
            assigned[tid] = dict(beginner[i], score=0)
            taken.add(beginner[i]["id"])

    out = {"channel": "Easy Russian",
           "channel_url": "https://www.youtube.com/@EasyRussian",
           "units": assigned}
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    have = sum(1 for u in units if u[0] in assigned)
    print(f"wrote {args.out}")
    print(f"  units with a video : {have}/{len(units)}")
    print(f"  videos used        : {len(taken)}\n")
    for tid, name, kind, _ in units:
        v = assigned.get(tid)
        mark = "  " if v else "!!"
        detail = f"{v['title'][:58]}" if v else "(no confident match)"
        print(f"{mark} {name:<22} {detail}")


if __name__ == "__main__":
    main()
