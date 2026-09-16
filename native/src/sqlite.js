/* The repository contract (core/repo.js) on expo-sqlite.
 *
 * One file per profile, WAL, five tables: cards, review_log, decks, progress,
 * settings — and meta, for notes about the store itself. It takes an open
 * database rather than a name so the same code runs in jest on Node's own
 * SQLite (sqlite.test.js): the SQL here is what is tested, not a fake of it.
 * db.js is the one place that opens a file.
 *
 * A write is one transaction, which is the reason for the move off the JSON
 * row: the card a grade changed and the log row that grade left land together
 * or not at all. Cards and keys are inserted with OR REPLACE and log rows skip
 * a key already present, so a save retried after a failure, or a backup
 * restored twice, adds nothing twice.
 */

import { rowCard, nestCards, diff, logRow } from "@core/repo";

/* The schema version, in PRAGMA user_version. A later shape adds its ALTERs
   below the check, gated on the number found: one place, forward only, like
   core/state.js.

   1  Phase 1: the five tables, one card per word (`direction = 'both'`).
   2  Phase 2: the scheduler's columns on cards and the log, and a card per
      direction — the blended card becomes `recognise` (core/scheduler.js). */
export const SCHEMA = 2;

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
    await each(db, PUT_CARD, d.cards.put, (r) =>
      [r.word, r.direction, r.s, r.d, r.due, r.last, r.reps, r.lapses, r.state, r.steps, r.elapsed, r.scheduled]);
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
  const append = (rows) => each(db, PUT_LOG, (rows || []).map(logRow), (r) =>
    [r.word, r.direction, r.grade, r.day, r.at, r.s, r.d, r.due, r.last, r.reps, r.lapses, r.elapsed, r.source,
     r.state, r.steps, r.scheduled]);
  const drop = (keys) => each(db, DEL_LOG, keys || [], (k) => [k.word, k.direction || "recognise", k.at]);
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
    async replace(state, rows) {
      await db.withTransactionAsync(async () => {
        await db.execAsync("DELETE FROM cards; DELETE FROM decks; DELETE FROM progress; DELETE FROM settings;");
        await applyDiff(diff(null, state));
        await append(rows);
      });
    },
    async apply(d, rows, drops) {
      await db.withTransactionAsync(async () => {
        await applyDiff(d);
        await append(rows);
        await drop(drops);
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
      };
    },
    async getMeta(k) {
      const r = await db.getFirstAsync("SELECT value FROM meta WHERE key = ?", [k]);
      return r ? r.value : null;
    },
    async setMeta(k, v) { await db.runAsync(PUT_KV("meta"), [k, String(v)]); },
    async close() { await db.closeAsync(); },
  };
}
