"""The app icon: «Я», white on coral.

Hand-rolled with zlib, so the repository can regenerate its artwork without an
image library. The owner chose the "Ya" direction from the brand board
(2026-10-01): a heavy geometric Я — the letter that is also the word "I", and
the first one a learner sees that English does not have — white on coral
#D9502A. Three strokes (stem, bowl, leg) read at a launcher's 48 px where a
detailed mark would not. It replaced the suspension bridge. Writes every size
Expo needs (native/assets) and the web icons (site/icons).

    python tools/make_app_icon.py
"""

import argparse
import math
import struct
import sys
import zlib
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

CORAL = (217, 80, 42)           # #D9502A, the brand board's "Ya"
WHITE = (255, 255, 255)


def png_bytes(w, h, rows):
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def seg_dist(px, py, ax, ay, bx, by):
    """Distance from a point to a segment."""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    ex, ey = ax + t * dx, ay + t * dy
    return math.hypot(px - ex, py - ey)


class Ya:
    """«Я» in a unit square (0..1), scaled to `size`. Every stroke is a signed
    distance so edges are anti-aliased rather than stepped. The proportions
    follow a heavy geometric face (the board set it in Unbounded 800): a
    full-height stem on the right, a bowl over the top half, and a straight
    leg from the bowl to the bottom left."""

    def __init__(self, size, inset):
        self.s = size
        span = 1 - 2 * inset
        # Heavy and round, "almost like a bubble" (the owner, 2026-10-02):
        # chubbier than the board's Unbounded 800, and no flat ends anywhere.
        self.w = span * 0.19                       # stroke weight
        self.top, self.bot = inset + span * 0.10, inset + span * 0.90
        width = (self.bot - self.top) * 0.80        # a heavy Я is a little narrow
        self.xl = 0.5 - width / 2
        self.xr = 0.5 + width / 2
        self.mid = self.top + (self.bot - self.top) * 0.64   # where the bowl closes
        h = self.w / 2
        r = (self.mid - self.top - self.w) / 2      # the bowl's round, centre line
        cx, cy = self.xl + h + r, self.top + h + r
        # The bowl's centre line: along the top from the stem, round the left,
        # back along its foot to the stem.
        pts = [(self.xr - h, self.top + h), (cx, self.top + h)]
        for k in range(1, 24):
            a = math.pi / 2 + math.pi * k / 24
            pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
        pts += [(cx, cy + r), (self.xr - h, cy + r)]
        self.bowl = pts
        # The leg leaves the bowl's foot a little left of centre and lands at
        # the bottom left, its foot rounded like every other end.
        sx, sy = cx + r * 0.55, cy + r
        ex, ey = self.xl + h, self.bot - h
        self.leg = ((sx, sy), (ex, ey))

    def coverage(self, px, py):
        """0..1 how much of this pixel the white mark covers."""
        x, y = px / self.s, py / self.s
        aa = 0.9 / self.s
        h = self.w / 2
        best = self._rect(x, y, self.xr - self.w, self.top, self.xr, self.bot, h)     # stem, round ends
        d = min(seg_dist(x, y, ax, ay, bx, by) for (ax, ay), (bx, by) in zip(self.bowl, self.bowl[1:]))
        best = min(best, d - h)
        (ax, ay), (bx, by) = self.leg
        leg = seg_dist(x, y, ax, ay, bx, by) - h
        best = min(best, leg)
        return max(0.0, min(1.0, 0.5 - best / aa / 2))

    @staticmethod
    def _rect(x, y, x0, y0, x1, y1, r):
        """Signed distance to a rounded rectangle (negative inside)."""
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        hw, hh = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
        dx, dy = abs(x - cx) - hw, abs(y - cy) - hh
        outside = math.hypot(max(dx, 0), max(dy, 0))
        inside = min(max(dx, dy), 0)
        return outside + inside - r


def blend(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def draw(size, inset, corner, background=True, mark_color=WHITE, transparent_bg=False):
    mark = Ya(size, inset)
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            if background and not transparent_bg:
                bg = CORAL
                alpha = 255
                if corner:
                    d = _rounded_dist(px + 0.5, py + 0.5, size, corner)
                    alpha = int(255 * max(0.0, min(1.0, 0.5 - d)))
            else:
                bg, alpha = (0, 0, 0), 0
            c = mark.coverage(px + 0.5, py + 0.5)
            if alpha == 0:
                # transparent ground: the mark alone, with its own alpha
                row.append((mark_color[0], mark_color[1], mark_color[2], int(255 * c)))
            else:
                col = blend(bg, mark_color, c)
                row.append((col[0], col[1], col[2], alpha))
        rows.append(row)
    return png_bytes(size, size, rows)


def _rounded_dist(x, y, size, r):
    hw = size / 2 - r
    dx, dy = abs(x - size / 2) - hw, abs(y - size / 2) - hw
    return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--native", type=Path, default=ROOT / "native" / "assets")
    ap.add_argument("--web", type=Path, default=ROOT / "site" / "icons")
    args = ap.parse_args()
    jobs = [
        # Expo: the store icon is square with no rounding (the platform rounds it);
        # the adaptive foreground keeps the mark inside the safe zone, the
        # background is the plain ground; monochrome is the mark alone.
        (args.native / "icon.png", dict(size=1024, inset=0.16, corner=0)),
        (args.native / "android-icon-foreground.png", dict(size=1024, inset=0.30, corner=0, transparent_bg=True)),
        (args.native / "android-icon-background.png", dict(size=1024, inset=0.5, corner=0, mark_color=CORAL)),
        (args.native / "android-icon-monochrome.png", dict(size=1024, inset=0.30, corner=0, transparent_bg=True)),
        (args.native / "splash-icon.png", dict(size=512, inset=0.14, corner=110)),
        (args.native / "favicon.png", dict(size=64, inset=0.12, corner=14)),
        (args.web / "icon-192.png", dict(size=192, inset=0.16, corner=42)),
        (args.web / "icon-512.png", dict(size=512, inset=0.16, corner=112)),
        (args.web / "icon-maskable-512.png", dict(size=512, inset=0.28, corner=0)),
        (args.web / "apple-touch-icon.png", dict(size=180, inset=0.16, corner=0)),
    ]
    for path, spec in jobs:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = draw(**spec)
        path.write_bytes(data)
        shown = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        print(f"  {shown!s:<44} {spec['size']}px  {len(data) / 1024:.1f} KB")
    print(f"wrote {len(jobs)} icons")


if __name__ == "__main__":
    main()
