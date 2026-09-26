/* POST /v1/explain — why the right answer was right (2026-09-26).
 *
 * The owner: *"I'd like to get AI feedback on incorrect answers."* The runner
 * already shows the chapter's grammar card under a miss (§30al), but a card is
 * the rule in general; this is the rule applied to the one word the learner
 * just got wrong, and to the thing they put instead.
 *
 * What it is given is the question as the app drew it — what was asked, the
 * prompt, the right answer, what the learner answered — and nothing about the
 * learner. What it gives back is one short paragraph. Three rules:
 *
 *   1. **Explain, do not grade.** The verdict has already been given; this says
 *      why. No praise, no "keep trying", no second question.
 *   2. **Say what the learner's answer would have been**, when it is a real
 *      form or a real word: «книги» is the genitive, not a typo, and a learner
 *      who is told that learns two things from one miss.
 *   3. **Short.** WHY_WORDS at most, plain sentences a beginner reads in one
 *      look, Russian forms in guillemets. A wrong answer is a moment, not a
 *      lesson.
 */

import { plain } from "./schema.js";

export const WHY_WORDS = 55;
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";

export const SYSTEM_EXPLAIN = `You explain one wrong answer to a learner of Russian, in English. The app has already marked it wrong and shown the right answer; your job is to say why, briefly.

You receive JSON with:
- "kind": what sort of question it was (cases, conjugation, agreement, aspect, stress, cloze, type, choose-en, choose-ru, listen, form).
- "ask": the instruction the learner saw.
- "prompt": the word or sentence shown; "sub" its meaning or context, if any.
- "answer": the right answer.
- "said": what the learner answered (a form they wrote or an option they chose), or null if they gave nothing.
- "rule": the title of the grammar rule the question was built on, if any.

Rules:
- At most ${WHY_WORDS} words of plain English. Russian forms go in «guillemets».
- Say why the right answer is the right form or word here: the case and what governs it, the person and tense, the gender the noun carries, the aspect and why, the stress pattern, or the meaning that fits the sentence.
- If "said" is itself a real Russian form or word, say in a few words what it is or means, so the learner keeps that too. If it is not a real form, say nothing about it.
- Do not praise, do not encourage, do not ask a question, do not set a new exercise, do not restate the verdict. Only the explanation.
- Never use dashes in anything you write.

Reply with JSON only, no prose around it:
{"why":"<at most ${WHY_WORDS} words>"}`;

export function explainMessage(b) {
  return JSON.stringify({
    kind: String(b.kind || ""),
    ask: String(b.ask || ""),
    prompt: String(b.prompt || ""),
    sub: b.sub ? String(b.sub) : null,
    answer: String(b.answer || ""),
    said: b.said === undefined || b.said === null || b.said === "" ? null : String(b.said),
    rule: b.rule ? String(b.rule) : null,
  });
}

export function validateExplain(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }
  const errors = [];
  if (!isStr(raw.why) || !raw.why.trim()) errors.push("why: missing");
  else if (countWords(raw.why) > WHY_WORDS) errors.push(`why: over ${WHY_WORDS} words`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { why: plain(raw.why) } };
}
