/* POST /v1/tutor — a free conversation with a tutor who knows the learner
 * (2026-09-26).
 *
 * The owner: *"a free form conversation mode with AI but it also builds
 * context about the user to learn their progress, strengths, weaknesses,
 * preferences, and can provide real time feedback and structured training.
 * Sort of like an AI personal tutor."* — "give me drills one at a time to
 * conjugate irregular verbs", "what should I study next", "drill me on some
 * words from chapter one that I've had issues with", "be a girl on a blind
 * date but coach me through making mistakes".
 *
 * Talk (talk.js) is a scenario at the learner's level, in Russian, graded per
 * word. This is the other thing: whatever the learner wants, in either
 * language, and the tutor decides what to do with it. It runs drills by
 * *asking* — one question per turn, marked in the next — rather than through
 * any structure of its own, because a conversation that can ask a question
 * and read the answer already is a drill runner.
 *
 * **The Worker keeps nothing, and the tutor still remembers.** Every turn the
 * app sends the learner's standing: where they are on the route, the words
 * that have been trouble, the words they hold well, the recent misses, and a
 * short list of things the tutor itself asked to keep from earlier
 * conversations ("prefers drills over chat", "confuses genitive and
 * accusative"). The reply may add one line to that list (`remember`); the app
 * stores it in the profile and sends it back next time. Memory lives on the
 * phone, as every other piece of learner state does (§30d).
 *
 * The reply is one JSON object in three parts, because a turn has up to three
 * kinds of thing in it and the app draws each differently (2026-09-26, the
 * owner: *"Transcription is important. Also, if it can have both English and
 * Russian, that would be preferable. If the user wants, they can disable the
 * English in settings"*): `ru`, what the tutor says in Russian, word-linked and
 * read aloud; `en`, the English of that Russian, which the learner can switch
 * off; `note`, the coaching in English — a correction, an instruction, the
 * answer to a question asked in English — which is never switched off; and
 * `remember`, one fact about the learner worth keeping, or empty. A turn has
 * at least one of `ru` and `note`. The first shape was one mixed `text`
 * field, and on the owner's phone it drew as an empty bubble with a speaker.
 * `plain()` takes the dashes off, as it does for every route.
 *
 * `choices` is the fifth: up to three things the learner could ask for next,
 * offered when the tutor does not know what they want. It is what makes the
 * screen usable by somebody who cannot yet say what they want in Russian —
 * they tap instead of speaking, and the fourth option ("Something else") is
 * the app's, because a way out of a list is not something to ask a model for.
 */

import { plain } from "./schema.js";

/* Short, because a tutor in conversation speaks in short turns and the owner
   read the first version on his phone as "a large block of verbose text"
   (2026-09-26). A spoken turn is a sentence or two; a coaching note is one
   correction, not a lesson.

   45 was still too long and he said so again on 2026-09-27 — *"we need to get
   away from ugly blocks of text and verbose"*. Two things were wrong with it:
   the number, and a line in the prompt below that invited "two or three
   sentences" for a study plan, which is the turn he was reading. The app also
   stopped running a note together as a paragraph (ui.js `Note`, one sentence
   to a line), so the cap and the rendering are pulling the same way now. */
export const RU_WORDS = 30;
export const EN_WORDS = 40;
export const NOTE_WORDS = 32;
export const REMEMBER_WORDS = 20;
/* Things the learner could ask for next, offered when the tutor does not
   know what they want (the owner, 2026-09-26: *"have it prompt options when
   it's unsure what to do with input where it will recommend 3 things based
   on what the AI thinks the user should work on, and the fourth will be
   other where the user can steer directly"*). The fourth is the app's, not
   the model's — a way out of the list is not something to ask for. */
export const MAX_CHOICES = 3;
export const CHOICE_WORDS = 9;
export const MAX_NOTES = 20;          // what the app is expected to hold
export const MAX_HISTORY = 20;        // turns sent back each time
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";
const CYRILLIC = /[Ѐ-ӿ]/;

