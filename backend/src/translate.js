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

/* The other direction (2026-09-23): the owner asked for *"conversation mode so
 * it can help a Russian speaker and an English speaker communicate"*. Same
 * route, same rules, the languages swapped: an English speaker's transcript
 * comes back as spoken Russian for the Russian speaker to hear, and the note
 * stays in English because it is read by the phone's owner, who is the learner.
 *
 * **No stress marks.** The Russian goes to the phone's voice, and the app
 * strips a combining acute before speaking a sentence (audio.js `bare`); one
 * written here would only cost the validator a normalisation. Plain Cyrillic
 * as a person would write it in a message. */
export const SYSTEM_TRANSLATE_EN = `You interpret spoken English into Russian. An English speaker said something out loud to a Russian speaker, a phone transcribed it, and you are being shown that transcript. Your Russian will be read aloud by the phone to the Russian speaker.

Rules:
- Translate what the transcript actually says. Do not correct it, improve it, or translate what you think they meant to say.
- Natural spoken Russian, as one person says it to another, not word for word. At most ${EN_WORDS} words. Cyrillic only, no stress marks, no transliteration.
- The transcript comes from speech recognition and carries no punctuation and no capitals. Read it as speech and punctuate the Russian yourself.
- If the English is ambiguous or looks like the recogniser misheard, translate it as it stands and say what is off in "note", in English, at most ${NOTE_WORDS} words. Otherwise "note" is empty.
- No teaching, no praise, no grammar lessons, no suggestions. Only the translation.
- If the transcript is empty or is not English, set "ru" to "" and say so in "note".
- Never use dashes in anything you write.

Reply with JSON only, no prose around it:
{"ru":"<the Russian, at most ${EN_WORDS} words>","note":"<at most ${NOTE_WORDS} words in English, or empty>"}`;

/* Which way a request goes: `ru` in is Russian to English, `en` in is English
   to Russian. A body carrying both is read as Russian in — the app never
   sends both, and one rule is better than a 400 nobody can act on. */
export const direction = (b) => (typeof b.ru === "string" && b.ru.trim() ? "ru" : "en");

export function translateMessage(b) {
  const from = direction(b);
  return `Transcript: ${String(b[from] || "").trim()}`;
}

const CYRILLIC = /[Ѐ-ӿ]/;
/* A combining acute or grave in the Russian is stripped rather than refused:
   the model was told not to write one, and a reply that is otherwise right
   should not cost a retry over a mark the speaker would not hear. */
const unstress = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");

/* `to` names the field the reply must carry — "en" for Russian in (the
   default, and what every older caller checked), "ru" for English in. */
export function validateTranslate(raw, to = "en") {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }
  const out = raw[to];
  if (!isStr(out)) errors.push(`${to}: not a string`);
  else if (countWords(out) > EN_WORDS) errors.push(`${to}: over ${EN_WORDS} words`);
  /* Russian that is not in Cyrillic is a transliteration or English handed
     back, and the phone's Russian voice would read either as gibberish. An
     empty reply is allowed: it is how "that was not English" is said. */
  else if (to === "ru" && out.trim() && !CYRILLIC.test(out)) errors.push("ru: not in Cyrillic");
  if (raw.note === undefined || raw.note === null) raw.note = "";
  if (!isStr(raw.note)) errors.push("note: not a string");
  else if (countWords(raw.note) > NOTE_WORDS) errors.push(`note: over ${NOTE_WORDS} words`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { [to]: to === "ru" ? unstress(plain(out)) : plain(out), note: plain(raw.note) } };
}
