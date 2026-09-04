"""Export the real recordings the app needs, best source first.

The collection holds four audio sources of very different quality. Measured with
tools/audit_audio.py:

    Languages on Fire   281 files   128-320 kbps, 44.1 kHz stereo   human studio
    Yandex TTS        2,534 files    64 kbps, 48 kHz mono           good neural TTS
    Russian Core 5000 10,337 files   64 kbps, 48 kHz mono           uniform, unverified
    Google TTS       10,366 files    32 kbps, 24 kHz mono           worst held

Nearly every Ultimate Guide headword also exists in Core 5000 at twice the bitrate, so
ranking by source upgrades thousands of words for nothing. Files are copied under a
content hash, which also collapses duplicates across decks.

    python tools/build_audio.py             # export + manifest
    python tools/build_audio.py --dry-run   # report only, copy nothing
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import sys
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
MEDIA = Path(os.environ["APPDATA"]) / "Anki2" / "User 1" / "collection.media"

# Higher wins. Ranking is by measured fidelity and by whether a human said it.
RANK = {"tatoeba": 5, "lof": 4, "yandex": 3, "core5000": 2, "googletts": 1, "other": 0}
LABEL = {5: "Tatoeba (native speakers)", 4: "Languages on Fire (human)",
         3: "Yandex neural TTS", 2: "Core 5000", 1: "Google TTS", 0: "other"}
TATOEBA_DIR = ROOT / "data" / "raw" / "tatoeba" / "audio"


def source_of(name):
    if name.startswith("LoF-RU-EN-"):
        return "lof"
    if name.startswith("yandexpremium-"):
        return "yandex"
    if name.startswith("googletts-"):
        return "googletts"
    if re.match(r"^[а-яёА-ЯЁ]", name):
        return "core5000"
    return "other"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--out", type=Path, default=ROOT / "site" / "audio")
    ap.add_argument("--manifest", type=Path, default=ROOT / "data" / "audio.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = sqlite3.connect(f"file:{args.corpus}?mode=ro", uri=True)

    # Every distinct Russian string the app can utter, with the candidates for it.
    # Keyed on the folded text so the same sentence from two decks competes.
    sys.path.insert(0, str(ROOT / "tools"))
    from panel import fold  # noqa: E402

    best = {}
    rows = db.execute(
        "select ru_key, ru, kind, audio from items where audio is not null").fetchall()
    for ru_key, ru, kind, audio in rows:
        src = source_of(audio)
        rank = RANK[src]
        cur = best.get(ru_key)
        if cur is None or rank > cur["rank"]:
            best[ru_key] = {"ru": ru, "kind": kind, "file": audio,
                            "src": src, "rank": rank}

    # Native-speaker recordings outrank everything synthetic. Fetched by
    # tools/fetch_tatoeba_audio.py; only entries whose file is on disk are used.
    tat_manifest = ROOT / "data" / "raw" / "tatoeba" / "audio_manifest.json"
    if tat_manifest.exists():
        tat = json.loads(tat_manifest.read_text(encoding="utf-8"))
        added = 0
        for key, info in tat.items():
            path = TATOEBA_DIR / f"{info['sid']}.mp3"
            if not path.exists():
                continue
            cur = best.get(key)
            if cur is None or RANK["tatoeba"] > cur["rank"]:
                best[key] = {"ru": info["text"], "kind": "sentence",
                             "file": str(path), "src": "tatoeba",
                             "rank": RANK["tatoeba"], "abs": True}
                added += 1
        print(f"native Tatoeba recordings layered in: {added}")
    db.close()

    picked = Counter(v["src"] for v in best.values())
    print(f"{len(rows):,} audio references → {len(best):,} distinct utterances")
    print("\nchosen source per utterance:")
    for rank in sorted(LABEL, reverse=True):
        name = LABEL[rank]
        n = sum(1 for v in best.values() if v["rank"] == rank)
        if n:
            print(f"  {name:<28} {n:>7,}")

    upgraded = sum(1 for v in best.values() if v["src"] == "core5000")
    print(f"\nwould have been Google TTS without ranking: up to {upgraded:,} utterances")

    missing, total_bytes, manifest = 0, 0, {}
    if not args.dry_run:
        args.out.mkdir(parents=True, exist_ok=True)

    for key, v in best.items():
        src_path = Path(v["file"]) if v.get("abs") else MEDIA / v["file"]
        if not src_path.exists():
            missing += 1
            continue
        data = src_path.read_bytes()
        # Content hash: identical audio shared by several decks is stored once.
        h = hashlib.sha1(data).hexdigest()[:16] + ".mp3"
        total_bytes += len(data)
        if not args.dry_run:
            dest = args.out / h
            if not dest.exists():
                dest.write_bytes(data)
        manifest[key] = h

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps({"files": manifest,
                    "sources": {k: v for k, v in picked.items()}},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    uniq = len(set(manifest.values()))
    print(f"\nmanifest      : {len(manifest):,} utterances → {uniq:,} unique files")
    print(f"payload       : {total_bytes/1_048_576:.0f} MB before dedupe")
    if missing:
        print(f"missing files : {missing:,}")
    if args.dry_run:
        print("\n(dry run — nothing copied)")
    else:
        on_disk = sum(p.stat().st_size for p in args.out.iterdir())
        print(f"exported      : {args.out}  ({on_disk/1_048_576:.0f} MB)")


if __name__ == "__main__":
    main()
