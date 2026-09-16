/* The repository on real SQL.
 *
 * jest replaces src/db with the in-memory store for every other suite; this
 * one runs src/sqlite.js — the statements the phone runs — on Node's own
 * SQLite (node:sqlite, in Node since 22.5; no package), behind the slice of
 * expo-sqlite's async API the adapter uses. So a wrong column, a missing
 * index, a transaction that does not roll back, fail here rather than on the
 * emulator. */

import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

import { sqliteRepo, SCHEMA } from "../src/sqlite";
import { openRepo, dbName } from "../src/db";
import { split, merge, diff } from "@core/repo";
import { applyGrade, reviewRows, isLegacyCard, normaliseSeen, fromLegacy, DAY, REVIEW } from "@core/scheduler";

jest.unmock("../src/db");

/* expo-sqlite's shape on node:sqlite. Params arrive as an array, as the
   adapter always passes them. */
function expoLike(file = ":memory:") {
  const db = new DatabaseSync(file);
  const bind = (p) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, params) {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowid };
    },
    async getAllAsync(sql, params) { return db.prepare(sql).all(...bind(params)); },
    async getFirstAsync(sql, params) {
      const r = db.prepare(sql).get(...bind(params));
      return r === undefined ? null : r;
    },
    async prepareAsync(sql) {
      const s = db.prepare(sql);
      return { async executeAsync(params) { return s.run(...bind(params)); }, async finalizeAsync() {} };
    },
    async withTransactionAsync(fn) {
      db.exec("BEGIN");
      try { await fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    async closeAsync() { db.close(); },
    raw: db,
  };
}

const T0 = 20700 * DAY + 12 * 3600000;
const bigDeck = () => Array.from({ length: 4005 }, (_, k) => ({ ru: `слово${k}`, en: `word ${k}` }));
const card = (over) => Object.assign({ dueAt: T0 + 10 * DAY, lastAt: T0, s: 5, d: 4.2, state: REVIEW, steps: 0,
                                       reps: 2, lapses: 0, elapsed: 0, scheduled: 10 }, over);

/* A v7 profile with every kind of row: cards in three directions, with and
   without a last review, two decks, settings, progress — and a key this
   build has never heard of. */
const fixture = () => ({
  v: 7, dev: true, theme: "auto", talkLevel: null,
  xp: 42, streak: 3, day: 20700, sets: [], pinned: ["дом"], trouble: { стол: 2 },
  unit: { core1: { lessons: { 0: { v: true, q: 90 } } } }, drills: {}, recent: [],
  speech: { attempts: [], tagCounts: {} }, watched: {}, mined: {},
  seen: {
    книга: { recognise: card(), produce: card({ dueAt: T0 + 2 * DAY, s: 2, d: 6, reps: 3, lapses: 1, scheduled: 3 }) },
    да: { recognise: card({ s: 0, d: 0, state: 0, reps: 4, scheduled: 0 }) },   // as the v1 migration leaves a card
    нет: { listen: { dueAt: T0 + 3 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 1, lapses: 0, elapsed: 0, scheduled: 0 } },  // no `lastAt` at all
  },
  decks: [{ id: "k1", name: "Big", cards: bigDeck() }, { id: "k2", name: "Small", cards: [{ ru: "да", en: "yes" }] }],
  whatever: { future: true },
});

