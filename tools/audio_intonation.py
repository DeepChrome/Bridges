#!/usr/bin/env python3
"""Which bought word clips rise at the end — read as a question or left
hanging — when a word on its own should fall (§30db).

The owner hears it most on single words: «видео» came back «Видео?»
(2026-11-13), «русский» and «повторить» before it. Nothing in a clip's length
or size says so, and listening to 12,000 files is not a plan, so this
measures each clip's pitch contour (Praat, through parselmouth) and ranks the
clips by how far the end sits above the rest of the word, in semitones.

A statement in this voice falls: the last voiced frames of an ordinary word
sit 4–7 semitones *under* its opening, around 150 Hz. The three clips a person
had flagged for a rising end finished 5.6–9.3 semitones *above* their lowest
third, at 316–342 Hz — a different population, not a tail. `--threshold` is
that gap; the default is set from the distribution this prints, and the tool
is an instrument first: read the ranked list before flagging anything.

    python tools/audio_intonation.py                 # words, ranked, summary
    python tools/audio_intonation.py --forms         # the table forms as well
    python tools/audio_intonation.py --flag          # flag the rising clips in
                                                     # data/curated/audio_review.json,
                                                     # for build_word_audio.mjs /
                                                     # build_form_audio.mjs --rebuy-flagged

It measures the purchase (data/word_audio/<id>.mp3), which is what a rebuy
replaces; the shipped copy is the same sound trimmed. Sentences are not
measured: a question is meant to rise.

Not stdlib: `pip install praat-parselmouth numpy` — a QA tool, beside
faster-whisper, not part of the build pipeline.
"""
import argparse
import json
import math
import os
import sys
from datetime import date

try:
    import numpy as np
    import parselmouth
