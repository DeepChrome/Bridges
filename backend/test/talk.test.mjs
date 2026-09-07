/* The conversation route: its reply shape, and the Worker's handling of it. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTalk, talkMessage, MAX_NEW_WORDS } from "../src/talk.js";
import { handle } from "../src/index.js";

const good = () => ({
  reply_ru: "Здравствуйте! Что вы хотите?",
  reply_en: "Hello! What would you like?",
  reply_tokens: [
    { ru: "Здравствуйте", lemma: "здравствуйте" }, { ru: "Что", lemma: "что" },
    { ru: "вы", lemma: "вы" }, { ru: "хотите", lemma: "хотеть" },
  ],
  feedback: null,
  newWords: [],
});

const studied = ["я", "хотеть", "что", "вы", "кофе", "чай"];

test("a well-formed opening turn passes", () => {
  const r = validateTalk(good(), studied);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.feedback, null);
  assert.deepEqual(r.value.newWords, []);
});

test("a reply of three sentences is refused", () => {
  const g = good(); g.reply_ru = "Привет. Как дела. Что хотите?";
  g.reply_tokens = "Привет Как дела Что хотите".split(" ").map((w) => ({ ru: w, lemma: w.toLowerCase() }));
  assert.match(validateTalk(g, studied).errors.join("\n"), /more than two sentences/);
});

test("a reply with no question is refused", () => {
  const g = good(); g.reply_ru = "Здравствуйте, я вас слушаю.";
  g.reply_tokens = "Здравствуйте я вас слушаю".split(" ").map((w) => ({ ru: w, lemma: w.toLowerCase() }));
  assert.match(validateTalk(g, studied).errors.join("\n"), /no question/);
});

test("reply_tokens must cover reply_ru word for word", () => {
  const g = good(); g.reply_tokens = g.reply_tokens.slice(0, 2);
  assert.match(validateTalk(g, studied).errors.join("\n"), /word for word/);
});

test("a token without a lemma is refused", () => {
  const g = good(); g.reply_tokens[1] = { ru: "Что" };
  assert.match(validateTalk(g, studied).errors.join("\n"), /needs ru and lemma/);
});

test("feedback, when present, goes through the Say validator", () => {
  const g = good();
  g.feedback = { words: [{ said: "кофе", expected: "кофе", lemma: "кофе", status: "ok", tags: [] }],
                 grammar: [{ tag: "NOPE", note: "x" }], wordChoice: [], overall: "ok", praise: "" };
  assert.match(validateTalk(g, studied).errors.join("\n"), /feedback\.grammar\[0\]\.tag/);
  g.feedback.grammar = [];
  const r = validateTalk(g, studied);
  assert.equal(r.ok, true);
  assert.equal(r.value.feedback.overall, "ok");
});

test("newWords: at most two, each with ru, lemma, en; a studied one is dropped, not refused", () => {
  const g = good();
  g.newWords = [{ ru: "булочка", lemma: "булочка", en: "bun" }, { ru: "чай", lemma: "чай", en: "tea" }];
  const r = validateTalk(g, studied);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.newWords.map((w) => w.lemma), ["булочка"]);
  g.newWords = [{ ru: "а", lemma: "а", en: "a" }, { ru: "б", lemma: "б", en: "b" }, { ru: "в", lemma: "в", en: "c" }];
  assert.match(validateTalk(g, studied).errors.join("\n"), new RegExp(`more than ${MAX_NEW_WORDS}`));
  g.newWords = [{ ru: "булочка", lemma: "булочка" }];
  assert.match(validateTalk(g, studied).errors.join("\n"), /needs ru, lemma, en/);
});

test("dashes are cleaned out of the English and new-word glosses", () => {
  const g = good(); g.reply_en = "Hello — what would you like?";
  g.newWords = [{ ru: "булочка", lemma: "булочка", en: "bun — a sweet roll" }];
  const r = validateTalk(g, studied);
  assert.equal(r.ok, true);
  assert.equal(r.value.reply_en, "Hello, what would you like?");
  assert.equal(r.value.newWords[0].en, "bun, a sweet roll");
});

test("the request message carries the scenario, studied list and trimmed history", () => {
  const m = JSON.parse(talkMessage({ scenario: "café", topic: "Accusative", studied,
    history: Array.from({ length: 40 }, (_, i) => ({ who: i % 2 ? "learner" : "tutor", ru: `t${i}` })),
    transcript: "я хочу кофе" }));
  assert.equal(m.scenario, "café");
  assert.equal(m.studied.length, studied.length);
  assert.equal(m.history.length, 24);                 // 2 × MAX_TURNS, the newest
  assert.equal(m.history[0].ru, "t16");
  assert.equal(m.transcript, "я хочу кофе");
});

/* ---- the route ---- */

const TOKEN = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = (over = {}) => ({ APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "m",
  DAILY_CAP: "300", TALK_DAILY_CAP: "3", USAGE: fakeKv(), ...over });
const req = (body, headers = {}) => new Request("https://x/v1/talk", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const auth = { authorization: `Bearer ${TOKEN}` };
const upstream = (texts) => {
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: texts[Math.min(calls.length - 1, texts.length - 1)] }],
      usage: { input_tokens: 300, output_tokens: 120 } }), { status: 200 });
  } };
};

test("POST /v1/talk: 401 without the token, 400 without a scenario", async () => {
  assert.equal((await handle(req({ scenario: "café" }), env())).status, 401);
  assert.equal((await handle(req({ history: [] }, auth), env())).status, 400);
});

test("POST /v1/talk returns the validated turn and uses the talk prompt", async () => {
  const up = upstream([JSON.stringify(good())]);
  const r = await handle(req({ scenario: "café", studied, history: [], transcript: "" }, auth), env(), { fetch: up.fetch });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.reply_ru, "Здравствуйте! Что вы хотите?");
  assert.match(up.calls[0].system, /Russian tutor/);
  assert.equal(up.calls[0].max_tokens, 1000);
  assert.deepEqual(JSON.parse(up.calls[0].messages[0].content).studied, studied);
});

test("the talk cap is its own counter: the request past it gets 429", async () => {
  const e = env({ TALK_DAILY_CAP: "2" }); const up = upstream([JSON.stringify(good())]);
  const now = () => new Date("2026-09-06T12:00:00Z");
  for (let i = 0; i < 2; i++) assert.equal((await handle(req({ scenario: "café", history: [] }, auth), e, { fetch: up.fetch, now })).status, 200);
  const r = await handle(req({ scenario: "café", history: [] }, auth), e, { fetch: up.fetch, now });
  assert.equal(r.status, 429);
  assert.equal(e.USAGE.store.get("talk:2026-09-06"), "2");
  // Feedback's counter is untouched by talk.
  assert.equal(e.USAGE.store.get("count:2026-09-06"), undefined);
});
