/* The save layer keeps the learner's month (P9.7, the engineering review):
   a row that cannot be read is set aside and never overwritten; decks live in
   their own rows so a large import cannot push the profile row past Android's
   cursor window; a loaded profile is not re-saved on the way in.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession, ERRORS } from "../src/session";
import { flushState, loadState, saveState, DECK_CHUNK } from "../src/store";
import { SCHEMA_VERSION } from "@core/state";

function Probe() {
  const { st, update, error, clearError } = useSession();
  return (
    <>
      <Text testID="xp">{String(st.xp)}</Text>
      <Text testID="decks">{String((st.decks || []).reduce((a, d) => a + d.cards.length, 0))}</Text>
      {error ? <Text testID="error">{error.text}</Text> : null}
      <Text testID="bump" onPress={() => update((p) => ({ ...p, xp: (p.xp || 0) + 1 }))}>bump</Text>
      <Text testID="dismiss" onPress={clearError}>dismiss</Text>
    </>
  );
}

const accounts = { list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" };

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

describe("the save layer", () => {
  it("keeps an unreadable row aside and writes nothing until the learner acts", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", "{not json");
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByTestId("error")).toHaveTextContent(ERRORS.unreadable);
    await flushState();
    // Untouched, and a copy set aside.
    expect(await AsyncStorage.getItem("rb.state.p1")).toBe("{not json");
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.startsWith("rb.state.p1.bad-"))).toBe(true);
    // Only a change the learner makes is written, and it clears the banner.
    await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
    expect(screen.queryByTestId("error")).toBeNull();
    await flushState();
    expect(JSON.parse(await AsyncStorage.getItem("rb.state.p1")).xp).toBe(1);
  });

  it("does not re-save a profile it only loaded", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    const row = JSON.stringify({ v: 6, xp: 7, day: 99999, streak: 3 });
    await AsyncStorage.setItem("rb.state.p1", row);
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByTestId("xp")).toHaveTextContent("7");
    await flushState();
    // The streak moved on (a new day), which is the one write a load earns.
    const saved = JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
    expect(saved.xp).toBe(7);
    expect(saved.streak).toBe(1);
  });

  it("stores imported decks in their own rows, in chunks, and reads them back", async () => {
    const cards = Array.from({ length: DECK_CHUNK + 5 }, (_, k) => ({ ru: `слово${k}`, en: `word ${k}` }));
    const state = { v: 6, xp: 0, decks: [{ id: "k1", name: "Big", cards }] };
    saveState("p1", state);
    await flushState();
    const row = JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
    expect(row.decks).toBeUndefined();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith("rb.deck.p1.k1.")).length).toBe(2);
    const { state: back, bad } = await loadState("p1");
    expect(bad).toBeNull();
    expect(back.decks[0].cards.length).toBe(DECK_CHUNK + 5);
    expect(back.decks[0].cards[DECK_CHUNK].ru).toBe(`слово${DECK_CHUNK}`);
    // A deck removed is gone from storage too.
    saveState("p1", { ...state, decks: [] });
    await flushState();
    expect((await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("rb.deck.")).length).toBe(0);
  });

  it("still reads a profile saved with its decks inline", async () => {
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
      v: 6, decks: [{ id: "k0", name: "Old", cards: [{ ru: "да", en: "yes" }] }] }));
    const { state } = await loadState("p1");
    expect(state.decks[0].cards[0].ru).toBe("да");
  });
});

/* Every schema a real profile could be sitting at, through the save layer that
 * actually loads it (ROADMAP P12.9: this file migrated only v6, so v1 to v5 had
 * no fixture here at all).
 *
 * core.test.mjs proves `migrate` in isolation. What it cannot see is this path:
 * a row on disk, `normalise` deciding which version it is, the result handed to
 * a screen — and the rule that a profile only loaded is never re-saved, which
 * means a migration that drops something drops it the moment anything else is
 * written. The learner's month is the thing at stake (rule 20.4), so the
 * assertion is the same for every version: the words they have studied are
 * still there afterwards.
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
      const { state, error } = await loadState("p1");

      expect(error).toBeFalsy();
      expect(state.v).toBe(SCHEMA_VERSION);
      // The month itself: a studied word is still studied, whatever shape it
      // was stored in. v1 has no stability to carry, but it keeps the history.
      expect(state.seen["книга"]).toBeTruthy();
      expect(state.seen["книга"].reps).toBe(4);
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
    });
  }

  /* Loading must not write. If a migration is wrong, an unwritten row is a row
     that can still be recovered from the phone; a re-saved one is not. */
  it("does not write the migrated row back on the way in", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify(rows[1]));
    await loadState("p1");
    await flushState();
    expect(JSON.parse(await AsyncStorage.getItem("rb.state.p1")).v).toBe(1);
  });
});
