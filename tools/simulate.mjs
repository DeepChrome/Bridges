/* Simulated learners: the curriculum as a learner meets it, measured.
 *
 * Drives the real generators (core/questions.js) and the real scheduler
 * (core/fsrs.js) through the path in the order the app would present it, with a
 * learner who answers according to a profile, and reports what no suite checks:
 * how often a word comes straight back, how the activity mix is balanced, how the
 * sentences and the new-word load grow per chapter, how much review piles up, and
 * where a generated question is structurally wrong (duplicate options, an empty
 * quiz, a gap-fill with no gap).
 *
 * Deterministic: every random choice — the generators' and the learners' — comes
 * from a seeded generator, so the same command is the same trial. Change the app,
 * rerun, diff the report. That is the point.
 *
 *   node tools/simulate.mjs                       # three profiles, 40 lessons each
 *   node tools/simulate.mjs --lessons 60 --seed 7
 *   node tools/simulate.mjs --profile struggling
 *
 * Writes tools/sim/<date>-<seed>.md and .json; prints the summary. Exit code 1 when
 * a structural check fails, so it can gate a build.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, TOKEN } from "../core/util.js";
import { makeQuestions, QUIZ_N, SPEECH_MIX, lessonSize } from "../core/questions.js";
import { gradeFor, applyGrade, isTrouble, fsrsReview } from "../core/fsrs.js";
import { quizPassed, RELIEF_AFTER, reviewFirst, REVIEW_FIRST } from "../core/state.js";
import { compare } from "../core/compare.js";
import { gradeAlignment, sentenceLemmas } from "../core/speech.js";
import { parseDeep } from "../core/search.js";
import { makeHydrator } from "../core/entry.js";
import { loadPayload } from "./payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const LESSONS = parseInt(arg("--lessons", "40"), 10);
const SEED = parseInt(arg("--seed", "1"), 10);
const ONLY = arg("--profile", null);
/* The review-first threshold (core/state.js REVIEW_FIRST), overridable so the
   number can be chosen by sweeping it rather than by eye. `--review-first 0`
   turns the rule off, which is how the before/after comparison is made. */
const HOLD_AT = parseInt(arg("--review-first", String(REVIEW_FIRST)), 10);
const holdNow = (due) => HOLD_AT > 0 && due >= HOLD_AT;

/* ------------------------------------------------------------ the world */

const DATA = loadPayload(ROOT);
const L = DATA.lemmas, IX = DATA.index, UN = DATA.units, PATH = DATA.path, SPEECH = DATA.speech;
const DEEP = parseDeep(DATA.deep || "");
const DEEP_BY_BARE = new Map();
for (const d of DEEP) if (!DEEP_BY_BARE.has(d.b)) DEEP_BY_BARE.set(d.b, d);
L.forEach(makeHydrator({ deepIndex: () => DEEP_BY_BARE, shapes: DATA.shapes,
                         slots: DATA.slots, sent: DATA.sent }));

// Mirrors native/src/data.js — the chapter structure and lesson arithmetic the app
// uses. Kept literal so the sim walks exactly the route the learner sees.
const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) out.push({ core: UN[p.u], branches: [], title: p.ch || "" });
    else out[out.length - 1].branches.push(UN[p.u]);
  });
  return out;
})();
const chapterOf = (u) => STAGES.findIndex((s) => s.core === u || s.branches.includes(u));
const sizeOf = (u) => lessonSize(chapterOf(u));
const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u)));
const lessonWords = (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u));

/* The route as the app unlocks it with developer mode off: a chapter after the
   previous spine is done, a branch once its spine has a lesson done. */
function* route() {
  for (const s of STAGES) {
    for (const u of [s.core].concat(s.branches)) {
      for (let k = 0; k < lessonCount(u); k++) yield { unit: u, index: k };
    }
  }
}

/* ----------------------------------------------------------- randomness */

/* mulberry32: small, seedable, good enough. Installed over Math.random so the
   generators' shuffles are part of the seed too. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ profiles */

/* How a learner answers. `base` is the chance of a right answer on a word met
   once, by activity; familiarity raises it, production lowers it. `speech` is the
   per-word chance a spoken or heard word comes out wrong. */
const PROFILES = {
  quick:      { base: 0.92, growth: 0.04, speech: 0.06 },
  steady:     { base: 0.80, growth: 0.05, speech: 0.14 },
  struggling: { base: 0.58, growth: 0.06, speech: 0.30 },
};
const KIND_DIFFICULTY = {           // multiplier on the chance of being right
  "choose-en": 1.00, listen: 0.95, "choose-ru": 0.92, cloze: 0.85, type: 0.70,
  match: 0.95, cases: 0.85, aspect: 0.8, agreement: 0.85, conjugation: 0.85,
  stress: 0.8, grammar: 0.85, form: 0.8,
};

