/* A reviewed CSV back into the curated files (PLAYBOOK 3.3).
 *
 * The rule is that nobody hand-edits the JSON. The reviewer fills in `fix`
 * on the rows they changed and sends the file back; this applies those by
 * id, prints exactly what moved, and leaves the checks to say whether the
 * result still holds.
 *
 *   node tools/import_review.mjs review/content_v1_reviewed.csv
 *   node tools/import_review.mjs review/content_v1_reviewed.csv --apply
 *
 * Reading and showing is the default; writing needs `--apply`, because this
 * edits the one part of the repo that is hand-authored and cannot be
 * regenerated (rule 20.3).
 *
 * What it refuses, rather than guessing:
 *   - an id it does not know how to place;
 *   - a `fix` on a row whose `ru`/`en` no longer matches the file, which
 *     means the CSV was reviewed against an older export;
 *   - a fix that empties a string, or puts Latin letters into Russian.
 *
 * The parsing and the planning are exported and tested (core.test.mjs);
 * only the writing is behind the command line.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_DIR = join(ROOT, "data", "curated", "scripts");

/* ------------------------------------------------------------- CSV in */

/* A real CSV reader: a reviewer's note will contain commas, quotes and
   newlines, and a split(",") would shred the file silently — which, in a
   tool that edits the curated data, is the worst kind of bug. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false, any = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      any = true;
      continue;
    }
    if (c === '"') { quoted = true; any = true; continue; }
    if (c === ",") { row.push(field); field = ""; any = true; continue; }
    if (c === "\r") continue;
    if (c === "\n") {
      if (any) { row.push(field); rows.push(row); }
      row = []; field = ""; any = false;
      continue;
    }
    field += c; any = true;
  }
  if (any) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
}

/* ------------------------------------------------- where an id lives */

/* Each id names a lesson and a path inside it. Parsed rather than looked up,
   so a new kind of row needs a case here and cannot be applied by accident.
   Only the scenarios are writable: the rest of the export (the alphabet, the
   tasks, the Talk situations) lives in `core/*.js` as code, and rewriting
   source from a spreadsheet is a worse idea than a person editing it. */
export function locate(id) {
  let m;
  if ((m = String(id).match(/^script:([^:]+):(\d+):title$/))) {
    return { unit: m[1], key: `${m[1]}:${m[2]}`, path: ["title"], lang: "en" };
  }
  if ((m = String(id).match(/^script:([^:]+):(\d+):line:(\d+)$/))) {
    return { unit: m[1], key: `${m[1]}:${m[2]}`, path: ["lines", +m[3], "ru"], lang: "ru" };
  }
  if ((m = String(id).match(/^script:([^:]+):(\d+):line:(\d+):en$/))) {
    return { unit: m[1], key: `${m[1]}:${m[2]}`, path: ["lines", +m[3], "en"], lang: "en" };
  }
  if ((m = String(id).match(/^script:([^:]+):(\d+):q:(\d+):ask$/))) {
    return { unit: m[1], key: `${m[1]}:${m[2]}`, path: ["questions", +m[3], "ask"], lang: "en" };
  }
  if ((m = String(id).match(/^script:([^:]+):(\d+):q:(\d+):opt:(\d+)$/))) {
    return { unit: m[1], key: `${m[1]}:${m[2]}`, path: ["questions", +m[3], "options", +m[4]], lang: "en" };
  }
  return null;
}

const at = (obj, path) => path.reduce((o, k) => (o === undefined || o === null ? o : o[k]), obj);
function setAt(obj, path, value) {
  const parent = path.slice(0, -1).reduce((o, k) => o[k], obj);
  parent[path[path.length - 1]] = value;
}

/* ------------------------------------------------------------- plan */

/* -> { changes, refused }. `docs` maps a unit id to the parsed chapter file
   it lives in; nothing is written here, so a test hands in objects and reads
   the plan back. */
