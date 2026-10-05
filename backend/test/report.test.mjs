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

test("eighty a day, then no more", async () => {
  const e = env();
  for (let i = 0; i < 80; i++) {
    const at = new Date(Date.UTC(2026, 9, 3, 10, Math.floor(i / 60), i % 60));
    assert.equal((await handle(report({ text: `n${i}` }), e, { now: () => at })).status, 200);
  }
  assert.equal((await handle(report({ text: "one more" }), e, { now })).status, 429);
});

/* A report on a question (2026-10-05): severity, kind, the fix, what the
   tester was looking at, and recordings, each clip its own key. */
test("a structured report keeps its severity, kind, question and recordings", async () => {
  const e = env();
  const about = { screen: "Quiz", title: "Family & People", question: { kind: "choose-ru", prompt: "how much", answer: "сколько" } };
  const r = await handle(report({ severity: "major", kind: "pronunciation", text: "", fix: "ско́лько",
                                  about, clips: ["AAAA", "BBBB"], facts: {} }), e, { now });
  assert.equal(r.status, 200);
  const key = [...e.USAGE.store.keys()].find((k) => k.startsWith("report:"));
  const saved = JSON.parse(e.USAGE.store.get(key));
  assert.equal(saved.severity, "major");
  assert.equal(saved.kind, "pronunciation");
  assert.equal(saved.fix, "ско́лько");
  assert.equal(saved.about.question.answer, "сколько");
  assert.equal(saved.clips, 2);
  assert.equal(e.USAGE.store.get(`report-clip:${key}:1`), "BBBB");
});

test("a report of only a recording is accepted; unknown labels are dropped", async () => {
  const e = env();
  const r = await handle(report({ severity: "apocalyptic", kind: "vibes", clips: ["AAAA"] }), e, { now });
  assert.equal(r.status, 200);
  const key = [...e.USAGE.store.keys()].find((k) => k.startsWith("report:"));
  const saved = JSON.parse(e.USAGE.store.get(key));
  assert.equal(saved.severity, null);
  assert.equal(saved.kind, null);
});