except ImportError:
    sys.exit("needs praat-parselmouth and numpy: py -m pip install praat-parselmouth numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "data", "word_audio")
REVIEW = os.path.join(ROOT, "data", "curated", "audio_review.json")
OUT = os.path.join(ROOT, "data", "_work", "intonation.txt")

PITCH_FLOOR, PITCH_CEILING = 75, 500   # one woman's voice; wide enough either way
MIN_VOICED_FRAMES = 8                   # 80 ms of voicing, or nothing can be said
# A voiced run shorter than this at the end of a clip is not the word's last
# syllable: the release of a final «к» or «т» («снег», «мост») tracks at
# 440–490 Hz for 30–40 ms after a gap and read as a two-octave rise. A real
# final syllable («бабушка?» at 360 Hz) runs 100 ms and more.
MIN_END_RUN = 6
THRESHOLD_ST = 3.0                      # end above the lowest third by this much
END_HZ = 250                            # …and finishing high in absolute terms


def semitones(a, b):
    return 12 * math.log2(a / b) if a > 0 and b > 0 else float("nan")


def measure(path):
    """(end rise in semitones over the lowest third, end Hz, voiced ms) or None."""
    snd = parselmouth.Sound(path)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=PITCH_FLOOR, pitch_ceiling=PITCH_CEILING)
    raw = pitch.selected_array["frequency"]
    # Voiced runs, in order; trailing bursts too short to be a syllable go.
    runs, cur = [], []
    for v in raw:
        if v > 0:
            cur.append(v)
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    while runs and len(runs[-1]) < MIN_END_RUN:
        runs.pop()
    f0 = np.array([v for r in runs for v in r])
    n = len(f0)
    if n < MIN_VOICED_FRAMES:
        return None
    thirds = [np.median(f0[: n // 3]), np.median(f0[n // 3: 2 * n // 3]), np.median(f0[2 * n // 3:])]
    end = float(np.median(f0[-max(3, n // 5):]))
    return semitones(end, float(min(thirds))), end, n * 10


def load_keys(forms):
    """[(review key, text, clip id)] for every word clip, and every form clip with --forms."""
    # Both manifests are { source, voice, rate, note, files: { key: id }, … };
    # a word's key is its folded text, a sentence's has spaces in it.
    out = []
    man = json.load(open(os.path.join(AUDIO, "manifest.json"), encoding="utf-8"))
    for key, cid in man["files"].items():
        if isinstance(cid, str) and " " not in key:
            out.append((f"word:{key}", key, cid))
    if forms:
        fpath = os.path.join(AUDIO, "forms.json")
        if os.path.exists(fpath):
            fm = json.load(open(fpath, encoding="utf-8"))
            for key, cid in fm["files"].items():
                if isinstance(cid, str):
                    out.append((f"form:{key}", key, cid))
    return out


def already_flagged(review, key, cid):
    it = (review.get("items") or {}).get(key)
    if not it:
        return False
    last = (it.get("verdicts") or [None])[-1]
    return bool(last and last.get("verdict") == "flag" and last.get("id") == cid)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--forms", action="store_true", help="measure the table forms too")
    ap.add_argument("--threshold", type=float, default=THRESHOLD_ST, help="end rise in semitones (default %(default)s)")
    ap.add_argument("--end-hz", type=float, default=END_HZ, help="…and an end pitch at least this (default %(default)s)")
    ap.add_argument("--flag", action="store_true", help="write a flag per rising clip into audio_review.json")
    ap.add_argument("--limit", type=int, help="measure only the first N (a quick look)")
    args = ap.parse_args()

    keys = load_keys(args.forms)
    if args.limit:
        keys = keys[: args.limit]
    rows, unvoiced, missing = [], 0, 0
    for k, (rkey, text, cid) in enumerate(keys):
        path = os.path.join(AUDIO, f"{cid}.mp3")
        if not os.path.exists(path):
            missing += 1
            continue
        m = measure(path)
        if m is None:
            unvoiced += 1
            continue
        rows.append((m[0], m[1], m[2], rkey, text, cid))
        if (k + 1) % 500 == 0:
            print(f"  {k + 1}/{len(keys)}", file=sys.stderr)
    rows.sort(key=lambda r: -r[0])

    rising = [r for r in rows if r[0] >= args.threshold and r[1] >= args.end_hz]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(f"# end rise (st over the lowest third) · end Hz · voiced ms · key · clip  — {date.today()}\n")
        f.write(f"# {len(rows)} measured, {len(rising)} rising (>= {args.threshold} st and >= {args.end_hz:.0f} Hz)\n")
        for r in rows:
            mark = "RISE " if r in rising else "     "
            f.write(f"{mark}{r[0]:+5.1f}  {r[1]:4.0f}  {r[2]:4d}  {r[3]}  {r[5]}\n")

    rises = np.array([r[0] for r in rows])
    print(f"{len(rows)} clips measured ({unvoiced} with too little voicing, {missing} files missing)")
    for lo, hi in [(-99, -3), (-3, 0), (0, 3), (3, 6), (6, 99)]:
        n = int(((rises >= lo) & (rises < hi)).sum())
        print(f"  end rise {lo:+3d}..{hi:+3d} st: {n}")
    print(f"{len(rising)} rising at the end (>= {args.threshold} st over the lowest third, end >= {args.end_hz:.0f} Hz)")
    for r in rising[:25]:
        print(f"   {r[0]:+5.1f} st  end {r[1]:3.0f} Hz  {r[4]}  ({r[5]})")
    if len(rising) > 25:
        print(f"   …and {len(rising) - 25} more; the whole list is in {os.path.relpath(OUT, ROOT)}")

    if args.flag and rising:
        review = json.load(open(REVIEW, encoding="utf-8")) if os.path.exists(REVIEW) else {"items": {}}
        items = review.setdefault("items", {})
        added = 0
        for rise, end, _, rkey, text, cid in rising:
            if already_flagged(review, rkey, cid):
                continue
            it = items.setdefault(rkey, {"verdicts": []})
            it.setdefault("verdicts", []).append({
                "verdict": "flag", "id": cid, "at": date.today().isoformat(), "who": "intonation",
                "note": f"rises at the end: +{rise:.1f} semitones over the lowest third, ending at {end:.0f} Hz "
                        f"(tools/audio_intonation.py)",
            })
            added += 1
        with open(REVIEW, "w", encoding="utf-8") as f:
            f.write(json.dumps(review, ensure_ascii=False, indent=1) + "\n")
        print(f"{added} flag(s) written to {os.path.relpath(REVIEW, ROOT)}; "
              f"node tools/build_word_audio.mjs --rebuy-flagged buys the next rendering of each")


if __name__ == "__main__":
    main()
