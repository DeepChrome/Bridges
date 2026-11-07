/* The repository contract (core/repo.js) on SQLite.
 *
 * One file per profile, WAL, the five tables — cards, review_log, decks,
 * progress, settings — and meta, for notes about the store itself. It takes an
 * open database rather than a name so the same code runs wherever there is a
 * SQLite: on the phone through expo-sqlite (native/src/db.js opens the file),
 * on the desktop through Node's own `node:sqlite` (desktop/src/main/db.js),
 * and in jest on `node:sqlite` too (native/__tests__/sqlite.test.js), so the
 * SQL here is what is tested, not a fake of it. The database handle is the
 * slice of expo-sqlite's async API this file uses: execAsync, runAsync,
 * getAllAsync, getFirstAsync, prepareAsync, withTransactionAsync, closeAsync.
 *
 * A write is one transaction, which is the reason for the move off the JSON
 * row: the card a grade changed and the log row that grade left land together
 * or not at all. Cards and keys are inserted with OR REPLACE and log rows skip
 * a key already present, so a save retried after a failure, or a backup
 * restored twice, adds nothing twice.
 *
 * **Sync** (2026-11-07, core/sync.js). Two tables beside the learner's:
 * `outbox`, the ops a save produced that have not reached the server yet,
 * written in the same transaction as the rows they describe; and `sync_rows`,
 * when each row last changed as far as this device knows, which is what
 * decides whether a pulled op is newer than what is held. `applyOps` writes
 * pulled ops without touching the outbox — they came *from* the server. A
 * profile that does not sync carries an outbox that grows and is never read;
 * `clearOutbox` empties it when sync is switched off, and `pruneOutbox` keeps
 * it to the rows that would still matter.
 */

import { cardRow, nestCards, diff, logRow } from "./repo.js";
import { opsOf, newer, parseId, logOf } from "./sync.js";

/* A card's columns from its in-memory shape (an op's `v`), through the one
   mapping core/repo.js keeps. */
const cardRowOf = (card) => {
  const r = cardRow("", "", card);
  delete r.word;
  delete r.direction;
  return r;
};

/* The schema version, in PRAGMA user_version. A later shape adds its ALTERs
   below the check, gated on the number found: one place, forward only, like
   core/state.js.

   1  Phase 1: the five tables, one card per word (`direction = 'both'`).
   2  Phase 2: the scheduler's columns on cards and the log, and a card per
      direction — the blended card becomes `recognise` (core/scheduler.js).
   3  Sync: `outbox` and `sync_rows` (CREATE IF NOT EXISTS; no ALTER). */
export const SCHEMA = 3;

const DDL = `
CREATE TABLE IF NOT EXISTS cards (
  word      TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'recognise',
  s REAL, d REAL, due INTEGER, last INTEGER,
  reps   INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state     INTEGER NOT NULL DEFAULT 0,
  steps     INTEGER NOT NULL DEFAULT 0,
  elapsed   INTEGER,
  scheduled INTEGER,
  PRIMARY KEY (word, direction)
);
CREATE INDEX IF NOT EXISTS cards_due ON cards (due);
CREATE TABLE IF NOT EXISTS review_log (
  id        INTEGER PRIMARY KEY,
  word      TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'recognise',
  grade     INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4),
  day       INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  s REAL, d REAL, due INTEGER, last INTEGER,
  reps    INTEGER NOT NULL DEFAULT 0,
  lapses  INTEGER NOT NULL DEFAULT 0,
  elapsed INTEGER,
  source  TEXT,
  state     INTEGER,
  steps     INTEGER,
  scheduled INTEGER,
  UNIQUE (word, direction, at)
);
CREATE INDEX IF NOT EXISTS review_log_word ON review_log (word, at);
CREATE TABLE IF NOT EXISTS decks (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  name TEXT NOT NULL,
  n    INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta     (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (
  k  TEXT NOT NULL,
  id TEXT NOT NULL,
  v  TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (k, id)
);
CREATE TABLE IF NOT EXISTS sync_rows (
  k  TEXT NOT NULL,
  id TEXT NOT NULL,
  v  TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (k, id)
);
`;

/* Schema 1 → 2. The columns are added to a table made at 1; a table made at
   2 has them from the DDL. The one blended card becomes the recognise card,
   and so does every log row it left; and the day numbers Phase 1 kept in
   `due` and `last` become the clock in ms, by the same rule
   core/scheduler.js `fromLegacy` applies to a blob: a card with a memory was
   a review card, one without is new and has no last review. Everything
   written since is in ms already (a day number is far below 1e9). */
