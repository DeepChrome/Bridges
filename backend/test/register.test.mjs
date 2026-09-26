/* Registration (ROADMAP 13.39): the one route with no bearer token, and the
   ceiling that bounds what every registered install together can spend. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, REGISTERED_CAPS } from "../src/index.js";

const OWNER = "test-app-token-0123456789";

function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

const env = (over = {}) => ({
  APP_TOKEN: OWNER, ANTHROPIC_API_KEY: "sk-test", MODEL: "claude-haiku-4-5-20251001",
  DAILY_CAP: "3", USAGE: fakeKv(), ...over,
});

const GOOD = JSON.stringify({
  words: [], grammar: [], wordChoice: [], overall: "ok", praise: "",
});
const upstream = () => async () => new Response(JSON.stringify({
  content: [{ type: "text", text: GOOD }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn",
}), { status: 200 });

const reg = (ip = "203.0.113.7", method = "POST") =>
  new Request("https://feedback.example/v1/register", { method, headers: ip ? { "cf-connecting-ip": ip } : {} });
const attempt = (token) => new Request("https://feedback.example/v1/feedback", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ transcript: "да", target: "Да.", lemmas: [] }),
});
const now = () => new Date("2026-09-18T10:00:00Z");

test("register mints a token that then authenticates with a stranger's caps", async () => {
  const e = env();
  const r = await handle(reg(), e, { now });
  assert.equal(r.status, 200);
  const { ok, token } = await r.json();
  assert.equal(ok, true);
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 32, `token is ${token.length} chars`);
  assert.match(token, /^[A-Za-z0-9_-]+$/);

  const rec = JSON.parse(e.USAGE.store.get(`user:${token}`));
  /* Read rather than duplicated: the numbers move when real use shows they
     are too mean (2026-09-26, 60 talk turns was one sitting), and a test
     that pins them is a test that fails for being out of date rather than
     for being broken. What matters is that registration writes the
     configured caps, and that they are enough for a day of use. */
  assert.deepEqual(rec.caps, REGISTERED_CAPS);
  assert.ok(REGISTERED_CAPS.talk >= 200, `a day of conversation is more than ${REGISTERED_CAPS.talk} turns`);
  assert.match(rec.id, /^app-[A-Za-z0-9_-]{8}$/);
  assert.equal(rec.created, "2026-09-18");
  assert.notEqual(rec.id.slice(4), token.slice(0, 8), "the id is not a piece of the token");

  // A second on: log lines are keyed by the millisecond, and a fixed clock
  // would write the feedback line over the registration's.
  const later = () => new Date("2026-09-18T10:00:01Z");
  const used = await handle(attempt(token), e, { fetch: upstream(), now: later });
  assert.equal(used.status, 200);
  assert.equal(e.USAGE.store.get(`count:2026-09-18:${rec.id}`), "1");
  const log = [...e.USAGE.store.entries()].filter(([k]) => k.startsWith("log:")).map(([, v]) => JSON.parse(v));
  assert.ok(log.some((l) => l.kind === "register" && l.user === rec.id));
  assert.ok(!JSON.stringify(log).includes(token), "the token is never logged");
});

/* An install already out there follows the caps as they are *now*. Raising
   them used to reach only installs that registered afterwards, because the
   numbers are written into the record at registration — which is how the
   owner's phone went on being refused at a limit that had already been
   lifted (2026-09-26). A token minted by hand keeps its own caps. */
test("a registered install follows the current caps, not the ones it was minted under", async () => {
  const e = env();
  const { token } = await (await handle(reg(), e, { now })).json();
  const rec = JSON.parse(e.USAGE.store.get(`user:${token}`));

  e.USAGE.store.set(`user:${token}`, JSON.stringify({ ...rec, caps: { feedback: 0, talk: 0 } }));
  const after = await handle(attempt(token), e, { fetch: upstream(), now });
  assert.notEqual(after.status, 429, "a stale record must not hold an install at an old cap");

  // …while a hand-minted token is left exactly as it was given.
  const hand = "hand-made-token-0123456789";
  e.USAGE.store.set(`user:${hand}`, JSON.stringify({ id: "friend", caps: { feedback: 0, talk: 0 } }));
  const refused = await handle(attempt(hand), e, { fetch: upstream(), now });
  assert.equal(refused.status, 429);
});