describe("the schema", () => {
  it("is created in WAL mode and stamped with its version", async () => {
    const file = join(tmpdir(), `bridges-test-${process.pid}-${Date.now()}.db`);
    const db = expoLike(file);
    try {
      const repo = await sqliteRepo(db);
      expect(db.raw.prepare("PRAGMA journal_mode").get().journal_mode).toBe("wal");
      expect(db.raw.prepare("PRAGMA user_version").get().user_version).toBe(SCHEMA);
      const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
      expect(tables).toEqual(["cards", "decks", "meta", "progress", "review_log", "settings"]);
      // Opening again is harmless: every statement is IF NOT EXISTS.
      await sqliteRepo(db);
      expect(await repo.load()).toBeNull();
      await repo.close();
    } finally {
      for (const s of ["", "-wal", "-shm"]) rmSync(file + s, { force: true });
    }
  });

  /* A file Phase 1 wrote: one blended card per word, `direction = 'both'`,
     day numbers in `due` and `last`, and none of the scheduler's columns.
     Opening it under Phase 2 adds the columns and renames the direction; the
     day numbers are converted where every old card is (normaliseSeen). */
  it("brings a Phase 1 file forward: columns added, the blended card is recognise", async () => {
    const db = expoLike();
    db.raw.exec(`
      CREATE TABLE cards (word TEXT NOT NULL, direction TEXT NOT NULL DEFAULT 'both', s REAL, d REAL, due INTEGER, last INTEGER,
        reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (word, direction));
      CREATE TABLE review_log (id INTEGER PRIMARY KEY, word TEXT NOT NULL, direction TEXT NOT NULL DEFAULT 'both',
        grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4), day INTEGER NOT NULL, at INTEGER NOT NULL,
        s REAL, d REAL, due INTEGER, last INTEGER, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
        elapsed INTEGER, source TEXT, UNIQUE (word, direction, at));
      CREATE TABLE decks (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE progress (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO cards (word, direction, s, d, due, last, reps, lapses) VALUES ('книга', 'both', 5, 4.2, 20710, 20700, 2, 0);
      INSERT INTO cards (word, direction, s, d, due, last, reps, lapses) VALUES ('да', 'both', 0, 0, 0, 0, 4, 0);
      INSERT INTO review_log (word, direction, grade, day, at, s, d, due, last, reps, lapses, elapsed, source)
        VALUES ('книга', 'both', 3, 20705, 1700000000000, 5, 4.2, 20710, 20700, 2, 0, 5, 'study');
      INSERT INTO progress (key, value) VALUES ('v', '7'), ('xp', '12');
      PRAGMA user_version = 1;
    `);
    const repo = await sqliteRepo(db);
    expect(db.raw.prepare("PRAGMA user_version").get().user_version).toBe(2);
    const cols = db.raw.prepare("PRAGMA table_info(cards)").all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["state", "steps", "elapsed", "scheduled"]));
    expect(db.raw.prepare("SELECT direction FROM cards").all().map((r) => r.direction)).toEqual(["recognise", "recognise"]);
    expect(db.raw.prepare("SELECT direction FROM review_log").all()[0].direction).toBe("recognise");
    const rows = await repo.load();
    // Converted in SQL, and by exactly the rule a blob's card is converted by.
    expect(isLegacyCard(rows.cards["книга"].recognise)).toBe(false);
    expect(rows.cards["книга"].recognise).toEqual(fromLegacy({ s: 5, d: 4.2, due: 20710, last: 20700, reps: 2, lapses: 0 }));
    expect(rows.cards["да"].recognise).toEqual(fromLegacy({ s: 0, d: 0, due: 0, last: 0, reps: 4, lapses: 0 }));
    expect(normaliseSeen(rows.cards)).toBe(rows.cards);
    expect((await repo.readLog())[0]).toMatchObject({ word: "книга", direction: "recognise", grade: 3, state: REVIEW,
                                                     due: 20710 * DAY, last: 20700 * DAY, scheduled: 10 });
  });
});

