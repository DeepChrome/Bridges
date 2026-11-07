/* Sync: a learner's profile on more than one device (2026-11-07, core/sync.js).
 *
 * Until now this Worker held no learner state (§30d). It holds it now, in a
 * **Durable Object per account** — Cloudflare's stateful mini-server with its
 * own SQLite — because a profile has to live somewhere both the phone and the
 * computer can reach, and a learner's cards are one object's rows: writes to
 * one account are serialised by construction, a transaction is a transaction,
 * and nothing about one account can see another.
 *
 * Two classes:
 *
 *   SyncAccount   one per account: the rows (k, id, v, at, seq, dev), the
 *                 devices admitted and the hash of each one's secret. `sync`
 *                 takes a device's ops, keeps each row's latest (core/sync.js
 *                 `newer`), stamps what it kept with the next seq and the
 *                 device that sent it, and answers with every row changed by
 *                 *other* devices since the cursor the device gave.
 *   Pairings      one for everyone: a six-digit code the computer shows, the
 *                 phone claims, and the computer collects its token from.
 *                 Ten minutes, one use.
 *
 * The Worker (index.js) routes to them. A device token on the wire is
 * `s1.<account>.<secret>` (core/sync.js parseToken); the account names the
 * object, the object checks the secret's SHA-256 against its devices table.
 * The secret itself is stored nowhere.
 *
 * Plain classes rather than `extends DurableObject`: `cloudflare:workers`
 * cannot be imported in Node, and the tests run these on Node's own SQLite
 * behind the two storage calls used — `storage.sql.exec(q, ...params)` and
 * `storage.transactionSync(fn)`. The constructor signature (ctx, env) is what
 * the platform calls either way.
 */

import { PROTOCOL, PAGE, PAIR_TTL_MS, PAIR_CODE_LEN, isPairCode, newer, validOp } from "../../core/sync.js";

/* How many ops one push may carry; a device chunks a larger first push. */
export const PUSH_MAX = 2000;
/* Devices an account admits at once: a phone, a few computers. */
const MAX_DEVICES = 10;