/* --------------------------------------------------------------- a run */

function simulate(profileName, seed) {
  const P = PROFILES[profileName];
  const rand = rng(seed);
  const restore = Math.random;
  Math.random = rand;

  const Q = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH,
                            SCRIPTS: DATA.scripts || {}, hasVoice: () => true });
  let st = { seen: {}, trouble: {}, speech: { attempts: [] } };
  const met = new Map();                 // lemma idx -> times seen in any question
  const log = [];                        // every question asked, in order
  const structural = [];                 // generated questions that are wrong
  const perLesson = [];
  let day = 0, qn = 0;

  const chance = (kind, idx) => {
    const n = met.get(idx) || 0;
    const p = Math.min(0.99, P.base + P.growth * n) * (KIND_DIFFICULTY[kind] || 0.85);
    return p;
  };

  const grade = (idx, correct) => {
    if (typeof idx !== "number" || !L[idx]) return;
    const r = applyGrade(st.seen, st.trouble, L[idx].b, gradeFor(correct, false), day);
    st = { ...st, seen: r.seen, trouble: r.trouble };
  };

  /* The learner's rendering of a sentence: each word wrong with P.speech. */
  const speakOrType = (target) => {
    const toks = target.match(TOKEN) || [];
    return toks.map((w) => (rand() < P.speech ? w + "х" : w)).join(" ");
  };

  /* How much of the listening a learner meets is written rather than harvested,
     and how much of the written material turns out to have a real recording
     anyway (the collection holds one for sentences people actually say). */
  const written = { scenes: 0, rows: 0, withAudio: 0 };

  const check = (q, where) => {
    const bad = (why) => structural.push({ where, kind: q.kind, why, prompt: q.prompt });
    if (!q.kind) bad("no kind");
    if (q.options) {
      const labels = q.options.map((o) => o.label);
      if (new Set(labels).size !== labels.length) bad("duplicate option labels");
      if (q.options.filter((o) => o.right).length !== 1) bad("not exactly one right option");
      if (q.options.length < 2) bad("fewer than two options");
    }
    if (q.kind === "cloze" && !/_____/.test(q.prompt)) bad("cloze without a gap");
    if (q.kind === "scene") {
      if (!q.rows || !q.questions || q.questions.length < q.rows.length) bad("scene without a question per sentence");
      // A corpus scene is cut from sentences that have a recording, so one
      // without audio there is a broken join. A written passage (§30l) has no
      // recording by nature — nobody has said the sentence — and is read by the
      // device voice, which the screen says. Counted, not faulted.
      if (!q.written) {
        for (const row of q.rows || []) if (!DATA.audio.files[fold(row.ru)]) bad("scene sentence without audio");
      } else {
        written.scenes++;
        written.rows += (q.rows || []).length;
        written.withAudio += (q.rows || []).filter((r) => DATA.audio.files[fold(r.ru)]).length;
      }
      for (const qq of q.questions || []) if (qq.options.filter((o) => o.right).length !== 1) bad("scene question without one right option");
    }
    if (q.kind === "type" && (!q.target || !q.answer)) bad("type without target/answer");
    if ((q.kind === "hear" || q.kind === "say") && !DATA.audio.files[fold(q.target)]) bad("speech step without audio");
    if (q.kind === "hear" || q.kind === "say") {
      const lem = sentenceLemmas(q.target, IX);
      if (!lem.length) bad("speech step grades no lemma");
    }
  };

  const answer = (q, ctx) => {
    check(q, ctx);
    qn++;
    let correct, words = [];
    if (q.kind === "hear" || q.kind === "say") {
      const said = speakOrType(q.target);
      const out = compare(said, q.target);
      correct = out.wer === 0;
      const grades = gradeAlignment(out.alignment, IX, { perfect: correct, firstTry: true });
      for (const g of grades) {
        const r = applyGrade(st.seen, st.trouble, L[g.i].b, g.grade, day);
        st = { ...st, seen: r.seen, trouble: r.trouble };
        met.set(g.i, (met.get(g.i) || 0) + 1);
      }
      words = grades.map((g) => g.i);
    } else if (q.kind === "match") {
      words = q.pairs.map((p) => p.i);
      correct = words.every((i) => rand() < chance("match", i));
      for (const i of words) { grade(i, correct); met.set(i, (met.get(i) || 0) + 1); }
    } else if (q.kind === "scene") {
      // Each question answered with the profile's listening chance; a sentence's
      // words graded by its question, as the activity does.
      let right = 0;
      for (const qq of q.questions) {
        const ok = rand() < chance("hear", qq.i);
        if (ok) right++;
        const lem = typeof qq.row === "number" ? (q.rows[qq.row].lemmas || []) : [qq.i];
        for (const i of lem) { grade(i, ok); met.set(i, (met.get(i) || 0) + 1); words.push(i); }
      }
      correct = right === q.questions.length;
    } else {
      const i = q.i;
      correct = rand() < chance(q.kind, i);
      if (typeof i === "number") { grade(i, correct); met.set(i, (met.get(i) || 0) + 1); words = [i]; }
    }
    const speech = q.kind === "hear" || q.kind === "say";
    log.push({ n: qn, kind: q.kind, words, correct, ...ctx,
               tokens: speech ? (q.target.match(TOKEN) || []).length : null });
    return correct;
  };

  /* The day's Study session: every card due today, graded Again/Good/Easy by the
     profile's chance on a plain meaning question, through the same FSRS review
     the Study screen runs. Capped at REVIEW_CAP a day — what a learner will sit
     through — so the backlog that builds past it is visible in the report. */
  const REVIEW_CAP = 60;
  const reviews = [];                    // per day: { day, due, done, again }
  const review = () => {
    const dueWords = Object.keys(st.seen).filter((w) => st.seen[w].due <= day);
    let done = 0, again = 0;
    for (const w of dueWords.slice(0, REVIEW_CAP)) {
      const i = L.findIndex((e) => e.b === w);
      const ok = rand() < chance("choose-en", i >= 0 ? i : -1);
      const g = ok ? (rand() < 0.3 ? 4 : 3) : 1;
      const card = fsrsReview(st.seen[w], g, day);
      st = { ...st, seen: { ...st.seen, [w]: card } };
      if (i >= 0) met.set(i, (met.get(i) || 0) + 1);
      done++;
      if (!ok) again++;
    }
    reviews.push({ day, due: dueWords.length, done, again });
  };

  let lessons = 0, heldDays = 0;
  for (const { unit, index } of route()) {
    if (lessons >= LESSONS) break;

    /* Reviews before new words (core/state.js reviewFirst). Learn makes Review
       the primary action above REVIEW_FIRST due cards, so the simulated learner
       spends the day clearing instead of starting a lesson — and keeps spending
       days until the backlog is under the line. Without this the learner took
       two lessons a day into a 239-card backlog. */
    let guard = 0;
    while (holdNow(Object.keys(st.seen).filter((w) => st.seen[w].due <= day).length)
           && guard++ < 40) {
      day++;
      heldDays++;
      review();
    }

    const ch = chapterOf(unit);
    const ctx = { unit: unit.id, chapter: ch + 1, lesson: index };
    const words = lessonWords(unit, index);
    const newWords = words.filter((i) => !met.has(i)).length;

    // Vocabulary: teaching steps count as a first meeting; the interleaved questions
    // are answered like any other.
    const vocab = Q.vocabSteps(unit, index);
    for (const s of vocab) {
      if (s.t === "word") met.set(s.i, (met.get(s.i) || 0) + 1);
      else if (s.kind) answer(s, { ...ctx, phase: "vocab" });
    }

    // Quiz, retaken until passed — the app's own rule, relief included — or given
    // up after one try past the relief point, which is what a learner does.
    let tries = 0, best = 0, quizLen = 0, kinds = {};
    let slot = { q: undefined, tries: 0 };
    do {
      const quiz = Q.quizSteps(unit, index);
      quizLen = quiz.length;
      if (!quiz.length) structural.push({ where: ctx, why: "empty quiz" });
      let right = 0;
      for (const q of quiz) {
        kinds[q.kind] = (kinds[q.kind] || 0) + 1;
        if (answer(q, { ...ctx, phase: "quiz", try: tries + 1 })) right++;
      }
      const score = Math.round(right / quiz.length * 100);
      best = Math.max(best, score);
      tries++;
      slot = { q: best, tries };
    } while (!quizPassed(slot) && tries <= RELIEF_AFTER);

    perLesson.push({ ...ctx, newWords, quizLen, score: best, tries, passed: quizPassed(slot),
                     relieved: quizPassed(slot) && best < 80, kinds });
    lessons++;
    if (lessons % 2 === 0) {                   // two lessons a day, then the day's review
      day++;
      review();
    }
  }

  const due = Object.values(st.seen).filter((c) => c.due <= day).length;
  Math.random = restore;
  return { profile: profileName, seed, log, perLesson, structural, st, met, day, due,
           reviews, heldDays, written };
}

