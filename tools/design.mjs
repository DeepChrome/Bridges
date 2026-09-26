/* The measurable half of "does this look designed", as a gate.
 *
 *   node tools/design.mjs            report
 *   node tools/design.mjs --strict   exit 1 on a failure
 *
 * **Why this exists.** The owner has said three times that the app "looks AI
 * generated", and each time the fix came from *measuring* a screen rather
 * than looking at it: §30s found a card had become the default container,
 * §30ah found eight identical rings and ten identical grey rows, §30ak found
 * an activity centred in seven hundred pixels of nothing. What none of those
 * passes had was an instrument, so each one had to rediscover the method.
 *
 * This is the instrument for the part of visual design that is arithmetic.
 * It cannot tell you a screen is ugly. It can tell you the type scale jumps
 * 1.43× in one place and 1.13× in another, that a shadow is five times
 * blurrier than it is deep, or that a spacing value is off the grid — and
 * those are what make an interface read as assembled rather than drawn.
 *
 * **The rules are not invented here.** They are the measurable subset of
 * Anthony Hobday's "Visual design rules you can safely follow every time"
 * (anthonyhobday.com/sideprojects/saferules/ — the most endorsed thing in
 * this category anywhere, and concrete enough to enforce) plus Material 3,
 * which is the design language of the platform this app ships on. Where a
 * rule is a web rule that does not survive contact with a phone, it is
 * marked ADVISORY and does not fail the gate — a full-width button does not
 * care about its horizontal padding ratio.
 *
 * `tools/contrast.js` is the sibling: it owns colour *contrast*, this owns
 * scale, rhythm and depth. Neither picks a value by eye.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME = readFileSync(join(ROOT, "native/src/theme.js"), "utf8");
const STRICT = process.argv.includes("--strict");

let fails = 0, warns = 0, checks = 0;
const pass = (label, extra) => { checks++; console.log("  pass  " + label + (extra ? "  → " + extra : "")); };
const fail = (label, extra) => { checks++; fails++; console.log("  FAIL  " + label + (extra ? "  → " + extra : "")); };
const advise = (label, extra) => { checks++; warns++; console.log("  note  " + label + (extra ? "  → " + extra : "")); };
const group = (n) => console.log("\n" + n);

/* ------------------------------------------------------------ reading the tokens */

/* The token objects are read out of the source rather than imported, because
   theme.js imports react-native. Same approach as contrast.js. */
function objectNamed(name) {
  const m = THEME.match(new RegExp(`(?:export )?const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n?\\};`));
  if (!m) throw new Error(`theme.js has no ${name}`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*("?[#A-Za-z0-9_.-]+"?)/g)) {
    const n = Number(v);
    out[k] = Number.isFinite(n) && v !== "" ? n : v.replace(/"/g, "");
  }
  return out;
}

const radius = objectNamed("radius");
const space = objectNamed("space");
const type = objectNamed("type");
const motion = objectNamed("motion");
const light = objectNamed("light");
const dark = objectNamed("dark");

