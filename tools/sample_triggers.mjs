/* What the case cards find under each trigger (core/triggers.js, core/
 * questions.js triggerSightings), so a person can read it: how many sentences
 * each trigger has, how many distinct nouns, and a few with the trigger and
 * the noun marked.
 *
 *   node tools/sample_triggers.mjs            every trigger, three sentences each
 *   node tools/sample_triggers.mjs za-instr   one trigger, twenty sentences
 *   node tools/sample_triggers.mjs --counts   the counts alone
 *
 * Read it after touching the catalogue or the sorting (triggerOf): a sentence
 * filed under the wrong trigger is a card that teaches the wrong reason. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { TRIGGERS } from "../core/triggers.js";
import { TOKEN } from "../core/util.js";
import { PATH_MIN_SENTENCES } from "../core/casecards.js";

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

const arg = process.argv[2];
const countsOnly = arg === "--counts";
const only = !countsOnly ? arg : null;
const all = Q.triggerSightings();
// The noun in [brackets], the trigger in <angles>, counted as TOKEN counts.
const mark = (s) => {
  let n = -1;
  return s.ru.replace(TOKEN, (x) => (++n === s.k ? `[${x}]` : n === s.j ? `<${x}>` : x));
};
let offered = 0;
for (const x of TRIGGERS) {
  if (only && x.id !== only) continue;
  const list = all[x.id].slice().sort((a, b) => a.ease - b.ease);
  const nouns = new Set(list.map((s) => s.i)).size;
  const ok = list.length >= PATH_MIN_SENTENCES;
  if (ok) offered++;
  console.log(`${ok ? " " : "-"} ${x.id.padEnd(12)} ${x.case.padEnd(13)} ${String(list.length).padStart(4)} sentences ${String(nouns).padStart(4)} nouns  ${x.en}`);
  if (countsOnly) continue;
  for (const s of list.slice(0, only ? 20 : 3)) console.log(`      ${mark(s)}  — ${s.en}`);
}
console.log(`\n${offered} of ${TRIGGERS.length} triggers have at least ${PATH_MIN_SENTENCES} sentences`);