/* ------------------------------------------------------------- metrics */

function metrics(run) {
  const { log, perLesson, st, met } = run;
  const m = {};

  // Recurrence inside quizzes: for each word, the gaps between consecutive quiz
  // questions asking it. The vocabulary phase deliberately asks a word right after
  // teaching it, so it is left out here and would only say "by design".
  const lastAt = new Map(); const gaps = [];
  let backToBack = 0, within3 = 0, sameQuizTwice = 0, quizQs = 0;
  const seenInQuiz = new Map();
  let prev = null;
  for (const q of log) {
    if (q.phase !== "quiz") continue;
    quizQs++;
    const quizId = `${q.unit}/${q.lesson}/${q.try}`;
    const speech = q.kind === "hear" || q.kind === "say";
    for (const w of q.words) {
      if (lastAt.has(w)) {
        const gap = quizQs - lastAt.get(w);
        gaps.push(gap);
        if (gap <= 3) within3++;
        // Back-to-back: two word questions in a row about the same word within one
        // quiz. A sentence step sharing a lemma with its neighbour is not that.
        if (gap === 1 && !speech && prev && prev.quizId === quizId && !prev.speech) backToBack++;
      }
      lastAt.set(w, quizQs);
      const key = `${quizId}/${w}`;
      if (seenInQuiz.has(key)) sameQuizTwice++;
      seenInQuiz.set(key, true);
    }
    prev = { quizId, speech };
  }
  gaps.sort((a, b) => a - b);
  m.recurrence = {
    quizQuestions: quizQs, askedAgain: gaps.length, backToBack, within3, sameQuizTwice,
    medianGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    quizzes: perLesson.reduce((a, l) => a + l.tries, 0),
  };

  // Activity mix over all quiz questions, and per chapter.
  const mix = {}; const byChapter = {};
  for (const q of log) {
    if (q.phase !== "quiz") continue;
    mix[q.kind] = (mix[q.kind] || 0) + 1;
    const c = byChapter[q.chapter] = byChapter[q.chapter] || { n: 0, right: 0, speech: 0, tokens: [] };
    c.n++; if (q.correct) c.right++;
    if (q.tokens) { c.speech++; c.tokens.push(q.tokens); }
  }
  m.mix = mix;
  m.chapters = Object.keys(byChapter).map((k) => {
    const c = byChapter[k];
    const lessons = perLesson.filter((l) => l.chapter === +k);
    return {
      chapter: +k, title: STAGES[k - 1] ? STAGES[k - 1].title : "",
      lessons: lessons.length,
      newWordsPerLesson: +(lessons.reduce((a, l) => a + l.newWords, 0) / Math.max(1, lessons.length)).toFixed(1),
      quizAccuracy: +(c.right / Math.max(1, c.n)).toFixed(2),
      passFirstTry: lessons.filter((l) => l.tries === 1).length,
      failedThrice: lessons.filter((l) => !l.passed).length,
      speechSteps: c.speech,
      speechTokensMean: c.tokens.length ? +(c.tokens.reduce((a, b) => a + b, 0) / c.tokens.length).toFixed(1) : null,
      speechTokensMax: c.tokens.length ? Math.max(...c.tokens) : null,
    };
  });

  // Coverage: words met vs. words the units teach up to where the run stopped.
  const taught = new Set();
  for (const l of perLesson) for (const i of lessonWords(UN.find((u) => u.id === l.unit), l.lesson)) taught.add(i);
  const askedOnce = [...taught].filter((i) => (met.get(i) || 0) <= 1).length;
  m.words = {
    taught: taught.size, everAsked: [...taught].filter((i) => met.get(i) > 1).length,
    taughtButNeverAsked: askedOnce, inSeen: Object.keys(st.seen).length,
    trouble: Object.keys(st.trouble).length,
    leeches: Object.values(st.seen).filter(isTrouble).length,
  };
  const rv = run.reviews || [];
  m.review = { simulatedDays: run.day, dueAtEnd: run.due,
               duePerDay: +(run.due / Math.max(1, run.day)).toFixed(1),
               sessions: rv.length,
               reviewsPerDay: +(rv.reduce((a, r) => a + r.done, 0) / Math.max(1, rv.length)).toFixed(1),
               maxDueInADay: rv.reduce((a, r) => Math.max(a, r.due), 0),
               againRate: +(rv.reduce((a, r) => a + r.again, 0) / Math.max(1, rv.reduce((a, r) => a + r.done, 0))).toFixed(2),
               backlogDays: rv.filter((r) => r.due > r.done).length,
               // Days spent clearing reviews instead of starting a lesson,
               // because the path said so (core/state.js reviewFirst).
               heldDays: run.heldDays || 0 };
  m.lessons = { total: perLesson.length, passed: perLesson.filter((l) => l.passed).length,
                relieved: perLesson.filter((l) => l.relieved).length,
                retakes: perLesson.reduce((a, l) => a + l.tries - 1, 0),
                shortQuizzes: perLesson.filter((l) => l.quizLen < QUIZ_N).length };
  m.structural = run.structural.length;
  return m;
}

