"""Audit the audio in the Anki media library.

Groups recordings by source, reads the MP3 frame headers directly (no ffmpeg), and
reports bitrate, sample rate, channels and duration per source. Synthetic voices are
uniform; human recordings vary. Also reports any ID3 encoder tags.

    python tools/audit_audio.py
"""

import io
import os
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
MEDIA = Path(os.environ["APPDATA"]) / "Anki2" / "User 1" / "collection.media"

BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}


def read_mp3(path):
    """-> (bitrate_kbps, sample_rate, channels, approx_seconds, encoder) or None."""
    data = path.read_bytes()
    encoder = None
    i = 0
    if data[:3] == b"ID3":
        size = ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 |
                (data[8] & 0x7F) << 7 | (data[9] & 0x7F))
        head = data[:10 + size]
        m = re.search(rb"(TSSE|TENC)\x00{0,3}.{0,4}([\x20-\x7e]{3,40})", head, re.S)
        if m:
            encoder = m.group(2).decode("ascii", "ignore").strip("\x00 ")
        i = 10 + size

    # First valid frame header.
    while i < len(data) - 4:
        if data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0:
            h = data[i:i + 4]
            ver = (h[1] >> 3) & 0x03           # 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
            layer = (h[1] >> 1) & 0x03         # 1 = Layer III
            bidx = (h[2] >> 4) & 0x0F
            ridx = (h[2] >> 2) & 0x03
            chan = (h[3] >> 6) & 0x03
            if layer != 1 or bidx in (0, 15) or ridx == 3:
                i += 1
                continue
            table = BITRATES_V1_L3 if ver == 3 else BITRATES_V2_L3
            rate_key = 0 if ver == 3 else (2 if ver == 2 else 3)
            br = table[bidx]
            sr = RATES[rate_key][ridx]
            channels = 1 if chan == 3 else 2
            secs = (len(data) - i) * 8 / (br * 1000) if br else 0
            return br, sr, channels, secs, encoder
        i += 1
    return None


def source_of(name):
    if name.startswith("yandexpremium-"):
        return "Yandex TTS (lingo llama)"
    if name.startswith("googletts-"):
        return "Google TTS (Ultimate Guide)"
    if name.startswith("LoF-RU-EN-"):
        return "Languages on Fire"
    if re.match(r"^[а-яёА-ЯЁ]", name):
        return "Russian Core 5000"
    return "other"


def main():
    groups = defaultdict(list)
    for p in MEDIA.iterdir():
        if p.is_file() and p.suffix.lower() == ".mp3":
            groups[source_of(p.name)].append(p)

    print(f"{sum(len(v) for v in groups.values()):,} mp3 files\n")
    for src in sorted(groups, key=lambda s: -len(groups[s])):
        files = groups[src]
        sample = files[:400]
        info = [read_mp3(p) for p in sample]
        info = [x for x in info if x]
        if not info:
            print(f"{src}: {len(files):,} files (unreadable headers)")
            continue
        brs = sorted({x[0] for x in info})
        srs = sorted({x[1] for x in info})
        chs = sorted({x[2] for x in info})
        durs = [x[3] for x in info]
        encs = {x[4] for x in info if x[4]}
        sizes = [p.stat().st_size for p in sample]
        print(f"{src}")
        print(f"  files        : {len(files):,}")
        print(f"  bitrate      : {', '.join(str(b) + 'k' for b in brs)}")
        print(f"  sample rate  : {', '.join(str(s) for s in srs)} Hz")
        print(f"  channels     : {', '.join('mono' if c == 1 else 'stereo' for c in chs)}")
        print(f"  duration     : {min(durs):.1f}–{max(durs):.1f}s "
              f"(median {statistics.median(durs):.1f}s)")
        print(f"  size         : median {statistics.median(sizes)/1024:.1f} KB")
        if encs:
            print(f"  encoder tag  : {', '.join(sorted(encs))[:70]}")
        print()


if __name__ == "__main__":
    main()
