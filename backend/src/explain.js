/* POST /v1/explain — why the right answer was right (2026-09-26).
 *
 * The owner: *"I'd like to get AI feedback on incorrect answers."* The runner
 * used to show the chapter's grammar card under a miss (§30al), but a card is
 * the rule in general; this is the rule applied to the one word the learner
 * just got wrong, and to the thing they put instead.
 *
 * **Two short fields, not a paragraph.** The first cut allowed 55 words of
 * prose in one field and shipped beside the grammar card, which the owner read
 * on his phone as *"a large ugly verbose block of text"*. A verdict is a
 * moment, so the reply is two lines at most:
 *
 *   why   — one sentence, ≤ WHY_WORDS, why `answer` is the right form here.
 *   yours — ≤ YOURS_WORDS, what the learner's own answer actually is, and only
 *           when it is a real Russian form. Empty otherwise.
 *
 * **Russian goes in «guillemets»**, because that is what the app's renderer
 * sets apart (ui.js `Marked`): the forms are what the eye should land on, and
 * asking for the punctuation is cheaper than asking for markup. The renderer
 * falls back to marking Cyrillic runs, so a reply that forgets them still
 * reads right.
 *
 * Three rules hold it: explain, do not grade (the verdict is already given);
 * say what the learner's answer *was* when it is a word, so a miss teaches two
 * things; and no praise, no encouragement, no second question.
 */

import { plain } from "./schema.js";

/* Twenty words is one clear sentence; the extra four are slack, because a
   reply over the cap costs a retry and then falls back to the grammar card. */
export const WHY_WORDS = 24;
export const YOURS_WORDS = 12;
/* The rule behind the question, for the learner who wants more than the one
   correction (the owner, 2026-09-26: *"make the AI able to pass relevant
   references if the user is struggling on a question where the user can
   click a box and get a little hint on the rules"*). It is **not** shown
   with the verdict — it sits behind a tap, so the two short lines stay two
   short lines and the reference is there for whoever wants it. Longer than
   `why` because it teaches the pattern rather than fixing one word, and
   still short enough to read standing up. */
export const RULE_WORDS = 45;
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";

export const SYSTEM_EXPLAIN = `You explain one wrong answer to a learner of Russian, in English, in one short line. The app has already marked it wrong and shown the right answer; your job is to say why, briefly.

You receive JSON with:
- "kind": what sort of question it was (cases, conjugation, agreement, aspect, stress, cloze, type, choose-en, choose-ru, listen, form).
- "ask": the instruction the learner saw.
- "prompt": the word or sentence shown; "sub" its meaning or context, if any.
- "answer": the right answer.
- "said": what the learner answered, or null if they gave nothing.
- "rule": the title of the grammar rule the question was built on, if any.

Reply with JSON only, no prose around it:
{"why":"<at most ${WHY_WORDS} words>","yours":"<at most ${YOURS_WORDS} words, or empty>","rule":"<at most ${RULE_WORDS} words, or empty>"}

Rules:
- "rule": the general pattern behind this question, for a learner who wants more than this one correction. State the rule and give one short example in «guillemets». At most ${RULE_WORDS} words. Write it about the pattern, not about this word. Empty when the question has no rule behind it, such as where the stress falls in a single word.
- "why": one sentence saying why "answer" is the right form or word here: the case and what governs it, the person and tense, the gender the noun carries, the aspect and why, where the stress falls, or the meaning that fits the sentence. At most ${WHY_WORDS} words.
- Write every Russian form inside «guillemets», like «книги». Never write Russian without them.
- "yours": what the learner's own answer is, in a few words, like «книгу» is the accusative. Only when "said" is itself a real Russian form or word. Empty when it is not a word, is missing, or is English.
- Do not praise, do not encourage, do not ask a question, do not set a new exercise, do not restate the verdict, do not say what to remember. Only the explanation.
- Never use dashes in anything you write.`;

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
  for (const k of ["yours", "rule"]) if (raw[k] === undefined || raw[k] === null) raw[k] = "";
  if (!isStr(raw.why) || !raw.why.trim()) errors.push("why: missing");
  else if (countWords(raw.why) > WHY_WORDS) errors.push(`why: over ${WHY_WORDS} words`);
  if (!isStr(raw.yours)) errors.push("yours: not a string");
  else if (countWords(raw.yours) > YOURS_WORDS) errors.push(`yours: over ${YOURS_WORDS} words`);
  if (!isStr(raw.rule)) errors.push("rule: not a string");
  else if (countWords(raw.rule) > RULE_WORDS) errors.push(`rule: over ${RULE_WORDS} words`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { why: plain(raw.why), yours: plain(raw.yours), rule: plain(raw.rule) } };
}
