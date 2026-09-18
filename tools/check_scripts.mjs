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
import { fold, TOKEN, translit } from "../core/util.js";
import { PEOPLE } from "../core/names.js";
import { briefs, FREE } from "./lesson_brief.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_DIR = join(ROOT, "data", "curated", "scripts");

const DATA = loadPayload(ROOT);
const L = DATA.lemmas, IX = DATA.index;

/* Proper nouns a script may use even though no lesson teaches them. A name is
   not vocabulary, but a passage with no people in it is not a passage.
 *
 * The people live in `core/names.js`, because the app needs the same list to
 * give each character a voice of the right sex and two copies would drift.
 * The places stay here — nothing but this check cares about them, and they are
 * the ones the corpus itself keeps naming. */
export const PLACES = new Set([
  "москва", "россия", "петербург", "сибирь", "киев", "волга", "джаред",
]);
export const NAMES = new Set(
  Object.keys(PEOPLE).map((n) => n.toLowerCase()).concat([...PLACES]));

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

/* Words the lexicon spells with ё and never with е (PLAYBOOK 3.2).
 *
 * ё written as е is a real authoring slip: it changes the pronunciation, and
 * the bought audio is generated from this text, so the voice says the wrong
 * vowel and nothing on screen looks wrong.
 *
 * **Only where there is no choice.** «все» is not a misspelling of «всё» —
 * they are different words that differ in exactly those two dots, and a
 * check that folds them together reports 48 errors in text that is correct
 * (measured 2026-09-16). A key the lexicon spells both ways is the writer's
 * call; a key it only ever spells with ё is not.
 *
 * Headwords only, deliberately: reaching every inflected form means
 * hydrating all 4,017 paradigms on a check that runs on every build, and the
 * slip this catches is nearly always the dictionary form («еще», «ребенок»).
 */
export const YO_ONLY = (() => {
  const yo = new Map(), eh = new Set();
  const plain = (s) => String(s).normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
  for (const w of L) {
    for (const form of [w.w, w.b]) {
      if (!form) continue;
      const b = plain(form);
      const k = fold(b);
      if (/ё/i.test(b)) { if (!yo.has(k)) yo.set(k, b); }
      else if (/е/i.test(b)) eh.add(k);
    }
  }
  for (const k of eh) yo.delete(k);
  return yo;
})();

/* Whether an English word reads like a Russian one said out loud — "parliament"
   for «парламент». The bar is a shared opening of four letters on words of
   five or more, which is what it takes to detect the case the rule is named
   after; a stricter test reported nothing on a corpus where nothing is wrong,
   which is a metric that cannot tell the skill from the flaw (§30r). */
export function cognate(englishWord, saidTranslit) {
  if (englishWord.length < 5 || saidTranslit.length < 5) return false;
  const n = Math.min(englishWord.length, saidTranslit.length);
  let same = 0;
  for (let i = 0; i < n; i++) { if (englishWord[i] !== saidTranslit[i]) break; same++; }
  return same >= 4;
}

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

/* Words a dialogue may introduce that its lesson has not taught (the owner,
 * 2026-09-17: *"Yes the dialogue can introduce new words"*).
 *
 * Why the allowance exists at all: chapter 1's whole palette is fifty words, of
 * which the spine's content words are five — мочь, год, хотеть, знать,
 * говорить. A conversation at a football match needs about forty nouns that do
 * not exist yet, so under the old gate the early scenes could only be people
 * asking each other who is where, which is what the owner reported as
 * repetitive and barely coherent.
 *
 * Six is the cap, and it is a cap rather than a target. §30j's finding is that
 * input has to be 95–98 % comprehensible to be worth listening to; six new
 * words in a forty-second scene of sixty is right at that edge, and more would
 * make the audio a vocabulary list read aloud. They are shown on screen with
 * their meaning before the audio plays (native/src/activities/Scene.js) and
 * never graded — the scenario still grades only what the lesson taught. */
export const INTRO_MAX = 6;
export const CAST_MIN = 2, CAST_MAX = 3;
export const QUESTIONS = 5, OPTIONS = 4;

