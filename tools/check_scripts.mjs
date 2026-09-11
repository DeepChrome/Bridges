/* The guard on the written listening scenarios (§30k).
 *
 * The scenarios are authored rather than harvested, which means nothing about
 * them is true by construction. This is what can still be checked by machine,
 * and it is checked on every build:
 *
 *   - every Cyrillic token resolves to a curriculum lemma, so an invented word
 *     or a typo cannot ship;
 *   - every lemma it resolves to is one the learner has met by that lesson, or
 *     is below FREE_RANK — the level guarantee, the whole point of the file;
 *   - the conversation actually uses the words the lesson teaches;
 *   - lines stay inside the length the chapter has earned;
 *   - two or three speakers, each of whom says something and is named out loud,
 *     and none of whom says nearly everything;
 *   - the whole thing runs for something like the half minute it promises;
 *   - five questions, four distinct English options each, the answer among them;
 *   - no two lessons share a line of three words or more, and every lesson on
 *     the path has a scenario.
 *
 * What it cannot check is whether the Russian is idiomatic, or whether a
 * question is really answerable from the audio. Those are read by a person, and
 * the owner accepted the trade when he asked for these (§30a).
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

/* …and the forms those names take.
 *
 * A conversation cannot keep every name in the nominative — "who is Anya?",
 * "I know Ivan", "Masha's brother" are the sentences a scenario is made of —
 * and the lexicon carries no personal names at all, so nothing resolves them
 * the way «Москвы» resolves through «Москва». The declensions of a first name
 * are regular enough to generate: first-declension in -а/-я (Аня, Маша, and
 * Миша, which declines the same way), and masculine consonant stems. Being
 * over-generous here costs nothing — the set only ever admits names, and a
 * misspelled name is still a name.
 *
 * Everything is folded (ё→е), which is what the token check compares against;
 * «Пётр» would otherwise have failed against its own entry. */
const HUSH = /[шжчщкгх]$/;
function nameForms(name) {
  const n = name.toLowerCase();
  if (/[ая]$/.test(n)) {
    const s = n.slice(0, -1);
    const soft = n.endsWith("я");
    return [n, s + (soft || HUSH.test(s) ? "и" : "ы"), s + "е",
            s + (soft ? "ю" : "у"), s + (soft ? "ей" : "ой")];
  }
  if (n.endsWith("ь")) { const s = n.slice(0, -1); return [n, s + "и"]; }
  return [n, n + "а", n + "у", n + "ом", n + "е"];
}
/* Пётр loses its vowel outside the nominative, which no rule above knows. */
const NAME_ODD = ["петра", "петру", "петром", "петре"];
export const NAME_KEYS = new Set(
  [...NAMES].flatMap(nameForms).concat(NAME_ODD).map((n) => fold(n)));

/* How long a sentence may run, by chapter. Five words in the first chapter is
   about all thirty words of Russian can say; the allowance grows with the
   palette so chapter 10 is not still writing baby talk. */
export const maxWords = (chapter) => 4 + chapter;

export function tokensOf(ru) {
  return (ru.match(TOKEN) || []).map((t) => fold(t));
}

/* Which lemmas a folded form could be, in the order the app resolves them —
   index[key][0] is what a tap on the word opens. */
const candidatesFor = (key) => IX[key] || [];

/* How long the conversation will run on the device, in seconds — the same
   estimate the app plays it against (native/src/scenario.js). A scenario is
   meant to be 30–45 seconds; anything far outside that is either two exchanges
   pretending to be a scene or a monologue. */
export const GAP_MS = 420;
export const estimateMs = (text) => 400 + String(text || "").length * 70;
export const runSeconds = (lines) =>
  Math.round((lines.reduce((n, l) => n + estimateMs(l.ru) + GAP_MS, 0) - GAP_MS) / 1000);
export const MIN_SECONDS = 22, MAX_SECONDS = 70;

/* A conversation, not a reading: two or three people, eight to sixteen turns. */
export const MIN_LINES = 8, MAX_LINES = 16;
export const CAST_MIN = 2, CAST_MAX = 3;
export const QUESTIONS = 5, OPTIONS = 4;

