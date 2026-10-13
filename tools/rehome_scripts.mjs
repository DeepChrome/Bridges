/* After a curriculum re-cut the scripted conversations fall out of step with
 * their lessons: a script is checked against the exact lesson a word is taught
 * in (check_scripts.mjs), and a re-cut moves lesson boundaries and words
 * (§30n, §30bh). This tool does the mechanical part of the repair:
 *
 *   1. For every failing script, try each lesson of its unit and keep the
 *      placement with the fewest errors (ties keep the current lesson).
 *   2. Drop `intro` words the lesson now teaches ("already taught — not new"),
 *      and introduce the content words the lines use that the lesson has not
 *      taught, up to INTRO_MAX, glossed from the dictionary.
 *   3. Report what is left — lines that still use untaught words past the
 *      allowance, or a script using too few of its lesson's words — which is a
 *      writer's job (docs/scenario-brief.md).
 *
 *   node tools/rehome_scripts.mjs            dry run: the plan and what remains
 *   node tools/rehome_scripts.mjs --apply    write the chapter files
 *
 * Runs after build_site (it reads the built payload, as check_scripts does).
 * The chapter files keep their one-space indent. */

import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAll, loadScripts, SCRIPT_DIR, INTRO_MAX } from "./check_scripts.mjs";
import { loadPayload } from "./payload.mjs";
import { firstSense, fold } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = loadPayload(ROOT);
const L = DATA.lemmas;
const apply = process.argv.includes("--apply");

const lessonsOf = (unitId) => {
  const u = DATA.units.find((x) => x.id === unitId);
  return u ? (u.ls || []).length : 0;
};
const errorsFor = (key, entry) => checkAll({ [key]: entry }).errors
  .filter((e) => e.startsWith(key + ":")).map((e) => e.slice(key.length + 2));
const lemmaIdx = (bare) => L.findIndex((x) => x && fold(x.b) === fold(bare));

/* Which file holds a key. */
const files = fs.readdirSync(SCRIPT_DIR).filter((f) => f.endsWith(".json"))
  .map((f) => ({ path: join(SCRIPT_DIR, f), json: JSON.parse(fs.readFileSync(join(SCRIPT_DIR, f), "utf8")) }));
const fileOf = (key) => files.find((f) => (f.json.lessons || f.json)[key]);

const scripts = loadScripts();
const report = checkAll(scripts, { strict: true });
const failing = [...new Set(report.errors.map((e) => e.split(":").slice(0, 2).join(":")))]
  .filter((k) => scripts[k]);
console.log(`${failing.length} failing script(s), ${report.errors.length} errors`);

let remaining = 0;
// Lessons already holding a conversation — the ones not moving, and the
// destinations chosen earlier in this run. Two scripts once moved onto one
// lesson and the second overwrote the first (2026-10-12).
const taken = new Set(Object.keys(scripts).filter((k) => !failing.includes(k)));
for (const key of failing) {
  const [unit] = key.split(":");
  const entry = JSON.parse(JSON.stringify(scripts[key]));
  const n = lessonsOf(unit);
  // 1. The placement with the fewest errors.
  let best = { key, errs: errorsFor(key, entry) };
  for (let j = 0; j < n; j++) {
    const cand = `${unit}:${j}`;
    if (cand === key || taken.has(cand)) continue;
    const errs = errorsFor(cand, entry);
    if (errs.length < best.errs.length) best = { key: cand, errs };
  }
  taken.add(best.key);
  // 2. The intro list: drop what is taught now, introduce what the lines need.
  const pass = (errs) => {
    const intro = (entry.intro || []).slice();
    const taughtNow = errs.map((e) => e.match(/^intro \d+: "([^"]+)" is already taught/)).filter(Boolean).map((m) => m[1]);
    let next = intro.filter((w) => !taughtNow.includes(w.ru));
    const need = [...new Set(errs.map((e) => e.match(/^line \d+: "[^"]+" is (\S+) \((\w+)\), which this lesson has not taught/))
      .filter(Boolean).map((m) => m[1]))];
    for (const bare of need) {
      if (next.length >= INTRO_MAX) break;
      if (next.some((w) => fold(w.ru) === fold(bare))) continue;
      const i = lemmaIdx(bare);
      if (i < 0) continue;
      next.push({ ru: L[i].b, en: firstSense(L[i]) || "" });
    }
    return next;
  };
  entry.intro = pass(best.errs);
  let errs = errorsFor(best.key, entry);
  // A second look: words the intro freed may reveal "already taught" of its own.
  entry.intro = pass(errs);
  errs = errorsFor(best.key, entry);
  const moved = best.key !== key ? ` → ${best.key}` : "";
  console.log(`\n${key}${moved}: intro [${(entry.intro || []).map((w) => w.ru).join(", ")}] · ${errs.length} error(s) left`);
  for (const e of errs) console.log(`   ${e}`);
  remaining += errs.length;
  if (apply) {
    const f = fileOf(key);
    const box = f.json.lessons || f.json;
    delete box[key];
    box[best.key] = entry;
    f.changed = true;
  }
}
if (apply) {
  for (const f of files) if (f.changed) {
    // Keys in lesson order, as the files are kept.
    const box = f.json.lessons || f.json;
    const sorted = Object.fromEntries(Object.entries(box).sort((a, b) => {
      const [ua, ia] = a[0].split(":"), [ub, ib] = b[0].split(":");
      return ua === ub ? Number(ia) - Number(ib) : a[0].localeCompare(b[0]);
    }));
    if (f.json.lessons) f.json.lessons = sorted; else f.json = sorted;
    fs.writeFileSync(f.path, JSON.stringify(f.json, null, 1) + "\n", "utf8");
    console.log(`wrote ${f.path}`);
  }
}
console.log(`\n${remaining} error(s) need a writer${apply ? "" : " (dry run — add --apply to write)"}`);