export function checkOne(brief, entry) {
  const errors = [], warnings = [];
  const allow = new Set(brief.palette.map((w) => w.i));
  const isNew = new Set(brief.newWords.map((w) => w.i));
  const used = new Set();

  /* The words this dialogue introduces (INTRO_MAX). Checked before the lines
     are, because they widen what the lines may say. Four rules, and each one
     exists to stop the allowance becoming a way round the level match:
       - a real word, not an invented one;
       - not already taught, or the list is padding on screen;
       - actually said in the conversation, or it is noise;
       - and a content word, since the closed class is free anyway. */
  const introUsed = new Set();
  const intro = entry.intro || [];
  if (!Array.isArray(intro)) errors.push("`intro` is not a list");
  else if (intro.length > INTRO_MAX) {
    errors.push(`${intro.length} new words introduced, at most ${INTRO_MAX}`);
  }
  const introIdx = [];
  (Array.isArray(intro) ? intro : []).forEach((w, k) => {
    const where = `intro ${k + 1}`;
    if (!w || !w.ru || !w.en) { errors.push(`${where}: needs both ru and en`); return; }
    if (/[а-яё]/i.test(w.en)) errors.push(`${where}: the gloss is in English`);
    if (/[̀́]/.test(w.ru)) errors.push(`${where}: no stress marks here`);
    const key = fold(w.ru);
    const cand = candidatesFor(key);
    if (!cand.length) { errors.push(`${where}: "${w.ru}" is not a word the app knows`); return; }
    if (cand.some((i) => allow.has(i) || FREE.has(i))) {
      errors.push(`${where}: "${w.ru}" is already taught by this lesson — it is not new`);
      return;
    }
    introIdx.push(cand[0]);
    cand.forEach((i) => allow.add(i));
  });

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
      /* Against `core/names.js`, which is also where the app reads each
         character's sex to pick their voice. A name it does not carry has no
         sex, so it would be read aloud by whichever voice came first — which
         is the bug this table exists to stop. The English spelling is checked
         too: it is what the questions call the person, and a typo there is a
         question about somebody who is not in the conversation. */
      const person = PEOPLE[c.ru];
      if (!c.ru || !/^[А-ЯЁ][а-яё]+$/.test(c.ru)) errors.push(`speaker ${c.id}: "${c.ru}" is not a Russian given name`);
      else if (!person) errors.push(`speaker ${c.id}: "${c.ru}" is not in core/names.js`);
      if (!c.en || /[а-яё]/i.test(c.en)) errors.push(`speaker ${c.id}: no English name`);
      else if (person && person.en !== c.en) {
        errors.push(`speaker ${c.id}: "${c.ru}" is "${person.en}" in core/names.js, not "${c.en}"`);
      }
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
      /* The answer must not be the longest or shortest line on the screen.
       *
       * Measured over 770 of these on 2026-09-11 (tools/audit_options.mjs):
       * in 33 % the right answer was three or more characters longer or shorter
       * than every wrong one — "Ivan brings it himself" against "Nobody",
       * "Never", "Yes". A learner who reads no Russian can play that, and these
       * options are authored, so it is a writing habit rather than a generator
       * to fix: the specific answer gets written out and the wrong ones get
       * written short.
       *
       * It was a warning while 266 of the 840 were like that, because failing
       * the build on it would have failed it on work already done. All 266 were
       * rewritten on 2026-09-12 — the distractors were made the same length and
       * the same degree of specific as the answer, in context, one lesson at a
       * time — so the count is 0 and this is an **error** now. A rule nobody can
       * break is worth more than a rule everybody is already breaking. */
      const right = opts[q.answer];
      const others = opts.filter((_, n) => n !== q.answer);
      if (typeof right === "string" && others.length) {
        const len = (s) => String(s).length;
        const longest = Math.max(...others.map(len));
        const shortest = Math.min(...others.map(len));
        if (len(right) - longest >= 3 || shortest - len(right) >= 3) {
          errors.push(`${where}: the answer is the odd one out by length — "${right}" ` +
                      `(${len(right)} against ${others.map(len).join("/")})`);
        }
      }
    });

    /* At least one question that cannot be answered by spotting a cognate
       (PLAYBOOK 3.4). A learner who hears «парламент» and sees "parliament"
       among the options has answered without understanding anything, and a
       scenario made entirely of those tests nothing.
       Measured 2026-09-16: 0 of 840 questions are like that, because the
       questions ask about the situation rather than about words (§30l). The
       rule exists so that stays true. */
    if (qs.length) {
      const said = new Set();
      for (const l of rows) {
        for (const m of String(l.ru || "").match(TOKEN) || []) said.add(translit(fold(m)).toLowerCase());
      }
      const guessable = (q) => {
        const right = String((q.options || [])[q.answer] || "").toLowerCase();
        return right.split(/[^a-z]+/).filter((w) => w.length >= 5)
          .some((w) => [...said].some((s) => cognate(w, s)));
      };
      if (qs.every(guessable)) {
        errors.push("every question can be answered by spotting a cognate — none of them tests listening");
      }
    }
  }

  rows.forEach((row, k) => {
    const where = `line ${k + 1}`;
    if (!row || !row.ru || !row.en) { errors.push(`${where}: missing ru or en`); return; }
    if (!/[.?!…]$/.test(row.ru.trim())) errors.push(`${where}: no end punctuation — "${row.ru}"`);
    if (/[̀́]/.test(row.ru)) errors.push(`${where}: stress marks belong on headwords, not in a spoken line`);
    if (/[a-z]/i.test(row.ru)) errors.push(`${where}: Latin letters in the Russian — "${row.ru}"`);
    if (/[а-яё]/i.test(row.en)) errors.push(`${where}: Cyrillic in the English — "${row.en}"`);

    /* ё written as е, where the lexicon leaves no choice (see YO_ONLY). The
       audio is generated from this text, so the voice says the wrong vowel. */
    for (const raw of String(row.ru).match(TOKEN) || []) {
      if (/ё/i.test(raw)) continue;
      const real = YO_ONLY.get(fold(raw));
      if (!real) continue;
      const keepCase = raw[0] === raw[0].toUpperCase()
        ? real[0].toUpperCase() + real.slice(1) : real;
      errors.push(`${where}: "${raw}" is spelled "${keepCase}" — ё, not е`);
    }

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
      ok.forEach((i) => { if (introIdx.includes(i)) introUsed.add(i); });
    }
  });

  /* A word offered on screen and never said is a word the learner was asked to
     hold in their head for nothing. */
  for (const i of introIdx) {
    if (!introUsed.has(i)) {
      errors.push(`intro: "${L[i].b}" is introduced but never said in the conversation`);
    }
  }

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
