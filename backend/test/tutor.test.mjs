/* POST /v1/tutor — the free conversation with a tutor who knows the learner
 * (2026-09-26). What is worth pinning: the profile rides in every turn and
 * the Worker keeps none of it; the reply's Russian is Cyrillic or nothing;
 * `remember` is one line the app will hold, capped. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTutor, tutorMessage, SYSTEM_TUTOR, NOTE_WORDS, RU_WORDS, EN_WORDS, REMEMBER_WORDS,
         MAX_HISTORY, MAX_CHOICES, CHOICE_WORDS, MARK_WORDS } from "../src/tutor.js";
import { handle } from "../src/index.js";

const TOKEN = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = (over = {}) => ({ APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "m",
  TALK_DAILY_CAP: "240", USAGE: fakeKv(), ...over });
const req = (body, headers = {}) => new Request("https://x/v1/tutor", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const auth = { authorization: `Bearer ${TOKEN}` };
const upstream = (texts) => {
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: texts[Math.min(calls.length - 1, texts.length - 1)] }],
      usage: { input_tokens: 40, output_tokens: 20 } }), { status: 200 });
  } };
};

test("a turn passes in its parts; the English is owed for any Russian; empty and Latin turns are refused", () => {
  const r = validateTutor({ ru: "Я читаю кни́гу.", en: "I am reading a book.", note: "Try saying it back.", remember: "likes drills" });
  assert.equal(r.ok, true);
  assert.equal(r.value.ru, "Я читаю книгу.");                 // stress marks off, for the voice
  assert.equal(r.value.en, "I am reading a book.");
  assert.equal(r.value.note, "Try saying it back.");
  assert.equal(r.value.remember, "likes drills");
  // A turn in English alone is a turn (what to study next); one with nothing is not.
  const only = validateTutor({ note: "Work on the genitive next." });
  assert.equal(only.ok, true);
  assert.equal(only.value.ru, "");
  assert.equal(only.value.en, "");
  assert.match(validateTutor({}).errors.join(" "), /both empty/);
  assert.match(validateTutor({ ru: "Привет!" }).errors.join(" "), /en: missing/);
  assert.match(validateTutor({ ru: "ya chitayu", en: "I read" }).errors.join(" "), /not in Cyrillic/);
  assert.match(validateTutor({ ru: new Array(RU_WORDS + 1).fill("да").join(" "), en: "x" }).errors.join(" "), /ru: over/);
  assert.match(validateTutor({ ru: "да", en: new Array(EN_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /en: over/);
  assert.match(validateTutor({ note: new Array(NOTE_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /note: over/);
  assert.match(validateTutor({ note: "ok", remember: new Array(REMEMBER_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /remember: over/);
  // English given with no Russian is dropped: there is nothing for it to translate.
  assert.equal(validateTutor({ note: "ok", en: "stray" }).value.en, "");
});

test("the profile rides in every message, trimmed, and the history is capped", () => {
  const history = [];
  for (let k = 0; k < MAX_HISTORY + 5; k++) history.push({ who: k % 2 ? "learner" : "tutor", text: "t" + k });
  const m = JSON.parse(tutorMessage({
    profile: { chapter: 2, lesson: 3, level: "beginner", trouble: ["же", " ещё "], strong: ["да"],
               misses: [{ kind: "cases", prompt: "книга", answer: "книги", said: "книгу" }],
               notes: ["prefers drills"] },
    studied: ["я", "ты"], history, text: "drill me",
  }));
  assert.equal(m.profile.chapter, 2);
  assert.deepEqual(m.profile.trouble, ["же", "ещё"]);
  assert.equal(m.profile.misses[0].said, "книгу");
  assert.deepEqual(m.profile.notes, ["prefers drills"]);
  assert.equal(m.history.length, MAX_HISTORY);
  assert.equal(m.history[0].text, "t5");                       // the oldest dropped, not the newest
  assert.equal(m.text, "drill me");
  // A bare body still makes a message.
  assert.equal(JSON.parse(tutorMessage({})).profile.level, "beginner");
  assert.deepEqual(JSON.parse(tutorMessage({})).profile.chapters, []);
  assert.equal(JSON.parse(tutorMessage({})).profile.intro, null);
});

/* The tutor is grounded as the sparkle is (2026-11-24): it called «время»
   «време», neuter in -е, and held to it. The dictionary's entries, the
   learner's non-words and a re-ask's invalid words reach the model; the
   prompt makes the dictionary the ground truth. */