const DAY_MS = 86400000;
const UPGRADE_2 = [
  "ALTER TABLE cards ADD COLUMN state INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN steps INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN elapsed INTEGER",
  "ALTER TABLE cards ADD COLUMN scheduled INTEGER",
  "ALTER TABLE review_log ADD COLUMN state INTEGER",
  "ALTER TABLE review_log ADD COLUMN steps INTEGER",
  "ALTER TABLE review_log ADD COLUMN scheduled INTEGER",
  "UPDATE cards SET direction = 'recognise' WHERE direction = 'both'",
  "UPDATE review_log SET direction = 'recognise' WHERE direction = 'both'",
  `UPDATE cards SET
     scheduled = CASE WHEN s > 0 AND last IS NOT NULL THEN MAX(0, due - last) ELSE 0 END,
     elapsed = 0,
     state = CASE WHEN s > 0 THEN 2 ELSE 0 END,
     last = CASE WHEN s > 0 AND last IS NOT NULL THEN last * ${DAY_MS} ELSE NULL END,
     due = COALESCE(due, 0) * ${DAY_MS}
   WHERE due IS NULL OR due < 1000000000`,
  `UPDATE review_log SET
     scheduled = CASE WHEN s > 0 AND last IS NOT NULL AND due IS NOT NULL THEN MAX(0, due - last) ELSE 0 END,
     state = CASE WHEN s > 0 THEN 2 ELSE 0 END,
     steps = 0,
     last = CASE WHEN s > 0 AND last IS NOT NULL THEN last * ${DAY_MS} ELSE NULL END,
     due = CASE WHEN due IS NOT NULL THEN due * ${DAY_MS} ELSE NULL END
   WHERE state IS NULL AND (due IS NULL OR due < 1000000000)`,
];

const PUT_CARD = "INSERT OR REPLACE INTO cards (word, direction, s, d, due, last, reps, lapses, state, steps, elapsed, scheduled)"
               + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const DEL_CARD = "DELETE FROM cards WHERE word = ? AND direction = ?";
const PUT_DECK = "INSERT OR REPLACE INTO decks (id, ord, name, n, json) VALUES (?, ?, ?, ?, ?)";
const DEL_DECK = "DELETE FROM decks WHERE id = ?";
const PUT_KV = (t) => `INSERT OR REPLACE INTO ${t} (key, value) VALUES (?, ?)`;
const DEL_KV = (t) => `DELETE FROM ${t} WHERE key = ?`;
/* ON CONFLICT … DO NOTHING rather than OR IGNORE: OR IGNORE also swallows a
   CHECK or NOT NULL violation, so a bad row would vanish instead of failing
   the write. This ignores exactly one thing — a row already there. */
const PUT_LOG = "INSERT INTO review_log (word, direction, grade, day, at, s, d, due, last, reps, lapses, elapsed, source, state, steps, scheduled)"
              + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (word, direction, at) DO NOTHING";
const DEL_LOG = "DELETE FROM review_log WHERE word = ? AND direction = ? AND at = ?";
const LOG_COLS = "id, word, direction, grade, day, at, s, d, due, last, reps, lapses, elapsed, source, state, steps, scheduled";
const PUT_OP = (t) => `INSERT OR REPLACE INTO ${t} (k, id, v, at) VALUES (?, ?, ?, ?)`;

/* One statement prepared once, run for every row. */
async function each(db, sql, rows, params) {
  if (!rows.length) return;
  const st = await db.prepareAsync(sql);
  try {
    for (const r of rows) await st.executeAsync(params(r));
  } finally {
    await st.finalizeAsync();
  }
}

const cardParams = (r) =>
  [r.word, r.direction, r.s, r.d, r.due, r.last, r.reps, r.lapses, r.state, r.steps, r.elapsed, r.scheduled];
const logParams = (r) =>
  [r.word, r.direction, r.grade, r.day, r.at, r.s, r.d, r.due, r.last, r.reps, r.lapses, r.elapsed, r.source,
   r.state, r.steps, r.scheduled];

