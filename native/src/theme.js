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

export const radius = { sm: 8, md: 14, lg: 20 };
export const space = { pad: 16, gap: 10 };

export function useTheme() {
  return useColorScheme() === "light" ? light : dark;
}

export { light, dark };