/* -------------------------------------------------------------- report */

const profiles = ONLY ? [ONLY] : Object.keys(PROFILES);
const runs = profiles.map((p, k) => simulate(p, SEED * 1000 + k));
const results = runs.map((r) => ({ profile: r.profile, seed: r.seed, metrics: metrics(r),
                                   written: r.written, structural: r.structural.slice(0, 30) }));

const lines = [];
const out = (s = "") => lines.push(s);
out(`# Simulated learners — ${new Date().toISOString().slice(0, 10)}, seed ${SEED}, ${LESSONS} lessons each`);
out();
out("Same seed, same trial. Change the app, rerun, diff this file.");
out();
for (const r of results) {
  const m = r.metrics;
  out(`## ${r.profile}`);
  out();
  out(`- lessons ${m.lessons.total}, passed ${m.lessons.passed} (${m.lessons.relieved} on relief), retakes ${m.lessons.retakes}, short quizzes ${m.lessons.shortQuizzes}`);
  out(`- words taught ${m.words.taught}; asked again after teaching ${m.words.everAsked}; taught but never asked ${m.words.taughtButNeverAsked}; in scheduler ${m.words.inSeen}; trouble ${m.words.trouble}; leeches ${m.words.leeches}`);
  out(`- recurrence over ${m.recurrence.quizQuestions} quiz questions in ${m.recurrence.quizzes} quizzes: a word asked again ${m.recurrence.askedAgain} times; back-to-back ${m.recurrence.backToBack}; within 3 questions ${m.recurrence.within3}; same word twice in one quiz ${m.recurrence.sameQuizTwice} (${(m.recurrence.sameQuizTwice / Math.max(1, m.recurrence.quizzes)).toFixed(1)} per quiz); median gap ${m.recurrence.medianGap}`);
  out(`- review: ${m.review.simulatedDays} days with a Study session each; ${m.review.reviewsPerDay} reviews a day, again rate ${m.review.againRate}, most due in one day ${m.review.maxDueInADay}, days with a backlog past the cap ${m.review.backlogDays}; ${m.review.dueAtEnd} due at the end`);
  out(`- review-first: ${m.review.heldDays} days spent clearing reviews rather than starting a lesson (threshold ${HOLD_AT || "off"})`);
  out(`- quiz activity mix: ${Object.entries(m.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  out(`- written passages met: ${r.written.scenes} scenes, ${r.written.rows} sentences, `
      + `${r.written.withAudio} of them with a real recording anyway`);
  out(`- structural problems: ${m.structural}`);
  out();
  out("| chapter | lessons | new words/lesson | quiz accuracy | pass 1st try | failed ×3 | speech steps | speech words mean/max |");
  out("|---|---|---|---|---|---|---|---|");
  for (const c of m.chapters) {
    out(`| ${c.chapter} ${c.title} | ${c.lessons} | ${c.newWordsPerLesson} | ${c.quizAccuracy} | ${c.passFirstTry} | ${c.failedThrice} | ${c.speechSteps} | ${c.speechTokensMean ?? "–"} / ${c.speechTokensMax ?? "–"} |`);
  }
  out();
  if (r.structural.length) {
    out("Structural:");
    for (const s of r.structural) out(`- ${s.where.unit}/${s.where.lesson} ${s.kind || ""}: ${s.why}${s.prompt ? " — " + s.prompt : ""}`);
    out();
  }
}

const dir = join(ROOT, "tools", "sim");
mkdirSync(dir, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}-seed${SEED}`;
writeFileSync(join(dir, `${stamp}.md`), lines.join("\n") + "\n", "utf8");
writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(results, null, 1), "utf8");
console.log(lines.join("\n"));
console.log(`\nwrote tools/sim/${stamp}.md and .json`);
process.exit(results.some((r) => r.metrics.structural) ? 1 : 0);
