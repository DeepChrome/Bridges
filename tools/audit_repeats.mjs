/* How often a lesson asks the learner the same thing twice — the repetition
 * the owner feels as "I just did this" (2026-10-12), counted off the real
 * generators rather than read by eye. Every lesson on the route, DRAWS times:
 *
 *   sameShape     a word asked in the same shape twice in one lesson
 *                 (vocabulary walk + quiz; the quiz draws its shapes on its
 *                 own, so some of this is the quiz echoing the walk)
 *   walkShape     the same within the vocabulary walk alone — the walk's
 *                 own retrieval and its go-back review were the usual pair
 *   sameSentence  one gap-fill sentence shown twice in a lesson, or gapped
 *                 twice in one quiz
 *   adjacentKind  two consecutive quiz questions of one shape (type, type…)
 *   grammarTwice  the walk's grammar practice and the quiz's form question
 *                 on the same word
 *   reviewAgain   a word reviewed in the walk of lesson N and again in N+1
 *   freeReview    a quiz review slot spent on a top-100 closed-class word
 *   speechAhead   a spoken step whose sentence uses a word the lesson has
 *                 not reached
 *   sameSense     two words of one lesson sharing a first meaning, both
 *                 asked by that meaning (choose-ru or type)
 *
 *   node tools/audit_repeats.mjs            every chapter, 3 draws
 *   node tools/audit_repeats.mjs 1 2 --draws 5
 *
 * Run before and after touching vocabStepsIn, quizStepsIn or clozeFor; the
 * totals are the measure (§30r: a metric that cannot tell the skill from the
 * flaw is worse than none — spaced review in a *different* shape is not
 * counted here, by design). */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf, LESSON_FREE_RANK } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { firstSense, fold } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = loadPayload(ROOT);
const L = data.lemmas;
const DEEP = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({ deepIndex: () => DEEP, shapes: data.shapes, slots: data.slots, sent: data.sent }));
const STAGES = [];
data.path.forEach((p) => {
  if (p.c === 0 || !STAGES.length) STAGES.push({ core: data.units[p.u], branches: [], title: p.ch || "" });
  else STAGES[STAGES.length - 1].branches.push(data.units[p.u]);
});
const stageIndex = (u) => Math.max(0, STAGES.findIndex((s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));
const lessonWords = (u, i) => lessonWordsOf(u, i, sizeOf(u));
const lessonCount = (u) => lessonCountOf(u, sizeOf(u));
const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {}, hasVoice: () => true,
  lessonWords, lessonCount, SPEECH: data.speech, SCRIPTS: data.scripts || {},
});

const args = process.argv.slice(2);
const DRAWS = args.includes("--draws") ? Number(args[args.indexOf("--draws") + 1]) : 3;
const nums = args.filter((a, k) => /^\d+$/.test(a) && args[k - 1] !== "--draws").map(Number);
const from = nums[0] || 1, to = nums[1] || STAGES.length;
const verbose = args.includes("--verbose");