export function checkOne(brief, entry) {
  const errors = [], warnings = [];
  const allow = new Set(brief.palette.map((w) => w.i));
  const isNew = new Set(brief.newWords.map((w) => w.i));
  const used = new Set();

  if (!entry.title || !entry.title.trim()) errors.push("no title");
  else if (entry.title.trim().split(/\s+/).length > 6) errors.push(`title too long: "${entry.title}"`);
  if (/[а-яё]/i.test(entry.title || "")) errors.push("the title is the English topic, not Russian");

  /* The scenario shape (§30k): a cast, their lines, and five questions about
     the situation. */
  const rows = entry.lines || [];
  if (!entry.lines) errors.push("no lines — this is not a scenario");
  {
    const cast = entry.cast || [];
    if (cast.length < CAST_MIN || cast.length > CAST_MAX) {
      errors.push(`${cast.length} speakers, wanted ${CAST_MIN}-${CAST_MAX}`);
    }
    const ids = new Set();
    cast.forEach((c, k) => {
      if (!c.id) errors.push(`speaker ${k + 1}: no id`);
      else if (ids.has(c.id)) errors.push(`two speakers share the id "${c.id}"`);
      ids.add(c.id);
      if (!c.ru || !/^[А-ЯЁ][а-яё]+$/.test(c.ru)) errors.push(`speaker ${c.id}: "${c.ru}" is not a Russian given name`);
      else if (!NAMES.has(c.ru.toLowerCase())) errors.push(`speaker ${c.id}: "${c.ru}" is not in the allowed names`);
      if (!c.en || /[а-яё]/i.test(c.en)) errors.push(`speaker ${c.id}: no English name`);
    });
    if (rows.length < MIN_LINES || rows.length > MAX_LINES) {
      errors.push(`${rows.length} lines, wanted ${MIN_LINES}-${MAX_LINES}`);
    }
    rows.forEach((l, k) => {
      if (!l.s || !ids.has(l.s)) errors.push(`line ${k + 1}: "${l.s}" is not one of the speakers`);
    });
    // Nobody says every line, and nobody is in the cast to say nothing.
    cast.forEach((c) => {
      const n = rows.filter((l) => l.s === c.id).length;
      if (!n) errors.push(`speaker ${c.id} never says anything`);
      else if (n > rows.length - 2) errors.push(`speaker ${c.id} says nearly everything`);
      /* "Who is talking?" is one of the five questions, and it can only be
         answered from the audio if somebody says the name out loud. The screen
         shows the cast, so a name never said makes the question a guess. */
      const said = rows.some((l) => tokensOf(l.ru || "").some(
        (k) => nameForms(c.ru || "").map((f) => fold(f)).includes(k)));
      if (!said) errors.push(`nobody says "${c.ru}" out loud`);
    });
    const secs = runSeconds(rows);
    if (secs < MIN_SECONDS || secs > MAX_SECONDS) {
      errors.push(`runs about ${secs}s, wanted ${MIN_SECONDS}-${MAX_SECONDS}s`);
    }

    const qs = entry.questions || [];
    if (qs.length !== QUESTIONS) errors.push(`${qs.length} questions, wanted ${QUESTIONS}`);
    const asked = new Set();
    qs.forEach((q, k) => {
      const where = `question ${k + 1}`;
      if (!q.ask || !q.ask.trim()) { errors.push(`${where}: nothing asked`); return; }
      if (/[а-яё]/i.test(q.ask)) errors.push(`${where}: the questions are in English`);
      if (q.ask.trim().split(/\s+/).length > 12) errors.push(`${where}: too long — "${q.ask}"`);
      if (asked.has(q.ask)) errors.push(`${where}: asked twice`);
      asked.add(q.ask);
      const opts = q.options || [];
      if (opts.length !== OPTIONS) errors.push(`${where}: ${opts.length} options, wanted ${OPTIONS}`);
      if (new Set(opts).size !== opts.length) errors.push(`${where}: two options are the same`);
      opts.forEach((o) => {
        if (/[а-яё]/i.test(o)) errors.push(`${where}: Cyrillic in an option — "${o}"`);
        if (String(o).split(/\s+/).length > 8) errors.push(`${where}: option too long — "${o}"`);
      });
      if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= opts.length) {
        errors.push(`${where}: answer ${q.answer} is not one of the options`);
      }
    });
  }

  rows.forEach((row, k) => {
    const where = `line ${k + 1}`;
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
      if (NAME_KEYS.has(key) || cand.some((i) => NAMES.has(L[i].b.toLowerCase()))) continue;
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
  const report = { lessons: 0, missing: [], errors: [], warnings: [], covered: 0,
                   of: all.length, seconds: [] };
  const seen = new Map();

  for (const [key, entry] of Object.entries(scripts)) {
    const brief = byKey.get(key);
    if (!brief) { report.errors.push(`${key}: no such lesson on the path`); continue; }
    report.lessons++;
    if (entry.lines) report.seconds.push(runSeconds(entry.lines));
    const r = checkOne(brief, entry);
    r.errors.forEach((e) => report.errors.push(`${key}: ${e}`));
    r.warnings.forEach((w) => report.warnings.push(`${key}: ${w}`));
    /* No two lessons may share a sentence — but a conversation is allowed its
       small change. «Да.», «Хорошо.», «А ты?» are how people actually answer
       each other, and a rule that forbids them across 168 scenarios would be a
       rule against writing dialogue. Anything of three words or more still has
       to be written once. */
    for (const row of entry.lines || []) {
      const f = fold(row.ru || "");
      if (tokensOf(row.ru || "").length < 3) continue;
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
  const secs = report.seconds.slice().sort((a, b) => a - b);
  console.log(`\n${report.lessons} lessons checked, ${report.of - report.lessons} without a script`
              + `, ${report.errors.length} errors, ${report.warnings.length} warnings`);
  console.log(`${report.seconds.length} scenarios`
              + (secs.length ? `; ${secs[0]}-${secs[secs.length - 1]}s, median ${secs[secs.length >> 1]}s` : ""));
  process.exit(report.errors.length ? 1 : 0);
}
