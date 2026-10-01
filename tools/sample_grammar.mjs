/* What a chapter's grammar run asks (core/questions.js grammarRun), unit by
 * unit, so a person can read it: the grammar point, how many questions came
 * back, and each one's prompt, ask and answer.
 *
 *   node tools/sample_grammar.mjs              every unit, its whole run
 *   node tools/sample_grammar.mjs core4 0      one unit, one lesson's run
 *
 * Read it after touching a grammar card's `form` or the generator: a run that
 * comes back short, or asks the same word twice, shows here first. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, GRAMMAR_N } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = loadPayload(ROOT);
const L = data.lemmas;
const DEEP = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({ deepIndex: () => DEEP, shapes: data.shapes, slots: data.slots, sent: data.sent }));

const STAGES = [];
data.path.forEach((p) => {
  if (p.c === 0 || !STAGES.length) STAGES.push({ core: data.units[p.u], branches: [], n: p.cn || STAGES.length + 1, title: p.ch || "" });
  else STAGES[STAGES.length - 1].branches.push(data.units[p.u]);
});
const stageIndex = (u) => Math.max(0, STAGES.findIndex((s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));
const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {}, hasVoice: () => true,
  lessonWords: (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u)),
  lessonCount: (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u))),
  SPEECH: data.speech, SCRIPTS: data.scripts || {},
});

const [only, lesson] = process.argv.slice(2);
let short = 0;
for (const u of data.units) {
  if (only && u.id !== only) continue;
  const run = Q.grammarRun(u, lesson === undefined ? null : +lesson);
  const title = run[0] && run[0].note ? run[0].note.title : "(no grammar point)";
  if (run.length && run.length < GRAMMAR_N) short++;
  console.log(`\n## ${u.id} — ${title}: ${run.length} questions`);
  for (const q of run) {
    const right = q.typed ? q.target : (q.options || []).filter((o) => o.right).map((o) => o.label).join("/");
    console.log(`   ${q.typed ? "write " : "choose"}  ${q.prompt}  ·  ${q.ask}  →  ${right}`);
  }
}
console.log(`\n${short} unit(s) with a short run`);