const WORD_KINDS = new Set(["choose-en", "choose-ru", "listen", "cloze", "type"]);
const MEANING = new Set(["choose-ru", "type"]);
const totals = {};
const bump = (k, n = 1) => { totals[k] = (totals[k] || 0) + n; };
const examples = {};
const note = (k, s) => { (examples[k] ||= []).length < 6 && examples[k].push(s); };
// The generator's own meaning key (mainSense): parentheticals and "to" stripped.
const sense = (i) => fold(String(firstSense(L[i]) || "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim().replace(/^to\s+/i, ""));
let lessons = 0;

for (let s = from - 1; s < to && s < STAGES.length; s++) {
  const stage = STAGES[s];
  for (const u of [stage.core].concat(stage.branches)) {
    const n = lessonCount(u);
    for (let d = 0; d < DRAWS; d++) {
      let prevReview = new Set();
      for (let i = 0; i < n; i++) {
        lessons++;
        const words = new Set(lessonWords(u, i));
        const walk = Q.vocabSteps(u, i).filter((q) => q && q.kind);
        const quiz = Q.quizSteps(u, i);
        const tag = `${u.id}:${i + 1}`;
        // sameShape — over the walk's and the quiz's word questions together.
        const seen = new Map();
        for (const q of walk.concat(quiz)) {
          if (!WORD_KINDS.has(q.kind) || typeof q.i !== "number") continue;
          const k = `${q.kind}:${q.i}`;
          if (seen.has(k)) { bump("sameShape"); note("sameShape", `${tag} ${q.kind} ${L[q.i].w}`); }
          seen.set(k, true);
        }
        // sameSentence — a gap sentence twice in the lesson, or twice in the quiz.
        const sent = new Map();
        for (const q of walk.concat(quiz)) {
          if (q.kind !== "cloze" || !q.reveal) continue;
          const k = fold(q.reveal);
          if (sent.has(k)) { bump("sameSentence"); note("sameSentence", `${tag} «${q.reveal}»`); }
          sent.set(k, true);
        }
        // adjacentKind — in the quiz as dealt.
        for (let k = 1; k < quiz.length; k++) {
          if (quiz[k].kind === quiz[k - 1].kind && WORD_KINDS.has(quiz[k].kind)) {
            bump("adjacentKind"); note("adjacentKind", `${tag} ${quiz[k].kind} ×2`);
          }
        }
        // grammarTwice — the walk's practice and the quiz's form question on one word.
        const practised = new Set(walk.filter((q) => q.drill && typeof q.i === "number").map((q) => q.i));
        for (const q of quiz) {
          if (q.kind === "form" && practised.has(q.i)) { bump("grammarTwice"); note("grammarTwice", `${tag} ${L[q.i].w}`); }
        }
        // walkShape — the same, over the walk alone (the quiz draws on its own).
        // A word barred from its meaning (another lesson word shares it) may
        // repeat a shape rather than be asked by that meaning: not counted.
        const bySenseAll = new Map();
        for (const i of [...words].sort((a, b) => a - b)) {
          const k = sense(i);
          if (k && !bySenseAll.has(k)) bySenseAll.set(k, i);
        }
        const barredHere = new Set([...words].filter((i) => sense(i) && bySenseAll.get(sense(i)) !== i));
        const seenWalk = new Set();
        for (const q of walk) {
          if (!WORD_KINDS.has(q.kind) || typeof q.i !== "number" || barredHere.has(q.i)) continue;
          const k = `${q.kind}:${q.i}`;
          if (seenWalk.has(k)) { bump("walkShape"); note("walkShape", `${tag} ${q.kind} ${L[q.i].w}`); }
          seenWalk.add(k);
        }
        // reviewAgain — the walk's chapter reviews against the previous lesson's.
        const reviewed = new Set(walk.filter((q) => q.review && typeof q.i === "number" && !words.has(q.i)).map((q) => q.i));
        for (const i2 of reviewed) if (prevReview.has(i2)) { bump("reviewAgain"); note("reviewAgain", `${tag} ${L[i2].w}`); }
        prevReview = reviewed;
        // freeReview — a quiz review slot on a top-100 word.
        for (const q of quiz) {
          if (q.review && typeof q.i === "number" && q.i < LESSON_FREE_RANK
              && !["noun", "verb", "adjective", "adverb"].includes(L[q.i].p)) { bump("freeReview"); note("freeReview", `${tag} ${L[q.i].w}`); }
        }
        // speechAhead — a spoken sentence using a word this lesson has not reached.
        const met = new Set(Q.metBy ? Q.metBy(u, i) : []);
        if (Q.metBy) {
          for (const q of quiz) {
            if ((q.kind === "say" || q.kind === "hear") && Array.isArray(q.lemmas)) {
              const ahead = q.lemmas.filter((l) => !met.has(l) && l >= LESSON_FREE_RANK && u.w.includes(l));
              if (ahead.length) { bump("speechAhead"); note("speechAhead", `${tag} ${ahead.map((l) => L[l].w).join(",")}`); }
            }
          }
        }
        // sameSense — two lesson words with one first meaning, both asked by it.
        const byMeaning = new Map();
        for (const q of walk.concat(quiz)) {
          if (!MEANING.has(q.kind) || typeof q.i !== "number" || !words.has(q.i)) continue;
          const k = sense(q.i);
          if (!k) continue;
          if (!byMeaning.has(k)) byMeaning.set(k, new Set());
          byMeaning.get(k).add(q.i);
        }
        for (const [k, set] of byMeaning) if (set.size > 1) { bump("sameSense"); note("sameSense", `${tag} "${k}": ${[...set].map((x) => L[x].w).join("/")}`); }
      }
    }
  }
}

console.log(`${lessons} lesson draws (${DRAWS} per lesson), chapters ${from}–${Math.min(to, STAGES.length)}`);
for (const k of ["sameShape", "walkShape", "sameSentence", "adjacentKind", "grammarTwice", "reviewAgain", "freeReview", "speechAhead", "sameSense"]) {
  const v = totals[k] || 0;
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(5)}  (${(v / lessons).toFixed(2)} a lesson)`);
  if (verbose && examples[k]) for (const e of examples[k]) console.log(`      ${e}`);
}
