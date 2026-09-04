"""Harvest vocabulary and timings from the Easy Russian transcripts.

YouTube's auto-captions come back as json3 with per-word offsets, so every spoken
word can be pinned to a moment rather than to a caption block. Each token is folded
and resolved through the lexicon's form->lemma index, which is what lets a lesson
word be found in the video even when it is spoken in a different case.

Only the index is kept — lemma to a list of milliseconds. The caption text itself is
not stored or shipped: the app needs to know *when* a word was said, not to reproduce
the transcript.

    python tools/build_transcripts.py            # fetch what is missing, then index
    python tools/build_transcripts.py --no-fetch # index whatever is already on disk
"""

import argparse
import json
import re
import sqlite3
import subprocess
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from panel import fold  # noqa: E402

SUBS = ROOT / "data" / "raw" / "subs"
LIST = ROOT / "data" / "raw" / "youtube" / "easyrussian.tsv"
TOKEN = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")


def fetch(video_id, pause):
    """Auto-captions in the original language, with per-word offsets."""
    out = SUBS / f"{video_id}.ru-orig.json3"
    if out.exists() and out.stat().st_size > 500:
        return "cached"
    cmd = [sys.executable, "-m", "yt_dlp", "--skip-download", "--write-auto-subs",
           "--sub-langs", "ru-orig", "--sub-format", "json3", "--quiet", "--no-warnings",
           "-o", str(SUBS / "%(id)s"), f"https://www.youtube.com/watch?v={video_id}"]
    try:
        subprocess.run(cmd, check=False, timeout=120,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return "timeout"
    time.sleep(pause)
    return "fetched" if out.exists() else "missing"


def words_with_times(path):
    """-> [(token, absolute_ms)] for every Cyrillic word in the transcript."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for ev in data.get("events", []):
        segs = ev.get("segs")
        if not segs:
            continue
        base = ev.get("tStartMs", 0)
        for s in segs:
            text = s.get("utf8", "")
            if not text.strip():
                continue
            at = base + s.get("tOffsetMs", 0)
            for m in TOKEN.finditer(text):
                out.append((m.group(0), at))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "transcripts.json")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--pause", type=float, default=0.6)
    args = ap.parse_args()

    videos = []
    for line in LIST.read_text(encoding="utf-8").splitlines():
        p = line.rstrip("\n").split("\t")
        if len(p) >= 2 and p[0].strip():
            videos.append((p[0].strip(), p[1].strip()))
    print(f"{len(videos)} videos in the channel listing")

    SUBS.mkdir(parents=True, exist_ok=True)
    if not args.no_fetch:
        tally = Counter()
        for n, (vid, title) in enumerate(videos, 1):
            tally[fetch(vid, args.pause)] += 1
            if n % 20 == 0:
                print(f"  {n}/{len(videos)} … {dict(tally)}")
        print(f"  transcripts: {dict(tally)}")

    # form -> lemma bare form. Keyed by the word itself so the index survives a
    # payload rebuild, exactly like learner progress does.
    db = sqlite3.connect(f"file:{args.lexicon}?mode=ro", uri=True)
    form_to_lemma = {}
    for key, bare in db.execute(
            "select f.key, l.bare from forms f join lemmas l on l.id = f.lemma_id"):
        form_to_lemma.setdefault(key, bare)
    db.close()
    print(f"  lexicon index: {len(form_to_lemma):,} forms")

    index, stats = {}, Counter()
    for vid, title in videos:
        path = SUBS / f"{vid}.ru-orig.json3"
        if not path.exists():
            stats["no transcript"] += 1
            continue
        pairs = words_with_times(path)
        if not pairs:
            stats["empty"] += 1
            continue
        hits = defaultdict(list)
        for token, at in pairs:
            lemma = form_to_lemma.get(fold(token))
            if lemma:
                hits[lemma].append(at)
        if not hits:
            stats["no matches"] += 1
            continue
        # Timings sorted, and near-duplicates within a second collapsed — the same
        # word repeated in one breath is one moment to replay, not three.
        index[vid] = {}
        for lemma, times in hits.items():
            times.sort()
            keep = []
            for t in times:
                if not keep or t - keep[-1] > 1000:
                    keep.append(t)
            index[vid][lemma] = keep
        stats["indexed"] += 1
        stats["words"] += len(pairs)
        stats["lemmas"] += len(hits)

    args.out.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")

    print(f"\nwrote {args.out}")
    print(f"  videos indexed   : {stats['indexed']}/{len(videos)}")
    if stats["no transcript"]:
        print(f"  no transcript    : {stats['no transcript']}")
    print(f"  words heard      : {stats['words']:,}")
    print(f"  lemma slots      : {stats['lemmas']:,}")
    if stats["indexed"]:
        print(f"  distinct lemmas per video (median): "
              f"{sorted(len(v) for v in index.values())[len(index) // 2]}")
    print(f"  file size        : {args.out.stat().st_size / 1_048_576:.2f} MB")


if __name__ == "__main__":
    main()