test("the dictionary, the learner's non-words and a re-ask ride to the tutor", () => {
  const m = JSON.parse(tutorMessage({
    text: "время или времы?",
    dictionary: [{ asked: "время", word: "вре́мя", pos: "noun", gender: "neuter", tables: "Nominative: вре́мя | времена́" }],
    notWords: ["времы"], invalid: ["време"], previous: "«време» is neuter",
  }));
  assert.equal(m.dictionary[0].gender, "neuter");
  assert.deepEqual(m.not_words, ["времы"]);
  assert.deepEqual(m.invalid, ["време"]);
  assert.equal(m.previous, "«време» is neuter");
  const bare = JSON.parse(tutorMessage({ text: "hi" }));
  assert.equal(bare.dictionary, null);
  assert.equal(bare.previous, undefined);
  assert.match(SYSTEM_TUTOR, /Never invent a Russian form/);
  assert.match(SYSTEM_TUTOR, /"dictionary"/);
});

/* The data and the algorithm ride along (2026-11-12): chapters worked on,
   the four skill averages, the words with a hole between their two meaning
   skills, the resting words, the days studied and the questionnaire. */
test("the learner's standing rides in full, trimmed and typed", () => {
  const m = JSON.parse(tutorMessage({ profile: {
    chapters: [{ chapter: 1, title: "Greetings & Family", units: ["Greetings 5/5", "Family 2/4"] }, "junk"],
    skills: { ru2en: 71.4, en2ru: 40, forms: null, usage: "x", scored: 120 },
    holes: [{ w: "выглядеть", ru2en: 80, en2ru: 12, forms: null, usage: 30 }, { nope: 1 }],
    resting: ["же"], recentDays: 5,
    intro: { goal: "speaking", style: "drills", time: "15", struggle: "cases" },
  } }));
  assert.deepEqual(m.profile.chapters, [{ chapter: 1, title: "Greetings & Family", units: ["Greetings 5/5", "Family 2/4"] }]);
  assert.deepEqual(m.profile.skills, { ru2en: 71, en2ru: 40, forms: null, usage: null, scored: 120 });
  assert.deepEqual(m.profile.holes, [{ w: "выглядеть", ru2en: 80, en2ru: 12, forms: null, usage: 30 }]);
  assert.deepEqual(m.profile.resting, ["же"]);
  assert.equal(m.profile.recentDays, 5);
  assert.equal(m.profile.intro.style, "drills");
  // The prompt knows the fields, and takes the lead when the learner does not.
  assert.match(SYSTEM_TUTOR, /"holes"/);
  assert.match(SYSTEM_TUTOR, /"chapters"/);
  assert.match(SYSTEM_TUTOR, /"intro"/);
  assert.match(SYSTEM_TUTOR, /Take the lead when the learner has not/);
  assert.match(SYSTEM_TUTOR, /Build your memory of them/);
});

test("the prompt asks for one question at a time, a first-turn greeting, and no dashes", () => {
  assert.match(SYSTEM_TUTOR, /one question at a time/);
  assert.match(SYSTEM_TUTOR, /Empty on the first turn/);
  assert.match(SYSTEM_TUTOR, /Never empty when "ru" is not/);
  assert.match(SYSTEM_TUTOR, /Never use dashes/);
  assert.match(SYSTEM_TUTOR, /Never repeat a note already in "notes"/);
});

/* Two rules from the owner's first real conversation with it (2026-09-26):
   the coaching note is a sentence or two, not a block, and a question the
   learner answers with "yes" teaches them nothing — *"it sometimes just
   requests that the user says Da or Nyet… that's not actually something to
   learn from."* */
test("the note is short, carries guillemets, and yes/no questions are refused", () => {
  assert.ok(NOTE_WORDS <= 45, "a coaching note is a sentence or two");
  assert.ok(RU_WORDS <= 30, "a spoken turn is short");
  assert.match(SYSTEM_TUTOR, /Never a list of points, never a paragraph/);
  assert.match(SYSTEM_TUTOR, /«guillemets»/);
  assert.match(SYSTEM_TUTOR, /Never ask a question the learner can answer with «да» or «нет»/);
  assert.match(SYSTEM_TUTOR, /nothing to learn from saying yes/);
});

