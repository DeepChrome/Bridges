/* How often each word is the subject of a question, over the whole course —
 * the measure behind "this/этот feels like it shows up far too often"
 * (2026-10-20). Every lesson on the route, DRAWS times, the vocabulary walk
 * and the quiz as the app deals them, counted by the word a question is
 * about (`q.i`), with and without a learner's state:
 *
 *   fresh     no review state: what the generators put in front of anyone
 *   learner   a seeded learner who has met every earlier word, with one word
 *             weak (--weak WORD, default «этот»): what the review slots do
 *             with a word that keeps being marked wrong
 *
 *   node tools/audit_targets.mjs                 the top words, both ways
 *   node tools/audit_targets.mjs --draws 5 --top 25 --weak этот
 *
 * A word's own lessons ask about it by design; what is counted against it is
 * the questions it gets *outside* its own lessons (`elsewhere`), which is
 * where a word comes to dominate. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { fold } from "../core/util.js";

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
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const DRAWS = Number(opt("--draws", 3));
const TOP = Number(opt("--top", 15));
const weakWord = opt("--weak", "этот");
const weakIdx = L.findIndex((l) => fold(l.b) === fold(weakWord));

/* `withState`: a learner walking the course LESSONS_A_DAY lessons a day, every
   word met so far holding, and the weak word answered wrong every time it is
   asked — its card due again a minute later, as Again leaves it. The clock is
   the learner's, so "today" moves as they do. */
const DAY = 86400000, LESSONS_A_DAY = 3;
function run(withState) {
  const total = new Map(), elsewhere = new Map();
  let questions = 0;
  const realNow = Date.now;
  const base = realNow();
  for (let d = 0; d < DRAWS; d++) {
    const met = new Set();
    let n0 = 0;
    const weakCard = { state: 2, s: 0.5, d: 9, reps: 12, lapses: 6, lastAt: base - DAY, dueAt: base - 3600000 };
    for (const stage of STAGES) {
      for (const u of [stage.core].concat(stage.branches)) {
        const n = lessonCount(u);
        for (let i = 0; i < n; i++, n0++) {
          const now = base + Math.floor(n0 / LESSONS_A_DAY) * DAY + (n0 % LESSONS_A_DAY) * 3600000;
          Date.now = () => now;
          const own = new Set(lessonWords(u, i));
          let seen, prefer;
          if (withState) {
            seen = {};
            for (const w of met) {
              seen[L[w].b] = { recognise: w === weakIdx ? { ...weakCard }
                : { state: 2, s: 30, d: 5, reps: 12, lapses: 0, lastAt: now - 2 * DAY, dueAt: now + 20 * DAY } };
            }
            // What the app hands the quiz as due or in trouble (Lesson.js, reviewWords).
            prefer = met.has(weakIdx) ? [weakIdx] : undefined;
          }
          const qs = Q.vocabSteps(u, i).concat(Q.quizSteps(u, i, prefer, seen));
          for (const q of qs) {
            if (!q || typeof q.i !== "number") continue;
            questions++;
            total.set(q.i, (total.get(q.i) || 0) + 1);
            if (!own.has(q.i)) elsewhere.set(q.i, (elsewhere.get(q.i) || 0) + 1);
            if (q.i === weakIdx) { weakCard.lastAt = now; weakCard.dueAt = now + 60000; }
          }
          for (const w of own) met.add(w);
        }
      }
    }
  }
  Date.now = realNow;
  return { total, elsewhere, questions };
}

for (const withState of [false, true]) {
  const { total, elsewhere, questions } = run(withState);
  const per = (n) => (n / DRAWS).toFixed(1);
  const vals = [...elsewhere.values()].sort((a, b) => a - b);
  const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  console.log(`\n${withState ? `learner (weak: ${weakWord})` : "fresh"}: ${(questions / DRAWS).toFixed(0)} questions a pass over the course; `
    + `median word asked ${per(median)}× outside its own lessons`);
  const top = [...elsewhere.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
  for (const [i, n] of top) console.log(`  ${per(n).padStart(6)} elsewhere  ${per(total.get(i)).padStart(6)} in all   ${L[i].w}  (${L[i].e.slice(0, 30)})`);
  const watch = L.map((l, i) => i).filter((i) => ["этот", "это", "эта", "эти", "тот"].includes(L[i].b));
  for (const i of watch) console.log(`  watch: ${L[i].w.padEnd(6)} ${per(elsewhere.get(i) || 0)} elsewhere, ${per(total.get(i) || 0)} in all, `
    + `rank ${1 + [...elsewhere.values()].filter((v) => v > (elsewhere.get(i) || 0)).length} of ${elsewhere.size}`);
}
