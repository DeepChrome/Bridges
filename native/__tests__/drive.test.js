/* Drive mode (core/drive.js, 2026-10-15): a hands-free lesson. Pinned here:
   it plays from where the learner is, English first and the Russian after it;
   a silent carrier holds the lock screen while it runs and is let go when the
   screen is left; pause silences everything; nothing is graded. */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Drive, { driveFrom } from "../src/screens/Drive";
import { STAGES, L } from "../src/data";

const base = { v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"] };

async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(<SessionProvider><Drive /></SessionProvider>);
}

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear();
  global.__spoke = []; global.__players = []; global.__played = [];
});
afterEach(async () => { await flushState(); });

it("draws from the next lesson on a new profile, words with a recording and their meaning", () => {
  const items = driveFrom(base);
  expect(items.length).toBeGreaterThan(0);
  const first = STAGES[0].core.w.map((i) => L[i].w || L[i].b);
  expect(items.filter((x) => x.kind === "word").every((x) => first.includes(x.ru) && x.en)).toBe(true);
});

it("plays the English first, holds the lock screen, pauses everything, and lets go on leaving", async () => {
  const view = await open();
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  const en = await screen.findByTestId("drive-en");
  await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(0));
  expect(global.__spoke[0]).toBe(en.props.children);       // the prompt is the English
  const carrier = global.__players[0];
  expect(carrier.loop).toBe(true);
  expect(carrier.sounding).toBe(true);

  await act(async () => { fireEvent.press(screen.getByTestId("drive-play")); });   // pause
  expect(global.__sounding()).toEqual([]);
  expect(screen.getByTestId("drive-play").props.accessibilityLabel).toBe("Play");

  await act(async () => { view.unmount(); });
  expect(carrier.freed).toBe(true);
  // Practice, not a claim: nothing was graded.
  const saved = await global.__db.saved("p1");
  expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
});
