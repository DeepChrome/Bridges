"""Generate the two answer cues, the same way make_icons.py generates the icons.

Hand-rolled with the stdlib `wave` module so the repository carries no opaque binary
blobs it cannot regenerate, and no audio dependency.

The brief: the correct cue is positive, the incorrect cue is negative but *not* a
buzzer. A buzzer is a square wave with harsh upper harmonics; these are pure sines
with a soft attack and a long decay, which reads as "no" without punishing anyone for
getting a word wrong forty times an evening.

    python tools/make_sounds.py
"""

import argparse
import math
import struct
import sys
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

RATE = 44100
PEAK = 20000          # 16-bit headroom, deliberately short of clipping


def envelope(i, n, attack=0.02, release=0.55):
    """Raised-cosine attack and exponential decay — no clicks at either end."""
    t = i / n
    a = min(1.0, (t / attack)) if attack else 1.0
    a = 0.5 - 0.5 * math.cos(math.pi * a)          # smooth the attack itself
    d = math.exp(-t / release)
    return a * d


def tone(freq_from, freq_to, ms, gain=1.0, harmonic=0.0):
    """A sine sweep. `harmonic` adds a quiet octave for a little body."""
    n = int(RATE * ms / 1000)
    out = []
    phase = 0.0
    for i in range(n):
        f = freq_from + (freq_to - freq_from) * (i / n)
        phase += 2 * math.pi * f / RATE
        s = math.sin(phase) + harmonic * math.sin(2 * phase)
        out.append(s * envelope(i, n) * gain)
    return out


def mix(*layers):
    """Overlay layers of differing length, offset in samples: (samples, offset)."""
    length = max(off + len(buf) for buf, off in layers)
    acc = [0.0] * length
    for buf, off in layers:
        for i, s in enumerate(buf):
            acc[off + i] += s
    return acc


def write(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s / peak)) * PEAK)) for s in samples)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    return path.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "native" / "assets" / "sfx")
    args = ap.parse_args()

    # Correct: a rising major third (E6 -> G#6) — the interval a doorbell uses, and
    # short enough to land before the learner's eyes leave the answer.
    right = mix(
        (tone(1318.5, 1318.5, 110, gain=0.5, harmonic=0.12), 0),
        (tone(1661.2, 1661.2, 260, gain=0.6, harmonic=0.12), int(RATE * 0.075)),
    )

    # Incorrect: a falling minor third, low and quiet. Descending reads as negative
    # across most listeners; keeping it in the low register and off the harmonics
    # keeps it from feeling like a punishment.
    wrong = mix(
        (tone(311.1, 246.9, 300, gain=0.75, harmonic=0.05), 0),
        (tone(155.6, 123.5, 320, gain=0.35), int(RATE * 0.02)),
    )

    n1 = write(args.out / "correct.wav", right)
    n2 = write(args.out / "wrong.wav", wrong)

    print(f"wrote {args.out}")
    print(f"  correct.wav  {len(right) / RATE * 1000:5.0f} ms  {n1:,} bytes")
    print(f"  wrong.wav    {len(wrong) / RATE * 1000:5.0f} ms  {n2:,} bytes")


if __name__ == "__main__":
    main()
