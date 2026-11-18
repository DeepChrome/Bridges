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

/* The radius scale (2026-11-18, the aesthetic sweep — CLAUDE.md 30cz). The
   exercise book cut its corners at 4–10, which with a hairline border reads
   as a form; the modern consumer apps the owner named as the bar round a
   control at 12 and a card at 16. Four steps on the 4-grid: a chip or a flag
   (sm), a button or an answer (md), a card, a list or a sheet (lg), the one
   large panel on a screen (xl). Pills stay 99. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20 };
/* On the 4-grid, like every mobile system's spacing (Material 3 included).
   `gap` was 10, which is the sort of value that makes a row look a pixel
   wrong without anyone being able to say why (tools/design.mjs). */
/* `pad` is a screen's side gutter. 20, not 16 (the owner, 2026-11-18: "preserve
   a little bit of padding from the side of the screen… where the text begins…
   doesn't need to be a ton"); the primary button at the foot of a page and
   the first letter of a row both sit off the edge by it. */
export const space = { pad: 20, gap: 12 };

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

/* The typeface: Inter (Rasmus Andersson, OFL; credited on Credits), since
 * 2026-11-18. PT Serif was the exercise book's and read as one — a notebook,
 * not an app — and the owner asked for the modern, clean feel of the apps
 * people use every day, which are all set in a sans. Inter is the one most of
 * them are set in, and it carries Cyrillic with the stress marks and ё in
 * their places. Four files, one per weight, because Android will not
 * synthesise a weight for a named family (§30bj): a semibold is a real
 * semibold now, which is what gives a row's title and a button's label their
 * step above body copy.
 *
 * `React Native has no global font.` Every `Text` that names a size must also
 * name a family or it silently falls back to the system one, which is worse
 * than not having a typeface at all: two fonts on one screen reads as a bug.
 * The app's own `Text` (ui.js) applies it, and **nothing imports `Text` from
 * react-native any more** — `font.test.js` is what keeps that true. The PT
 * Serif files stay in assets/fonts for the desktop app, which reads them by
 * path; the phone no longer bundles them. */
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};
export const fontFiles = {
  Inter_400Regular: require("../assets/fonts/Inter-Regular.ttf"),
  Inter_500Medium: require("../assets/fonts/Inter-Medium.ttf"),
  Inter_600SemiBold: require("../assets/fonts/Inter-SemiBold.ttf"),
  Inter_700Bold: require("../assets/fonts/Inter-Bold.ttf"),
};

/* Which file a weight resolves to. RN on Android does not synthesise weights
   for a named family — and asked for a weight a family lacks, it drops the
   family for Roboto (§30bj) — so a weight picks its file: 400 and under the
   regular, 500 the medium, 600 the semibold, 700 and over the bold. */
export function faceFor(weight) {
  const w = String(weight || "400");
  if (w === "500") return font.medium;
  if (w === "600") return font.semibold;
  if (w === "400" || w === "normal" || w === "300" || w === "200" || w === "100") return font.regular;
  return font.bold;
}

/* Depth: none. Surfaces are told apart by tone and a soft hairline, and a
   control by the press of its face into its edge (`Lift`), not by shadows —
   a dark theme has nothing for a shadow to fall on, and the two themes should
   not carry two depth models. The hook stays the one place a screen asks, so
   depth can come back in one line. */
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
