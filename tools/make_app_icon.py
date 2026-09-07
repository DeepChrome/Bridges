"""The app icon: a bridge, in the app's own colours.

Hand-rolled with zlib, so the repository can regenerate its artwork without an
image library. A suspension bridge in white on the brand indigo — two towers,
the deck, the main cable and its hangers — reads as "bridge" at 48 px on a
phone. Writes every size Expo needs (native/assets) and the web icons
(site/icons). It replaced make_icons.py, whose three bars were the old mark.

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

INDIGO = (77, 69, 230)          # theme.js light brand #4D45E6
INDIGO_DEEP = (51, 44, 188)     # brandDim, the lower half of a soft gradient
WHITE = (255, 255, 255)
SPLASH_BG = (247, 248, 249)     # theme.js light bg


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


class Bridge:
    """The mark in a unit square (0..1), scaled to `size`. Every stroke is a
    signed distance so edges are anti-aliased rather than stepped."""

    def __init__(self, size, inset):
        self.s = size
        self.inset = inset                     # fraction of the icon kept clear
        span = 1 - 2 * inset
        self.x0, self.x1 = inset, 1 - inset
        self.deck_y = inset + span * 0.62
        self.tower_x = (inset + span * 0.27, inset + span * 0.73)
        self.tower_top = inset + span * 0.16
        self.tower_w = span * 0.045
        self.deck_h = span * 0.055
        self.cable_w = span * 0.032
        self.hanger_w = span * 0.016
        self.sag = span * 0.30                 # how far the main cable dips
        self.polyline = self._cable()

    def _cable(self):
        """The main cable: two towers joined by a parabola, side spans falling
        to the deck ends. Sampled into segments once."""
        pts = []
        lx, rx = self.tower_x
        # left side span: from deck end up to the left tower top
        for k in range(0, 21):
            t = k / 20
            x = self.x0 + (lx - self.x0) * t
            y = self.deck_y - (self.deck_y - self.tower_top) * (t ** 1.6)
            pts.append((x, y))
        # main span: parabola between the towers
        for k in range(1, 41):
            t = k / 40
            x = lx + (rx - lx) * t
            y = self.tower_top + self.sag * (4 * t * (1 - t))
            pts.append((x, y))
        for k in range(1, 21):
            t = k / 20
            x = rx + (self.x1 - rx) * t
            y = self.tower_top + (self.deck_y - self.tower_top) * ((1 - (1 - t) ** 1.6))
            pts.append((x, y))
        return pts

    def cable_y(self, x):
        pts = self.polyline
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            if ax <= x <= bx:
                t = 0 if bx == ax else (x - ax) / (bx - ax)
                return ay + (by - ay) * t
        return None

    def coverage(self, px, py):
        """0..1 how much of this pixel the white mark covers."""
        x, y = px / self.s, py / self.s
        aa = 0.9 / self.s
        best = 10.0
        # deck
        best = min(best, self._rect(x, y, self.x0, self.deck_y - self.deck_h / 2,
                                    self.x1, self.deck_y + self.deck_h / 2, self.deck_h / 2))
        # towers, a little above the cable top and below the deck
        for tx in self.tower_x:
            best = min(best, self._rect(x, y, tx - self.tower_w / 2, self.tower_top - self.tower_w,
                                        tx + self.tower_w / 2, self.deck_y + self.deck_h * 1.6,
                                        self.tower_w / 2))
        # main cable
        pts = self.polyline
        d = min(seg_dist(x, y, ax, ay, bx, by) for (ax, ay), (bx, by) in zip(pts, pts[1:]))
        best = min(best, d - self.cable_w / 2)
        # hangers between the cable and the deck, on the main span and side spans
        lx, rx = self.tower_x
        n = 11
        for k in range(n):
            hx = self.x0 + (self.x1 - self.x0) * (k + 0.5) / n
            if abs(hx - lx) < self.tower_w or abs(hx - rx) < self.tower_w:
                continue
            cy = self.cable_y(hx)
            if cy is None or self.deck_y - cy < self.hanger_w * 2:
                continue
            best = min(best, self._rect(x, y, hx - self.hanger_w / 2, cy,
                                        hx + self.hanger_w / 2, self.deck_y, self.hanger_w / 2))
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


def draw(size, inset, corner, background=True, gradient=True, mark_color=WHITE, transparent_bg=False):
    bridge = Bridge(size, inset)
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            if background and not transparent_bg:
                bg = blend(INDIGO, INDIGO_DEEP, py / size) if gradient else INDIGO
                alpha = 255
                if corner:
                    d = _rounded_dist(px + 0.5, py + 0.5, size, corner)
                    alpha = int(255 * max(0.0, min(1.0, 0.5 - d)))
            else:
                bg, alpha = (0, 0, 0), 0
            c = bridge.coverage(px + 0.5, py + 0.5)
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
        (args.native / "android-icon-background.png", dict(size=1024, inset=0.5, corner=0, mark_color=INDIGO)),
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
        print(f"  {path.relative_to(ROOT)!s:<44} {spec['size']}px  {len(data) / 1024:.1f} KB")
    print(f"wrote {len(jobs)} icons")


if __name__ == "__main__":
    main()
