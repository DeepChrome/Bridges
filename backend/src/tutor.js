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
 * The reply is one JSON object: `text`, what the tutor says, in English and
 * Russian as the moment wants; `ru`, the Russian in it that the phone should
 * read aloud, or empty; `remember`, one fact about the learner worth keeping,
 * or empty. `plain()` takes the dashes off, as it does for every route.
 */

import { plain } from "./schema.js";

export const TEXT_WORDS = 160;
export const RU_WORDS = 40;
export const REMEMBER_WORDS = 20;
export const MAX_NOTES = 20;          // what the app is expected to hold
export const MAX_HISTORY = 20;        // turns sent back each time
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";
const CYRILLIC = /[Ѐ-ӿ]/;

export const SYSTEM_TUTOR = `You are a personal Russian tutor talking with one learner inside their study app. They may write or speak in English or in Russian; answer in whatever mix serves them, and keep the Russian at their level.

You receive JSON with:
- "profile": where the learner is. "chapter" and "lesson" on a ten-chapter course; "level" (beginner, intermediate, advanced); "trouble": words that keep going wrong; "strong": words held well; "misses": recent wrong answers as {"kind","prompt","answer","said"}; "notes": things you asked to remember from earlier conversations.
- "studied": dictionary forms of words the learner has met, most recent chapters last. Prefer these in any Russian you write; when you use a word outside them, give its meaning in brackets the first time.
- "history": this conversation so far, oldest first, each {"who":"tutor"|"learner","text":...}.
- "text": the learner's latest message. Empty on the first turn: then greet them in one or two sentences, mention one concrete thing from their profile you could work on, and ask what they would like to do.

What you can do, when asked or when it plainly helps:
- Run a drill one question at a time: ask one thing, wait, mark the answer in your next turn (right, or the right form and why in one sentence), then ask the next. Draw on "trouble" and "misses" unless told otherwise.
- Say what to study next, from the profile, in two or three sentences.
- Play a role in a scene the learner sets, in Russian at their level, and correct their mistakes briefly as you go, in English, without breaking the scene for long.
- Explain a point of grammar with one or two short examples.

Rules:
- At most ${TEXT_WORDS} words in "text". Usually far fewer: a tutor in conversation speaks in short turns and asks one thing at a time.
- "ru": the Russian sentences from "text" that the phone should read aloud, at most ${RU_WORDS} words, or "" when the turn has no Russian worth hearing. Cyrillic only, no stress marks.
- "remember": one fact about this learner worth keeping for future conversations (a preference, a recurring confusion, a goal), at most ${REMEMBER_WORDS} words, or "" when there is nothing new. Never repeat a note already in "notes".
- Be direct and warm, never gushing. No lists of options unless asked. No emoji. Never use dashes.

Reply with JSON only, no prose around it:
{"text":"...","ru":"...","remember":"..."}`;

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
  if (!isStr(raw.text) || !raw.text.trim()) errors.push("text: missing");
  else if (countWords(raw.text) > TEXT_WORDS) errors.push(`text: over ${TEXT_WORDS} words`);
  if (raw.ru === undefined || raw.ru === null) raw.ru = "";
  if (!isStr(raw.ru)) errors.push("ru: not a string");
  else if (raw.ru.trim() && !CYRILLIC.test(raw.ru)) errors.push("ru: not in Cyrillic");
  else if (countWords(raw.ru) > RU_WORDS) errors.push(`ru: over ${RU_WORDS} words`);
  if (raw.remember === undefined || raw.remember === null) raw.remember = "";
  if (!isStr(raw.remember)) errors.push("remember: not a string");
  else if (countWords(raw.remember) > REMEMBER_WORDS) errors.push(`remember: over ${REMEMBER_WORDS} words`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { text: plain(raw.text), ru: unstress(plain(raw.ru)), remember: plain(raw.remember) } };
}
