/* The palette as CSS custom properties, from core/palette.js — the same
   values the phone draws with, so one audit (tools/contrast.js) covers both.
   `applyTheme("dark" | "light")` writes them onto :root. */

import { palette } from "@core/palette";

const cssName = (k) => "--" + k.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

export function applyTheme(scheme) {
  const p = palette(scheme);
  const root = document.documentElement;
  for (const k in p) root.style.setProperty(cssName(k), p[k]);
  root.dataset.theme = scheme;
  document.body.style.background = p.bg;
}

export { palette };
