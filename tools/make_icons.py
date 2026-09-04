"""Generate the app icons as PNGs.

Writes them by hand with zlib so the build needs no image library. The mark is
three stacked bars of increasing width - the learning path, and the "blocks" of
the name - on the app's ink background in its brass accent.

    python tools/make_icons.py
"""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "icons"

INK = (14, 17, 19, 255)        # --bg dark
BRASS = (224, 167, 60, 255)    # --brand dark
CREAM = (246, 245, 241, 255)


def png_bytes(w, h, rows):
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def rounded(x, y, x0, y0, x1, y1, r):
    """Inside the rounded rectangle? Distance from the corner-inset rectangle."""
    if not (x0 <= x < x1 and y0 <= y < y1):
        return False
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    dx = max(x0 + r - x, 0, x - (x1 - r))
    dy = max(y0 + r - y, 0, y - (y1 - r))
    return dx * dx + dy * dy <= r * r


def draw(size, maskable=False):
    # A maskable icon must survive Android cropping it to a circle, so the mark
    # sits inside a smaller safe area and the background bleeds to the edge.
    pad = size * (0.26 if maskable else 0.16)
    corner = 0 if maskable else size * 0.22
    bars = [(0.34, 0.30), (0.52, 0.46), (0.70, 0.62)]   # (width fraction, y fraction)
    bar_h = size * 0.115
    gap = size * 0.055
    top = (size - (3 * bar_h + 2 * gap)) / 2

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px = INK
            if corner and not rounded(x, y, 0, 0, size, size, corner):
                px = (0, 0, 0, 0)
            else:
                for n, (wf, _) in enumerate(bars):
                    by = top + n * (bar_h + gap)
                    bw = (size - 2 * pad) * wf
                    left = (size - bw) / 2          # centred reads better than flush left
                    if rounded(x, y, left, by, left + bw, by + bar_h, bar_h / 2):
                        px = BRASS if n < 2 else CREAM
                        break
            row.append(px)
        rows.append(row)
    return png_bytes(size, size, rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [("icon-192.png", 192, False), ("icon-512.png", 512, False),
            ("icon-maskable-512.png", 512, True), ("apple-touch-icon.png", 180, False)]
    for name, size, mask in jobs:
        data = draw(size, mask)
        (OUT / name).write_bytes(data)
        print(f"  {name:<26} {size}x{size}  {len(data)/1024:.1f} KB")
    print(f"wrote {len(jobs)} icons to {OUT}")


if __name__ == "__main__":
    main()
