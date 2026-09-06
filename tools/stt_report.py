"""Summarise an STT lab export (ROADMAP P3.4).

The lab screen logs every attempt into the learner state's speech slot as
kind "lab", and the export button shares that slot as JSON. This reads that file and
answers the Phase 3 question — is on-device recognition good enough on his voice — as
numbers: median and mean word error rate, WER by sentence length, latency at the 50th
and 95th percentile, the worst sentences, and how often the recogniser gave up.

    python tools/stt_report.py export.json
    python tools/stt_report.py --demo           # a made-up sample, to see the shape

Accepts either the whole speech slot ({attempts, tagCounts}) or a bare list.
Attempts of other kinds are ignored. Stdlib only.
"""

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEMO = [
    {"kind": "lab", "target": "Что ты делаешь?", "transcript": "что ты делаешь", "wer": 0.0, "latencyMs": 820, "engine": "device"},
    {"kind": "lab", "target": "Она ходит в школу.", "transcript": "она ходит школу", "wer": 0.25, "latencyMs": 1100, "engine": "device"},
    {"kind": "lab", "target": "Том только что был здесь.", "transcript": "том только что был здесь", "wer": 0.0, "latencyMs": 940, "engine": "device"},
    {"kind": "lab", "target": "Ярко светит солнце.", "transcript": "яркое светит солнце", "wer": 0.333, "latencyMs": 1300, "engine": "device"},
    {"kind": "lab", "target": "Вот это да!", "transcript": "", "wer": 1.0, "latencyMs": 4000, "engine": "device", "error": "no-speech"},
]


def pct(values, p):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def n_words(s):
    return len([w for w in (s or "").replace("—", " ").split() if any(c.isalpha() for c in w)])


def report(attempts, engine=None):
    labs = [a for a in attempts if a.get("kind") == "lab"
            and (engine is None or a.get("engine") == engine)]
    if not labs:
        print("no lab attempts" + (f" for engine {engine}" if engine else ""))
        return 1

    by_engine = Counter(a.get("engine", "?") for a in labs)
    errors = [a for a in labs if a.get("error")]
    scored = [a for a in labs if not a.get("error")]
    wers = [float(a.get("wer", 1)) for a in scored]
    lats = [float(a["latencyMs"]) for a in labs if a.get("latencyMs") is not None]

    print(f"attempts        : {len(labs)}  by engine: " +
          ", ".join(f"{k} {v}" for k, v in by_engine.items()))
    print(f"recogniser gave up: {len(errors)} ({100 * len(errors) / len(labs):.0f}%)  " +
          ", ".join(f"{k} {v}" for k, v in Counter(a['error'] for a in errors).items()))
    if wers:
        print(f"WER (scored)    : median {100 * statistics.median(wers):.1f}%  "
              f"mean {100 * statistics.mean(wers):.1f}%  "
              f"exact {sum(1 for w in wers if w == 0)}/{len(wers)}")
        # Including errors as WER 1 is the honest number for "how often did it work".
        all_w = wers + [1.0] * len(errors)
        print(f"WER (all)       : median {100 * statistics.median(all_w):.1f}%  "
              f"mean {100 * statistics.mean(all_w):.1f}%")
    if lats:
        print(f"latency         : p50 {pct(lats, .5):.0f} ms  p95 {pct(lats, .95):.0f} ms  "
              f"max {max(lats):.0f} ms")

    by_len = defaultdict(list)
    for a in scored:
        n = n_words(a.get("target"))
        bucket = "3-4" if n <= 4 else "5-6" if n <= 6 else "7+"
        by_len[bucket].append(float(a.get("wer", 1)))
    if by_len:
        print("WER by length   : " + "  ".join(
            f"{b} words {100 * statistics.mean(by_len[b]):.0f}% (n={len(by_len[b])})"
            for b in ("3-4", "5-6", "7+") if b in by_len))

    worst = sorted(labs, key=lambda a: -float(a.get("wer", 1)))[:10]
    print("\nworst sentences :")
    for a in worst:
        w = float(a.get("wer", 1))
        heard = a.get("error") or f"“{a.get('transcript', '')}”"
        print(f"  {100 * w:4.0f}%  {a.get('target', '')}")
        print(f"        heard {heard}")

    med = statistics.median(wers + [1.0] * len(errors)) if (wers or errors) else 1.0
    verdict = ("≤ 15%: proceed to Phase 4 with this engine" if med <= 0.15
               else "15–30%: proceed, but treat sub/del as UNCLEAR; also run P3.7"
               if med <= 0.30 else "> 30%: run P3.7 (whisper.rn) before anything else")
    print(f"\ndecision rule   : median WER {100 * med:.1f}% → {verdict}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", nargs="?", type=Path, help="JSON from the lab's Export")
    ap.add_argument("--engine", help="only attempts from this engine (device, whisper, cloud)")
    ap.add_argument("--demo", action="store_true", help="run on a made-up sample")
    args = ap.parse_args()

    if args.demo:
        attempts = DEMO
    elif args.export:
        raw = json.loads(args.export.read_text(encoding="utf-8"))
        attempts = raw.get("attempts", raw) if isinstance(raw, dict) else raw
    else:
        ap.error("give an export file, or --demo")
    return report(attempts, args.engine)


if __name__ == "__main__":
    sys.exit(main())
