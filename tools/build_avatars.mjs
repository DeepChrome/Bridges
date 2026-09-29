#!/usr/bin/env node
/* The profile characters, from DiceBear (2026-09-28).
 *
 * The ten hand-drawn faces read as clip-art (ROADMAP 13.43). DiceBear draws
 * avatars in styles made by working illustrators, and a style's faces are
 * generated from a seed, so a set is consistent by construction. Nothing of
 * DiceBear ships: this tool renders the chosen faces to SVG markup once and
 * writes core/avatars.js, which both apps already read (rule 20.5 — no
 * runtime dependency).
 *
 * DiceBear is not a dependency of the repo either. Install it anywhere and
 * point the tool at it:
 *
 *   npm i --prefix <dir> @dicebear/core @dicebear/collection
 *   node tools/build_avatars.mjs --from <dir>              # writes core/avatars.js
 *   node tools/build_avatars.mjs --from <dir> --sheet out.html [--styles a,b]
 *
 * --sheet writes a contact sheet of candidate styles instead, for choosing.
 */

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const from = opt("--from");
if (!from) {
  console.error("--from <dir> is required: a folder where @dicebear/core and @dicebear/collection are installed");
  process.exit(2);
}
const req = createRequire(join(resolve(from), "noop.js"));
const load = async (name) => import(pathToFileURL(req.resolve(name)).href);
const { createAvatar } = await load("@dicebear/core");
const collection = await load("@dicebear/collection");

/* The style shipped, and the faces in it. Seeds were chosen off the contact
   sheet for variety — hair, skin, expression — rather than taken in order. */
const STYLE = "adventurer";
/* Every face happy: the smiling mouths and the open, bright or winking eyes
   only, read off a sheet of all thirty mouths and twenty-six eyes. The owner
   asked for "modern cool fun avatars"; half this style's expressions are
   sleepy, sulking or side-eyed, which is a character, not a welcome. */
const STYLE_OPTS = {
  mouth: ["variant30", "variant29", "variant28", "variant27", "variant26", "variant25",
          "variant24", "variant23", "variant22", "variant05", "variant01"],
  eyes: ["variant26", "variant25", "variant24", "variant23", "variant22", "variant21",
         "variant20", "variant19"],
};
/* Backgrounds: saturated but not loud, and each distinct from the brand
   indigo so a face never melts into the header it sits in. */
const BGS = ["#FFD166", "#06D6A0", "#8ECAE6", "#F4A261", "#CDB4DB", "#FF8FAB",
             "#90DBF4", "#B9FBC0", "#FFC8DD", "#A0C4FF", "#FDFFB6", "#FFADAD"];

/* Twelve, picked off a sheet of 48 (--candidates 48) for range — skin, hair,
   glasses, a flower crown, sunglasses — and each kept on the background it
   was chosen against (`c<N>` sat on BGS[N % 12]). The first is the default
   for a new profile. */
const pick = (n, id, name) => ({ id, name, seed: "c" + n, bg: BGS[n % BGS.length] });
const FACES = [
  pick(0, "curls", "Curls"), pick(1, "mint", "Mint"), pick(3, "blossom", "Blossom"),
  pick(7, "fern", "Fern"), pick(9, "ginger", "Ginger"), pick(13, "frost", "Frost"),
  pick(14, "ace", "Ace"), pick(15, "shades", "Shades"), pick(17, "bun", "Bun"),
  pick(21, "teal", "Teal"), pick(24, "bubblegum", "Bubblegum"), pick(45, "sunny", "Sunny"),
];

/* Ids inside a face (masks, clip paths) are made unique per face: several
   faces share one page on the web and in the picker, and two masks named
   alike draw each other's shapes — which is what the first contact sheet
   showed, half its styles cut to slivers. Deterministic, so a re-run writes
   the same file. */
