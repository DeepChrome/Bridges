/* POST /v1/tutor — the free conversation with a tutor who knows the learner
 * (2026-09-26). What is worth pinning: the profile rides in every turn and
 * the Worker keeps none of it; the reply's Russian is Cyrillic or nothing;
 * `remember` is one line the app will hold, capped. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTutor, tutorMessage, SYSTEM_TUTOR, TEXT_WORDS, RU_WORDS, REMEMBER_WORDS, MAX_HISTORY }
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

test("a turn passes with its Russian and its note; Latin 'Russian' and long fields are refused", () => {
  const r = validateTutor({ text: "Try this: «я читаю кни́гу». What does it mean?", ru: "я читаю кни́гу", remember: "likes drills" });
  assert.equal(r.ok, true);
  assert.equal(r.value.ru, "я читаю книгу");                 // stress marks off, for the voice
  assert.equal(r.value.remember, "likes drills");
  assert.equal(validateTutor({ text: "ok" }).value.ru, "");    // absent is empty
  assert.match(validateTutor({ text: "ok", ru: "ya chitayu" }).errors.join(" "), /not in Cyrillic/);
  assert.match(validateTutor({ text: new Array(TEXT_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /over/);
  assert.match(validateTutor({ text: "ok", ru: new Array(RU_WORDS + 1).fill("да").join(" ") }).errors.join(" "), /ru: over/);
  assert.match(validateTutor({ text: "ok", remember: new Array(REMEMBER_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /remember: over/);
  assert.match(validateTutor({}).errors.join(" "), /text: missing/);
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
  assert.match(SYSTEM_TUTOR, /Never use dashes/);
  assert.match(SYSTEM_TUTOR, /Never repeat a note already in "notes"/);
});

test("POST /v1/tutor: 401 without a token, 400 without text, the reply through, counted as talk", async () => {
  assert.equal((await handle(req({ text: "hi", history: [] }), env())).status, 401);
  assert.equal((await handle(req({ history: [] }, auth), env())).status, 400);
  const up = upstream([JSON.stringify({ text: "Привет! Ready for a drill?", ru: "Привет!", remember: "" })]);
  const r = await handle(req({ text: "", history: [], profile: { chapter: 1 } }, auth), env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.text, "Привет! Ready for a drill?");
  assert.equal(body.ru, "Привет!");
  assert.equal(up.calls[0].max_tokens, 700);
  assert.match(up.calls[0].system[0].text, /personal Russian tutor/);

  const e = env({ TALK_DAILY_CAP: "1" });
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal((await handle(req({ text: "a", history: [] }, auth), e, { fetch: up.fetch })).status, 429);
});
