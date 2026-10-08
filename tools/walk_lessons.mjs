/* The course as a learner meets it, lesson by lesson along the route, in
 * text: each lesson's steps, the rule card where it appears, the vocabulary
 * walk (cards and the questions between them), and one draw of its quiz,
 * with the answers. For reading the sequence end to end — what is taught
 * when, what is asked before it is taught, what repeats.
 *
 *   node tools/walk_lessons.mjs              every chapter
 *   node tools/walk_lessons.mjs 1 3          chapters 1 to 3
 *   node tools/walk_lessons.mjs 2 2 --spine  chapter 2, the spine only
 *
 * The lesson's steps mirror native/src/data.js `components`; the questions
 * come from the real generators (core/questions.js). One random draw: run it
 * twice to see another. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeQuestions, lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { CASES } from "../core/cases.js";
import { firstSense } from "../core/util.js";

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

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const from = Number(args[0] || 1), to = Number(args[1] || STAGES.length);
const spineOnly = process.argv.includes("--spine");

const word = (i) => (L[i] ? `${L[i].w} (${firstSense(L[i]) || ""})` : `#${i}`);
const answerOf = (q) => (q.typed ? q.answer
  : q.options ? (q.options.find((o) => o.right) || {}).label
  : q.pairs ? "(match)" : q.kind === "say" || q.kind === "hear" ? q.answer || q.ru || "" : "");
const line = (q) => {
  const prompt = String(q.prompt || q.ru || "").replace(/\s+/g, " ");
  return `${q.kind}${q.typed ? "/typed" : q.options ? "/choice" : ""}: ${q.ask || ""} | ${prompt}${q.sub ? " | " + q.sub : ""} → ${answerOf(q)}`;
};

for (let s = from - 1; s < to && s < STAGES.length; s++) {
  const stage = STAGES[s];
  console.log(`\n################ CHAPTER ${s + 1}: ${stage.title}`);
  const units = [stage.core].concat(spineOnly ? [] : stage.branches);
  for (const u of units) {
    console.log(`\n======== ${u.id === stage.core.id ? "SPINE" : u.opt ? "OPTIONAL QUEST" : "QUEST"} ${u.id} — ${u.name}`
      + (u.v ? `  · video: ${u.v.title}` : ""));
    if (u.g) console.log(`  RULE CARD: ${u.g.title} — ${u.g.body}\n    e.g. ${(u.g.examples || []).map((e) => e.join(" = ")).join("; ")}`);
    const n = lessonCount(u);
    for (let i = 0; i < n; i++) {
      const steps = ["Vocabulary"];
      if (Q.formSpec(u)) steps.push("Grammar (optional)");
      const c = i === 0 && u.id === stage.core.id ? CASES.find((x) => x.stage === s) : null;
      if (c) steps.push(`${c.name} case (optional)`);
      steps.push("Quiz");
      if ((data.scripts || {})[`${u.id}:${i}`]) steps.push("Listening (optional)");
      steps.push("Summary (optional)");
      if (u.v && i === n - 1) steps.push("Video", ...(u.v.quiz ? ["Video questions (optional)"] : []));
      console.log(`\n  --- Lesson ${i + 1}/${n}: ${lessonWords(u, i).map(word).join(", ")}`);
      console.log(`  steps: ${steps.join(" → ")}`);
      console.log("  vocabulary walk:");
      for (const st of Q.vocabSteps(u, i)) {
        if (st.t === "grammar") console.log(`    [rule card] ${st.note.title}`);
        else if (st.t === "list") console.log(`    [word list] ${st.words.length} words`);
        else if (st.t === "word") console.log(`    [card] ${word(st.i)}`);
        else console.log(`    ${st.drill ? "[grammar] " : st.review ? "[review] " : ""}${line(st)}`);
      }
      console.log("  quiz (one draw):");
      for (const q of Q.quizSteps(u, i)) console.log(`    ${q.drill ? "[drill] " : ""}${line(q)}`);
    }
  }
}
