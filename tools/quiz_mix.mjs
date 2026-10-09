/* How much of a lesson quiz is the lesson's own chapter, and how much is
 * older material (the owner, 2026-10-09: "if 10 questions, 8 of them should
 * focus on current chapter and maybe 1 or 2 on older concepts").
 *
 * A question is "older" when the word it asks about is taught in an earlier
 * chapter. A question with no word behind it (a sentence heard or said, a
 * built word) is counted by its sentence's newest word. Draws every lesson
 * of every unit a few times and prints the share per chapter and the worst
 * quizzes.
 *
 *   node tools/quiz_mix.mjs [draws=5]
 */
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
  if (p.c === 0 || !STAGES.length) STAGES.push({ core: data.units[p.u], branches: [] });
  else STAGES[STAGES.length - 1].branches.push(data.units[p.u]);
});
const stageOf = (u) => Math.max(0, STAGES.findIndex((s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageOf(u));
const lessonWords = (u, i) => lessonWordsOf(u, i, sizeOf(u));
const lessonCount = (u) => lessonCountOf(u, sizeOf(u));
const Q = makeQuestions({ L, IX: data.index, UN: data.units, STAGES, PAIRS: data.pairs || {}, hasVoice: () => true,
                          lessonWords, lessonCount, SPEECH: data.speech, SCRIPTS: data.scripts || {} });

// The chapter a word is first taught in.
const chapterOfWord = new Map();
STAGES.forEach((s, k) => [s.core].concat(s.branches).forEach((u) => (u.w || []).forEach((i) => {
  if (!chapterOfWord.has(i)) chapterOfWord.set(i, k);
})));
/* The chapter's grammar asked of an older word is this chapter's concept: a
   form question, and the drill on this chapter's rule, count as current. The
   second drill on earlier chapters' words is the older one (`old` below). */
const wordChapter = (q, k) => {
  if (q.chapter || q.kind === "form" || (q.drill && !q.older)) return k;
  if (typeof q.i === "number" && chapterOfWord.has(q.i)) return chapterOfWord.get(q.i);
  const text = q.target || q.answer || q.ru || q.prompt || "";
  let newest = -1;
  for (const tok of String(text).match(/[А-Яа-яЁё́-]+/g) || []) {
    const hit = (data.index[fold(tok)] || [])[0];
    if (hit !== undefined && chapterOfWord.has(hit)) newest = Math.max(newest, chapterOfWord.get(hit));
  }
  return newest;
};

const draws = Number(process.argv[2] || 5);
let worst = [];
const byChapter = STAGES.map(() => ({ q: 0, old: 0, quizzes: 0, over: 0 }));
STAGES.forEach((s, k) => {
  for (const u of [s.core].concat(s.branches)) {
    for (let i = 0; i < lessonCount(u); i++) {
      for (let d = 0; d < draws; d++) {
        const quiz = Q.quizSteps(u, i);
        const olds = quiz.filter((q) => { const c = wordChapter(q, k); return c >= 0 && c < k; });
        const old = olds.length;
        if (process.argv[3] === `${u.id}:${i}`) {
          console.log(olds.map((q) => `${q.kind}${q.review ? "/review" : ""}${q.drill ? "/drill" : ""}: ${q.prompt || q.ru || q.target || ""}`).join("\n  "));
        }
        const b = byChapter[k];
        b.q += quiz.length; b.old += old; b.quizzes++;
        if (old / quiz.length > 0.2) b.over++;
        worst.push({ at: `${u.id}:${i}`, old, n: quiz.length });
      }
    }
  }
});
byChapter.forEach((b, k) => console.log(`chapter ${k + 1}: ${(100 * b.old / b.q).toFixed(0)}% older, `
  + `${b.over} of ${b.quizzes} quizzes over 20%`));
worst.sort((a, b) => b.old / b.n - a.old / a.n);
console.log("worst:", worst.slice(0, 8).map((w) => `${w.at} ${w.old}/${w.n}`).join(", "));
