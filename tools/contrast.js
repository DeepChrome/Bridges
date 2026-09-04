/* Palette audit: contrast minimums, and the two platforms agreeing.
 *
 * Two things regress quietly and neither shows up in the other suites. A colour
 * nudged for looks can drop text under its WCAG minimum — muted 13px text once sat
 * at 3.01:1 — and a colour changed on one platform leaves the other behind, which
 * is the drift rule 20a exists to prevent.
 *
 * Reads the shipped sources, not a copy: native/src/theme.js and tools/app/app.css.
 *
 *     node tools/contrast.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const THEME = path.join(ROOT, "native", "src", "theme.js");
const CSS = path.join(ROOT, "tools", "app", "app.css");

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log(`  pass  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`); }
};
const group = (t) => console.log(`\n${t}`);

/* ------------------------------------------------------------------ colour */

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ------------------------------------------------------------------ parse */

function nativePalette(name) {
  const src = fs.readFileSync(THEME, "utf8");
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`no ${name} palette in theme.js`);
  const out = {};
  for (const t of m[1].matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)) out[t[1]] = t[2].toUpperCase();
  return out;
}

/* CSS uses kebab-case custom properties for the same tokens. */
const cssName = (k) => "--" + k.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

function cssPalette(which) {
  const src = fs.readFileSync(CSS, "utf8");
  // light = the bare :root block; dark = the [data-theme="dark"] block.
  const block = which === "light"
    ? src.match(/:root\s*\{([\s\S]*?)\n\}/)
    : src.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error(`no ${which} block in app.css`);
  const out = {};
  for (const t of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) {
    out[t[1]] = t[2].toUpperCase();
  }
  return out;
}

// [foreground, background, minimum, what it is]
const PAIRS = [
  ["ink", "bg", 4.5, "body text on the page"],
  ["ink", "surface", 4.5, "body text on a card"],
  ["ink", "surface2", 4.5, "text on the secondary surface"],
  ["ink2", "bg", 4.5, "secondary text on the page"],
  ["ink2", "surface", 4.5, "secondary text on a card"],
  // Muted 13px text turns up on all three grounds, so it must clear the darkest.
  ["ink3", "bg", 4.5, "muted text on the page"],
  ["ink3", "surface", 4.5, "muted text on a card"],
  ["ink3", "surface2", 4.5, "muted text on the secondary surface"],
  ["brandInk", "brandBg", 4.5, "brand pill text"],
  ["good", "goodBg", 4.5, "correct-answer text"],
  ["bad", "badBg", 4.5, "wrong-answer text"],
  ["ink", "goodBg", 4.5, "feedback heading, correct"],
  ["ink", "badBg", 4.5, "feedback heading, wrong"],
  ["brand", "bg", 3.0, "brand accent and focus ring"],
  ["line", "bg", 1.3, "hairline against the page"],
];

for (const theme of ["light", "dark"]) {
  const p = nativePalette(theme);
  group(`${theme} theme — contrast`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!p[fg] || !p[bg]) continue;
    const r = ratio(p[fg], p[bg]);
    ok(r >= min, `${what} (${fg} on ${bg}) ≥ ${min}:1`, `${r.toFixed(2)}:1`);
  }

  group(`${theme} theme — one hue family for the neutrals`);
  // A ramp that wanders between hue families is what makes a palette look
  // accidental; the old light ramp had green-grey text on warm paper.
  const hueOf = (h) => {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const max = Math.max(r, g, b), min2 = Math.min(r, g, b), d = max - min2;
    if (d < 0.008) return null;                   // effectively neutral
    let hh;
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    return ((hh * 60) + 360) % 360;
  };
  const keys = ["bg", "surface2", "surface3", "line", "lineSoft", "ink", "ink2", "ink3"];
  const hues = keys.map((k) => [k, p[k] && hueOf(p[k])]).filter(([, h]) => h !== null && h !== undefined);
  const base = hues.length ? hues[0][1] : 0;
  for (const [k, h] of hues) {
    const d = Math.min(Math.abs(h - base), 360 - Math.abs(h - base));
    ok(d <= 40, `${k} shares the neutral hue family`, `hue ${Math.round(h)} vs ${Math.round(base)}`);
  }
}

group("the two platforms carry the same palette");
for (const theme of ["light", "dark"]) {
  const n = nativePalette(theme);
  const c = cssPalette(theme);
  for (const k of Object.keys(n)) {
    const name = cssName(k);
    if (!(name in c)) continue;                   // CSS-only extras are fine
    ok(c[name] === n[k], `${theme}: ${k} matches ${name}`, `css ${c[name]} vs native ${n[k]}`);
  }
}

console.log(`\n${pass + fail} checks · ${fail ? `${fail} FAILED` : "all passed"}`);
process.exit(fail ? 1 : 0);
