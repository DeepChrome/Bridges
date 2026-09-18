"""The 1024x500 feature graphic Google Play asks for (Phase 7, store listing).

Drawn from the same geometry as the launcher icon rather than made separately,
so the store image and the thing installed on the phone are provably one mark —
`make_app_icon.Bridge` is imported, not copied. Hand-rolled with zlib like its
sibling, so the repository can regenerate its own artwork with no image library
(rule 20.5).

**No wordmark.** Lettering without a font means hand-drawing letterforms, which
looks exactly as amateur as it sounds; Play shows the app name beside this
image in every placement that uses it, so the graphic is the mark and the
colour and nothing else. That is a decision, not an omission.

    python tools/make_feature_graphic.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_app_icon import Bridge, blend, png_bytes, INDIGO, INDIGO_DEEP, WHITE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
W, H = 1024, 500


def draw(w=W, h=H):
    """The mark at a readable size on the left third, on a diagonal gradient.

    Play crops this image differently in different placements and has always
    been liable to put a title over the middle, so the mark is kept off-centre
    and well inside the safe area rather than filling the frame.
    """
    # The mark is drawn in a square that is most of the height, set in from the
    # left; `Bridge` works in a unit square scaled to one size, so the square is
    # sampled through an offset rather than the class being changed.
    side = int(h * 0.74)
    ox, oy = int(w * 0.085), (h - side) // 2
    bridge = Bridge(side, 0.10)

    rows = []
    for py in range(h):
        row = []
        for px in range(w):
            # A diagonal blend rather than a vertical one: across 1024 px a
            # purely vertical gradient reads as a flat band.
            t = (px / w) * 0.45 + (py / h) * 0.55
            bg = blend(INDIGO, INDIGO_DEEP, t)
            sx, sy = px - ox, py - oy
            c = bridge.coverage(sx + 0.5, sy + 0.5) if 0 <= sx < side and 0 <= sy < side else 0.0
            col = blend(bg, WHITE, c)
            row.append((col[0], col[1], col[2], 255))
        rows.append(row)
    return png_bytes(w, h, rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "docs" / "store" / "feature-graphic.png"))
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    data = draw()
    out.write_bytes(data)
    print(f"wrote {out.relative_to(ROOT)}  {W}x{H}  {len(data) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
