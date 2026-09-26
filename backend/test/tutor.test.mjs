/* POST /v1/tutor — the free conversation with a tutor who knows the learner
 * (2026-09-26). What is worth pinning: the profile rides in every turn and
 * the Worker keeps none of it; the reply's Russian is Cyrillic or nothing;
 * `remember` is one line the app will hold, capped. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTutor, tutorMessage, SYSTEM_TUTOR, NOTE_WORDS, RU_WORDS, EN_WORDS, REMEMBER_WORDS, MAX_HISTORY }
  from "../src/tutor.js";
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
});

test("the prompt asks for one question at a time, a first-turn greeting, and no dashes", () => {
  assert.match(SYSTEM_TUTOR, /one question at a time/);
  assert.match(SYSTEM_TUTOR, /Empty on the first turn/);
  assert.match(SYSTEM_TUTOR, /Never empty when "ru" is not/);
  assert.match(SYSTEM_TUTOR, /Never use dashes/);
  assert.match(SYSTEM_TUTOR, /Never repeat a note already in "notes"/);
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
  assert.equal(up.calls[0].max_tokens, 700);
  assert.match(up.calls[0].system[0].text, /personal Russian tutor/);

  const e = env({ TALK_DAILY_CAP: "1" });
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 429);
});
