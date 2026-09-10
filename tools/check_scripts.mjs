/* The guard on the written listening scripts (§30j).
 *
 * The scripts are authored rather than harvested, which means nothing about them
 * is true by construction. This is what can still be checked by machine, and it
 * is checked on every build:
 *
 *   - every Cyrillic token resolves to a curriculum lemma, so an invented word
 *     or a typo cannot ship;
 *   - every lemma it resolves to is one the learner has met by that lesson, or
 *     is below FREE_RANK — the level guarantee, the whole point of the file;
 *   - the passage actually uses the words the lesson teaches;
 *   - sentences stay inside the length the chapter has earned;
 *   - no two lessons share a sentence, and every lesson on the path has one.
 *
 * What it cannot check is whether the Russian is idiomatic. That is read by a
 * person, and the owner accepted the trade when he asked for these (§30a).
 *
 *   node tools/check_scripts.mjs                      # data/curated/scripts/
 *   node tools/check_scripts.mjs --file <path.json>   # one chapter, while writing
 *   node tools/check_scripts.mjs --strict             # missing lessons are errors
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { fold, TOKEN } from "../core/util.js";
import { briefs, FREE } from "./lesson_brief.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_DIR = join(ROOT, "data", "curated", "scripts");

const DATA = loadPayload(ROOT);
const L = DATA.lemmas, IX = DATA.index;

/* Proper nouns a script may use even though no lesson teaches them. Kept short
   and explicit: a name is not vocabulary, but a passage with no people in it is
   not a passage. Cities are the ones the corpus itself keeps naming. */
export const NAMES = new Set([
  "анна", "аня", "иван", "ваня", "маша", "мария", "саша", "лена", "нина", "олег",
  "борис", "виктор", "катя", "миша", "пётр", "петя", "соня", "таня", "юра",
  "москва", "россия", "петербург", "сибирь", "киев", "волга", "джаред",
]);

/* How long a sentence may run, by chapter. Five words in the first chapter is
   about all thirty words of Russian can say; the allowance grows with the
   palette so chapter 10 is not still writing baby talk. */
export const maxWords = (chapter) => 4 + chapter;
export const MIN_ROWS = 4, MAX_ROWS = 5;

export function tokensOf(ru) {
  return (ru.match(TOKEN) || []).map((t) => fold(t));
}

/* Which lemmas a folded form could be, in the order the app resolves them —
   index[key][0] is what a tap on the word opens. */
const candidatesFor = (key) => IX[key] || [];