const DDL_ACCOUNT = `
CREATE TABLE IF NOT EXISTS devices (
  id      TEXT PRIMARY KEY,
  hash    TEXT NOT NULL,
  name    TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rows (
  k   TEXT NOT NULL,
  id  TEXT NOT NULL,
  v   TEXT,
  at  INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  dev TEXT NOT NULL,
  PRIMARY KEY (k, id)
);
CREATE INDEX IF NOT EXISTS rows_seq ON rows (seq);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const DDL_PAIR = `
CREATE TABLE IF NOT EXISTS pairings (
  code    TEXT PRIMARY KEY,
  secret  TEXT NOT NULL,
  created INTEGER NOT NULL,
  token   TEXT
);
`;

/* The two storage calls, wrapped so a test can stand in node:sqlite. */
function sqlOf(storage) {
  return {
    all: (q, params = []) => storage.sql.exec(q, ...params).toArray(),
    run: (q, params = []) => { storage.sql.exec(q, ...params).toArray(); },
    tx: (fn) => storage.transactionSync(fn),
  };
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Web Crypto's randomness, base64url (the same shape index.js mints). */
export function randomWord(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});
const refuse = (reason, status = 400) => reply({ ok: false, reason }, status);

export class SyncAccount {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.db = sqlOf(ctx.storage);
    this.db.run(DDL_ACCOUNT);
  }

  /* The device a secret belongs to, or null. Updates `seen`. */
  async device(secret, now) {
    if (typeof secret !== "string" || secret.length < 20) return null;
    const hash = await sha256(secret);
    const rows = this.db.all("SELECT id, name FROM devices WHERE hash = ? AND revoked = 0", [hash]);
    if (!rows.length) return null;
    this.db.run("UPDATE devices SET seen = ? WHERE id = ?", [now, rows[0].id]);
    return rows[0];
  }

  async mint(name, now) {
    const n = this.db.all("SELECT COUNT(*) AS n FROM devices WHERE revoked = 0")[0].n;
    if (n >= MAX_DEVICES) return null;
    const secret = randomWord(24);
    const id = "d-" + randomWord(6);
    this.db.run("INSERT INTO devices (id, hash, name, created, seen) VALUES (?, ?, ?, ?, ?)",
                [id, await sha256(secret), String(name || "Device").slice(0, 40), now, now]);
    return { id, secret };
  }

  nextSeq() {
    const r = this.db.all("SELECT COALESCE(MAX(seq), 0) AS n FROM rows")[0];
    return (r ? r.n : 0) + 1;
  }

  async fetch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return refuse("a JSON body is required"); }
    const now = Number.isFinite(body.now) ? body.now : Date.now();
    const op = body.op;

    if (op === "create") {
      if (this.db.all("SELECT 1 FROM devices LIMIT 1").length) return refuse("exists", 409);
      const made = await this.mint(body.name, now);
      this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('created', ?)", [String(now)]);
      return reply({ ok: true, device: made.id, secret: made.secret });
    }

    const me = await this.device(body.secret, now);
    if (!me) return refuse("unauthorised", 401);

    if (op === "auth") return reply({ ok: true, device: me.id, name: me.name });

    if (op === "sync") {
      if (body.protocol !== PROTOCOL) return refuse("protocol", 426);
      const ops = Array.isArray(body.ops) ? body.ops : [];
      if (ops.length > PUSH_MAX) return refuse("too many ops", 413);
      if (!ops.every(validOp)) return refuse("malformed op");
      const cursor = Number.isFinite(body.cursor) ? body.cursor : 0;
      let applied = 0;
      this.db.tx(() => {
        let seq = this.nextSeq();
        for (const o of ops) {
          const have = this.db.all("SELECT v, at FROM rows WHERE k = ? AND id = ?", [o.k, o.id])[0] || null;
          if (!newer(o, have)) continue;
          this.db.run("INSERT OR REPLACE INTO rows (k, id, v, at, seq, dev) VALUES (?, ?, ?, ?, ?, ?)",
                      [o.k, o.id, o.v, o.at, seq++, me.id]);
          applied++;
        }
      });
      /* What the others changed since the cursor. One page; `more` says to
         come back with the new cursor. The cursor advances to the last row
         *returned* when there is more, so nothing in between is skipped, and
         to the top of the table when the page is complete. */
      const page = this.db.all(
        "SELECT k, id, v, at, seq FROM rows WHERE seq > ? AND dev != ? ORDER BY seq LIMIT ?",
        [cursor, me.id, PAGE + 1]);
      const more = page.length > PAGE;
      const out = more ? page.slice(0, PAGE) : page;
      const top = this.db.all("SELECT COALESCE(MAX(seq), 0) AS n FROM rows")[0].n;
      const next = more ? out[out.length - 1].seq : top;
      return reply({ ok: true, applied, cursor: next, more,
                     ops: out.map((r) => ({ k: r.k, id: r.id, v: r.v, at: r.at })) });
    }

    if (op === "addDevice") {
      const made = await this.mint(body.name, now);
      if (!made) return refuse("too many devices", 429);
      return reply({ ok: true, device: made.id, secret: made.secret });
    }

    if (op === "devices") {
      const list = this.db.all("SELECT id, name, created, seen FROM devices WHERE revoked = 0 ORDER BY created");
      return reply({ ok: true, devices: list.map((d) => ({ ...d, me: d.id === me.id })) });
    }

    if (op === "revoke") {
      if (typeof body.device !== "string") return refuse("device is required");
      if (body.device === me.id) return refuse("cannot revoke this device");
      this.db.run("UPDATE devices SET revoked = 1 WHERE id = ?", [body.device]);
      return reply({ ok: true });
    }

    if (op === "counts") {
      const rows = this.db.all("SELECT k, COUNT(*) AS n FROM rows GROUP BY k");
      const counts = {};
      for (const r of rows) counts[r.k] = r.n;
      return reply({ ok: true, counts, top: this.nextSeq() - 1 });
    }

    return refuse("unknown op", 404);
  }
}

export class Pairings {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.db = sqlOf(ctx.storage);
    this.db.run(DDL_PAIR);
  }

  sweep(now) {
    this.db.run("DELETE FROM pairings WHERE created < ?", [now - PAIR_TTL_MS]);
  }

  code() {
    for (let tries = 0; tries < 20; tries++) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const c = String(buf[0] % 10 ** PAIR_CODE_LEN).padStart(PAIR_CODE_LEN, "0");
      if (!this.db.all("SELECT 1 FROM pairings WHERE code = ?", [c]).length) return c;
    }
    return null;
  }

  async fetch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return refuse("a JSON body is required"); }
    const now = Number.isFinite(body.now) ? body.now : Date.now();
    this.sweep(now);

    if (body.op === "start") {
      const code = this.code();
      if (!code) return refuse("busy", 503);
      const secret = randomWord(18);
      this.db.run("INSERT INTO pairings (code, secret, created) VALUES (?, ?, ?)", [code, secret, now]);
      return reply({ ok: true, code, secret, expiresAt: now + PAIR_TTL_MS });
    }

    if (!isPairCode(body.code)) return refuse("code");
    const row = this.db.all("SELECT secret, token FROM pairings WHERE code = ?", [String(body.code).trim()])[0];

    if (body.op === "wait") {
      if (!row || row.secret !== body.secret) return refuse("expired", 410);
      if (!row.token) return reply({ ok: true, status: "waiting" });
      this.db.run("DELETE FROM pairings WHERE code = ?", [body.code]);
      return reply({ ok: true, status: "claimed", token: row.token });
    }

    if (body.op === "claim") {
      if (!row) return refuse("expired", 410);
      if (row.token) return refuse("claimed", 409);
      if (typeof body.token !== "string" || !body.token) return refuse("token is required");
      this.db.run("UPDATE pairings SET token = ? WHERE code = ?", [body.token, body.code]);
      return reply({ ok: true });
    }

    return refuse("unknown op", 404);
  }
}

/* The Worker's side: route a request to the right object and shape the
   answer. `callDO(ns, name, body)` is the one way in, so a test can hand in a
   namespace of in-process objects. */
export async function callDO(ns, name, body) {
  const stub = ns.get(ns.idFromName(name));
  const r = await stub.fetch(new Request("https://do/" + body.op, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { status: r.status, data: data || { ok: false, reason: "no answer" } };
}
