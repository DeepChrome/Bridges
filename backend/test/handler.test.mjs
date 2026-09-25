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
function upstream(texts, status = 200, stops = []) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const n = Math.min(calls.length - 1, texts.length - 1);
    return new Response(JSON.stringify({
      content: [{ type: "text", text: texts[n] }], usage: { input_tokens: 120, output_tokens: 60 },
      stop_reason: stops[n] || "end_turn",
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

/* Per-user tokens (P8.4): a KV record admits a second learner with a cap of their
   own; revoking it refuses them; the owner's count is untouched. */
test("a user token from KV is admitted with its own counter and cap, and a revoked one is not", async () => {
  const e = env({ DAILY_CAP: "5" });
  const utoken = "learner-token-abcdefghijkl";
  await e.USAGE.put(`user:${utoken}`, JSON.stringify({ id: "ann", caps: { feedback: 1 } }));
  const up = upstream([JSON.stringify(GOOD)]);
  const uauth = { authorization: `Bearer ${utoken}` };
  assert.equal((await handle(req(attempt, uauth), e, { fetch: up.fetch })).status, 200);
  const capped = await handle(req(attempt, uauth), e, { fetch: up.fetch });
  assert.equal(capped.status, 429);                                   // her cap, not the owner's
  assert.equal((await handle(req(attempt, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal(e.USAGE.store.get("count:" + new Date().toISOString().slice(0, 10) + ":ann"), "1");
  const line = [...e.USAGE.store.entries()].find(([k]) => k.startsWith("log:"));
  assert.equal(JSON.parse(line[1]).user, "ann");
  await e.USAGE.put(`user:${utoken}`, JSON.stringify({ id: "ann", revoked: true }));
  assert.equal((await handle(req(attempt, uauth), e, { fetch: up.fetch })).status, 401);
  assert.equal((await handle(req(attempt, { authorization: "Bearer short" }), e)).status, 401);
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
  assert.equal(e.USAGE.store.get("count:2026-09-06:owner"), "1");
  assert.deepEqual(JSON.parse(e.USAGE.store.get("tokens:2026-09-06:feedback")), { in: 120, out: 60, n: 1 });
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

test("three bad replies → ok:false reason parse, and an unknown tag counts as bad", async () => {
  const badTag = JSON.stringify({ ...GOOD, grammar: [{ tag: "TYPO", note: "x" }] });
  const up = upstream([badTag, badTag, badTag]);
  const r = await handle(req(attempt, auth), env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.reason, "parse");
  assert.match(body.errors.join(" "), /unknown tag "TYPO"/);
  // Three tries since 2026-09-24: a malformed conversational turn was reaching
  // the owner often enough to notice, and a nudge usually fixes it.
  assert.equal(up.calls.length, 3);
});

test("…and a good third reply is taken", async () => {
  const badTag = JSON.stringify({ ...GOOD, grammar: [{ tag: "TYPO", note: "x" }] });
  const up = upstream([badTag, badTag, JSON.stringify(GOOD)]);
  const r = await handle(req(attempt, auth), env(), { fetch: up.fetch });
  assert.equal((await r.json()).ok, true);
  assert.equal(up.calls.length, 3);
});

test("a reply cut at the token limit is named as such, and the retry is asked to be brief", async () => {
  const cut = JSON.stringify(GOOD).slice(0, 40);                       // truncated mid-object
  const up = upstream([cut, JSON.stringify(GOOD)], 200, ["max_tokens", "end_turn"]);
  const r = await handle(req(attempt, auth), env(), { fetch: up.fetch });
  assert.equal((await r.json()).ok, true);
  assert.equal(up.calls.length, 2);
  assert.match(up.calls[1].messages[2].content, /cut off at 400 tokens/);
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