export function checkOne(brief, entry) {
  const errors = [], warnings = [];
  const allow = new Set(brief.palette.map((w) => w.i));
  const isNew = new Set(brief.newWords.map((w) => w.i));
  const used = new Set();

  if (!entry.title || !entry.title.trim()) errors.push("no title");
  else if (entry.title.trim().split(/\s+/).length > 6) errors.push(`title too long: "${entry.title}"`);
  if (/[а-яё]/i.test(entry.title || "")) errors.push("the title is the English topic, not Russian");

  const rows = entry.rows || [];
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) {
    errors.push(`${rows.length} sentences, wanted ${MIN_ROWS}-${MAX_ROWS}`);
  }

  rows.forEach((row, k) => {
    const where = `sentence ${k + 1}`;
    if (!row || !row.ru || !row.en) { errors.push(`${where}: missing ru or en`); return; }
    if (!/[.?!…]$/.test(row.ru.trim())) errors.push(`${where}: no end punctuation — "${row.ru}"`);
    if (/[̀́]/.test(row.ru)) errors.push(`${where}: stress marks belong on headwords, not in a spoken line`);
    if (/[a-z]/i.test(row.ru)) errors.push(`${where}: Latin letters in the Russian — "${row.ru}"`);
    if (/[а-яё]/i.test(row.en)) errors.push(`${where}: Cyrillic in the English — "${row.en}"`);

    const toks = tokensOf(row.ru);
    if (toks.length > maxWords(brief.chapter)) {
      errors.push(`${where}: ${toks.length} words, chapter ${brief.chapter} allows ${maxWords(brief.chapter)} — "${row.ru}"`);
    }
    if (!toks.length) errors.push(`${where}: no Russian in it`);

    for (const key of toks) {
      const cand = candidatesFor(key);
      // A name is checked by its dictionary form, not its surface: «Москвы» is
      // genitive, and matching the folded token alone let the gate reject a
      // name it had been given. Names the lexicon does not carry at all still
      // pass on the surface form.
      if (NAMES.has(key) || cand.some((i) => NAMES.has(L[i].b.toLowerCase()))) continue;
      if (!cand.length) {
        errors.push(`${where}: "${key}" is not a form of any word the app knows — "${row.ru}"`);
        continue;
      }
      const ok = cand.filter((i) => allow.has(i) || FREE.has(i));
      if (!ok.length) {
        const who = L[cand[0]];
        errors.push(`${where}: "${key}" is ${who.b} (${who.p}), which this lesson has not taught — "${row.ru}"`);
        continue;
      }
      if (!(allow.has(cand[0]) || FREE.has(cand[0]))) {
        // The word is fine for the level, but a tap on it opens a different
        // lemma — the shared-form trap of §23, in a sentence we chose to write.
        warnings.push(`${where}: "${key}" opens ${L[cand[0]].b}, not ${L[ok[0]].b}`);
      }
      ok.forEach((i) => used.add(i));
    }
  });

  const hit = brief.newWords.filter((w) => used.has(w.i));
  const want = Math.min(3, brief.newWords.length);
  if (hit.length < want) {
    errors.push(`uses ${hit.length} of this lesson's ${brief.newWords.length} words, wanted ${want}`
                + ` (missing ${brief.newWords.filter((w) => !used.has(w.i)).map((w) => w.b).join(", ")})`);
  }
  return { errors, warnings, newHit: hit.length, newOf: brief.newWords.length };
}

export function loadScripts(dir = SCRIPT_DIR) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const obj = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const [k, v] of Object.entries(obj.lessons || obj)) {
      if (out[k]) throw new Error(`${k} is written twice (${f})`);
      out[k] = v;
    }
  }
  return out;
}

export function checkAll(scripts, { strict = false } = {}) {
  const all = briefs();
  const byKey = new Map(all.map((b) => [b.key, b]));
  const report = { lessons: 0, missing: [], errors: [], warnings: [], covered: 0, of: all.length };
  const seen = new Map();

  for (const [key, entry] of Object.entries(scripts)) {
    const brief = byKey.get(key);
    if (!brief) { report.errors.push(`${key}: no such lesson on the path`); continue; }
    report.lessons++;
    const r = checkOne(brief, entry);
    r.errors.forEach((e) => report.errors.push(`${key}: ${e}`));
    r.warnings.forEach((w) => report.warnings.push(`${key}: ${w}`));
    for (const row of entry.rows || []) {
      const f = fold(row.ru || "");
      if (seen.has(f)) report.errors.push(`${key}: "${row.ru}" is already used by ${seen.get(f)}`);
      else seen.set(f, key);
    }
  }
  report.covered = report.lessons;
  for (const b of all) if (!scripts[b.key]) report.missing.push(b.key);
  if (strict && report.missing.length) {
    report.errors.push(`${report.missing.length} lessons have no script: ${report.missing.slice(0, 8).join(", ")}…`);
  }
  return report;
}

/* ------------------------------------------------------------------ CLI */

if (process.argv[1] && process.argv[1].endsWith("check_scripts.mjs")) {
  const argv = process.argv.slice(2);
  const k = argv.indexOf("--file");
  const scripts = k >= 0
    ? (() => { const o = JSON.parse(readFileSync(argv[k + 1], "utf8")); return o.lessons || o; })()
    : loadScripts();
  const report = checkAll(scripts, { strict: argv.includes("--strict") });

  report.warnings.forEach((w) => console.log(`warn  ${w}`));
  report.errors.forEach((e) => console.log(`FAIL  ${e}`));
  console.log(`\n${report.lessons} lessons checked, ${report.of - report.lessons} without a script`
              + `, ${report.errors.length} errors, ${report.warnings.length} warnings`);
  process.exit(report.errors.length ? 1 : 0);
}
