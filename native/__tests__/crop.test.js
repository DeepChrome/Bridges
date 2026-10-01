/* A card crops a photograph around its subject, not its middle (2026-10-01:
   "if it's Cat… the cat shouldn't be cropped from the head up"). The render
   tree cannot show a crop, so the arithmetic is asserted directly, over every
   photo that ships. */

import { cropFor, pictureOf } from "../src/pictures";
import { IMAGES, SHAPES } from "../src/images";

const CARD_W = 358, MIN_H = 190, MAX_H = 300;
const boxFor = (ratio) => Math.max(MIN_H, Math.min(MAX_H, CARD_W / ratio));

describe("cropping a photograph", () => {
  it("every shipped photo has a shape and a focus inside it", () => {
    for (const w of Object.keys(IMAGES)) {
      const s = SHAPES[w];
      expect(s).toBeTruthy();
      expect(s[0] > 0 && s[1] > 0).toBe(true);
      expect(s[2] >= 0 && s[2] <= 1).toBe(true);
    }
  });

  it("keeps each photo's subject inside the window, never stretched", () => {
    for (const w of Object.keys(IMAGES)) {
      const p = pictureOf(w);
      if (p.drawn) continue;
      const h = boxFor(p.ratio);
      const at = cropFor(p.ratio, p.focus, CARD_W, h);
      // The photo keeps its own shape and covers the box.
      expect(Math.abs(at.width / at.height - p.ratio)).toBeLessThan(1e-9);
      expect(at.width).toBeGreaterThanOrEqual(CARD_W - 1e-9);
      expect(at.height).toBeGreaterThanOrEqual(h - 1e-9);
      expect(at.left).toBeLessThanOrEqual(0);
      expect(at.top).toBeLessThanOrEqual(0);
      expect(at.top).toBeGreaterThanOrEqual(-(at.height - h) - 1e-9);
      // The subject's line is on screen.
      const y = at.height * p.focus + at.top;
      expect(y >= 0 && y <= h).toBe(true);
    }
  });

  it("shows a 4:3 photo whole on a phone-width card", () => {
    const at = cropFor(4 / 3, 0.5, CARD_W, boxFor(4 / 3));
    expect(Math.abs(at.top)).toBeLessThan(1e-9);
    expect(at.height).toBeCloseTo(boxFor(4 / 3));
  });

  it("keeps the cat's head: the window starts at the top of the photo", () => {
    const p = pictureOf("кот");
    if (!p) return;                      // a re-cut may stop teaching the word
    const at = cropFor(p.ratio, p.focus, CARD_W, boxFor(p.ratio));
    expect(Math.abs(at.top)).toBeLessThan(1e-9);
  });
});
