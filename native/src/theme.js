/* Design tokens, ported one-for-one from tools/app/app.css.
 *
 * React Native has no cascade and no custom properties, so the tokens become a plain
 * object chosen by colour scheme and handed down through context. Same values, same
 * names — a colour that changes here should change there. */

import { useColorScheme } from "react-native";

const light = {
  bg: "#F6F5F1", surface: "#FFFFFF", surface2: "#EDEBE4", surface3: "#E2DFD5",
  ink: "#17181A", ink2: "#5A5D5E", ink3: "#8B8F8C",
  line: "#DEDCD3", lineSoft: "#EAE8E1",
  brand: "#C08519", brandInk: "#8A6114", brandBg: "#F6EBD3", brandDim: "#9A6B14",
  good: "#2F8C5A", goodBg: "#DFF0E5", goodDim: "#246E46",
  bad: "#C0473E", badBg: "#F7E2E0", badDim: "#9A382F",
  info: "#3C74B4", infoBg: "#E2ECF8",
};

const dark = {
  bg: "#0E1113", surface: "#171B1E", surface2: "#1F2428", surface3: "#282F34",
  ink: "#ECEFF1", ink2: "#A0A8AD", ink3: "#78817F",
  line: "#2A3136", lineSoft: "#212728",
  brand: "#E0A73C", brandInk: "#EDBE62", brandBg: "#2C2517", brandDim: "#A87B24",
  good: "#4CAF7D", goodBg: "#16281E", goodDim: "#357C58",
  bad: "#E0685D", badBg: "#2A1917", badDim: "#A44A41",
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
