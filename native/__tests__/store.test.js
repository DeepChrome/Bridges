/* The save layer keeps the learner's month (P9.7, the engineering review;
   Phase 1 of the playbook, 2026-09-15): a row that cannot be read is set aside
   and never overwritten; a profile from before the database is moved in once
   and its row left exactly as it was; a review is a card row and a log row in
   one write; a loaded profile is not re-saved on the way in.

   The database here is the in-memory store (jest.setup.js); sqlite.test.js
   runs the real SQL. Own file, per the timeout note in screens.test.js. */

import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession, ERRORS } from "../src/session";
import { flushState, loadState, saveState } from "../src/store";
import { SCHEMA_VERSION } from "@core/state";
import { reviewRows, applyGrade, fromLegacy } from "@core/scheduler";

function Probe() {
  const { st, update, restore, error, clearError } = useSession();
  const review = () => {
    const now = Date.now();
    const rows = reviewRows(st.seen, [{ word: "книга", direction: "recognise", grade: 3 }], now, "probe");
    update((p) => {
      const r = applyGrade(p.seen, p.trouble, "книга", "recognise", 3, now);
      return { ...p, seen: r.seen, trouble: r.trouble };
    }, rows);
  };
  return (
    <>
      <Text testID="xp">{String(st.xp)}</Text>
      <Text testID="decks">{String((st.decks || []).reduce((a, d) => a + d.cards.length, 0))}</Text>
      {error ? <Text testID="error">{error.text}</Text> : null}
      <Text testID="bump" onPress={() => update((p) => ({ ...p, xp: (p.xp || 0) + 1 }))}>bump</Text>
      <Text testID="review" onPress={review}>review</Text>
      <Text testID="restore" onPress={() => restore({ ...st, xp: 500 },
        [{ word: "дом", grade: 4, day: 1, at: 1000, reps: 0, lapses: 0 }])}>restore</Text>
      <Text testID="dismiss" onPress={clearError}>dismiss</Text>
    </>
  );
}

const accounts = { list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" };
const repo = () => global.__db.repos.get("p1");
const card = { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 };

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

describe("the save layer", () => {
  it("keeps an unreadable row aside and writes nothing until the learner acts", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", "{not json");
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByTestId("error")).toHaveTextContent(ERRORS.unreadable);
    await flushState();
    // Untouched, a copy set aside, and nothing in the database.
    expect(await AsyncStorage.getItem("rb.state.p1")).toBe("{not json");
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.startsWith("rb.state.p1.bad-"))).toBe(true);
    expect(await global.__db.saved("p1")).toBeNull();
    // Only a change the learner makes is written, and it clears the banner.
    await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
    expect(screen.queryByTestId("error")).toBeNull();
    await flushState();
    expect((await global.__db.saved("p1")).xp).toBe(1);
    expect(await AsyncStorage.getItem("rb.state.p1")).toBe("{not json");
  });

  it("moves a profile from its row into the database and leaves the row as it was", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    const row = JSON.stringify({ v: 6, xp: 7, day: 99999, streak: 3, seen: { книга: card } });
    await AsyncStorage.setItem("rb.state.p1", row);
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByTestId("xp")).toHaveTextContent("7");
    await flushState();
    // The row is byte for byte what it was: it is the copy that survives.
    expect(await AsyncStorage.getItem("rb.state.p1")).toBe(row);
    const saved = await global.__db.saved("p1");
    expect(saved.xp).toBe(7);
    // The one blended card became the recognise card, on the new clock.
    expect(saved.seen["книга"]).toEqual({ recognise: fromLegacy(card) });
    // The streak moved on (a new day), which is the one write a load earns.
    expect(saved.streak).toBe(1);
    const stamp = JSON.parse(await repo().getMeta("migrated"));
    expect(stamp.cards).toBe(1);
    expect(stamp.at).toBeGreaterThan(0);
  });

  it("reads the database, not the row, once it has one", async () => {
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, xp: 7, seen: { книга: card } }));
    const first = await loadState("p1");
    expect(first.state.xp).toBe(7);
    // The row changing underneath is what an older build writing would look like.
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, xp: 99, seen: {} }));
    const again = await loadState("p1");
    expect(again.state.xp).toBe(7);
    expect(again.state.seen["книга"]).toEqual({ recognise: fromLegacy(card) });
    expect(again.bad).toBeNull();
  });

  it("reads decks out of their old chunk rows and keeps each as one row", async () => {
    const cards = Array.from({ length: 4005 }, (_, k) => ({ ru: `слово${k}`, en: `word ${k}` }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, xp: 0 }));
    await AsyncStorage.setItem("rb.decks.p1", JSON.stringify([{ id: "k1", name: "Big", chunks: 2 }]));
    await AsyncStorage.setItem("rb.deck.p1.k1.0", JSON.stringify(cards.slice(0, 4000)));
    await AsyncStorage.setItem("rb.deck.p1.k1.1", JSON.stringify(cards.slice(4000)));
    const { state, bad } = await loadState("p1");
    expect(bad).toBeNull();
    expect(state.decks[0].cards.length).toBe(4005);
    expect(state.decks[0].cards[4000].ru).toBe("слово4000");
    expect(await repo().counts()).toMatchObject({ decks: 1, deckCards: 4005 });
    // A deck removed is gone from the database too — and the old rows are
    // still not touched, since nothing writes there any more.
    saveState("p1", { ...state, decks: [] });
    await flushState();
    expect((await repo().counts()).decks).toBe(0);
    expect((await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("rb.deck.")).length).toBe(2);
  });

  it("still reads a profile saved with its decks inline", async () => {
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
      v: 6, decks: [{ id: "k0", name: "Old", cards: [{ ru: "да", en: "yes" }] }] }));
    const { state } = await loadState("p1");
    expect(state.decks[0].cards[0].ru).toBe("да");
    expect((await repo().counts()).deckCards).toBe(1);
  });

  it("writes one review as one card and one log row", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, xp: 0, seen: { книга: card } }));
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByTestId("xp");
    await act(async () => { fireEvent.press(screen.getByTestId("review")); });
    await flushState();
    const log = await global.__db.log("p1");
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ word: "книга", direction: "recognise", grade: 3, reps: 4, lapses: 1, s: 3, source: "probe" });
    expect((await global.__db.saved("p1")).seen["книга"].recognise.reps).toBe(5);
    expect((await repo().counts()).cards).toBe(1);
  });

  it("brings a restored backup's log in with it", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, xp: 1 }));
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByTestId("xp");
    await act(async () => { fireEvent.press(screen.getByTestId("restore")); });
    await flushState();
    expect((await global.__db.saved("p1")).xp).toBe(500);
    expect((await global.__db.log("p1")).map((r) => r.word)).toEqual(["дом"]);
  });

  it("starts a new profile with nothing to migrate and no complaint", async () => {
    const { state, bad, recovered } = await loadState("p1");
    expect(bad).toBeNull();
    expect(recovered).toBeNull();
    expect(state.v).toBe(SCHEMA_VERSION);
    expect(await global.__db.saved("p1")).toBeNull();
  });
});