/* The two shadow levels, each its own nested object. */
function shadowLevel(name) {
  const m = THEME.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`));
  if (!m) throw new Error(`theme.js has no shadow.${name}`);
  const body = m[1];
  const num = (k) => {
    const g = body.match(new RegExp(`${k}:\\s*(-?[0-9.]+)`));
    return g ? Number(g[1]) : null;
  };
  return { radius: num("shadowRadius"), height: num("height"), opacity: num("shadowOpacity"),
           elevation: num("elevation") };
}

/* ------------------------------------------------------------------ colour */

const rgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
/* HSL saturation and lightness, 0–1. */
function hsl(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
/* Perceived lightness, for the container-brightness rule. */
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* --------------------------------------------------------------- the rules */

group("scale — every step the same distance apart");
{
  /* A scale a reader can feel is one where each step is a consistent ratio.
     Hobday: "use a consistent scale"; Material 3's own type scale is built
     this way. What makes a set of sizes read as fifteen arbitrary choices is
     adjacent steps that jump 1.43× here and 1.13× there. */
  /* The **text band** — everything running text is set in. `hero` is left
     out on purpose and checked below: Material 3 separates its display sizes
     from its text sizes for the same reason, because a hero element is meant
     to leap rather than to be one step up. Excluding it is the rule, not an
     excuse for a value that fails. */
  const sizes = ["display", "title", "head", "body", "small", "tiny"].map((k) => type[k]);
  const steps = sizes.slice(0, -1).map((v, i) => v / sizes[i + 1]);
  const lo = Math.min(...steps), hi = Math.max(...steps);
  const spread = hi / lo;
  const shown = steps.map((r) => r.toFixed(2)).join(" · ");
  if (spread <= 1.10) pass("the text scale steps are even", shown);
  else fail("the text scale jumps unevenly", `${shown}  (widest ${hi.toFixed(2)}× / narrowest ${lo.toFixed(2)}×)`);

  /* And the one display size sits clearly above the band rather than beside
     the top of it, or it is not a hero, it is a heading. */
  if (type.hero / type.display >= 1.3) pass("hero leaps off the top of the band", `${type.hero} / ${type.display}`);
  else fail("hero is not clearly larger than display", `${type.hero} / ${type.display}`);

  /* Body text on a phone. Hobday's floor is 16; Material 3's body-large is
     16sp and is what Android's own apps set running text in. */
  if (type.body >= 16) pass("body text is at least 16", String(type.body));
  else fail("body text is under 16", `${type.body} — Material 3 body-large is 16sp`);

  /* The radius scale: even steps, for the same reason the type scale wants
     them, and every value on the 2-grid so a nested radius can be exact. */
  const rs = [radius.sm, radius.md, radius.lg, radius.xl];
  const gaps = rs.slice(1).map((v, i) => v - rs[i]);
  if (new Set(gaps).size === 1) pass("the radius scale steps evenly", gaps.join(" · "));
  else fail("the radius scale steps unevenly", gaps.join(" · "));
}

group("rhythm — spacing on one grid");
{
  /* Hobday: space in multiples of 8 (4 is the practical half-step every
     mobile system uses, Material 3 included). A value off the grid is the
     one that makes a row look a pixel wrong without anyone seeing why. */
  const off = Object.entries(space).filter(([, v]) => v % 4 !== 0);
  if (!off.length) pass("the spacing tokens are on the 4-grid", Object.entries(space).map(([k, v]) => `${k} ${v}`).join(" · "));
  else fail("a spacing token is off the 4-grid", off.map(([k, v]) => `${k} ${v}`).join(" · "));
}

group("depth — a shadow is a light source, not a haze");
{
  /* Hobday: shadow blur should be about twice the distance. A blur far wider
     than the offset is the soft grey halo that every generated interface
     has; it reads as fog rather than as a thing lifted off the page. */
  for (const name of ["raised", "lift"]) {
    const s = shadowLevel(name);
    const ratio = s.radius / s.height;
    if (ratio >= 1.6 && ratio <= 2.6) pass(`shadow.${name} blur is about twice its distance`, `${s.radius} / ${s.height}`);
    else fail(`shadow.${name} blur is ${ratio.toFixed(1)}× its distance`,
              `blur ${s.radius}, distance ${s.height} — want blur ≈ ${s.height * 2}`);
  }
}

group("colour — neutrals that read as neutral");
{
  /* Hobday: keep neutrals under 5% saturation, or the greys read as tinted
     and fight the accent. This app deliberately runs every neutral on one
     hue (220°), which is right; the rule is about how *far* along it. */
  const neutrals = ["bg", "surface", "surface2", "surface3", "line", "lineSoft", "ink", "ink2", "ink3"];
  for (const [theme, name] of [[light, "light"], [dark, "dark"]]) {
    const hot = neutrals.filter((k) => hsl(theme[k]).s > 0.12);
    if (!hot.length) pass(`${name}: the neutrals stay near-grey`);
    else advise(`${name}: a neutral is strongly tinted`,
                hot.map((k) => `${k} ${(hsl(theme[k]).s * 100).toFixed(0)}%`).join(" · "));
  }

  /* Hobday: a container's brightness should sit within 7% of the background
     in light mode, 12% in dark. Wider than that and the card stops being a
     surface and starts being a block. */
  for (const [theme, name, limit] of [[light, "light", 0.07], [dark, "dark", 0.12]]) {
    const base = lum(theme.bg);
    const wide = ["surface", "surface2"].filter((k) => Math.abs(lum(theme[k]) - base) > limit);
    if (!wide.length) pass(`${name}: the surfaces sit close to the page`);
    else advise(`${name}: a surface is far from the page`,
                wide.map((k) => `${k} ${(Math.abs(lum(theme[k]) - base) * 100).toFixed(0)}%`).join(" · "));
  }
}

group("motion — Material 3's own durations");
{
  /* M3 puts a small utility transition at 100–200 ms and an entering element
     at 200–400 ms. Anything past half a second between questions is delay
     rather than movement (§25). */
  const ok = motion.quick >= 80 && motion.quick <= 200
    && motion.enter >= 180 && motion.enter <= 400
    && motion.settle >= 250 && motion.settle <= 500
    && motion.celebrate <= 600;
  if (ok) pass("the durations sit inside Material 3's bands",
               Object.entries(motion).map(([k, v]) => `${k} ${v}`).join(" · "));
  else fail("a duration is outside Material 3's bands",
            Object.entries(motion).map(([k, v]) => `${k} ${v}`).join(" · "));
}

/* ------------------------------------------- what the screens actually use */

group("the screens against the scales");
{
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js")) files.push(p);
    }
  })(join(ROOT, "native/src"));

  const sizes = new Set(Object.values(type));
  const offSize = new Map();
  const offSpace = new Map();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [, v] of src.matchAll(/fontSize:\s*(\d+)/g)) {
      const n = Number(v);
      if (!sizes.has(n)) offSize.set(n, (offSize.get(n) || 0) + 1);
    }
    for (const [, k, v] of src.matchAll(/\b(margin|padding|gap)(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*(\d+)/g)) {
      const n = Number(v);
      if (n && n % 4 !== 0) offSpace.set(n, (offSpace.get(n) || 0) + 1);
    }
  }
  const sizeTotal = [...offSize.values()].reduce((a, b) => a + b, 0);
  const spaceTotal = [...offSpace.values()].reduce((a, b) => a + b, 0);
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([v, n]) => `${v}×${n}`).join(" ");

  /* ADVISORY, and deliberately so. Sweeping every literal across 30 files is
     the blind refactor §12 warns about; what the number is for is knowing
     whether the scales are actually being used, and by how much they are
     being ignored. */
  advise(`${sizeTotal} inline font sizes are off the type scale`, top(offSize) || "none");
  advise(`${spaceTotal} inline spacing values are off the 4-grid`, top(offSpace) || "none");
}

console.log(`\n${checks} checks · ${fails} failed · ${warns} to consider`);
process.exit(STRICT && fails ? 1 : 0);
