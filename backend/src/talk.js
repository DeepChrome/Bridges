/* Conversation mode (ROADMAP Phase 6): the tutor's turn, and what it must look like.
 *
 * The app sends the whole exchange every turn — the Worker keeps nothing — with
 * the scenario, the unit's grammar topic, the lemmas the learner has studied, and
 * the recogniser's transcript of the learner's latest turn. The model answers in
 * Russian at the learner's level, mostly from those lemmas, at most two sentences
 * and one question back, and says which words it used that the learner has not
 * studied. It also lemmatises every word of its own reply and grades the learner's
 * turn with the same schema the Say activity uses (schema.js), so one validator
 * and one set of tags serve both.
 *
 * Lemmatising here rather than shipping the full form index is a measured choice
 * (ROADMAP A25): the 439,358 forms beyond the app's index are 9.3 MB raw, and the
 * app resolves a lemma through the dictionary it already carries.
 */

import { ERROR_TAGS } from "../../core/errortags.js";
import { validate, extractJson, plain } from "./schema.js";

const TAG_LINES = ERROR_TAGS.map((t) => `  ${t.id} — ${t.en}`).join("\n");
export const MAX_TURNS = 12;          // learner turns per session
export const MAX_NEW_WORDS = 2;
const CYRILLIC_WORD = /[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*/g;

/* How the tutor pitches its Russian (the owner, 2026-09-07): the learner picks. */
export const LEVELS = {
  beginner: "The learner is a beginner: use only very common, concrete words and the present tense; short sentences of three to six words; no idioms.",
  intermediate: "The learner is intermediate: everyday Russian, past and future tenses are fine, an occasional less common word.",
  advanced: "The learner is advanced: speak naturally, use idioms, participles, aspect pairs and longer sentences where a native would; you may write up to three sentences.",
};
export const LEVEL_SENTENCES = { beginner: 2, intermediate: 2, advanced: 3 };
export const DEFAULT_LEVEL = "intermediate";
export const levelOf = (x) => (x in LEVELS ? x : DEFAULT_LEVEL);

export const SYSTEM_TALK = `You are a patient Russian tutor having a short spoken conversation with a learner.

You receive JSON with:
- "scenario": the situation (e.g. ordering in a café) and your role in it.
- "level": how to pitch your Russian, one of "beginner", "intermediate", "advanced":
  beginner — ${LEVELS.beginner}
  intermediate — ${LEVELS.intermediate}
  advanced — ${LEVELS.advanced}
- "topic": the grammar point of the learner's current unit, if any.
- "studied": dictionary forms of the words the learner has studied. Prefer these. You may use at most ${MAX_NEW_WORDS} words per turn that are not among them; list every such word in "newWords".
- "history": the conversation so far, oldest first, each turn {"who":"tutor"|"learner","ru":...}.
- "transcript": what a speech recogniser heard of the learner's latest turn. It may contain recognition errors; do not treat a homophone or a mis-heard consonant as a learner error. Empty on the first turn — then you open the conversation.

Reply with a single JSON object and nothing else — no prose, no code fences:
{
  "reply_ru": string,
  "reply_en": string,
  "reply_tokens": [ { "ru": string, "lemma": string } ],
  "feedback": null | { "words": [ { "said": string|null, "expected": string|null, "lemma": string, "status": "ok"|"sub"|"del"|"ins", "tags": [TAG] } ], "grammar": [ { "tag": TAG, "note": string } ], "wordChoice": [ { "said": string, "better": string, "note": string } ], "overall": "ok"|"minor"|"major", "praise": string },
  "newWords": [ { "ru": string, "lemma": string, "en": string } ]
}

Rules:
- "reply_ru": at most two sentences (three for an advanced learner), pitched at "level", and exactly one of them a question that keeps the conversation going. Stay in the scenario. Never lecture.
- "reply_en": a natural English translation of reply_ru.
- "reply_tokens": every Russian word of reply_ru in order, each with its dictionary form (nominative singular; infinitive for verbs).
- "feedback": null when transcript is empty. Otherwise grade the learner's turn: "words" aligns what was said to what a Russian speaker would have said in that turn ("expected" is your correction of each word, or null for an extra word), with "lemma" the dictionary form; a well-formed turn gets every word "ok", "grammar" and "wordChoice" empty, "overall" "ok". Notes are at most 20 words of plain English, plain sentences with commas and full stops, never a dash. "praise" at most 12 words or "".
- TAG must be one of exactly these names:
${TAG_LINES}
- "newWords": each word in reply_ru whose dictionary form is not in "studied", at most ${MAX_NEW_WORDS}; if you would need more, rephrase.
- Never invent an error to have something to say.`;

/* A hint (the owner, 2026-09-07): one way the learner could answer the tutor's
   last turn, at their level, from the words they have studied. */
export const SYSTEM_HINT = `You are a patient Russian tutor. The learner is in a spoken conversation and has asked for a hint: one natural, short thing they could say next in Russian.

You receive JSON with "scenario", "level" (beginner: very simple words and the present tense; intermediate: everyday Russian; advanced: natural Russian), "studied" (dictionary forms of words the learner knows — prefer these), and "history" (the conversation so far, oldest first; the last turn is the tutor's, which the hint must answer).

Reply with a single JSON object and nothing else:
{ "hint_ru": string, "hint_en": string }

Rules: hint_ru is one sentence of at most twelve words that answers the tutor's last turn and fits the scenario; hint_en is its natural English translation. No notes, no alternatives, no dashes.`;

export function hintMessage({ scenario, level, studied, history }) {
  return JSON.stringify({
    scenario: String(scenario || ""), level: levelOf(level),
    studied: Array.isArray(studied) ? studied.map(String).slice(0, 400) : [],
    history: Array.isArray(history)
      ? history.slice(-2 * MAX_TURNS).map((h) => ({ who: h.who === "learner" ? "learner" : "tutor", ru: String(h.ru || "") }))
      : [],
  });
}

export function validateHint(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["reply is not an object"] };
  if (!isStr(raw.hint_ru) || !raw.hint_ru.trim()) errors.push("hint_ru: missing");
  else {
    if (!/[а-яёА-ЯЁ]/.test(raw.hint_ru)) errors.push("hint_ru: not Russian");
    if ((raw.hint_ru.match(CYRILLIC_WORD) || []).length > 12) errors.push("hint_ru: more than twelve words");
    if (sentences(raw.hint_ru) > 1) errors.push("hint_ru: more than one sentence");
  }
  if (!isStr(raw.hint_en) || !raw.hint_en.trim()) errors.push("hint_en: missing");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { hint_ru: raw.hint_ru.trim(), hint_en: plain(raw.hint_en) } };
}

