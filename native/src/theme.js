/* Design tokens, ported one-for-one from tools/app/app.css.
 *
 * React Native has no cascade and no custom properties, so the tokens become a plain
 * object chosen by colour scheme and handed down through context. Same values, same
 * names — a colour that changes here should change there. */

import { useScheme } from "./appearance";

/* The exercise book (2026-10-01). What was the "UI test" skin (§30bj,
 * docs/ui-test-notebook.md) is the app's only look: the owner, "I like the new
 * UI… scrap the old UI". Ink on plain paper in the light — a neutral page,
 * dark blue ink for the brand, the teacher's red pen for a wrong answer and a
 * mark — and at night an ink-dark blue with chalk-white text and a lamp-gold
 * accent. The rounded indigo look before it is in git.
 *
 * Foreground values are not hand-picked: each clears its contrast minimum
 * against the surface it actually sits on (4.5:1 for text, 3:1 for the brand
 * accent, 1.35:1 for hairlines). If you change one, re-run tools/contrast.js
 * rather than trusting the swatch. */

/* The values live in core/palette.js since 2026-11-07, shared with the
   desktop app; tools/contrast.js audits them there. */
import { light, dark } from "@core/palette";

/* Small cut corners, as on a sheet of paper: a control a little rounder than
   the page it sits on. */
export const radius = { sm: 4, md: 6, lg: 8, xl: 10 };
/* On the 4-grid, like every mobile system's spacing (Material 3 included).
   `gap` was 10, which is the sort of value that makes a row look a pixel
   wrong without anyone being able to say why (tools/design.mjs). */
export const space = { pad: 16, gap: 12 };

/* The type scale (2026-09-10). Before this the app used fifteen inline sizes —
   38, 30, 26, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10 — chosen one screen
   at a time, which is a large part of why a lesson read as flat: nothing was
   two clear steps away from anything else. New and rebuilt screens size from
   here. Existing literals are left alone rather than swept, since a blind
   find-and-replace across every screen is exactly the refactor §12 warns about.

   **Every step is the same distance apart** (2026-09-26). It was not: the
   steps ran 1.43 · 1.40 · 1.18 · 1.13 · 1.15 · 1.18, so the top of the scale
   leapt and the middle of it barely moved — `title` at 20 and `head` at 17
   were not two clear steps apart, they were almost the same size, which is
   the arithmetic behind a screen reading as flat. The text band is now a
   steady ~1.20 anchored on a 16 body (the floor for running text on a phone,
   and Material 3's own body-large): 28 · 23 · 19 · 16 · 13 · 11, every
   adjacent pair within 4% of the same ratio. `tools/design.mjs` is the gate.

   `hero` is the Russian word on a vocabulary card and nothing else — a
   display one-off deliberately off the top of the band, the way Material 3
   separates its display sizes from its text sizes. */
export const type = {
  hero: 40, display: 28, title: 23, head: 19, body: 16, small: 13, tiny: 11,
};

/* The typeface: PT Serif, the exercise book's (Paratype, OFL; credited on
 * Credits). Made for Cyrillic, so stress marks and ё sit properly.
 *
 * `React Native has no global font.` Every `Text` that names a size must also
 * name a family or it silently falls back to the system one, which is worse
 * than not having a typeface at all: two fonts on one screen reads as a bug.
 * The app's own `Text` (ui.js) applies it, and **nothing imports `Text` from
 * react-native any more** — `font.test.js` is what keeps that true. */
export const font = {
  regular: "PTSerif_400Regular",
  bold: "PTSerif_700Bold",
};
export const fontFiles = {
  PTSerif_400Regular: require("../assets/fonts/PTSerif-Regular.ttf"),
  PTSerif_700Bold: require("../assets/fonts/PTSerif-Bold.ttf"),
};

/* Which file a weight resolves to. RN on Android does not synthesise weights
   for a named family — and asked for a weight a family lacks, it drops the
   family for Roboto (§30bj) — so a weight picks its file, and the app's four
   weights fold into PT Serif's two: a semibold that read as emphasis is bold. */
export function faceFor(weight) {
  const w = String(weight || "400");
  return w === "400" || w === "normal" || w === "300" ? font.regular : font.bold;
}

/* Depth: none. Paper on paper does not float — the exercise book separates
   things with hairlines and the press of a control into its edge (`Lift`),
   not with shadows, and that flatness is part of what the owner liked. The
   hook stays the one place a screen asks, so depth can come back in one line. */
export function useShadow() {
  return null;
}

/* Motion. One place for how long a thing takes, so a card that rises and a bar
   that fills agree with each other. Deliberately short: §25 says motion
   reinforces interaction and must never be decoration that delays study, so
   these are the shortest durations that still read as movement rather than as
   a repaint. Anything above `celebrate` is too slow to sit between questions. */
export const motion = { quick: 130, enter: 240, settle: 380, celebrate: 520 };

export function useTheme() {
  return useScheme() === "dark" ? dark : light;
}

export const palette = (scheme) => (scheme === "dark" ? dark : light);

export { light, dark };
