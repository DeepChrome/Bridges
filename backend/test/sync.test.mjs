/* Sync (core/sync.js, src/sync.js): a profile on more than one device.
 *
 * The two Durable Objects run here in-process on Node's own SQLite behind
 * the two storage calls they use, and the Worker's routes are driven through
 * `handle` with a namespace of those objects — so a wrong column, a row kept
 * that should have lost, a pairing code that works twice, fail here. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handle } from "../src/index.js";
import { SyncAccount, Pairings } from "../src/sync.js";
import { PROTOCOL, parseToken, opKv, opCard, opLog, PAGE } from "../../core/sync.js";

const OWNER = "test-app-token-0123456789";

function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}

/* A Durable Object's storage on node:sqlite: `sql.exec(q, ...params)`
   returning a cursor with `toArray()`, and `transactionSync(fn)`. */
function fakeStorage() {
  const db = new DatabaseSync(":memory:");
  return {
    sql: {
      exec(q, ...params) {
        if (!params.length && /;\s*\S/.test(q.trim().replace(/;\s*$/, ""))) { db.exec(q); return { toArray: () => [] }; }
        const st = db.prepare(q);
        if (/^\s*(SELECT|PRAGMA)/i.test(q)) return { toArray: () => st.all(...params) };
        st.run(...params);
        return { toArray: () => [] };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

/* A namespace of in-process objects, one per name, like the platform's. */
function fakeNamespace(Cls, envRef) {
  const objects = new Map();
  return {
    objects,
    idFromName: (name) => name,
    get(id) {
      if (!objects.has(id)) objects.set(id, new Cls({ storage: fakeStorage() }, envRef));
      const obj = objects.get(id);
      return { fetch: (req) => obj.fetch(req) };
    },
  };
}

function env(over = {}) {
  const e = { APP_TOKEN: OWNER, ANTHROPIC_API_KEY: "sk-test", DAILY_CAP: "3", USAGE: fakeKv(), ...over };
  e.SYNC = fakeNamespace(SyncAccount, e);
  e.PAIR = fakeNamespace(Pairings, e);
  return e;
}

const post = (path, body, token, ip = "203.0.113.7") =>
  new Request(`https://feedback.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip,
               ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const now = () => new Date("2026-11-07T20:00:00Z");
const T = +now();

/* An install registers, then opens an account for a profile. */
async function account(e, name = "Phone") {
  const reg = await (await handle(post("/v1/register", {}), e, { now })).json();
  const r = await handle(post("/v1/sync/account", { name }, reg.token), e, { now });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(parseToken(data.token), "a device token in the s1 shape");
  return { install: reg.token, ...data };
}

const sync = (e, token, cursor, ops) =>
  handle(post("/v1/sync", { protocol: PROTOCOL, cursor, ops }, token), e, { now }).then((r) => r.json());

test("an install opens an account and gets a device token; a stranger's token is refused", async () => {
  const e = env();
  const a = await account(e);
  assert.match(a.account, /^a-/);
  const no = await handle(post("/v1/sync", { protocol: PROTOCOL, cursor: 0, ops: [] }, "s1." + a.account + ".nope-nope-nope-nope-nope"), e, { now });
  assert.equal(no.status, 401);
  const bad = await handle(post("/v1/sync", { protocol: PROTOCOL, cursor: 0, ops: [] }, "garbage"), e, { now });
  assert.equal(bad.status, 401);
  // Opening an account needs an install token, not nothing.
  assert.equal((await handle(post("/v1/sync/account", {}), e, { now })).status, 401);
});

test("push and pull: a second device sees what the first wrote, never its own rows back", async () => {
  const e = env();
  const a = await account(e);
  const first = await sync(e, a.token, 0, [
    opKv("progress", "unit", JSON.stringify({ core1: { done: true } }), T),
    opCard("книга", "recognise", { dueAt: T + 1000, s: 3, d: 5, state: 2, reps: 1, lapses: 0, steps: 0 }, T),
    opLog({ word: "книга", direction: "recognise", grade: 3, day: 1, at: T - 5, source: "study" }),
  ]);
  assert.equal(first.ok, true);
  assert.equal(first.applied, 3);
  assert.deepEqual(first.ops, []);                 // nothing from anyone else
  assert.equal(first.cursor, 3);

  // Pair a second device the quick way: the phone adds it.
  const added = await (await handle(post("/v1/sync/devices", { add: "Desk" }, a.token), e, { now })).json();
  assert.equal(added.ok, true);
  const desk = added.token;

  const pull = await sync(e, desk, 0, []);
  assert.equal(pull.ops.length, 3);
  assert.equal(pull.cursor, 3);
  assert.equal(pull.more, false);
  assert.ok(pull.ops.some((o) => o.k === "log"));

  // The desk writes; the phone pulls only that, from its cursor.
  const w = await sync(e, desk, pull.cursor, [opKv("progress", "streak", "4", T + 10)]);
  assert.equal(w.cursor, 4);
  const back = await sync(e, a.token, first.cursor, []);
  assert.equal(back.ops.length, 1);
  assert.equal(back.ops[0].id, "progress\u0001streak");
  assert.equal(back.cursor, 4);
});

test("last write wins per row, whichever device pushes second", async () => {
  const e = env();
  const a = await account(e);
  const added = await (await handle(post("/v1/sync/devices", { add: "Desk" }, a.token), e, { now })).json();
  const older = opKv("progress", "streak", "2", T + 100);
  const newest = opKv("progress", "streak", "9", T + 200);
  await sync(e, added.token, 0, [newest]);
  const r = await sync(e, a.token, 0, [older]);
  assert.equal(r.applied, 0, "the older write is not taken");
  // …and the phone is handed the newer one it lost to.
  assert.equal(r.ops.length, 1);
  assert.equal(r.ops[0].v, "9");
  // A deletion later than the value removes it; the same instant keeps the value.
  const del = { ...opKv("progress", "streak", undefined, T + 300) };
  const d = await sync(e, a.token, r.cursor, [del]);
  assert.equal(d.applied, 1);
  const tie = await sync(e, added.token, 0, [opKv("progress", "streak", "7", T + 300)]);
  assert.equal(tie.applied, 1, "a value at the same instant as a deletion wins");
});

test("a pull is paged, and the cursor never skips a row", async () => {
  const e = env();
  const a = await account(e);
  const added = await (await handle(post("/v1/sync/devices", { add: "Desk" }, a.token), e, { now })).json();
  const ops = [];
  for (let i = 0; i < PAGE + 5; i++) ops.push(opKv("progress", "k" + i, String(i), T + i));
  // Pushed in two chunks, as a device would.
  await sync(e, a.token, 0, ops.slice(0, 1500));
  await sync(e, a.token, 0, ops.slice(1500));
  const p1 = await sync(e, added.token, 0, []);
  assert.equal(p1.ops.length, PAGE);
  assert.equal(p1.more, true);
  const p2 = await sync(e, added.token, p1.cursor, []);
  assert.equal(p2.ops.length, 5);
  assert.equal(p2.more, false);
  const ids = new Set(p1.ops.concat(p2.ops).map((o) => o.id));
  assert.equal(ids.size, PAGE + 5);
});

test("a malformed op or the wrong protocol is refused whole", async () => {
  const e = env();
  const a = await account(e);
  const bad = await handle(post("/v1/sync", { protocol: PROTOCOL, cursor: 0,
    ops: [opKv("progress", "x", "1", T), { k: "card", id: "a\u0001b", v: 5, at: T }] }, a.token), e, { now });
  assert.equal(bad.status, 400);
  const old = await handle(post("/v1/sync", { protocol: 0, cursor: 0, ops: [] }, a.token), e, { now });
  assert.equal(old.status, 426);
  const after = await sync(e, a.token, 0, []);
  assert.equal(after.cursor, 0, "nothing of the refused push was kept");
});

test("pairing: the computer shows a code, the phone claims it, the computer collects a token once", async () => {
  const e = env();
  const a = await account(e);
  const start = await (await handle(post("/v1/pair/start", {}), e, { now })).json();
  assert.equal(start.ok, true);
  assert.match(start.code, /^\d{6}$/);
  const waiting = await (await handle(post("/v1/pair/wait", { code: start.code, secret: start.secret }), e, { now })).json();
  assert.equal(waiting.status, "waiting");
  // A wrong secret cannot collect somebody else's pairing.
  assert.equal((await handle(post("/v1/pair/wait", { code: start.code, secret: "x" }), e, { now })).status, 410);

  const claim = await handle(post("/v1/pair/claim", { code: start.code, name: "Laptop" }, a.token), e, { now });
  assert.equal(claim.status, 200);
  const got = await (await handle(post("/v1/pair/wait", { code: start.code, secret: start.secret }), e, { now })).json();
  assert.equal(got.status, "claimed");
  assert.ok(parseToken(got.token));
  assert.equal(parseToken(got.token).account, a.account);
  // Once: the code is gone.
  assert.equal((await handle(post("/v1/pair/wait", { code: start.code, secret: start.secret }), e, { now })).status, 410);
  // The new device is a device of the account.
  const list = await (await handle(post("/v1/sync/devices", {}, got.token), e, { now })).json();
  assert.equal(list.devices.length, 2);
  assert.ok(list.devices.some((d) => d.name === "Laptop" && d.me));
  // A claim needs a device token: an install token alone is not a profile.
  const nope = await handle(post("/v1/pair/claim", { code: "000000" }, a.install), e, { now });
  assert.equal(nope.status, 401);
});

test("a code expires, and cannot be claimed twice", async () => {
  const e = env();
  const a = await account(e);
  const start = await (await handle(post("/v1/pair/start", {}), e, { now })).json();
  assert.equal((await handle(post("/v1/pair/claim", { code: start.code }, a.token), e, { now })).status, 200);
  assert.equal((await handle(post("/v1/pair/claim", { code: start.code }, a.token), e, { now })).status, 409);
  const later = () => new Date(T + 11 * 60 * 1000);
  const s2 = await (await handle(post("/v1/pair/start", {}), e, { now })).json();
  assert.equal((await handle(post("/v1/pair/wait", { code: s2.code, secret: s2.secret }), e, { now: later })).status, 410);
});

test("devices are listed and a revoked one is refused", async () => {
  const e = env();
  const a = await account(e);
  const added = await (await handle(post("/v1/sync/devices", { add: "Desk" }, a.token), e, { now })).json();
  const list = await (await handle(post("/v1/sync/devices", {}, a.token), e, { now })).json();
  const desk = list.devices.find((d) => d.name === "Desk");
  assert.ok(desk && !desk.me);
  const rev = await handle(post("/v1/sync/devices", { revoke: desk.id }, a.token), e, { now });
  assert.equal(rev.status, 200);
  assert.equal((await handle(post("/v1/sync", { protocol: PROTOCOL, cursor: 0, ops: [] }, added.token), e, { now })).status, 401);
  // A device cannot revoke itself through this route.
  const me = list.devices.find((d) => d.me);
  assert.equal((await handle(post("/v1/sync/devices", { revoke: me.id }, a.token), e, { now })).status, 400);
});

test("accounts and pairing starts are rate-limited", async () => {
  const e = env({ SYNC_ACCOUNTS_CAP: "2", PAIR_IP_CAP: "2" });
  const reg = await (await handle(post("/v1/register", {}), e, { now })).json();
  assert.equal((await handle(post("/v1/sync/account", {}, reg.token), e, { now })).status, 200);
  assert.equal((await handle(post("/v1/sync/account", {}, reg.token), e, { now })).status, 200);
  assert.equal((await handle(post("/v1/sync/account", {}, reg.token), e, { now })).status, 429);
  assert.equal((await handle(post("/v1/pair/start", {}), e, { now })).status, 200);
  assert.equal((await handle(post("/v1/pair/start", {}), e, { now })).status, 200);
  assert.equal((await handle(post("/v1/pair/start", {}), e, { now })).status, 429);
});
