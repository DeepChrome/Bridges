/* What the case modules ask (core/cases.js, core/questions.js caseLesson and
 * caseDrill), so a person can read it: how many sentences each use found, a
 * few of them with the noun marked, and a lesson and a drill.
 *
 *   node tools/sample_cases.mjs               every case
 *   node tools/sample_cases.mjs genitive      one case
 *
 * Read it after touching a use's triggers or the sorting (useOf): a sentence
 * filed under the wrong use is what a learner would be taught wrongly. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { CASES } from "../core/cases.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = loadPayload(ROOT);
const L = data.lemmas;
const DEEP = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({ deepIndex: () => DEEP, shapes: data.shapes, slots: data.slots, sent: data.sent }));
const STAGES = [];
data.path.forEach((p) => {
  if (p.c === 0 || !STAGES.length) STAGES.push({ core: data.units[p.u], branches: [] });
  else STAGES[STAGES.length - 1].branches.push(data.units[p.u]);
});
const stageIndex = (u) => Math.max(0, STAGES.findIndex((s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));
const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {}, hasVoice: () => true,
  lessonWords: (u, i) => lessonWordsOf(u, i, sizeOf(u)),
  lessonCount: (u) => lessonCountOf(u, sizeOf(u)),
  SPEECH: data.speech, SCRIPTS: data.scripts || {},
});

const only = process.argv[2];
const counts = Q.caseCounts();
for (const c of CASES) {
  if (only && c.id !== only) continue;
  console.log(`\n=== ${c.name}`);
  for (const u of c.uses) console.log(`  ${u.id.padEnd(9)} ${String(counts[c.id][u.id]).padStart(4)}  ${u.label}`);
  console.log("\n  drill:");
  for (const q of Q.caseDrill(c.id, 12)) {
    const right = q.typed ? q.answer : (q.options || []).find((o) => o.right)?.label;
    console.log(`   [${q.caseUse || "form"}] ${q.ask} | ${q.prompt} | ${q.sub || ""} → ${right}`);
  }
}
