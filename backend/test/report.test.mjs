/* Feedback from testers (POST /v1/report, 2026-10-03): stored for the owner,
   no model call, limited per install per day. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";

const OWNER = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}
const env = () => ({ APP_TOKEN: OWNER, USAGE: fakeKv() });   // no model key: a report needs none
const report = (body, token = OWNER) => new Request("https://feedback.example/v1/report", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const now = () => new Date("2026-10-03T10:00:00Z");

test("a report is stored with what the app attached, and no model is asked", async () => {
  const e = env();
  let asked = false;
  const r = await handle(report({ text: "The slider froze.", facts: { version: "1.0.0-beta.1", chapter: 2 } }), e,
                         { now, fetch: async () => { asked = true; } });
  assert.equal(r.status, 200);
  assert.equal(asked, false);
  const key = [...e.USAGE.store.keys()].find((k) => k.startsWith("report:"));
  const saved = JSON.parse(e.USAGE.store.get(key));
  assert.equal(saved.text, "The slider froze.");
  assert.equal(saved.facts.chapter, 2);
});

test("an empty report is refused, and so is a stranger with no token", async () => {
  assert.equal((await handle(report({ text: "  " }), env(), { now })).status, 400);
  assert.equal((await handle(report({ text: "hi" }, "nobody"), env(), { now })).status, 401);
});

test("twenty a day, then no more", async () => {
  const e = env();
  for (let i = 0; i < 20; i++) {
    assert.equal((await handle(report({ text: `n${i}` }), e, { now: () => new Date(Date.UTC(2026, 9, 3, 10, 0, i)) })).status, 200);
  }
  assert.equal((await handle(report({ text: "one more" }), e, { now })).status, 429);
});