export async function sqliteRepo(db) {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  const found = await db.getFirstAsync("PRAGMA user_version");
  const have = found ? (found.user_version || 0) : 0;
  await db.execAsync(DDL);
  if (have === 1) {
    await db.withTransactionAsync(async () => {
      for (const sql of UPGRADE_2) await db.execAsync(sql);
    });
  }
  if (have < SCHEMA) await db.execAsync(`PRAGMA user_version = ${SCHEMA}`);

  const applyDiff = async (d) => {
    await each(db, PUT_CARD, d.cards.put, cardParams);
    await each(db, DEL_CARD, d.cards.del, (k) => [k.word, k.direction]);
    if (d.decks) {
      await each(db, PUT_DECK, d.decks.put, (r) => [r.id, r.ord, r.name, r.n, r.json]);
      await each(db, DEL_DECK, d.decks.del, (id) => [id]);
    }
    for (const t of ["progress", "settings"]) {
      await each(db, PUT_KV(t), Object.entries(d[t].put), (kv) => kv);
      await each(db, DEL_KV(t), d[t].del, (k) => [k]);
    }
  };
  const append = (rows) => each(db, PUT_LOG, (rows || []).map(logRow), logParams);
  const drop = (keys) => each(db, DEL_LOG, keys || [], (k) => [k.word, k.direction || "recognise", k.at]);
  /* What this save changed, as ops, into the outbox and the row clock — in
     the same transaction as the rows, so a crash between the two cannot leave
     a change the server never hears of. `at` is the save's clock. */
  const noteOps = async (ops, { outbox = true } = {}) => {
    const params = (op) => [op.k, op.id, op.v, op.at];
    if (outbox) await each(db, PUT_OP("outbox"), ops, params);
    await each(db, PUT_OP("sync_rows"), ops, params);
  };
  const kv = async (t) => {
    const o = {};
    for (const r of await db.getAllAsync(`SELECT key, value FROM ${t}`, [])) o[r.key] = JSON.parse(r.value);
    return o;
  };
  const count = async (sql) => {
    const r = await db.getFirstAsync(sql);
    return r ? (r.n || 0) : 0;
  };

  return {
    async load() {
      const v = await db.getFirstAsync("SELECT value FROM progress WHERE key = 'v'");
      if (!v) return null;
      const rows = await db.getAllAsync(
        "SELECT word, direction, s, d, due, last, reps, lapses, state, steps, elapsed, scheduled FROM cards", []);
      const decks = (await db.getAllAsync("SELECT json FROM decks ORDER BY ord, rowid", [])).map((r) => JSON.parse(r.json));
      return { cards: nestCards(rows), decks: decks, progress: await kv("progress"), settings: await kv("settings") };
    },
    /* `at` stamps the ops this write produces (the clock, unless a test says
       otherwise); a restore replaces everything, so every row is an op. */
    async replace(state, rows, at = Date.now()) {
      await db.withTransactionAsync(async () => {
        await db.execAsync("DELETE FROM cards; DELETE FROM decks; DELETE FROM progress; DELETE FROM settings;");
        const d = diff(null, state);
        await applyDiff(d);
        await append(rows);
        await noteOps(opsOf(d, rows, [], at));
      });
    },
    async apply(d, rows, drops, at = Date.now()) {
      await db.withTransactionAsync(async () => {
        await applyDiff(d);
        await append(rows);
        await drop(drops);
        await noteOps(opsOf(d, rows, drops, at));
      });
    },
    async readLog(opts) {
      const o = opts || {};
      const where = [], params = [];
      if (o.since !== undefined) { where.push("at >= ?"); params.push(o.since); }
      if (o.word !== undefined) { where.push("word = ?"); params.push(o.word); }
      const limit = o.limit !== undefined ? ` LIMIT ${o.limit | 0}` : "";
      return db.getAllAsync(`SELECT ${LOG_COLS} FROM review_log${where.length ? " WHERE " + where.join(" AND ") : ""}`
                            + ` ORDER BY at, id${limit}`, params);
    },
    async counts() {
      return {
        cards: await count("SELECT COUNT(*) AS n FROM cards"),
        decks: await count("SELECT COUNT(*) AS n FROM decks"),
        deckCards: await count("SELECT COALESCE(SUM(n), 0) AS n FROM decks"),
        log: await count("SELECT COUNT(*) AS n FROM review_log"),
        progress: await count("SELECT COUNT(*) AS n FROM progress"),
        settings: await count("SELECT COUNT(*) AS n FROM settings"),
        outbox: await count("SELECT COUNT(*) AS n FROM outbox"),
      };
    },
    async getMeta(k) {
      const r = await db.getFirstAsync("SELECT value FROM meta WHERE key = ?", [k]);
      return r ? r.value : null;
    },
    async setMeta(k, v) { await db.runAsync(PUT_KV("meta"), [k, String(v)]); },
    async delMeta(k) { await db.runAsync(DEL_KV("meta"), [k]); },

    /* ------------------------------------------------------------- sync */

    /* The ops not yet pushed, oldest first, at most `limit`. */
    async readOutbox(limit) {
      const lim = limit !== undefined ? ` LIMIT ${limit | 0}` : "";
      return db.getAllAsync(`SELECT k, id, v, at FROM outbox ORDER BY at, rowid${lim}`, []);
    },
    /* Ops into the outbox as this device's own assertions — the whole store
       when a profile is first linked (core/syncclient.js). */
    async queueOutbox(ops) {
      await db.withTransactionAsync(async () => { await noteOps(ops || []); });
    },
    /* Pushed: each named op leaves the outbox *only if it is still the same
       op* — a row changed again while the push was in flight stays, with its
       newer change, for the next push. */
    async clearOutbox(ops) {
      if (!ops) { await db.execAsync("DELETE FROM outbox"); return; }
      await each(db, "DELETE FROM outbox WHERE k = ? AND id = ? AND at = ?", ops, (op) => [op.k, op.id, op.at]);
    },
    /* The whole state as ops, for a first push: every row this store holds,
       stamped as the row clock knows it, or `at` where it never recorded one
       (a profile that lived here before sync did). */
    async allOps(at) {
      const known = new Map();
      for (const r of await db.getAllAsync("SELECT k, id, at FROM sync_rows", [])) known.set(r.k + "\u0001" + r.id, r.at);
      const stamp = (op) => Object.assign({}, op, { at: known.get(op.k + "\u0001" + op.id) || at });
      const out = [];
      const cards = await db.getAllAsync(
        "SELECT word, direction, s, d, due, last, reps, lapses, state, steps, elapsed, scheduled FROM cards", []);
      const decks = await db.getAllAsync("SELECT id, ord, name, n, json FROM decks ORDER BY ord, rowid", []);
      const d = { cards: { put: cards, del: [] }, decks: { put: decks, del: [] },
                  progress: { put: {}, del: [] }, settings: { put: {}, del: [] } };
      for (const t of ["progress", "settings"]) {
        for (const r of await db.getAllAsync(`SELECT key, value FROM ${t}`, [])) d[t].put[r.key] = r.value;
      }
      for (const op of opsOf(d, [], [], at)) out.push(stamp(op));
      for (const r of await db.getAllAsync(`SELECT ${LOG_COLS} FROM review_log ORDER BY at, id`, [])) {
        const { id, ...row } = r;
        out.push(stamp(opsOf(null, [row], [], at)[0]));
      }
      return out;
    },
    /* Ops pulled from the server, applied where they are newer than what is
       held (core/sync.js `newer`), and never into the outbox. Returns the ops
       that were applied — what the caller folds into its memory with
       `applyOps` — in one transaction with the rows. */
    async applyOps(ops) {
      const taken = [];
      await db.withTransactionAsync(async () => {
        for (const op of ops || []) {
          const have = await db.getFirstAsync("SELECT v, at FROM sync_rows WHERE k = ? AND id = ?", [op.k, op.id]);
          if (newer(op, have || null)) taken.push(op);
        }
        const d = { cards: { put: [], del: [] }, decks: { put: [], del: [] },
                    progress: { put: {}, del: [] }, settings: { put: {}, del: [] } };
        for (const op of taken) {
          if (op.k === "card") {
            const { word, direction } = parseId("card", op.id);
            if (op.v === null) d.cards.del.push({ word, direction });
            else d.cards.put.push(Object.assign({ word, direction }, cardRowOf(JSON.parse(op.v))));
          } else if (op.k === "kv") {
            const { table, key } = parseId("kv", op.id);
            if (table !== "progress" && table !== "settings") continue;
            if (op.v === null) d[table].del.push(key);
            else d[table].put[key] = op.v;
          } else if (op.k === "deck") {
            if (op.v === null) d.decks.del.push(op.id);
            else {
              const { ord, json } = JSON.parse(op.v);
              const deck = JSON.parse(json);
              d.decks.put.push({ id: op.id, ord, name: deck.name || "", n: (deck.cards || []).length, json });
            }
          }
        }
        if (!d.decks.put.length && !d.decks.del.length) d.decks = null;
        await applyDiff(d);
        const { rows, drops } = logOf(taken);
        await append(rows);
        await drop(drops);
        await noteOps(taken, { outbox: false });
      });
      return taken;
    },
    async close() { await db.closeAsync(); },
  };
}
