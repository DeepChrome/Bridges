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