test("two registrations are two different tokens and two different ids", async () => {
  const e = env();
  const a = await (await handle(reg(), e, { now })).json();
  const b = await (await handle(reg(), e, { now })).json();
  assert.notEqual(a.token, b.token);
  assert.notEqual(JSON.parse(e.USAGE.store.get(`user:${a.token}`)).id,
                  JSON.parse(e.USAGE.store.get(`user:${b.token}`)).id);
});

test("an address is limited per day, and so is the whole day; a new day resets both", async () => {
  const e = env({ REGISTER_IP_CAP: "2", REGISTER_DAILY_CAP: "3" });
  assert.equal((await handle(reg("10.0.0.1"), e, { now })).status, 200);
  assert.equal((await handle(reg("10.0.0.1"), e, { now })).status, 200);
  const third = await handle(reg("10.0.0.1"), e, { now });
  assert.equal(third.status, 429);
  assert.match((await third.json()).message, /this address/);
  assert.equal(e.USAGE.store.get("reg:2026-09-18"), "2");           // the refused one was not counted

  assert.equal((await handle(reg("10.0.0.2"), e, { now })).status, 200);
  const overall = await handle(reg("10.0.0.3"), e, { now });
  assert.equal(overall.status, 429);
  assert.match((await overall.json()).message, /No more new installs/);
  assert.equal([...e.USAGE.store.keys()].filter((k) => k.startsWith("user:")).length, 3);

  const tomorrow = () => new Date("2026-09-19T00:00:01Z");
  assert.equal((await handle(reg("10.0.0.1"), e, { now: tomorrow })).status, 200);
});

test("no address header is one bucket, not an open door", async () => {
  const e = env({ REGISTER_IP_CAP: "1" });
  assert.equal((await handle(reg(null), e, { now })).status, 200);
  assert.equal((await handle(reg(null), e, { now })).status, 429);
});

test("GET is refused, and register takes no token to reach", async () => {
  assert.equal((await handle(reg("1.2.3.4", "GET"), env(), { now })).status, 405);
});

test("the global ceiling bounds every registered install together, and not the owner", async () => {
  const e = env({ GLOBAL_DAILY_CAP: "2" });
  const a = (await (await handle(reg("10.0.0.1"), e, { now })).json()).token;
  const b = (await (await handle(reg("10.0.0.2"), e, { now })).json()).token;
  let calls = 0;
  const fetch = async (...args) => { calls++; return upstream()(...args); };
  assert.equal((await handle(attempt(a), e, { fetch, now })).status, 200);
  assert.equal((await handle(attempt(b), e, { fetch, now })).status, 200);
  const over = await handle(attempt(a), e, { fetch, now });
  assert.equal(over.status, 429);
  assert.equal((await over.json()).reason, "cap");
  assert.equal(calls, 2);                                               // never reached the model
  assert.equal(e.USAGE.store.get("all:2026-09-18"), "2");
  // The owner's token is his budget, not theirs.
  assert.equal((await handle(attempt(OWNER), e, { fetch, now })).status, 200);
  assert.equal(e.USAGE.store.get("all:2026-09-18"), "2");
});

test("a learner past their own cap does not consume the shared allowance", async () => {
  const e = env({ GLOBAL_DAILY_CAP: "10" });
  const token = (await (await handle(reg(), e, { now })).json()).token;
  await e.USAGE.put(`user:${token}`, JSON.stringify({ id: "tiny", caps: { feedback: 1 } }));
  const fetch = upstream();
  assert.equal((await handle(attempt(token), e, { fetch, now })).status, 200);
  assert.equal((await handle(attempt(token), e, { fetch, now })).status, 429);
  assert.equal(e.USAGE.store.get("all:2026-09-18"), "1");
});
