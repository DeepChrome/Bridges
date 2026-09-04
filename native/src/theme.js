/* Design tokens, ported one-for-one from tools/app/app.css.
 *
 * React Native has no cascade and no custom properties, so the tokens become a plain
 * object chosen by colour scheme and handed down through context. Same values, same
 * names — a colour that changes here should change there. */

import { useColorScheme } from "react-native";

/* Every neutral sits on one hue per theme — warm (44°) on the pale ground, cool
 * (205°) on the dark one — because a ramp that wanders between hue families is what
 * makes an interface look accidental. The previous light ramp put green-grey text
 * (hue 135) on warm paper (hue 47), which is the muddiness you could see but not
 * name.
 *
 * Foreground values are not hand-picked: each was walked along its own hue until it
 * cleared its contrast minimum against the surface it actually sits on (4.5:1 for
 * text, 3:1 for the brand accent, 1.35:1 for hairlines). Six pairs failed before,
 * worst of them muted 13px text at 3.01:1. If you change one, re-run the audit
 * rather than trusting the swatch. */

const light = {
  bg: "#F5F4F2", surface: "#FFFFFF", surface2: "#EBEAE6", surface3: "#DFDDD8",
  ink: "#1A1917", ink2: "#4E4B45", ink3: "#6C685F",
  line: "#D6D3CD", lineSoft: "#E8E7E3",
  brand: "#B67D18", brandInk: "#8A6114", brandBg: "#F6EBD3", brandDim: "#956713",
  good: "#28784D", goodBg: "#DFF0E5", goodDim: "#246E46",
  bad: "#B2423A", badBg: "#F7E2E0", badDim: "#9A382F",
  info: "#386CA8", infoBg: "#E2ECF8",
};

const dark = {
  bg: "#0F1112", surface: "#171B1E", surface2: "#202427", surface3: "#292F33",
  ink: "#EEEFEF", ink2: "#B9BEC2", ink3: "#959CA1",
  line: "#2B3135", lineSoft: "#212528",
  brand: "#E0A73C", brandInk: "#EDBE62", brandBg: "#2C2517", brandDim: "#A87B24",
  good: "#4CAF7D", goodBg: "#16281E", goodDim: "#3B8A62",
  bad: "#E0685D", badBg: "#2A1917", badDim: "#BD6157",
  info: "#6BA3E0", infoBg: "#152230",
};

/* Literata carries the Cyrillic and does the language's typography; the system face
   handles the interface until the font is bundled. */
export const RU_FONT = undefined;

export const radius = { sm: 8, md: 14, lg: 20 };
export const space = { pad: 16, gap: 10 };

export function useTheme() {
  return useColorScheme() === "light" ? light : dark;
}

export { light, dark };
