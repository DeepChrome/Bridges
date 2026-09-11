/* Design tokens, ported one-for-one from tools/app/app.css.
 *
 * React Native has no cascade and no custom properties, so the tokens become a plain
 * object chosen by colour scheme and handed down through context. Same values, same
 * names — a colour that changes here should change there. */

import { useColorScheme } from "react-native";

/* Every neutral sits on one hue — 220° in both themes — because a ramp that wanders
 * between hue families is what makes an interface look accidental. The palette was
 * warm (44°) until 2026-09-04; the sepia cast and a muddy goldenrod brand (#B67D18)
 * were most of why the app read as dated, so both themes moved to a cool neutral
 * with an indigo accent.
 *
 * Foreground values are not hand-picked: each was walked along its own hue until it
 * cleared its contrast minimum against the surface it actually sits on (4.5:1 for
 * text, 3:1 for the brand accent, 1.35:1 for hairlines). Six pairs failed before,
 * worst of them muted 13px text at 3.01:1. If you change one, re-run the audit
 * rather than trusting the swatch. */

const light = {
  bg: "#F7F8F9", surface: "#FFFFFF", surface2: "#EEF0F4", surface3: "#DFE3E9",
  ink: "#14171C", ink2: "#4B505A", ink3: "#676D79",
  line: "#D2D7E1", lineSoft: "#ECEFF3",
  brand: "#4D45E6", brandInk: "#2D24DB", brandBg: "#EBEAFD", brandDim: "#332CBC",
  good: "#22774D", goodBg: "#E1F3EA", goodDim: "#1F6B45",
  bad: "#B53E30", badBg: "#F9E6E4", badDim: "#A5382C",
  info: "#2967AE", infoBg: "#E2EEFB",
  brandOn: "#FFFFFF", goodOn: "#FFFFFF", badOn: "#FFFFFF",
};

const dark = {
  bg: "#0C0D10", surface: "#16181C", surface2: "#1F2228", surface3: "#2C3037",
  ink: "#EDEEF0", ink2: "#B9BCC3", ink3: "#959BA7",
  line: "#2E323B", lineSoft: "#22252B",
  brand: "#7F79F6", brandInk: "#8A85F7", brandBg: "#181636", brandDim: "#5A54D4",
  good: "#47C285", goodBg: "#12271D", goodDim: "#3C9F6E",
  bad: "#E16D60", badBg: "#2C1715", badDim: "#CA5649",
  info: "#639FE3", infoBg: "#152230",
  brandOn: "#0C0D10", goodOn: "#0C0D10", badOn: "#0C0D10",
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 26 };
export const space = { pad: 16, gap: 10 };

/* The type scale (2026-09-10). Before this the app used fifteen inline sizes —
   38, 30, 26, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10 — chosen one screen
   at a time, which is a large part of why a lesson read as flat: nothing was
   two clear steps away from anything else. New and rebuilt screens size from
   here. Existing literals are left alone rather than swept, since a blind
   find-and-replace across every screen is exactly the refactor §12 warns about.

   `hero` is the Russian word on a vocabulary card and nothing else. */
export const type = {
  hero: 40, display: 28, title: 20, head: 17, body: 15, small: 13, tiny: 11,
};

/* The typeface (2026-09-11).
 *
 * The app was set in whatever the phone's system font happens to be, at fifteen
 * sizes chosen a screen at a time. A system font is the single loudest signal
 * that nobody designed a screen — and on Android it is Roboto, which is what
 * every utility app on the phone is set in.
 *
 * Nunito: rounded, warm, and with a Cyrillic cut that carries stress marks and
 * ё properly, which most display faces do not. Weight is how hierarchy is made
 * here — the scale above is only five steps — so four weights ship.
 *
 * `React Native has no global font.` Every `Text` that names a size must also
 * name a family or it silently falls back to the system one, which is worse
 * than not having a typeface at all: two fonts on one screen reads as a bug.
 * The app's own `Text` (ui.js) applies it, and **nothing imports `Text` from
 * react-native any more** — `font.test.js` is what keeps that true. */
export const font = {
  regular: "Nunito_400Regular",
  medium: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  heavy: "Nunito_800ExtraBold",
};

/* Which file a weight resolves to. RN on Android does not synthesise weights
   for a named family: `fontWeight: "700"` on a regular face is ignored, and the
   text comes out light while the code says bold. So a weight picks its file. */
export function faceFor(weight) {
  const w = String(weight || "400");
  if (w === "800" || w === "900") return font.heavy;
  if (w === "700" || w === "bold") return font.bold;
  if (w === "500" || w === "600") return font.medium;
  return font.regular;
}

/* Depth (2026-09-11).
 *
 * Everything in the app sat on one plane: a white surface, a one-pixel
 * hairline, on an almost-white ground. That is the whole of "blocky squares" —
 * nothing is *above* anything, so nothing is more important than anything, and
 * a screen reads as a form rather than as a thing you are using.
 *
 * Two levels and no more. `raised` is a grouped surface — a card, a list; `lift`
 * is the one control on a screen that is the point of it. A third level would
 * be a decision to make on every screen, which is how an interface stops being
 * consistent.
 *
 * Shadows are near-black at very low opacity rather than grey, because a grey
 * shadow on a tinted ground goes muddy; and `elevation` is set alongside for
 * Android, which ignores the rest. Kept off the dark theme: a shadow under a
 * dark surface on a dark ground is invisible, and the border is what separates
 * things there. */
export const shadow = {
  raised: {
    shadowColor: "#0B1020", shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  lift: {
    shadowColor: "#0B1020", shadowOpacity: 0.13, shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
};
export function useShadow(level = "raised") {
  return useColorScheme() === "light" ? shadow[level] : null;
}

/* Motion. One place for how long a thing takes, so a card that rises and a bar
   that fills agree with each other. Deliberately short: §25 says motion
   reinforces interaction and must never be decoration that delays study, so
   these are the shortest durations that still read as movement rather than as
   a repaint. Anything above `celebrate` is too slow to sit between questions. */
export const motion = { quick: 130, enter: 240, settle: 380, celebrate: 520 };

export function useTheme() {
  return useColorScheme() === "light" ? light : dark;
}

export { light, dark };
