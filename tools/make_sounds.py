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


def bell(freq, ms, partials, attack_ms=4.0):
    """One struck bell note: a set of partials (ratio, gain, decay seconds) over a
    fundamental, each dying at its own rate so the tone thins as it fades — which
    is what makes it read as a bell rather than an organ. A 4 ms raised-cosine
    attack keeps the strike soft."""
    n = int(RATE * ms / 1000)
    fade = int(RATE * 0.15)                  # the last 150 ms eased to silence
    out = []
    for i in range(n):
        t = i / RATE
        a = min(1.0, t * 1000 / attack_ms)
        a = 0.5 - 0.5 * math.cos(math.pi * a)
        if i > n - fade:
            a *= 0.5 + 0.5 * math.cos(math.pi * (i - (n - fade)) / fade)
        s = 0.0
        for ratio, gain, decay in partials:
            s += gain * math.sin(2 * math.pi * freq * ratio * t) * math.exp(-t / decay)
        out.append(s * a)
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

    # Correct: one soft bell on A5, ringing for about a second. The first version
    # was two thin high sines a tenth of a second long, which the owner described
    # accurately and unprintably. A bell's partials are not harmonic — the second
    # sits near 2.76× the fundamental, not 3× — and each fades at its own pace;
    # that inharmonicity and the long tail are the whole difference between a
    # "bing" and a beep. Quiet: it sits under the word that is read out after it.
    right = bell(880.0, 1400, [
        (1.00, 1.00, 0.55),      # fundamental, the body of the note
        (2.00, 0.28, 0.32),      # octave, a little brightness that goes first
        (2.76, 0.16, 0.22),      # the bell's characteristic minor-tenth partial
        (4.07, 0.05, 0.12),      # a touch of strike, gone in a tenth of a second
    ])

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