export function plan(rows, docs) {
  const changes = [], refused = [], byHand = [];
  for (const r of rows || []) {
    const fix = String(r.fix || "").trim();
    const id = String(r.id || "").trim();
    if (!fix) continue;
    const where = locate(id);
    /* A row the export knows and this tool deliberately does not write — the
       grammar notes and reference, the Talk situations, the alphabet, which
       live in code — is a correction to make by hand, not a failure. Only an
       id nothing exports is refused. */
    if (!where) {
      if (/^(script|talk|alphabet|note|ref|name):/.test(id)) {
        byHand.push({ id, before: String(r.ru || r.en || ""), after: fix, note: String(r.note || "").trim() });
      } else {
        refused.push(`${id}: not an id this tool knows how to apply`);
      }
      continue;
    }
    const doc = docs[where.unit];
    const entry = doc && (doc.lessons || {})[where.key];
    if (!entry) { refused.push(`${id}: ${where.key} is not in the scripts`); continue; }

    const before = at(entry, where.path);
    if (before === undefined || before === null) { refused.push(`${id}: nothing at that position any more`); continue; }

    // The CSV must have been reviewed against what the file holds now.
    const claimed = String((where.lang === "ru" ? r.ru : r.en) || "");
    if (claimed && claimed !== String(before)) {
      refused.push(`${id}: the row says "${claimed}" but the file holds "${before}" — reviewed against an older export`);
      continue;
    }
    if (String(before) === fix) continue;
    if (where.lang === "ru" && /[A-Za-z]/.test(fix)) {
      refused.push(`${id}: the correction has Latin letters in it: "${fix}"`);
      continue;
    }
    changes.push({ id, unit: where.unit, key: where.key, path: where.path,
                   before: String(before), after: fix, note: String(r.note || "").trim() });
  }
  return { changes, refused, byHand };
}

export function applyPlan(changes, docs) {
  const touched = new Set();
  for (const c of changes) {
    setAt(docs[c.unit].lessons[c.key], c.path, c.after);
    touched.add(c.unit);
  }
  return touched;
}

/* --------------------------------------------------------------- files */

/* Which chapter file a unit's lessons live in, read from the files
   themselves because the mapping belongs to the data, not to a convention. */
export function scriptFiles(dir = SCRIPT_DIR) {
  const byUnit = {}, byFile = {}, indentOf = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const p = join(dir, f);
    const text = readFileSync(p, "utf8");
    const obj = JSON.parse(text);
    byFile[p] = obj;
    // Written back with the file's own indentation (one space): a two-space
    // rewrite showed every line of a chapter as changed for one corrected word.
    indentOf[p] = indentOfText(text);
    for (const k of Object.keys(obj.lessons || {})) byUnit[k.split(":")[0]] = obj;
  }
  return { byUnit, byFile, indentOf };
}

export const indentOfText = (text) => {
  const m = String(text).match(/^\{\r?\n( +)"/);
  return m ? m[1].length : 2;
};

/* ------------------------------------------------------------------ CLI */

if (process.argv[1] && process.argv[1].endsWith("import_review.mjs")) {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const FILE = argv.find((a) => !a.startsWith("--"));
  if (!FILE || !existsSync(FILE)) {
    console.error("usage: node tools/import_review.mjs <reviewed.csv> [--apply]");
    process.exit(2);
  }

  const rows = parseCsv(readFileSync(FILE, "utf8"));
  const { byUnit, byFile, indentOf } = scriptFiles();
  const { changes, refused, byHand } = plan(rows, byUnit);

  console.log(`${rows.length} rows read, ${changes.length} corrections, ${byHand.length} to make by hand, `
              + `${refused.length} refused\n`);
  for (const c of changes) {
    console.log(`  ${c.id}`);
    console.log(`    - ${c.before}`);
    console.log(`    + ${c.after}` + (c.note ? `        (${c.note})` : ""));
  }
  if (byHand.length) {
    console.log("\nto make by hand (these live in code, core/*.js or grammar_notes.json):");
    for (const c of byHand) {
      console.log(`  ${c.id}`);
      console.log(`    - ${c.before}`);
      console.log(`    + ${c.after}` + (c.note ? `        (${c.note})` : ""));
    }
  }
  if (refused.length) {
    console.log("\nrefused:");
    for (const r of refused) console.log(`  ${r}`);
  }

  if (!APPLY) {
    console.log(`\nnothing written. Re-run with --apply to change ${new Set(changes.map((c) => c.unit)).size} file(s).`);
    process.exit(refused.length ? 1 : 0);
  }

  const touched = applyPlan(changes, byUnit);
  const written = [];
  for (const [p, doc] of Object.entries(byFile)) {
    if (![...touched].some((u) => Object.keys(doc.lessons || {}).some((k) => k.startsWith(u + ":")))) continue;
    writeFileSync(p, JSON.stringify(doc, null, indentOf[p]) + "\n", "utf8");
    written.push(p.replace(ROOT + "\\", "").replace(/\\/g, "/"));
  }
  console.log(`\nwrote ${written.join(", ") || "nothing"}`);
  console.log("now: node tools/check_scripts.mjs --strict");
  console.log("     and re-run build_scenario_audio.mjs + build_scene_tracks.mjs if a Russian line moved (§30l)");
  process.exit(refused.length ? 1 : 0);
}