/* Every schema a real profile could be sitting at, through the save layer that
 * actually loads it (ROADMAP P12.9: this file migrated only v6, so v1 to v5 had
 * no fixture here at all).
 *
 * core.test.mjs proves `migrate` in isolation. What it cannot see is this path:
 * a row on disk, `normalise` deciding which version it is, the result handed to
 * a screen — and now written into the database, from which the next boot reads
 * it. The learner's month is the thing at stake (rule 20.4), so the assertion
 * is the same for every version: the words they have studied are still there
 * afterwards, in the state and in the rows.
 */
describe("a profile from an older version of the app", () => {
  const rows = {
    // v1 kept Leitner counters; FSRS cannot be derived from them, so the word
    // comes back as new with its repetitions kept as history.
    1: { v: 1, xp: 12, seen: { книга: { n: 4, due: 20000 } }, unit: { core1: { lessons: { 0: 90 } } } },
    2: { v: 2, xp: 12, seen: { книга: { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 } },
         trouble: { стол: 2 }, pinned: ["дом"], unit: { core1: { lessons: { 0: 90 } } } },
    3: { v: 3, xp: 12, seen: { книга: { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 } },
         trouble: { стол: 2 }, pinned: ["дом"], unit: { core1: { lessons: { 0: 90 } } } },
    4: { v: 4, xp: 12, seen: { книга: { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 } },
         trouble: { стол: 2 }, pinned: ["дом"], unit: { core1: { lessons: { 0: { v: true, q: 90 } } } } },
    5: { v: 5, xp: 12, seen: { книга: { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 } },
         trouble: { стол: 2 }, pinned: ["дом"], speech: { attempts: [], tagCounts: { CASE: 2 } },
         unit: { core1: { lessons: { 0: { v: true, q: 90 } } } } },
    6: { v: 6, xp: 12, seen: { книга: { s: 3, d: 5, due: 20000, last: 0, reps: 4, lapses: 1 } },
         trouble: { стол: 2 }, pinned: ["дом"], speech: { attempts: [], tagCounts: { CASE: 2 } },
         watched: { abc: 3 }, decks: [], unit: { core1: { lessons: { 0: { v: true, q: 90 } } } } },
  };

  for (const [from, row] of Object.entries(rows)) {
    it(`v${from} keeps the learner's words, and arrives at the current schema`, async () => {
      await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
      await AsyncStorage.setItem("rb.state.p1", JSON.stringify(row));
      const { state, bad } = await loadState("p1");

      expect(bad).toBeNull();
      expect(state.v).toBe(SCHEMA_VERSION);
      // The month itself: a studied word is still studied, whatever shape it
      // was stored in — as the recognise card now. v1 has no stability to
      // carry, but it keeps the history.
      expect(state.seen["книга"]).toBeTruthy();
      expect(state.seen["книга"].recognise.reps).toBe(4);
      expect(state.seen["книга"].recognise.dueAt).toBeGreaterThan(1e9);
      expect(state.xp).toBe(12);
      // Every slot the app reads exists, so no screen meets an undefined.
      expect(Array.isArray(state.pinned)).toBe(true);
      expect(state.trouble && typeof state.trouble).toBe("object");
      expect(state.speech && Array.isArray(state.speech.attempts)).toBe(true);
      expect(state.watched && typeof state.watched).toBe("object");
      expect(state.mined && typeof state.mined).toBe("object");
      expect(Array.isArray(state.decks)).toBe(true);
      // A lesson that was passed is still passed, in whichever shape it was
      // written: v3 and earlier stored one number where v4 stores components.
      expect(state.unit.core1.lessons[0].q).toBe(90);
      // …and the rows say the same: one card, and the next boot reads them
      // back as exactly the state the row gave.
      expect((await repo().counts()).cards).toBe(1);
      const again = await loadState("p1");
      expect(again.state).toEqual(state);
    });
  }

  /* Loading must not write the row. If a migration is wrong, an untouched row
     is a row that can still be recovered from the phone; a re-saved one is not. */
  it("does not write the migrated row back on the way in", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    const raw = JSON.stringify(rows[1]);
    await AsyncStorage.setItem("rb.state.p1", raw);
    await loadState("p1");
    await flushState();
    expect(await AsyncStorage.getItem("rb.state.p1")).toBe(raw);
    expect(JSON.parse(await repo().getMeta("migrated")).cards).toBe(1);
  });
});