export function talkMessage({ scenario, topic, studied, history, transcript, level }) {
  return JSON.stringify({
    scenario: String(scenario || ""),
    level: levelOf(level),
    topic: topic ? String(topic) : null,
    studied: Array.isArray(studied) ? studied.map(String).slice(0, 400) : [],
    history: Array.isArray(history)
      ? history.slice(-2 * MAX_TURNS).map((h) => ({ who: h.who === "learner" ? "learner" : "tutor", ru: String(h.ru || "") }))
      : [],
    transcript: String(transcript || ""),
  });
}

const sentences = (s) => String(s).split(/(?<=[.!?…])\s+/).filter((x) => x.trim()).length;
const isStr = (x) => typeof x === "string";

/* -> { ok: true, value } or { ok: false, errors } */
export function validateTalk(raw, studied, level) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["reply is not an object"] };
  const maxSentences = LEVEL_SENTENCES[levelOf(level)];

  if (!isStr(raw.reply_ru) || !raw.reply_ru.trim()) bad("reply_ru: missing");
  else {
    if (!/[а-яёА-ЯЁ]/.test(raw.reply_ru)) bad("reply_ru: not Russian");
    if (sentences(raw.reply_ru) > maxSentences) bad(`reply_ru: more than ${maxSentences === 2 ? "two" : "three"} sentences`);
    if (!/\?/.test(raw.reply_ru)) bad("reply_ru: no question");
  }
  if (!isStr(raw.reply_en) || !raw.reply_en.trim()) bad("reply_en: missing");

  if (!Array.isArray(raw.reply_tokens)) bad("reply_tokens: not an array");
  else {
    raw.reply_tokens.forEach((t, i) => {
      if (!t || !isStr(t.ru) || !isStr(t.lemma)) bad(`reply_tokens[${i}]: needs ru and lemma`);
    });
    // Every word of the reply is accounted for, in order.
    const words = (isStr(raw.reply_ru) ? raw.reply_ru.match(CYRILLIC_WORD) || [] : []).map((w) => w.toLowerCase());
    const given = raw.reply_tokens.map((t) => String(t && t.ru || "").toLowerCase());
    if (words.length && given.join(" ") !== words.join(" ")) bad("reply_tokens: do not match reply_ru word for word");
  }

  let feedback = null;
  if (raw.feedback !== null && raw.feedback !== undefined) {
    const v = validate(raw.feedback);
    if (!v.ok) v.errors.forEach((e) => bad("feedback." + e));
    else feedback = v.value;
  }

  let newWords = [];
  if (!Array.isArray(raw.newWords)) bad("newWords: not an array");
  else {
    if (raw.newWords.length > MAX_NEW_WORDS) bad(`newWords: more than ${MAX_NEW_WORDS}`);
    raw.newWords.forEach((w, i) => {
      if (!w || !isStr(w.ru) || !isStr(w.lemma) || !isStr(w.en)) bad(`newWords[${i}]: needs ru, lemma, en`);
    });
    // A studied word offered as new is over-reporting, not a bad turn: drop it
    // rather than send the whole reply back (it was a fifth of the retries).
    const known = new Set((Array.isArray(studied) ? studied : []).map((s) => String(s).toLowerCase()));
    newWords = raw.newWords
      .filter((w) => w && isStr(w.lemma) && !known.has(w.lemma.toLowerCase()))
      .map((w) => ({ ru: w.ru, lemma: w.lemma, en: plain(w.en) }));
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      reply_ru: raw.reply_ru.trim(), reply_en: plain(raw.reply_en),
      reply_tokens: raw.reply_tokens.map((t) => ({ ru: t.ru, lemma: t.lemma })),
      feedback, newWords,
    },
  };
}

export { extractJson };
