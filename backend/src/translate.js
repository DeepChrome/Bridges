/* Say something in Russian and read it back in English: POST /v1/translate.
 *
 * The owner, 2026-09-22: *"add a feature where you can just speak in Russian to
 * it and it will live translate to english"*.
 *
 * **The recognition is not here.** The phone hears the Russian on-device and
 * sends text, exactly as Say and Talk do — audio never leaves it (§30c), and
 * the Worker holds no more of this than it does of a conversation: one request,
 * one answer, nothing kept.
 *
 * **Why a model at all**, when the app carries a 46,000-lemma dictionary and
 * can gloss every word offline: a gloss is not a translation. «Мне не до
 * этого» is four words the dictionary knows and one thing it cannot say. The
 * app shows the word-by-word reading with no network (that is what `Linked`
 * has always done) and asks for the sentence when there is one.
 *
 * Two rules the prompt holds and the validator enforces:
 *
 *   1. **Translate what was said, do not correct it.** This is not a lesson.
 *      A learner using it as a phrasebook would be badly served by an answer
 *      that quietly repairs their Russian and translates the repair; they
 *      would never learn that they had said something else. Where the Russian
 *      is not quite Russian, `note` says so in a few words and `en` still
 *      renders what was actually said.
 *   2. **No teaching, no encouragement, no grammar tags.** Those belong to
 *      Say and Talk, which are exercises. This is a tool, and a tool that
 *      pipes up with praise is one nobody reaches for twice.
 */

import { plain } from "./schema.js";

const EN_WORDS = 60;
const NOTE_WORDS = 12;
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";

export const SYSTEM_TRANSLATE = `You translate spoken Russian into English for someone learning the language. They said something out loud, their phone transcribed it, and you are being shown that transcript.

Rules:
- Translate what the transcript actually says. Do not correct it, improve it, or translate what you think they meant to say.
- Natural English, not word for word. At most ${EN_WORDS} words.
- The transcript comes from speech recognition and carries no punctuation and no capitals. Read it as speech and punctuate the English yourself.
- If the Russian is ungrammatical, ambiguous, or looks like the recogniser misheard, translate it as it stands and say what is off in "note" — at most ${NOTE_WORDS} words. Otherwise "note" is empty.
- No teaching, no praise, no grammar lessons, no suggestions. Only the translation.
- If the transcript is empty or is not Russian, set "en" to "" and say so in "note".
- Never use dashes in anything you write.

Reply with JSON only, no prose around it:
{"en":"<the translation, at most ${EN_WORDS} words>","note":"<at most ${NOTE_WORDS} words, or empty>"}`;

export function translateMessage({ ru }) {
  return `Transcript: ${String(ru || "").trim()}`;
}

export function validateTranslate(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }
  if (!isStr(raw.en)) errors.push("en: not a string");
  else if (countWords(raw.en) > EN_WORDS) errors.push(`en: over ${EN_WORDS} words`);
  if (raw.note === undefined || raw.note === null) raw.note = "";
  if (!isStr(raw.note)) errors.push("note: not a string");
  else if (countWords(raw.note) > NOTE_WORDS) errors.push(`note: over ${NOTE_WORDS} words`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { en: plain(raw.en), note: plain(raw.note) } };
}
