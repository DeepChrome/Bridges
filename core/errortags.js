/* The fixed vocabulary of learner errors.
 *
 * A feedback model may only name errors from this list — the backend rejects any
 * other tag — so what the learner is told, what the trouble bank counts and what a
 * grammar note is linked from all agree on one set of names. Descriptions are the
 * words a learner sees; `unit` is the unit whose grammar note teaches the point,
 * where one does (data/curated/grammar_notes.json is keyed by unit), and null where
 * the app has nothing to send them to yet.
 */

export const ERROR_TAGS = [
  { id: "CASE", en: "The wrong case ending for the word's role in the sentence", unit: "core4" },
  { id: "NUMBER", en: "Singular where plural was needed, or the reverse", unit: "core3" },
  { id: "GENDER_AGREE", en: "An adjective or past-tense verb not matching the noun's gender", unit: "core2" },
  { id: "ASPECT", en: "Imperfective where the perfective partner was needed, or the reverse", unit: "core8" },
  { id: "TENSE", en: "The wrong tense for when it happened", unit: "core7" },
  { id: "PERSON", en: "A verb ending that does not match who is doing it", unit: "core5" },
  { id: "WORD_ORDER", en: "Words in an order a speaker would not use", unit: null },
  { id: "PREPOSITION", en: "The wrong preposition, or the wrong case after it", unit: "core6" },
  { id: "WRONG_WORD", en: "A different word from the one that fits", unit: null },
  { id: "MISSING_WORD", en: "A word the sentence needs was left out", unit: null },
  { id: "EXTRA_WORD", en: "A word the sentence does not need, often an article or “is”", unit: "core1" },
  { id: "STRESS", en: "The emphasis on the wrong syllable", unit: null },
  { id: "UNCLEAR", en: "The recogniser could not make the word out — try again", unit: null },
];

const BY_ID = Object.create(null);
for (const t of ERROR_TAGS) BY_ID[t.id] = t;

export const TAG_IDS = ERROR_TAGS.map((t) => t.id);
export const isTag = (id) => typeof id === "string" && id in BY_ID;
export const tagInfo = (id) => BY_ID[id] || null;