describe("a profile in rows", () => {
  it("goes in whole and comes back exactly, unknown keys included", async () => {
    const repo = await sqliteRepo(expoLike());
    const state = fixture();
    await repo.replace(state, []);
    const c = await repo.counts();
    expect(c).toEqual({ cards: 4, decks: 2, deckCards: 4006, log: 0,
                        progress: Object.keys(split(state).progress).length, settings: 3 });
    const back = merge(await repo.load());
    expect(back).toEqual(state);
    // A card that never had `lastAt` does not grow one: the scheduler reads an
    // absent `lastAt` as "never reviewed", and a null there would be a review
    // long ago.
    expect("lastAt" in back.seen["нет"].listen).toBe(false);
    expect(back.decks.map((d) => d.id)).toEqual(["k1", "k2"]);
    expect(back.decks[0].cards.length).toBe(4005);
  });

  it("writes one review as one card row and one log row, together", async () => {
    const repo = await sqliteRepo(expoLike());
    const prev = fixture();
    await repo.replace(prev, []);
    const now = T0 + 12 * DAY;
    const rows = reviewRows(prev.seen, [{ word: "книга", direction: "recognise", grade: 3 }], now, "study", { fuzz: false });
    const r = applyGrade(prev.seen, prev.trouble, "книга", "recognise", 3, now, { fuzz: false });
    const next = { ...prev, seen: r.seen, trouble: r.trouble, xp: 43 };
    const d = diff(prev, next);
    expect(d.cards.put.map((x) => x.word + "/" + x.direction)).toEqual(["книга/recognise"]);
    expect(d.decks).toBeNull();
    expect(Object.keys(d.progress.put)).toEqual(["xp"]);
    await repo.apply(d, rows);

    const c = await repo.counts();
    expect(c.cards).toBe(4);
    expect(c.log).toBe(1);
    const [row] = await repo.readLog();
    // The card as it *was*, the grade, and when.
    expect(row).toMatchObject({ word: "книга", direction: "recognise", grade: 3, day: Math.floor(now / DAY), at: now,
                                s: 5, d: 4.2, due: T0 + 10 * DAY, last: T0, reps: 2, lapses: 0,
                                elapsed: 12, source: "study", state: REVIEW, steps: 0, scheduled: 10 });
    const back = merge(await repo.load());
    expect(back.seen["книга"].recognise.reps).toBe(3);
    expect(back.seen["книга"].recognise).toEqual(r.card);
    expect(back.seen["книга"].produce).toEqual(prev.seen["книга"].produce);
    expect(back.xp).toBe(43);
    expect(back.decks.length).toBe(2);

    // The same row offered again — a retried save, a backup restored twice —
    // is not a second review.
    await repo.apply(diff(next, next), rows);
    await repo.replace(next, rows);
    expect((await repo.counts()).log).toBe(1);

    // An undone review: the row is dropped in the same write that puts the
    // card back.
    const undone = { ...next, seen: prev.seen };
    await repo.apply(diff(next, undone), [], [{ word: "книга", direction: "recognise", at: now }]);
    expect((await repo.counts()).log).toBe(0);
    expect(merge(await repo.load()).seen["книга"].recognise).toEqual(prev.seen["книга"].recognise);
  });

  it("is all or nothing: a bad row rolls the whole save back", async () => {
    const repo = await sqliteRepo(expoLike());
    const prev = fixture();
    await repo.replace(prev, []);
    const next = { ...prev, seen: { ...prev.seen, стул: { produce: card({ s: 1 }) } }, xp: 99 };
    const bad = [{ word: "стул", direction: "produce", grade: 9, day: 1, at: 1 }];      // grade outside 1–4
    await expect(repo.apply(diff(prev, next), bad)).rejects.toThrow();
    const c = await repo.counts();
    expect(c.cards).toBe(4);
    expect(c.log).toBe(0);
    expect(merge(await repo.load()).xp).toBe(42);
  });

  it("removes a deck that went and leaves the one that stayed", async () => {
    const repo = await sqliteRepo(expoLike());
    const prev = fixture();
    await repo.replace(prev, []);
    const next = { ...prev, decks: [prev.decks[1]] };
    const d = diff(prev, next);
    expect(d.decks).toEqual({ put: [], del: ["k1"] });
    await repo.apply(d, []);
    expect((await repo.counts()).decks).toBe(1);
    expect(merge(await repo.load()).decks[0].id).toBe("k2");
  });

  it("reads the log oldest first, from a moment on, for one word, and keeps store notes apart from the learner's", async () => {
    const repo = await sqliteRepo(expoLike());
    await repo.replace(fixture(), [
      { word: "b", direction: "produce", grade: 2, day: 2, at: 200 }, { word: "a", grade: 3, day: 1, at: 100 },
      { word: "c", direction: "listen", grade: 1, day: 3, at: 300 },
    ]);
    expect((await repo.readLog()).map((r) => r.word)).toEqual(["a", "b", "c"]);
    expect((await repo.readLog({ since: 200 })).map((r) => r.word)).toEqual(["b", "c"]);
    expect((await repo.readLog({ limit: 1 })).map((r) => r.word)).toEqual(["a"]);
    expect((await repo.readLog({ word: "b" })).map((r) => r.direction)).toEqual(["produce"]);
    expect((await repo.readLog())[0].direction).toBe("recognise");
    expect(await repo.getMeta("migrated")).toBeNull();
    await repo.setMeta("migrated", "{\"at\":1}");
    expect(await repo.getMeta("migrated")).toBe("{\"at\":1}");
    expect("migrated" in merge(await repo.load())).toBe(false);
  });
});

describe("a file that will not open", () => {
  it("is set aside, never deleted, and a fresh one takes its place", async () => {
    const aside = [];
    let opens = 0;
    const open = async (name) => {
      expect(name).toBe(dbName("p1"));
      opens += 1;
      if (opens === 1) throw new Error("database disk image is malformed");
      return expoLike();
    };
    const { repo, recovered } = await openRepo("p1", { open, setAside: async (id) => aside.push(id) });
    expect(recovered).toMatch(/malformed/);
    expect(aside).toEqual(["p1"]);
    expect(opens).toBe(2);
    await repo.replace(fixture(), []);
    expect((await repo.counts()).cards).toBe(4);
  });

  it("opens cleanly when nothing is wrong", async () => {
    const aside = [];
    const { repo, recovered } = await openRepo("p2", { open: async () => expoLike(), setAside: async (id) => aside.push(id) });
    expect(recovered).toBeNull();
    expect(aside).toEqual([]);
    expect(await repo.load()).toBeNull();
  });
});
