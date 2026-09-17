/* How big is each exercise's bank of questions, really?
 *
 * The owner, 2026-09-16: *"Ensure that for all exercises, you have banks of
 * questions and not just the same 10 questions every time."*
 *
 * `drillQuestions` already dedupes *within* a run, so no single sitting repeats
 * itself and the screen always looks varied. That is not the question. The
 * question is across runs: sit down ten times and do you meet the same ten
 * questions? So what this counts is the number of **distinct questions seen
 * over many runs**, and — the part that actually matters — whether that count
 * is still growing at the end of the sample. A bank that stops growing has
 * been exhausted; one still finding new questions on the last run is deeper
 * than the sample.
 *
 * It reports per generator, because the size of a bank is a fact about the
 * generator and the words it is allowed to use, not about the app. Run it with
 * `--pool N` to see what a *learner* gets: a drill only ever draws from the
 * words that learner has met (`drillPool` in native/src/data.js), and a bank
 * measured against the whole 4,000-word curriculum says nothing about someone
 * three lessons in.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "./payload.mjs";
import { makeQuestions, DRILL_TYPES, QUIZ_KINDS, lessonSize } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const RUNS = parseInt(arg("--runs", "80"), 10);
const N = parseInt(arg("--n", "10"), 10);
const POOL = arg("--pool", null) === null ? null : parseInt(arg("--pool", "0"), 10);

const data = loadPayload(ROOT);
const L = data.lemmas;

/* The paradigm drills read `w.t` off the lemma and it is rebuilt on the way in
   rather than shipped (P9.24); without this they generate nothing at all. */
const DEEP_BY_BARE = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({
  deepIndex: () => DEEP_BY_BARE, shapes: data.shapes, slots: data.slots, sent: data.sent,
}));

const STAGES = (() => {
  const out = [];
  data.path.forEach((p) => {
    if (p.c === 0 || !out.length) {
      out.push({ core: data.units[p.u], branches: [], n: p.cn || out.length + 1, title: p.ch || "" });
    } else out[out.length - 1].branches.push(data.units[p.u]);
  });
  return out;
})();
const stageIndex = (u) => Math.max(0, STAGES.findIndex(
  (s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));

const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES,
  lessonWords: (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u)),
  lessonCount: (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u))),
  SPEECH: data.speech, SCRIPTS: data.scripts || {}, hasVoice: () => true,
});

/* A learner's pool: the first `POOL` words of the route, in the order the route
   teaches them, which is what `drillPool` hands in. */
const routeWords = () => {
  const out = [];
  for (const s of STAGES) {
    for (const u of [s.core].concat(s.branches)) for (const i of u.w || []) if (!out.includes(i)) out.push(i);
  }
  return out;
};
const pool = POOL === null ? null : routeWords().slice(0, POOL);

function bank(type, typed) {
  const seen = new Map();
  let lateNew = 0, first = 0;
  for (let r = 0; r < RUNS; r++) {
    const qs = Q.drillQuestions(type, N, pool, undefined, typed);
    if (r === 0) first = qs.length;
    for (const q of qs) {
      const k = Q.drillKey(q);
      if (!seen.has(k)) { seen.set(k, 0); if (r >= RUNS - 10) lateNew++; }
      seen.set(k, seen.get(k) + 1);
    }
  }
  const drawn = [...seen.values()].reduce((a, b) => a + b, 0);
  return { first, size: seen.size, lateNew, drawn };
}

const head = pool ? `a learner who has met ${pool.length} words` : "the whole curriculum";
console.log(`bank size over ${RUNS} runs of ${N} questions — ${head}\n`);
console.log("drill            run 1   distinct   new in last 10 runs   seen>once");
for (const d of DRILL_TYPES) {
  for (const typed of [true, false]) {
    const b = bank(d.id, typed);
    const label = `${d.id}${typed ? "" : " (chosen)"}`;
    console.log(`${label.padEnd(20)} ${String(b.first).padStart(5)}   ${String(b.size).padStart(8)}   ${String(b.lateNew).padStart(19)}   ${String(b.drawn - b.size).padStart(9)}`);
  }
}

console.log("\nA drill is exhausted when 'new in last 10 runs' is 0 and 'distinct'");
console.log("is near the run length — that is the same handful every sitting.");