/* What a learner who cannot yet ask in Russian taps instead of speaking. */
test("choices are capped and trimmed rather than refused, and the prompt says when to offer them", () => {
  const r = validateTutor({ note: "Where shall we start?",
                            choices: ["Drill the genitive", "Practise my trouble words", "Order a coffee", "A fourth"] });
  assert.equal(r.ok, true);
  assert.equal(r.value.choices.length, MAX_CHOICES);          // the fourth is dropped, not fatal
  assert.equal(r.value.choices[0], "Drill the genitive");
  assert.deepEqual(validateTutor({ note: "ok" }).value.choices, []);   // absent is none
  assert.equal(validateTutor({ note: "ok", choices: ["Drill the cases"] }).ok, true);
  assert.match(validateTutor({ note: "ok", choices: [new Array(CHOICE_WORDS + 1).fill("w").join(" ")] })
    .errors.join(" "), /choices: over/);
  assert.match(validateTutor({ note: "ok", choices: "nope" }).errors.join(" "), /not an array/);
  assert.match(SYSTEM_TUTOR, /Offer them whenever you are not sure what they want/);
  // And the tutor is told the learner may arrive in either language.
  assert.match(SYSTEM_TUTOR, /may be in English or in Russian, and may mix the two/);
});

/* An answer marked is a mark, not a sentence (the owner, 2026-11-19). */
test("a mark is {ok, yours, right}, short, with the right form owed on a miss; the note is one sentence", () => {
  const miss = validateTutor({ note: "Feminine nouns take -у.", mark: { ok: false, yours: "книга", right: "книгу" } });
  assert.equal(miss.ok, true);
  assert.deepEqual(miss.value.mark, { ok: false, yours: "книга", right: "книгу" });
  const hit = validateTutor({ ru: "Отлично! Теперь скажи «я вижу дом».", en: "Great! Now say «I see the house».",
                              mark: { ok: true, yours: "", right: "книгу" } });
  assert.equal(hit.ok, true);
  assert.equal(hit.value.mark.ok, true);
  // A mark alone is a turn.
  assert.equal(validateTutor({ mark: { ok: true, right: "книгу" } }).ok, true);
  // A miss has to name the right form; nothing to learn from otherwise.
  assert.match(validateTutor({ note: "x", mark: { ok: false, yours: "книга" } }).errors.join(" "), /needs the right one/);
  assert.match(validateTutor({ note: "x", mark: { ok: "yes", right: "книгу" } }).errors.join(" "), /mark: not/);
  assert.match(validateTutor({ note: "x", mark: { ok: false, yours: "a", right: new Array(MARK_WORDS + 1).fill("w").join(" ") } })
    .errors.join(" "), /mark: over/);
  // Null and absent are no mark.
  assert.equal(validateTutor({ note: "ok", mark: null }).value.mark, null);
  assert.equal(validateTutor({ note: "ok" }).value.mark, null);
  assert.equal(NOTE_WORDS, 26);
  assert.match(SYSTEM_TUTOR, /The marking goes in "mark", never in "note"/);
  assert.match(SYSTEM_TUTOR, /\*\*One sentence\*\*/);
});

test("POST /v1/tutor: 401 without a token, 400 without text, the reply through, counted as talk", async () => {
  assert.equal((await handle(req({ text: "hi", history: [] }), env())).status, 401);
  assert.equal((await handle(req({ history: [] }, auth), env())).status, 400);
  const up = upstream([JSON.stringify({ ru: "Привет!", en: "Hi!", note: "Ready for a drill?", remember: "" })]);
  const r = await handle(req({ text: "", history: [], profile: { chapter: 1 } }, auth), env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.note, "Ready for a drill?");
  assert.equal(body.ru, "Привет!");
  assert.equal(body.en, "Hi!");
  // The ask route's model: room for its thinking, and the model named.
  assert.equal(up.calls[0].max_tokens, 3000);
  assert.equal(up.calls[0].model, "claude-opus-5-5");
  assert.equal(up.calls[0].output_config.effort, "low");
  assert.match(up.calls[0].system[0].text, /personal Russian tutor/);

  const e = env({ TALK_DAILY_CAP: "1" });
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 429);
});
