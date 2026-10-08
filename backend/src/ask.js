/* POST /v1/ask — a question asked from any screen (2026-10-08).
 *
 * The owner: *"a button on just about every exercise and maybe every screen
 * that is like a symbol for AI help. The user presses it, and they can submit
 * a question and receive AI response. For example if I'm working on case
 * exercises, I don't understand a conjugation or why something is the way it
 * is… I press the button and ask my question and it gives me feedback."*
 *
 * The app sends the question and what is on the screen: the question card the
 * learner is looking at (its kind, prompt, the right answer, what they put),
 * the word or video open, the screen's name, and where the learner stands on
 * the route. The answer is about *that* — «why «книгу» here?» is answered for
 * the sentence on screen, not in the abstract. A few earlier turns of the same
 * sheet ride along, so a follow-up ("and in the plural?") makes sense.
 *
 * **Short, and Russian set apart.** One field, at most ANSWER_WORDS, plain
 * English with every Russian form in «guillemets» (the app's `Marked` draws
 * those loud). A learner mid-exercise wants the reason, not a lecture. It may
 * give the right answer — the app's references never hide it (§30az) — and it
 * keeps to Russian: anything else is declined in a sentence.
 */

import { plain } from "./schema.js";

export const ANSWER_WORDS = 90;
export const QUESTION_CHARS = 600;
export const GUIDE_CHARS = 6000;
const HISTORY_TURNS = 6;
const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

export const SYSTEM_ASK = `You are a patient Russian teacher inside a language-learning app. A learner has pressed "Ask" on a screen and typed a question. Answer it, in English, briefly and concretely.

You receive JSON with:
- "question": what the learner asked.
- "screen": the screen they are on.
- "about": what is on that screen, if anything: the exercise ("kind", "ask" — the instruction, "prompt" — the word or sentence shown, "sub" — its meaning or context, "answer" — the right answer, "said" — what the learner answered, "options" — the choices offered), or the word, video or topic open.
- "level": the learner's level ("beginner", "intermediate" or "advanced") and "chapter": where they are in the course.
- "history": the earlier questions and answers in this same conversation, oldest first, if any.

Reply with JSON only, no prose around it:
{"answer":"<at most ${ANSWER_WORDS} words>"}

Rules:
- Answer the question about what is on the screen. If they ask "why", give the rule that decides it here: the case and what governs it, the person and tense, the gender, the aspect, the stress, or the meaning in this sentence. Then one short example if it helps.
- You may state the right answer; the learner is allowed to know it.
- Write every Russian word or form inside «guillemets», like «книгу». Never write Russian without them.
- Pitch it to the learner's level: plain words for a beginner, grammar terms only when you also say what they mean.
- At most ${ANSWER_WORDS} words. Short sentences. No lists of more than three items, no headings, no markdown.
- If the question is not about Russian or this app's exercise, say in one sentence that you can only help with Russian.
- Never invent a Russian word. If you are not sure of a form, say so.
- Do not praise, do not say "great question", do not end with a question, do not set an exercise.
- Never use dashes in anything you write.`;

/* The "?" asks the same route about the app itself (`mode: "app"`): how to
   find or work something. It answers from the guide the app sends — the
   screen's own help lines and a map of the app — and from nothing else, so
   it cannot describe a button that does not exist. */
export const SYSTEM_APP = `You are the help inside a Russian-learning app called Ya. A learner pressed "?" and asked how to use the app.

You receive JSON with "question", "screen" (the screen they are on), "guide" (how the app works: its tabs, screens and controls, and the lines for this screen), and "history" (earlier turns of this conversation).

Reply with JSON only: {"answer":"<at most ${ANSWER_WORDS} words>"}

Rules:
- Answer only from the guide. Name the tab, screen and control to press, in the order they are pressed, using the guide's own names.
- If the guide does not say how to do it, say the app may not do that yet and that "Send feedback" below tells the owner. Never invent a screen, button or setting.
- If the question is about Russian itself, say the sparkle button beside "?" answers questions about the Russian on screen.
- Short sentences, no markdown, no lists of more than three items, no dashes. Do not praise or end with a question.`;

const str = (x, n = 300) => (x === undefined || x === null ? null : String(x).slice(0, n));

export function askMessage(b) {
  const a = b.about && typeof b.about === "object" ? b.about : {};
  const history = Array.isArray(b.history) ? b.history.slice(-HISTORY_TURNS) : [];
  if (b.mode === "app") {
    return JSON.stringify({
      question: String(b.question || "").slice(0, QUESTION_CHARS),
      screen: str(b.screen, 80), guide: str(b.guide, GUIDE_CHARS),
      history: history.map((h) => ({ q: str(h && h.q, QUESTION_CHARS), a: str(h && h.a, 1200) })),
    });
  }
  return JSON.stringify({
    question: String(b.question || "").slice(0, QUESTION_CHARS),
    screen: str(b.screen, 80),
    about: {
      kind: str(a.kind, 40), ask: str(a.ask), prompt: str(a.prompt), sub: str(a.sub),
      answer: str(a.answer), said: str(a.said),
      options: Array.isArray(a.options) ? a.options.slice(0, 6).map((o) => str(o, 80)) : null,
      word: str(a.word, 80), title: str(a.title, 160), topic: str(a.topic, 120),
    },
    level: str(b.level, 20), chapter: typeof b.chapter === "number" ? b.chapter : null,
    history: history.map((h) => ({ q: str(h && h.q, QUESTION_CHARS), a: str(h && h.a, 1200) })),
  });
}

export function checkAsk(b) {
  return typeof b.question === "string" && b.question.trim() ? null : "question is required";
}

export function validateAsk(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["reply is not an object"] };
  if (typeof raw.answer !== "string" || !raw.answer.trim()) return { ok: false, errors: ["answer: missing"] };
  if (countWords(raw.answer) > ANSWER_WORDS) return { ok: false, errors: [`answer: over ${ANSWER_WORDS} words`] };
  return { ok: true, value: { answer: plain(raw.answer) } };
}
