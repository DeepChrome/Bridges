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
import { split, merge, diff, DIRECTION } from "@core/repo";
import { applyGrade, reviewRows } from "@core/fsrs";

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

const bigDeck = () => Array.from({ length: 4005 }, (_, k) => ({ ru: `слово${k}`, en: `word ${k}` }));

/* A v7 profile with every kind of row: cards with and without a memory, two
   decks, settings, progress — and a key this build has never heard of. */
const fixture = () => ({
  v: 7, dev: true, theme: "auto", talkLevel: null,
  xp: 42, streak: 3, day: 20700, sets: [], pinned: ["дом"], trouble: { стол: 2 },
  unit: { core1: { lessons: { 0: { v: true, q: 90 } } } }, drills: {}, recent: [],
  speech: { attempts: [], tagCounts: {} }, watched: {}, mined: {},
  seen: {
    книга: { s: 5, d: 4.2, due: 20710, last: 20700, reps: 2, lapses: 0 },
    да: { s: 0, d: 0, due: 0, last: 0, reps: 4, lapses: 0 },        // as the v1 migration leaves a card
    нет: { s: 1, d: 5, due: 3, reps: 1, lapses: 0 },                  // no `last` at all
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
});

describe("a profile in rows", () => {
  it("goes in whole and comes back exactly, unknown keys included", async () => {
    const repo = await sqliteRepo(expoLike());
    const state = fixture();
    await repo.replace(state, []);
    const c = await repo.counts();
    expect(c).toEqual({ cards: 3, decks: 2, deckCards: 4006, log: 0,
                        progress: Object.keys(split(state).progress).length, settings: 3 });
    const back = merge(await repo.load());
    expect(back).toEqual(state);
    // A card that never had `last` does not grow one: fsrsReview reads
    // `card.last === undefined` and a null there would be a review after
    // `now` days.
    expect("last" in back.seen["нет"]).toBe(false);
    expect(back.decks.map((d) => d.id)).toEqual(["k1", "k2"]);
    expect(back.decks[0].cards.length).toBe(4005);
  });

  it("writes one review as one card row and one log row, together", async () => {
    const repo = await sqliteRepo(expoLike());
    const prev = fixture();
    await repo.replace(prev, []);
    const now = 20705, at = 1_760_000_000_000;
    const rows = reviewRows(prev.seen, [{ word: "книга", grade: 3 }], now, at, "study");
    const r = applyGrade(prev.seen, prev.trouble, "книга", 3, now);
    const next = { ...prev, seen: r.seen, trouble: r.trouble, xp: 43 };
    const d = diff(prev, next);
    expect(d.cards.put.map((x) => x.word)).toEqual(["книга"]);
    expect(d.decks).toBeNull();
    expect(Object.keys(d.progress.put)).toEqual(["xp"]);
    await repo.apply(d, rows);

    const c = await repo.counts();
    expect(c.cards).toBe(3);
    expect(c.log).toBe(1);
    const [row] = await repo.readLog();
    // The card as it *was*, the grade, and when.
    expect(row).toMatchObject({ word: "книга", direction: DIRECTION, grade: 3, day: now, at,
                                s: 5, d: 4.2, due: 20710, last: 20700, reps: 2, lapses: 0,
                                elapsed: 5, source: "study" });
    const back = merge(await repo.load());
    expect(back.seen["книга"].reps).toBe(3);
    expect(back.seen["книга"]).toEqual(r.card);
    expect(back.xp).toBe(43);
    expect(back.decks.length).toBe(2);

    // The same row offered again — a retried save, a backup restored twice —
    // is not a second review.
    await repo.apply(diff(next, next), rows);
    await repo.replace(next, rows);
    expect((await repo.counts()).log).toBe(1);
  });

  it("is all or nothing: a bad row rolls the whole save back", async () => {
    const repo = await sqliteRepo(expoLike());
    const prev = fixture();
    await repo.replace(prev, []);
    const next = { ...prev, seen: { ...prev.seen, стул: { s: 1, d: 5, due: 1, last: 0, reps: 1, lapses: 0 } }, xp: 99 };
    const bad = [{ word: "стул", grade: 9, day: 1, at: 1 }];      // grade outside 1–4: the CHECK refuses it
    await expect(repo.apply(diff(prev, next), bad)).rejects.toThrow();
    const c = await repo.counts();
    expect(c.cards).toBe(3);
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

  it("reads the log oldest first, from a moment on, and keeps store notes apart from the learner's", async () => {
    const repo = await sqliteRepo(expoLike());
    await repo.replace(fixture(), [
      { word: "b", grade: 2, day: 2, at: 200 }, { word: "a", grade: 3, day: 1, at: 100 },
      { word: "c", grade: 1, day: 3, at: 300 },
    ]);
    expect((await repo.readLog()).map((r) => r.word)).toEqual(["a", "b", "c"]);
    expect((await repo.readLog({ since: 200 })).map((r) => r.word)).toEqual(["b", "c"]);
    expect((await repo.readLog({ limit: 1 })).map((r) => r.word)).toEqual(["a"]);
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
    expect((await repo.counts()).cards).toBe(3);
  });

  it("opens cleanly when nothing is wrong", async () => {
    const aside = [];
    const { repo, recovered } = await openRepo("p2", { open: async () => expoLike(), setAside: async (id) => aside.push(id) });
    expect(recovered).toBeNull();
    expect(aside).toEqual([]);
    expect(await repo.load()).toBeNull();
  });
});