export const SYSTEM_TUTOR = `You are a personal Russian tutor talking with one learner inside their study app. They may write or speak in English or in Russian. Every turn of yours has up to two parts: what you say in Russian ("ru", with its English in "en"), and what you say in English as their coach ("note"). Keep the Russian at their level.

You receive JSON with:
- "profile": where the learner is. "chapter" and "lesson" on a ten-chapter course; "level" (beginner, intermediate, advanced); "trouble": words that keep going wrong; "strong": words held well; "misses": recent wrong answers as {"kind","prompt","answer","said"}; "notes": things you asked to remember from earlier conversations.
- "studied": dictionary forms of words the learner has met, most recent chapters last. Prefer these in any Russian you write; when you use a word outside them, give its meaning in brackets the first time.
- "history": this conversation so far, oldest first, each {"who":"tutor"|"learner","text":...}.
- "text": the learner's latest message. It may be in English or in Russian, and may mix the two in one sentence; a beginner will ask for things in English and practise in Russian. Empty on the first turn: then greet them in Russian ("ru") with a short English note, and offer "choices".

What you can do, when asked or when it plainly helps:
- Run a drill one question at a time: ask one thing, wait, mark the answer in your next turn (right, or the right form and why in one sentence), then ask the next. Draw on "trouble" and "misses" unless told otherwise. The question itself goes in "ru" when it is Russian to be read or answered, the marking in "note".
- Say what to study next, from the profile, in two sentences of "note" at most.
- Play a role in a scene the learner sets: your character speaks in "ru", and any correction of their mistakes goes in "note", brief, without breaking the scene for long.
- Explain a point of grammar in "note", with one or two short examples in Russian inside it in «guillemets».

Rules:
- "ru": what you say in Russian this turn, at most ${RU_WORDS} words, or "" when there is nothing to say in Russian. Cyrillic only, no stress marks. Prefer the "studied" words.
- "en": the natural English translation of "ru", at most ${EN_WORDS} words. "" when "ru" is "". Never empty when "ru" is not.
- "note": what you say in English, at most ${NOTE_WORDS} words, or "" when the Russian says it all. **Two sentences is the ceiling**, and one is usually right: a tutor in conversation speaks in short turns and asks one thing at a time. Never a list of points, never a paragraph.
- Write every Russian form inside «guillemets» wherever it appears in "note", like «книги». The app sets those apart for the learner.
- At least one of "ru" and "note" must be non-empty.
- **Never ask a question the learner can answer with «да» or «нет», or with one word they already know.** There is nothing to learn from saying yes. Ask for a sentence, a form, a choice between two things they must name, or something about themselves.
- "choices": up to ${MAX_CHOICES} things the learner could ask for next, each at most ${CHOICE_WORDS} words, written as the learner would say them ("Drill me on the genitive", "Practise the words I keep missing"). **Offer them whenever you are not sure what they want** — an unclear message, a one word answer, or a question you cannot act on. Draw them from "trouble", "misses" and where they are on the course, so they are what this learner should work on rather than a menu. Empty [] when the conversation is flowing and you know what to do next: answer them instead.
- "remember": one fact about this learner worth keeping for future conversations (a preference, a recurring confusion, a goal), at most ${REMEMBER_WORDS} words, or "" when there is nothing new. Never repeat a note already in "notes".
- Be direct and warm, never gushing. No lists of options unless asked. No emoji. Never use dashes.

Reply with JSON only, no prose around it:
{"ru":"...","en":"...","note":"...","choices":["..."],"remember":"..."}`;

const strList = (a, n) => (Array.isArray(a) ? a.filter(isStr).map((s) => s.trim()).filter(Boolean).slice(0, n) : []);

export function tutorMessage(b) {
  const p = b.profile && typeof b.profile === "object" ? b.profile : {};
  const misses = Array.isArray(p.misses) ? p.misses.slice(0, 12).map((m) => ({
    kind: String((m && m.kind) || ""), prompt: String((m && m.prompt) || ""),
    answer: String((m && m.answer) || ""), said: m && m.said ? String(m.said) : null,
  })) : [];
  return JSON.stringify({
    profile: {
      chapter: Number.isFinite(p.chapter) ? p.chapter : null,
      lesson: Number.isFinite(p.lesson) ? p.lesson : null,
      level: ["beginner", "intermediate", "advanced"].includes(p.level) ? p.level : "beginner",
      trouble: strList(p.trouble, 30),
      strong: strList(p.strong, 30),
      misses,
      notes: strList(p.notes, MAX_NOTES),
    },
    studied: strList(b.studied, 400),
    history: Array.isArray(b.history)
      ? b.history.slice(-MAX_HISTORY).map((h) => ({ who: h && h.who === "learner" ? "learner" : "tutor",
                                                    text: String((h && h.text) || "") }))
      : [],
    text: String(b.text || ""),
  });
}

const unstress = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");

export function validateTutor(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }
  const errors = [];
  for (const k of ["ru", "en", "note", "remember"]) {
    if (raw[k] === undefined || raw[k] === null) raw[k] = "";
    if (!isStr(raw[k])) errors.push(`${k}: not a string`);
  }
  if (errors.length) return { ok: false, errors };
  const ru = raw.ru.trim(), en = raw.en.trim(), note = raw.note.trim();
  if (!ru && !note) errors.push("ru and note: both empty");
  if (ru && !CYRILLIC.test(ru)) errors.push("ru: not in Cyrillic");
  else if (countWords(ru) > RU_WORDS) errors.push(`ru: over ${RU_WORDS} words`);
  /* The English of the Russian is owed whenever there is Russian: the learner
     can switch it off, and a turn without it has nothing to switch. */
  if (ru && !en) errors.push("en: missing for the Russian");
  else if (countWords(en) > EN_WORDS) errors.push(`en: over ${EN_WORDS} words`);
  if (countWords(note) > NOTE_WORDS) errors.push(`note: over ${NOTE_WORDS} words`);
  if (countWords(raw.remember) > REMEMBER_WORDS) errors.push(`remember: over ${REMEMBER_WORDS} words`);
  /* Over-offering is not a bad turn: take the first few and drop the rest
     rather than send the whole reply back over a fourth suggestion. */
  let choices = [];
  if (raw.choices !== undefined && raw.choices !== null) {
    if (!Array.isArray(raw.choices)) errors.push("choices: not an array");
    else {
      choices = raw.choices.filter(isStr).map((s) => plain(s)).filter(Boolean).slice(0, MAX_CHOICES);
      if (choices.some((s) => countWords(s) > CHOICE_WORDS)) errors.push(`choices: over ${CHOICE_WORDS} words`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ru: unstress(plain(ru)), en: ru ? plain(en) : "", note: plain(note),
                              choices, remember: plain(raw.remember) } };
}
