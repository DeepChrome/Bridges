/* Free and Premium (2026-09-29, core/plans.js): each install spends the
   plan's allowance of each kind a day, the refusal says which plan it was,
   and /v1/plan reports what is left without calling the model. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { PLANS } from "../../core/plans.js";

function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = () => ({ APP_TOKEN: "owner-token-0123456789", ANTHROPIC_API_KEY: "sk-test",
                     MODEL: "claude-haiku-4-5-20251001", USAGE: fakeKv() });
const EXPLAIN = JSON.stringify({ why: "The accusative after «хотеть».", yours: "", rule: "" });
let calls = 0;
const upstream = async () => { calls++; return new Response(JSON.stringify({
  content: [{ type: "text", text: EXPLAIN }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn",
}), { status: 200 }); };
const post = (path, token, body = {}) => new Request(`https://w.example${path}`, {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const miss = { ask: "хотеть · я", answer: "хочу", said: "хотю", kind: "conjugation" };
const now = () => new Date("2026-09-29T10:00:00Z");

async function install(e, plan) {
  const token = `install-${plan}-abcdefghijklmnop`;
  await e.USAGE.put(`user:${token}`, JSON.stringify({ id: `app-${plan}`, plan, via: "register" }));
  return token;
}

test("Free allows its taste of explanations, then refuses and says it is the Free plan", async () => {
  const e = env();
  const token = await install(e, "free");
  calls = 0;
  for (let i = 0; i < PLANS.free.explain; i++) {
    assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 200);
  }
  const refused = await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now });
  assert.equal(refused.status, 429);
  const body = await refused.json();
  assert.equal(body.plan, "free");
  assert.equal(body.counter, "explain");
  assert.match(body.message, /Free plan/);
  assert.equal(calls, PLANS.free.explain, "the refused request never reached the model");
});

test("Premium allows far more of the same", async () => {
  const e = env();
  const token = await install(e, "premium");
  for (let i = 0; i < PLANS.free.explain + 5; i++) {
    assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 200);
  }
  assert.ok(PLANS.premium.explain > PLANS.free.explain * 5);
});

test("/v1/plan says the plan, its caps and today's use, and calls no model", async () => {
  const e = env();
  const token = await install(e, "free");
  await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now });
  calls = 0;
  const r = await handle(post("/v1/plan", token), e, { fetch: upstream, now });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.plan, "free");
  assert.deepEqual(body.caps, PLANS.free);
  assert.equal(body.used.explain, 1);
  assert.equal(body.used.conversation, 0);
  assert.equal(calls, 0);
});

test("a hand-minted token with the old caps keeps them under the new counters", async () => {
  const e = env();
  const token = "hand-minted-token-abcdefghij";
  await e.USAGE.put(`user:${token}`, JSON.stringify({ id: "friend", caps: { feedback: 2, talk: 9 } }));
  const r = await handle(post("/v1/plan", token), e, { now });
  const body = await r.json();
  assert.equal(body.plan, "custom");
  assert.equal(body.caps.explain, 2);
  assert.equal(body.caps.conversation, 9);
});
