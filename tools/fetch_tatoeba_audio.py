"""Download the native-speaker recordings Tatoeba has for sentences we already own.

Tatoeba carries 10,652 Russian sentences read by real people. Matching by folded text
against the corpus finds the ones we can actually use. These outrank every synthetic
source in tools/build_audio.py.

Licences vary per recording (mostly CC BY 4.0); the attribution file written alongside
the audio records the speaker and licence for each one, which the licences require.

    python tools/fetch_tatoeba_audio.py
    python tools/fetch_tatoeba_audio.py --dry-run
"""

import argparse
import bz2
import json
import sqlite3
import sys
import tarfile
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from panel import fold  # noqa: E402

RAW = ROOT / "data" / "raw" / "tatoeba"
OUT = RAW / "audio"
# Two ids, and they are not interchangeable. The CDN path is keyed by SENTENCE id; the
# app route is keyed by AUDIO id (the second column of sentences_with_audio). This
# script once passed the sentence id to both, and whenever the CDN request failed
# under throttling the app route happily served recording #<sentence id> — a real
# file, right size, wrong sentence, usually English. It reached the phone as
# «Вот мы здесь.» playing "It may not be as difficult to do that as you think."
# Nothing in the pipeline could have caught it: the file was valid MP3 of the right
# length. The bytes now have to be right at the source, so this is the one place
# that must never pass the wrong id.
CDN_URL = "https://audio.tatoeba.org/sentences/rus/{sid}.mp3"
APP_URL = "https://tatoeba.org/en/audio/download/{aid}"
UA = "Mozilla/5.0 (compatible; bridges-personal-study/1.0)"


def fetch(sid, aid, tries=3):
    """The CDN by sentence id first, the app route by audio id second, then retry —
    the app endpoint throttles under a fast loop."""
    urls = [CDN_URL.format(sid=sid)] + ([APP_URL.format(aid=aid)] if aid else [])
    for attempt in range(tries):
        for url in urls:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                if len(data) > 500:
                    return data
            except (urllib.error.URLError, OSError):
                pass
        time.sleep(1.0 + attempt)
    return None


def load_index():
    rus = {}
    with bz2.open(RAW / "rus_sentences.tsv.bz2", "rt", encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 3 and p[0].isdigit():
                rus[int(p[0])] = p[2]

    tf = tarfile.open(RAW / "sentences_with_audio.tar.bz2", "r:bz2")
    raw = tf.extractfile(tf.getnames()[0]).read().decode("utf-8", "replace")
    by_text = {}
    for line in raw.splitlines():
        p = line.split("\t")
        if not p or not p[0].isdigit():
            continue
        sid = int(p[0])
        if sid not in rus:
            continue
        key = fold(rus[sid])
        # First recording wins; they are equivalent for our purposes.
        by_text.setdefault(key, {
            "sid": sid, "text": rus[sid],
            "aid": int(p[1]) if len(p) > 1 and p[1].isdigit() else None,
            "user": p[2] if len(p) > 2 else "",
            "licence": p[3] if len(p) > 3 else "",
        })
    return by_text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--pause", type=float, default=0.4,
                    help="seconds between requests; be a good guest")
    ap.add_argument("--refetch", action="store_true",
                    help="download again even if the file exists (after the id bug, "
                         "every file fetched before 2026-09-06 is suspect)")
    args = ap.parse_args()

    by_text = load_index()
    db = sqlite3.connect(f"file:{args.corpus}?mode=ro", uri=True)
    mine = db.execute("select distinct ru_key from items where kind='sentence'").fetchall()
    db.close()

    wanted = {k: by_text[k] for (k,) in mine if k in by_text}
    print(f"Tatoeba Russian recordings : {len(by_text):,}")
    print(f"matching your sentences    : {len(wanted):,}")
    print("  voices  :", dict(Counter(v["user"] for v in wanted.values()).most_common(6)))
    print("  licences:", dict(Counter(v["licence"] or "(unstated)"
                                      for v in wanted.values())))
    if args.dry_run:
        print("\n(dry run — nothing downloaded)")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    manifest, got, failed, skipped = {}, 0, 0, 0
    for n, (key, info) in enumerate(sorted(wanted.items()), 1):
        dest = OUT / f"{info['sid']}.mp3"
        if not args.refetch and dest.exists() and dest.stat().st_size > 500:
            manifest[key] = info
            skipped += 1
            continue
        data = fetch(info["sid"], info.get("aid"))
        if data:
            dest.write_bytes(data)
            manifest[key] = info
            got += 1
        else:
            failed += 1
        if n % 25 == 0:
            print(f"  {n}/{len(wanted)} … {got} fetched, {failed} failed")
        time.sleep(args.pause)

    (RAW / "audio_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    # The licences require credit; keep it next to the files.
    lines = ["Native-speaker recordings from Tatoeba (https://tatoeba.org).",
             "Each line: sentence id | speaker | licence | text", ""]
    for key, i in sorted(manifest.items(), key=lambda kv: kv[1]["sid"]):
        lines.append(f"{i['sid']} | {i['user']} | {i['licence'] or 'unstated'} | {i['text']}")
    (RAW / "ATTRIBUTION.txt").write_text("\n".join(lines), encoding="utf-8")

    print(f"\nfetched {got}, reused {skipped}, failed {failed}")
    print(f"manifest    : {RAW / 'audio_manifest.json'}")
    print(f"attribution : {RAW / 'ATTRIBUTION.txt'}")


if __name__ == "__main__":
    main()
