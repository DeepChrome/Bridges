/* The four skills a word is scored on, and which questions exercise which.
 *
 * The owner, 2026-10-29: *"imagine my ability to recall the word in Russian
 * is very strong but my ability to recall the English when given the Russian
 * word is weak. A score of 90 doesn't indicate that… break up the score into
 * different areas… English to Russian, Russian to English, cases, and perhaps
 * even usage in a sentence. All of these scores should feed into different
 * drills."*
 *
 * A word still has **one card** that decides when it comes round (§30at;
 * core/scheduler.js CARD) — this does not bring back the three cards a word.
 * Beside that card, `seen[word]` carries one **skill slot** per skill below,
 * each an FSRS memory of its own, graded only by the questions that exercise
 * that skill and never dealt by the schedule. The slot's stability is the
 * skill's score, read through `familiarity` like the card's, so "Russian →
 * English 90, English → Russian 40" is two memories reporting what they hold,
 * not two tallies that could drift from the schedule.
 *
 * This file is the tables only — which skill a question kind or a flashcard
 * front belongs to — so that the scheduler can import it without a cycle.
 * The grading lives in core/scheduler.js (`gradeSkill`, `skillScores`).
 */

export const SKILLS = [
  /* Russian in front (shown or heard), the meaning asked. */
  { id: "ru2en", name: "Russian → English" },
  /* The meaning in front, the Russian asked for. */
  { id: "en2ru", name: "English → Russian" },
  /* A form of the word: a case ending, a conjugation, agreement, the aspect
     partner, where the stress falls. */
  { id: "forms", name: "Cases & forms" },
  /* The word met inside a sentence: a gap to fill, a sentence heard or said. */
  { id: "usage", name: "In a sentence" },
];
export const SKILL_IDS = SKILLS.map((s) => s.id);
export const isSkill = (id) => SKILL_IDS.includes(id);

/* Which skill a flashcard front exercises (core/scheduler.js DIRECTIONS). The
   Russian heard and the Russian shown both ask for its meaning. */
export const SKILL_OF_FRONT = { recognise: "ru2en", produce: "en2ru", listen: "ru2en" };
/* …and the front that practises a meaning skill, for a nudge towards the one
   that has fallen behind (core/lean.js). Russian shown, not heard: the
   written card is the plain way to meet a word from its Russian side. */
export const FRONT_OF_SKILL = { ru2en: "recognise", en2ru: "produce" };

/* Which skill a question kind exercises (core/scheduler.js DIRECTION_OF_KIND
   has the same keys; registry.test.js holds the two complete). `null` is a
   kind that grades no word's skill — the mouth drills and the video quiz,
   which grade no card either. */
export const SKILL_OF_KIND = {
  "choose-en": "ru2en", match: "ru2en", listen: "ru2en",
  "choose-ru": "en2ru", type: "en2ru",
  stress: "forms", form: "forms", cases: "forms", aspect: "forms", agreement: "forms", conjugation: "forms",
  cloze: "usage", hear: "usage", say: "usage", scene: "usage", shadow: "usage",
  "pair-say": null, "pair-hear": null, buildup: null, video: null,
};

/* The skill a graded answer belongs to: the question's kind where it is one
   the table knows, else the front it was asked through (a flashcard, whose
   `source` is "study"; a Talk turn, "talk", asked through `produce`). */
export function skillOfKind(kind, direction) {
  if (kind !== undefined && kind !== null && Object.prototype.hasOwnProperty.call(SKILL_OF_KIND, kind)) {
    return SKILL_OF_KIND[kind];
  }
  return SKILL_OF_FRONT[direction] || null;
}
