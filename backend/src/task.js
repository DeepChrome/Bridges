/* The chapter-end task (ROADMAP P10.5): POST /v1/task.
 *
 * A quiz asks whether the learner can answer questions about a chapter's words.
 * This asks whether they can do something with them, and the model's job is to
 * judge the *goal*, not the grammar: did they get across who they are, what
 * they want, where they are going. Grammar notes ride along, but a task the
 * learner completed in wonky Russian is a task completed, and saying otherwise
 * would turn the one production exercise in the app into another quiz.
 *
 * Two rules the prompt has to hold, and the validator enforces:
 *
 *   1. **Judge against what they have been taught.** The studied list is sent
 *      with every request. A chapter-2 learner reaching for chapter-7 grammar
 *      is not a mistake to correct; a chapter-2 learner missing the point of the
 *      task is.
 *   2. **Each `must` gets a verdict, and only those.** The model does not get to
 *      invent extra requirements it then marks the learner down against, which
 *      is what an unconstrained "did they do well?" prompt does every time.
 */

import { ERROR_TAGS } from "../../core/errortags.js";
import { plain } from "./schema.js";

const TAG_LINES = ERROR_TAGS.map((t) => `  ${t.id} — ${t.en}`).join("\n");
const NOTE_WORDS = 20;
const PRAISE_WORDS = 12;
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";
const isTag = (id) => ERROR_TAGS.some((t) => t.id === id);

export const SYSTEM_TASK = `You are marking a short task a Russian learner has just done out loud or in writing.

The task has a goal and a small list of things the answer must get across. Your job is to say, for each of those things, whether the learner got it across. Judge the goal, not the grammar: if the meaning arrives, the point is made, even in clumsy Russian.

Rules:
- Judge only against the list you are given. Do not invent further requirements.
- The learner's studied words are listed. Do not fault them for not using words they have never been taught, and do not suggest such words.
- Grammar notes are secondary and optional. At most two, each at most ${NOTE_WORDS} words, each carrying one of these tags:
${TAG_LINES}
- Praise is at most ${PRAISE_WORDS} words and must be specific to what they wrote.
- Never use dashes in anything you write.

Reply with JSON only, no prose around it:
{"points":[{"must":"<the requirement, copied exactly>","met":true|false,"note":"<at most 12 words, why not, or empty>"}],
 "grammar":[{"tag":"<tag id>","note":"<at most ${NOTE_WORDS} words>"}],
 "praise":"<at most ${PRAISE_WORDS} words>"}`;

export function taskMessage({ goal, must, attempt, studied, chapter }) {
  const list = (must || []).map((m, i) => `${i + 1}. ${m}`).join("\n");
  const words = (studied || []).slice(0, 300).join(", ");
  return [
    `Chapter ${chapter || "?"} task.`,
    `Goal: ${goal}`,
    `The answer must get across:\n${list}`,
    `The learner wrote or said:\n${attempt}`,
    words ? `Words the learner has been taught: ${words}` : "",
  ].filter(Boolean).join("\n\n");
}

/* `must` is passed back in so a point can be matched to the requirement it
   answers: a model that renames or reorders them cannot be trusted to have
   judged the ones it was given. */
export function validateTask(raw, must) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }
  const wanted = Array.isArray(must) ? must : [];

  if (!Array.isArray(raw.points)) bad("points: not an array");
  else {
    raw.points.forEach((p, i) => {
      if (!p || typeof p !== "object") return bad(`points[${i}]: not an object`);
      if (!isStr(p.must)) bad(`points[${i}].must: not a string`);
      else if (wanted.length && !wanted.includes(p.must)) {
        bad(`points[${i}].must: not one of the requirements given`);
      }
      if (typeof p.met !== "boolean") bad(`points[${i}].met: not a boolean`);
      if (p.note === undefined || p.note === null) p.note = "";
      if (!isStr(p.note)) bad(`points[${i}].note: not a string`);
      else if (countWords(p.note) > 12) bad(`points[${i}].note: over 12 words`);
    });
    // Every requirement judged, none twice. A model that quietly drops one is
    // reporting a pass on a task it did not finish reading.
    if (wanted.length) {
      const seen = raw.points.map((p) => p && p.must);
      for (const m of wanted) if (!seen.includes(m)) bad(`points: nothing said about "${m}"`);
      if (new Set(seen).size !== seen.length) bad("points: a requirement is judged twice");
    }
  }

  if (raw.grammar === undefined || raw.grammar === null) raw.grammar = [];
  if (!Array.isArray(raw.grammar)) bad("grammar: not an array");
  else raw.grammar.forEach((g, i) => {
    if (!g || typeof g !== "object") return bad(`grammar[${i}]: not an object`);
    if (!isTag(g.tag)) bad(`grammar[${i}].tag: unknown tag ${JSON.stringify(g.tag)}`);
    if (!isStr(g.note)) bad(`grammar[${i}].note: not a string`);
    else if (countWords(g.note) > NOTE_WORDS) bad(`grammar[${i}].note: over ${NOTE_WORDS} words`);
  });

  if (raw.praise === undefined || raw.praise === null) raw.praise = "";
  if (!isStr(raw.praise)) bad("praise: not a string");
  else if (countWords(raw.praise) > PRAISE_WORDS) bad(`praise: over ${PRAISE_WORDS} words`);

  if (errors.length) return { ok: false, errors };
  const points = raw.points.map((p) => ({ must: p.must, met: !!p.met, note: plain(p.note) }));
  return {
    ok: true,
    value: {
      points,
      // The task is done when every requirement is met. Derived here rather
      // than asked for, so the model cannot say "done" over its own list of
      // things the learner did not manage.
      done: points.length > 0 && points.every((p) => p.met),
      grammar: raw.grammar.slice(0, 2).map((g) => ({ tag: g.tag, note: plain(g.note) })),
      praise: plain(raw.praise),
    },
  };
}
