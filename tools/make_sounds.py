"""Generate the answer cues, the same way make_app_icon.py generates the icons.

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


def pluck(freq, ms, harmonics, decay, attack_ms=2.0):
    """A plucked or struck string: a harmonic series whose upper partials die
    faster than the fundamental, which is what a harp or kalimba does."""
    n = int(RATE * ms / 1000)
    fade = int(RATE * 0.08)
    out = []
    for i in range(n):
        t = i / RATE
        a = min(1.0, t * 1000 / attack_ms)
        a = 0.5 - 0.5 * math.cos(math.pi * a)
        if i > n - fade:
            a *= 0.5 + 0.5 * math.cos(math.pi * (i - (n - fade)) / fade)
        s = 0.0
        for k, gain in enumerate(harmonics, 1):
            s += gain * math.sin(2 * math.pi * freq * k * t) * math.exp(-t / (decay / k ** 0.7))
        out.append(s * a)
    return out


def pad(freq, ms, attack_ms=45.0):
    """A warm, slow note: fundamental with a quiet octave and fifth, soft attack."""
    n = int(RATE * ms / 1000)
    out = []
    for i in range(n):
        t = i / RATE
        a = min(1.0, t * 1000 / attack_ms)
        a = 0.5 - 0.5 * math.cos(math.pi * a)
        d = math.exp(-t / 0.35)
        s = (math.sin(2 * math.pi * freq * t)
             + 0.35 * math.sin(2 * math.pi * freq * 2 * t)
             + 0.2 * math.sin(2 * math.pi * freq * 1.5 * t))
        out.append(s * a * d)
    return out


BELL = [(1.00, 1.00, 0.55), (2.00, 0.28, 0.32), (2.76, 0.16, 0.22), (4.07, 0.05, 0.12)]
GLASS = [(1.00, 1.00, 0.40), (2.32, 0.30, 0.20), (3.86, 0.18, 0.12), (5.90, 0.06, 0.06)]
WOOD = [(1.00, 1.00, 0.18), (3.93, 0.35, 0.06), (9.20, 0.12, 0.03)]
KALIMBA = [(1.00, 1.00, 0.45), (2.60, 0.18, 0.15), (5.40, 0.06, 0.06)]
MS = int(RATE / 1000)

# Ten cues for a right answer. The owner heard the first bell as "programmed"; the
# fix is a choice, since a sound that pleases one ear grates on another. Each is
# named in the app's settings, previewed on tap. All quiet, all under a second and
# a half, none a beep: bells with inharmonic partials, plucked and struck notes,
# and two short figures that rise — rising reads as "yes" to most listeners.
CORRECT = {
    "bell":    lambda: bell(880.0, 1400, BELL),
    "chime":   lambda: mix((bell(1046.5, 900, BELL), 0), (bell(1318.5, 1100, BELL), 110 * MS)),
    "glass":   lambda: bell(1318.5, 900, GLASS),
    "wood":    lambda: mix((bell(659.3, 380, WOOD), 0), (bell(880.0, 420, WOOD), 90 * MS)),
    "harp":    lambda: mix((pluck(523.3, 900, [1.0, 0.5, 0.3, 0.18, 0.1], 0.45), 0),
                           (pluck(784.0, 900, [1.0, 0.5, 0.3, 0.18, 0.1], 0.45), 70 * MS)),
    "triad":   lambda: mix((bell(523.3, 700, BELL), 0), (bell(659.3, 700, BELL), 80 * MS),
                           (bell(784.0, 900, BELL), 160 * MS)),
    "warm":    lambda: pad(440.0, 700),
    "pop":     lambda: tone(520.0, 880.0, 160, gain=0.9, harmonic=0.15),
    "kalimba": lambda: bell(880.0, 800, KALIMBA, attack_ms=2.0),
    "fifth":   lambda: mix((bell(880.0, 900, BELL), 0), (bell(1318.5, 1100, BELL), 140 * MS)),
}


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
    # Nine more in CORRECT, chosen in the app's settings.
    print(f"wrote {args.out}")
    for name, make in CORRECT.items():
        samples = make()
        n = write(args.out / f"correct-{name}.wav", samples)
        print(f"  correct-{name + '.wav':<12} {len(samples) / RATE * 1000:5.0f} ms  {n:,} bytes")

    # Incorrect: a falling minor third, low and quiet. Descending reads as negative
    # across most listeners; keeping it in the low register and off the harmonics
    # keeps it from feeling like a punishment.
    wrong = mix(
        (tone(311.1, 246.9, 300, gain=0.75, harmonic=0.05), 0),
        (tone(155.6, 123.5, 320, gain=0.35), int(RATE * 0.02)),
    )
    n2 = write(args.out / "wrong.wav", wrong)
    print(f"  wrong.wav          {len(wrong) / RATE * 1000:5.0f} ms  {n2:,} bytes")


if __name__ == "__main__":
    main()
