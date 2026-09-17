/* The pre-database JSON row retires itself (ROADMAP 13.20).
 *
 * Phase 1 moved the learner's state into SQLite and left `rb.state.<id>` alone
 * on purpose — rule 20.4, the copy that survives a wrong migration. Two copies
 * where only one is written is a thing that rots, so after a week of the
 * database actually answering on the learner's own phone, the row goes.
 *
 * Every test here is about *not* dropping it too early, because that is the
 * only way this feature can do harm.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadState, flushState, resetStore, BLOB_KEEP_MS } from "../src/store";

const DAY = 86400000;
const profile = (over) => JSON.stringify({
  v: 6, seen: { "я": { recognise: { s: 3, d: 5, dueAt: 1, lastAt: 1, state: 2, steps: 0, reps: 2, lapses: 0 } } },
  trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, xp: 7, streak: 2, ...over,
});

const keysFor = async (id) => (await AsyncStorage.getAllKeys())
  .filter((k) => k.startsWith(`rb.state.${id}`) || k.startsWith(`rb.decks.${id}`)
                 || k.startsWith(`rb.deck.${id}.`));

/* Seed a profile that has already been migrated, with the stamp `days` old. */
async function migratedDaysAgo(id, days) {
  await AsyncStorage.setItem(`rb.state.${id}`, profile());
  await loadState(id);                       // migrates, keeps the row
  await flushState();
  await ageStamp(id, days);
  resetStore();
}

/* Wind the migration stamp back, which is the only way to test a week without
   waiting one. */
async function ageStamp(id, days) {
  const db = global.__db.repos.get(id);
  const stamp = JSON.parse(await db.getMeta("migrated"));
  await db.setMeta("migrated", JSON.stringify({ ...stamp, at: Date.now() - days * DAY }));
}

beforeEach(async () => { await flushState(); resetStore(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

describe("retiring the row the database replaced", () => {
  it("keeps it the day after the move", async () => {
    await migratedDaysAgo("p1", 0);
    expect(await keysFor("p1")).toHaveLength(1);
    await loadState("p1");                   // the database answers now
    await flushState();
    expect(await keysFor("p1")).toHaveLength(1);
  });

  it("…and the day before the week is up", async () => {
    await migratedDaysAgo("p2", 6);
    await loadState("p2");
    await flushState();
    expect(await keysFor("p2")).toHaveLength(1);
  });

  it("drops it once the database has carried a week", async () => {
    await migratedDaysAgo("p3", 8);
    const before = await loadState("p3");
    expect(before.state.xp).toBe(7);          // the state still came back whole
    await flushState();
    expect(await keysFor("p3")).toHaveLength(0);
  });

  it("takes the chunked deck rows with it", async () => {
    await AsyncStorage.setItem("rb.decks.p4", JSON.stringify([]));
    await AsyncStorage.setItem("rb.deck.p4.d1.0", "[]");
    await AsyncStorage.setItem("rb.deck.p4.d1.1", "[]");
    await migratedDaysAgo("p4", 9);
    await loadState("p4");
    await flushState();
    expect(await keysFor("p4")).toHaveLength(0);
  });

  /* The case this delay exists for. A migration that produced an empty
     database and a week of silence is exactly when the row is the only copy
     left, and dropping it then would be the bug. */
  it("never drops it when the database is carrying nothing", async () => {
    await AsyncStorage.setItem("rb.state.p5", profile({ seen: {} }));
    await loadState("p5");
    await flushState();
    await ageStamp("p5", 30);
    resetStore();
    await loadState("p5");
    await flushState();
    expect(await keysFor("p5")).toHaveLength(1);
  });

  /* A profile created on this build was never migrated and has no stamp, so
     there is nothing of ours to drop — and an unrelated `rb.state.*` row must
     not be swept up by a tidy-up it was never part of. */
  it("leaves a profile that was never migrated alone", async () => {
    await loadState("p6");                   // fresh: straight into the database
    await flushState();
    await AsyncStorage.setItem("rb.state.p6", "{}");
    resetStore();
    await loadState("p6");
    await flushState();
    expect(await keysFor("p6")).toHaveLength(1);
  });

  it("agrees with itself about how long a week is", () => {
    expect(BLOB_KEEP_MS).toBe(7 * DAY);
  });
});
