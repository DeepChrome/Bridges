/* POST /v1/ask — a question asked from any screen, about what is on it
 * (2026-10-08). What is asserted: the screen's context reaches the model, a
 * follow-up carries the earlier turns, the answer is capped and keeps its
 * guillemets, and the route spends the explanation's allowance. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAsk, askMessage, SYSTEM_ASK, ANSWER_WORDS } from "../src/ask.js";
import { COUNTER_OF } from "../../core/plans.js";
import { handle } from "../src/index.js";

const TOKEN = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = (over = {}) => ({ APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "m",
  DAILY_CAP: "300", USAGE: fakeKv(), ...over });
const req = (body, headers = {}) => new Request("https://x/v1/ask", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const auth = { authorization: `Bearer ${TOKEN}` };
const upstream = (texts) => {
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: texts[Math.min(calls.length - 1, texts.length - 1)] }],
      usage: { input_tokens: 60, output_tokens: 40 } }), { status: 200 });
  } };
};

test("the screen's question card and the earlier turns go to the model", () => {
  const m = JSON.parse(askMessage({
    question: "Why книгу and not книга?", screen: "Cases",
    about: { kind: "cases", ask: "Fill the gap", prompt: "Я читаю ___.", answer: "кни́гу", said: "книга",
             options: ["кни́гу", "кни́ге", "кни́ги", "кни́гой"] },
    level: "beginner", chapter: 6,
    history: [{ q: "What case is this?", a: "The accusative." }],
  }));
  assert.equal(m.about.prompt, "Я читаю ___.");
  assert.equal(m.about.answer, "кни́гу");
  assert.equal(m.about.said, "книга");
  assert.equal(m.about.options.length, 4);
  assert.equal(m.chapter, 6);
  assert.equal(m.history[0].q, "What case is this?");
  // Nothing on screen is nulls, not the string "undefined".
  assert.equal(JSON.parse(askMessage({ question: "hi" })).about.prompt, null);
});

test("an answer is capped, keeps its guillemets, and loses its dashes", () => {
  const r = validateAsk({ answer: "«книгу» is the accusative — «читать» takes a direct object." });
  assert.equal(r.ok, true);
  assert.match(r.value.answer, /«книгу»/);
  assert.equal(/—/.test(r.value.answer), false);
  assert.match(validateAsk({ answer: new Array(ANSWER_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /over/);
  assert.equal(validateAsk({}).ok, false);
  assert.match(SYSTEM_ASK, /Never write Russian without them/);
  assert.match(SYSTEM_ASK, /You may state the right answer/);
  assert.match(SYSTEM_ASK, /only help with Russian/);
});

test("POST /v1/ask: 401 without a token, 400 without a question, the answer through, the explanation's cap", async () => {
  assert.equal(COUNTER_OF.ask, "explain");
  assert.equal((await handle(req({ question: "why?" }), env())).status, 401);
  assert.equal((await handle(req({ question: " " }, auth), env())).status, 400);
  const up = upstream([JSON.stringify({ answer: "«читать» takes the accusative, so «книга» becomes «книгу»." })]);
  const r = await handle(req({ question: "why?", about: { prompt: "Я читаю ___.", answer: "кни́гу" } }, auth),
                         env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.match(body.answer, /«книгу»/);
  assert.match(up.calls[0].messages[0].content, /Я читаю/);
  // The "?" asks the same route about the app, with the guide and its own prompt.
  const app = upstream([JSON.stringify({ answer: "Open Study, then the cog." })]);
  const ra = await handle(req({ question: "How do I add new words?", mode: "app", screen: "Cards",
                                guide: "Study tab: cog sets fronts, sources, new words a day." }, auth),
                          env(), { fetch: app.fetch });
  assert.equal((await ra.json()).answer, "Open Study, then the cog.");
  assert.match(app.calls[0].system[0].text, /Answer only from the guide/);
  assert.match(app.calls[0].messages[0].content, /new words a day/);
  assert.equal(/"about"/.test(app.calls[0].messages[0].content), false);
  const e = env({ DAILY_CAP: "1" });
  assert.equal((await handle(req({ question: "a" }, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal((await handle(req({ question: "b" }, auth), e, { fetch: up.fetch })).status, 429);
});