const scopeIds = (svg, tag) => {
  const ids = [...new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${tag}-${id}"`)
             .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${tag}-${id})`)
             .replace(new RegExp(`href="#${esc}"`, "g"), `href="#${tag}-${id}"`);
  }
  return out;
};
const svgOf = (style, seed, extra = {}) =>
  scopeIds(createAvatar(collection[style], { seed, ...extra }).toString(),
           `${style}-${String(seed).replace(/[^\w-]/g, "")}`);

/* Split a rendered SVG into its viewBox and inner markup, since the apps wrap
   the markup in their own <svg> at whatever size they draw it. Metadata is
   dropped: it is licence text for a file, and the licence rides in AV_CREDIT. */
function parts(svg) {
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || "0 0 100 100";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  return { vb, inner };
}

const sheet = opt("--sheet");
/* --candidates N: N seeds of the chosen style with its options, named, for
   picking the set. */
const candidates = Number(opt("--candidates") || 0);
if (sheet && candidates) {
  let html = `<!doctype html><meta charset="utf-8"><style>body{font:11px system-ui;margin:12px;display:flex;flex-wrap:wrap;gap:8px}
    div{width:84px;text-align:center}.a{width:76px;height:76px;border-radius:50%;overflow:hidden;margin:auto}
    .a svg{width:76px;height:76px}</style>`;
  for (let i = 0; i < candidates; i++) {
    html += `<div><div class="a" style="background:${BGS[i % BGS.length]}">${svgOf(STYLE, "c" + i, STYLE_OPTS)}</div>c${i}</div>`;
  }
  writeFileSync(sheet, html);
  console.log(`${candidates} candidates of ${STYLE} → ${sheet}`);
  process.exit(0);
}
if (sheet) {
  const styles = (opt("--styles") || "notionists,micah,adventurer,bigSmile,lorelei,funEmoji,personas,openPeeps,avataaars,thumbs")
    .split(",").filter((s) => collection[s]);
  const seeds = Array.from({ length: 16 }, (_, i) => `bridges-${i}`);
  let html = `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;margin:16px;background:#f7f8f9}
    h2{margin:18px 0 6px}.row{display:flex;flex-wrap:wrap;gap:10px}
    .a{width:72px;height:72px;border-radius:50%;overflow:hidden;display:grid;place-items:center}
    .a svg{width:72px;height:72px}.s{width:40px;height:40px}.s svg{width:40px;height:40px}
    small{display:block;color:#666}</style>`;
  for (const s of styles) {
    const lic = collection[s].meta && collection[s].meta.license;
    html += `<h2>${s}</h2><small>${lic ? lic.name : "?"} · ${
      (collection[s].meta && collection[s].meta.creator) || ""}</small><div class="row">`;
    seeds.forEach((seed, i) => {
      html += `<div class="a" style="background:${BGS[i % BGS.length]}">${svgOf(s, seed)}</div>`;
    });
    html += `</div><div class="row" style="margin-top:6px">`;
    seeds.slice(0, 8).forEach((seed, i) => {
      html += `<div class="a s" style="background:${BGS[i % BGS.length]}">${svgOf(s, seed)}</div>`;
    });
    html += `</div>`;
  }
  writeFileSync(sheet, html);
  console.log(`contact sheet: ${styles.length} styles × ${seeds.length} → ${sheet}`);
  process.exit(0);
}

if (!collection[STYLE] || !FACES.length) {
  console.error("choose STYLE and FACES from a contact sheet first (--sheet)");
  process.exit(2);
}
const meta = collection[STYLE].meta || {};
const out = {};
let bytes = 0;
FACES.forEach((f, i) => {
  const { vb, inner } = parts(svgOf(STYLE, f.seed, { ...STYLE_OPTS, ...(f.opts || {}) }));
  out[f.id] = { name: f.name, bg: f.bg || BGS[i % BGS.length], vb, svg: inner };
  bytes += inner.length;
});

const credit = {
  title: meta.title || STYLE,
  creator: meta.creator || "",
  license: meta.license ? meta.license.name : "",
  url: (meta.license && meta.license.url) || meta.homepage || "",
  via: "DiceBear (dicebear.com)",
};

const src = `/* GENERATED by tools/build_avatars.mjs — do not edit. Re-run the tool.
 *
 * The profile characters: ${FACES.length} faces in DiceBear's "${credit.title}"
 * style by ${credit.creator}, ${credit.license}. Rendered to SVG once at build
 * time, so neither app carries DiceBear. Each face is its viewBox and inner
 * markup; a renderer wraps it in its own <svg> at the size it needs.
 */

export const AV = ${JSON.stringify(out, null, 2)};

export const AV_IDS = Object.keys(AV);

/* Profiles made before these faces carry one of the ten hand-drawn ids. Each
   keeps a face of its own rather than all falling to the first (§20.4: a
   profile's choices are its data). */
export const AV_LEGACY = ${JSON.stringify(Object.fromEntries(
  ["monkeynaut", "gymbun", "shadesduck", "djcat", "scarfbear", "profowl",
   "kingfrog", "bowtiepen", "sneakfox", "spikelib"].map((old, i) => [old, FACES[i % FACES.length].id])), null, 2)};

export const avatarOf = (id) => AV[id] || AV[AV_LEGACY[id]] || AV[AV_IDS[0]];

/* The licence obligation (rule 20.10), drawn by the credits screen. */
export const AV_CREDIT = ${JSON.stringify(credit, null, 2)};
`;
writeFileSync(join(ROOT, "core", "avatars.js"), src);
console.log(`core/avatars.js: ${FACES.length} faces, ${STYLE} (${credit.license}), ${(bytes / 1024).toFixed(1)} KB of markup`);
