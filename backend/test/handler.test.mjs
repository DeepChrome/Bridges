/* The Worker's one route, run in plain Node with a fake KV and a fake upstream. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";

const TOKEN = "test-app-token-0123456789";

function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

const env = (over = {}) => ({
  APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "claude-haiku-4-5-20251001",
  DAILY_CAP: "3", USAGE: fakeKv(), ...over,
});

const req = (body, headers = {}, { method = "POST", path = "/v1/feedback" } = {}) =>
  new Request(`https://feedback.example${path}`, {
    method, headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

const auth = { authorization: `Bearer ${TOKEN}` };
const attempt = { transcript: "я читаю книга", target: "Я читаю книгу.", lemmas: ["я", "читать", "книга"] };

const GOOD = {
  words: [{ said: "книга", expected: "книгу", lemma: "книга", status: "sub", tags: ["CASE"] }],
  grammar: [{ tag: "CASE", note: "Accusative «книгу» after «читать»." }],
  wordChoice: [], overall: "minor", praise: "",
};

/* An upstream that answers with the given texts in order and records what it got. */
function upstream(texts, status = 200) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const text = texts[Math.min(calls.length - 1, texts.length - 1)];
    return new Response(JSON.stringify({
      content: [{ type: "text", text }], usage: { input_tokens: 120, output_tokens: 60 },
    }), { status });
  };
  return { fetch, calls };
}

test("no bearer token → 401, and nothing is counted or called", async () => {
  const e = env(); const up = upstream([JSON.stringify(GOOD)]);
  const r = await handle(req(attempt), e, { fetch: up.fetch });
  assert.equal(r.status, 401);
  assert.equal(up.calls.length, 0);
  assert.equal(e.USAGE.store.size, 0);
});

test("wrong token → 401; right token but no upstream key → 503", async () => {
  const r = await handle(req(attempt, { authorization: "Bearer nope" }), env());
  assert.equal(r.status, 401);
  const r2 = await handle(req(attempt, auth), env({ ANTHROPIC_API_KEY: "" }));
  assert.equal(r2.status, 503);
});

test("other paths and methods are refused", async () => {
  assert.equal((await handle(req(attempt, auth, { path: "/" }), env())).status, 404);
  assert.equal((await handle(req(null, auth, { method: "GET" }), env())).status, 405);
});

test("a body without transcript and target → 400", async () => {
  const r = await handle(req({ transcript: "да" }, auth), env());
  assert.equal(r.status, 400);
});

test("a valid reply comes back as ok with the schema fields, tokens logged", async () => {
  const e = env(); const up = upstream([JSON.stringify(GOOD)]);
  const r = await handle(req(attempt, auth), e, { fetch: up.fetch, now: () => new Date("2026-09-06T10:00:00Z") });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.overall, "minor");
  assert.deepEqual(body.grammar[0].tag, "CASE");
  // The model saw the system prompt and a JSON user turn with the attempt.
  assert.equal(up.calls[0].model, "claude-haiku-4-5-20251001");
  assert.equal(up.calls[0].max_tokens, 400);
  assert.deepEqual(JSON.parse(up.calls[0].messages[0].content).lemmas, attempt.lemmas);
  assert.equal(e.USAGE.store.get("count:2026-09-06"), "1");
  assert.deepEqual(JSON.parse(e.USAGE.store.get("tokens:2026-09-06")), { in: 120, out: 60, n: 1 });
});

test("an off-schema reply is retried once with a nudge, then accepted", async () => {
  const up = upstream(["Sure! Here is the feedback: not json", JSON.stringify(GOOD)]);
  const r = await handle(req(attempt, auth), env(), { fetch: up.fetch });
  assert.equal((await r.json()).ok, true);
  assert.equal(up.calls.length, 2);
  const second = up.calls[1].messages;
  assert.equal(second.length, 3);
  assert.equal(second[1].role, "assistant");
  assert.match(second[2].content, /only the JSON object/);
});

test("two bad replies → ok:false reason parse, and an unknown tag counts as bad", async () => {
  const badTag = JSON.stringify({ ...GOOD, grammar: [{ tag: "TYPO", note: "x" }] });
  const up = upstream([badTag, badTag]);
  const r = await handle(req(attempt, auth), env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.reason, "parse");
  assert.match(body.errors.join(" "), /unknown tag "TYPO"/);
  assert.equal(up.calls.length, 2);
});

test("the daily cap: the request past it gets 429 and never reaches the model", async () => {
  const e = env({ DAILY_CAP: "2" }); const up = upstream([JSON.stringify(GOOD)]);
  const now = () => new Date("2026-09-06T12:00:00Z");
  for (let i = 0; i < 2; i++) {
    assert.equal((await handle(req(attempt, auth), e, { fetch: up.fetch, now })).status, 200);
  }
  const r = await handle(req(attempt, auth), e, { fetch: up.fetch, now });
  assert.equal(r.status, 429);
  assert.match((await r.json()).message, /limit of 2/);
  assert.equal(up.calls.length, 2);
  // A new day starts a new count.
  const r2 = await handle(req(attempt, auth), e, { fetch: up.fetch, now: () => new Date("2026-09-07T00:00:01Z") });
  assert.equal(r2.status, 200);
});

test("an upstream failure is a 502 with the reason, not a crash", async () => {
  const fetch = async () => new Response("overloaded", { status: 529 });
  const r = await handle(req(attempt, auth), env(), { fetch });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).detail, "upstream 529");
});
