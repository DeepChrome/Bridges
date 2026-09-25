/* Print real questions from every generator, to be read by a person.
 *
 * `audit_options.mjs` counts the tells a learner could use without knowing
 * Russian and `audit_banks.mjs` counts how many distinct questions a drill
 * holds; neither says whether a question is *sensible* — answerable, asking
 * something worth knowing, with the answer actually in the options. That is a
 * reading job, and this puts the reading in one place: a handful of questions
 * per kind against a learner who has met `--pool` words (150 by default —
 * chapter 3 or so), plus whether a run of ten fills at all.
 *
 *   node tools/sample_drills.mjs
 *   node tools/sample_drills.mjs --pool 60 --each 5
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, DRILL_TYPES, lessonSize, DRILL_N } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { pairDrill } from "../core/alphabet.js";
import { buildupDrill } from "../core/buildup.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const POOL = parseInt(arg("--pool", "150"), 10);
const EACH = parseInt(arg("--each", "3"), 10);

const data = loadPayload(ROOT);
const L = data.lemmas;
const DEEP_BY_BARE = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({ deepIndex: () => DEEP_BY_BARE, shapes: data.shapes, slots: data.slots, sent: data.sent }));

const STAGES = (() => {
  const out = [];
  data.path.forEach((p) => {
    if (p.c === 0 || !out.length) out.push({ core: data.units[p.u], branches: [], n: p.cn || out.length + 1 });
    else out[out.length - 1].branches.push(data.units[p.u]);
  });
  return out;
})();
const stageIndex = (u) => Math.max(0, STAGES.findIndex((s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));
const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {},
  lessonWords: (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u)),
  lessonCount: (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u))),
  SPEECH: data.speech, SCRIPTS: data.scripts || {}, hasVoice: () => true,
});

const routeWords = () => {
  const out = [];
  for (const s of STAGES) for (const u of [s.core].concat(s.branches)) for (const i of u.w || []) if (!out.includes(i)) out.push(i);
  return out;
};
const pool = routeWords().slice(0, POOL);
const unitsUpTo = (n) => STAGES.slice(0, n).flatMap((s) => [s.core].concat(s.branches));

const strip = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
const one = (q) => {
  const bits = [];
  if (q.ask) bits.push(`ask=${JSON.stringify(strip(q.ask))}`);
  if (q.prompt) bits.push(`prompt=${JSON.stringify(strip(q.prompt))}`);
  if (q.sub) bits.push(`sub=${JSON.stringify(strip(q.sub))}`);
  if (q.say) bits.push(`say=${JSON.stringify(strip(q.say))}`);
  if (q.options) bits.push(`options=[${q.options.map((o) => (o.right ? "*" : "") + strip(o.label)).join(" | ")}]`);
  if (q.target) bits.push(`target=${JSON.stringify(strip(q.target))}`);
  if (q.alts && q.alts.length) bits.push(`alts=${q.alts.length}`);
  if (q.hint) bits.push(`hint=${JSON.stringify(strip(q.hint))}`);
  if (q.table) bits.push("table");
  if (q.note) bits.push("note");
  if (q.lines) bits.push(`lines=${q.lines.length}`);
  if (q.questions) bits.push(`questions=${q.questions.length}`);
  if (q.typed) bits.push("typed");
  return bits.join("  ");
};
const show = (title, qs, n = EACH) => {
  console.log(`\n== ${title}  (${qs.length} in a run)`);
  qs.slice(0, n).forEach((q, i) => console.log(`  ${i + 1}. [${q.kind || q.t || "?"}] ${one(q)}`));
  if (!qs.length) console.log("  (nothing)");
};

console.log(`a learner who has met ${pool.length} words\n`);

for (const d of DRILL_TYPES) {
  for (const typed of [true, false]) {
    let qs = [];
    try { qs = Q.drillQuestions(d.id, DRILL_N, pool, undefined, typed); } catch (e) { qs = []; console.log(`  ${d.id}: threw ${e.message}`); }
    show(`${d.name}${typed ? " (written)" : " (chosen)"}`, qs);
  }
}

/* The lesson quiz, mid-route: what a learner actually sits. */
const u3 = STAGES[2].core;
show(`Lesson quiz — ${u3.name}, lesson 2`, Q.quizSteps(u3, 1), 12);

const units = unitsUpTo(3);
try { const p = Q.lessonPassage(units, null); show("Listening fallback (corpus scene, lessonPassage)", p ? [p] : []); } catch (e) { console.log(`lessonPassage threw ${e.message}`); }
try { show("Shadowing", Q.shadowDrill(units, 6)); } catch (e) { console.log(`shadowDrill threw ${e.message}`); }
try { show("Pronunciation pairs", pairDrill(10)); } catch (e) { console.log(`pairDrill threw ${e.message}`); }
try {
  const words = pool.map((i) => L[i]).filter((w) => w && w.b).map((w) => ({ ru: w.b, en: (w.e || "").split(/[;,]/)[0] }));
  const qs = buildupDrill(words, 6);
  console.log(`\n== Word building  (${qs.length} in a run)`);
  qs.slice(0, EACH).forEach((q, i) => console.log(`  ${i + 1}. ${strip(q.ru)} (${q.en})  steps=[${q.steps.map(strip).join(" → ")}]`));
} catch (e) { console.log(`buildupDrill threw ${e.message}`); }
try { const s = Q.writtenPassage(units, () => 99); show("Listening (written scenario)", s ? [s] : []); } catch (e) { console.log(`writtenPassage threw ${e.message}`); }
