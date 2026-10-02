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

test("a refusal says when the day rolls over, as an instant", async () => {
  const e = env();
  const token = await install(e, "free");
  for (let i = 0; i < PLANS.free.explain; i++) await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now });
  const body = await (await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).json();
  assert.equal(body.resetsAt, "2026-09-30T00:00:00.000Z");
});

test("BETA_PREMIUM puts every registered install on Premium's allowance", async () => {
  const e = { ...env(), BETA_PREMIUM: "true" };
  const token = await install(e, "free");
  for (let i = 0; i < PLANS.free.explain + 5; i++) {
    assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 200);
  }
  // A token minted by hand keeps its own plan.
  await e.USAGE.put("user:hand-minted-abcdefghijklmnop", JSON.stringify({ id: "app-hand", plan: "free" }));
  for (let i = 0; i < PLANS.free.explain; i++) await handle(post("/v1/explain", "hand-minted-abcdefghijklmnop", miss), e, { fetch: upstream, now });
  assert.equal((await handle(post("/v1/explain", "hand-minted-abcdefghijklmnop", miss), e, { fetch: upstream, now })).status, 429);
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

/* The beta's own switch (2026-10-01): an install may choose its plan while
   BETA_SELF_PLAN is on, and the choice is what the next request is held to. */
test("during the beta an install switches itself to Premium, and is held to Premium's caps", async () => {
  const e = { ...env(), BETA_SELF_PLAN: "true" };
  const token = await install(e, "free");
  const before = await (await handle(post("/v1/plan", token), e, { now })).json();
  assert.equal(before.selfServe, true);
  const r = await handle(post("/v1/plan", token, { set: "premium" }), e, { now });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.plan, "premium");
  assert.deepEqual(body.caps, PLANS.premium);
  // The next request is counted against Premium, not Free.
  calls = 0;
  for (let i = 0; i < PLANS.free.explain + 1; i++) {
    assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 200);
  }
  // And back.
  const back = await (await handle(post("/v1/plan", token, { set: "free" }), e, { now })).json();
  assert.equal(back.plan, "free");
});

test("outside the beta, or for the owner's token, the plan cannot be chosen", async () => {
  const off = env();
  const token = await install(off, "free");
  assert.equal((await (await handle(post("/v1/plan", token), off, { now })).json()).selfServe, false);
  assert.equal((await handle(post("/v1/plan", token, { set: "premium" }), off, { now })).status, 403);
  const on = { ...env(), BETA_SELF_PLAN: "true" };
  assert.equal((await handle(post("/v1/plan", on.APP_TOKEN, { set: "free" }), on, { now })).status, 403);
  const t2 = await install(on, "free");
  assert.equal((await handle(post("/v1/plan", t2, { set: "platinum" }), on, { now })).status, 400);
});

/* A request that gave the learner nothing costs them nothing (the review,
   2026-10-01): an upstream error and a reply that never parsed both hand the
   unit back, and a refusal by the global ceiling does not spend the user's. */
test("a failed request does not spend the learner's allowance", async () => {
  const e = env();
  const token = await install(e, "free");
  const failing = async () => new Response("overloaded", { status: 529 });
  const garbage = async () => new Response(JSON.stringify({
    content: [{ type: "text", text: "not json at all" }], usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: "end_turn",
  }), { status: 200 });
  for (let i = 0; i < 5; i++) {
    await handle(post("/v1/explain", token, miss), e, { fetch: failing, now });
    await handle(post("/v1/explain", token, miss), e, { fetch: garbage, now });
  }
  const left = await (await handle(post("/v1/plan", token), e, { now })).json();
  assert.equal(left.used.explain, 0);
  // The whole allowance is still there for requests that work.
  for (let i = 0; i < PLANS.free.explain; i++) {
    assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 200);
  }
});

test("a refusal by the global ceiling leaves the learner's own counter as it was", async () => {
  const e = { ...env(), GLOBAL_DAILY_CAP: "0" };
  const token = await install(e, "free");
  assert.equal((await handle(post("/v1/explain", token, miss), e, { fetch: upstream, now })).status, 429);
  assert.equal((await (await handle(post("/v1/plan", token), e, { now })).json()).used.explain, 0);
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
