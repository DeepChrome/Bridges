/* Questions whose cue fits more than the one answer they accept (2026-10-20:
 * "this" wanted «этот», and «эта», «это», «эти» are all "this").
 *
 * Every unit word, asked the ways a learner meets it, through the real
 * generators (core/questions.js `present`), DRAWS times:
 *
 *   type       "Write it in Russian": a gender or number form of the word
 *              itself, or another taught word with the same meaning, that
 *              the question would mark wrong
 *   choose-ru  "Choose the Russian": a wrong option that is in fact a form of
 *              the answer («это» beside «этот» for "this»)
 *
 *   node tools/audit_answers.mjs            counts and examples
 *   node tools/audit_answers.mjs --draws 20 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { fold, firstSense } from "../core/util.js";

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
const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {}, hasVoice: () => true,
  lessonWords: (u, i) => lessonWordsOf(u, i, sizeOf(u)), lessonCount: (u) => lessonCountOf(u, sizeOf(u)),
  SPEECH: data.speech, SCRIPTS: data.scripts || {},
});
const DRAWS = Number(process.argv.includes("--draws") ? process.argv[process.argv.indexOf("--draws") + 1] : 10);

/* The nominative of a word declined for gender: what an English word that
   carries no gender or number ("this", "big", "my") can be in Russian. */
function genderForms(w) {
  const out = new Set();
  for (const t of w.t || []) {
    if (!(t.columns || []).includes("Feminine")) continue;
    const row = (t.rows || []).find((r) => r[0] === "Nominative");
    if (row) for (const c of row.slice(1)) for (const f of (Array.isArray(c) ? c : [c])) if (f) out.add(fold(f));
  }
  return out;
}

const words = [...new Set(data.units.flatMap((u) => u.w))];
const pool = words;
let typeAsked = 0, typeAmbiguous = 0, chooseAsked = 0, chooseBad = 0;
const exType = new Map(), exChoose = new Map();
for (const i of words) {
  const w = L[i];
  for (let d = 0; d < DRAWS; d++) {
    const t = Q.present({ t: "type", i, pool });
    if (t) {
      typeAsked++;
      const accepted = new Set([fold(t.answer), ...(t.alts || [])]);
      const valid = [...genderForms(w)].filter((f) => !accepted.has(f));
      if (valid.length) { typeAmbiguous++; exType.set(w.b, `${t.prompt} → ${t.answer}; also right, marked wrong: ${valid.join(", ")}`); }
    }
    const c = Q.present({ t: "choose-ru", i, pool });
    if (c && c.options) {
      chooseAsked++;
      /* What the cue fits: the word's gender and number forms. A different
         word spelt like one of its case forms («у́тром» "in the morning",
         «вку́сно» the adverb) is a look-alike wrong answer by design (§30ao),
         not a second right one. */
      const own = genderForms(w);
      const bad = c.options.filter((o) => !o.right && own.has(fold(o.label)));
      if (bad.length) { chooseBad++; exChoose.set(w.b, `${c.prompt} → ${w.w}; wrong option that is its own form: ${bad.map((o) => o.label).join(", ")}`); }
    }
  }
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "0");
console.log(`type: ${typeAmbiguous} of ${typeAsked} (${pct(typeAmbiguous, typeAsked)} %) mark a right answer wrong; ${exType.size} words`);
for (const s of [...exType.values()].slice(0, 25)) console.log("   ", s);
console.log(`choose-ru: ${chooseBad} of ${chooseAsked} (${pct(chooseBad, chooseAsked)} %) offer the answer's own form as wrong; ${exChoose.size} words`);
for (const s of [...exChoose.values()].slice(0, 25)) console.log("   ", s);
