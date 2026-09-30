/* The counter counts the day's pile, not the chunk (the owner, 2026-09-30:
   *"Still says 157 due but 20 cards… the user should have the option to
   review all due cards til they are caught up"*). The pile was always dealt
   to the end, twenty at a time; the counter read 1/20 and said otherwise. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { L } from "../src/data";

const DAY = 86400000;
const due = () => ({ recognise: { state: 2, s: 3, d: 5, steps: 0, reps: 3, lapses: 0,
                                  lastAt: Date.now() - 4 * DAY, dueAt: Date.now() - DAY } });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

it("counts every card due today, and runs on past the first twenty", async () => {
  const words = L.slice(0, 25).map((w) => w.b);
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "teddy", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: Object.fromEntries(words.map((w) => [w, due()])), trouble: {}, pinned: [],
    sets: ["__path__"], drills: {}, unit: {}, watched: {}, speech: { attempts: [], tagCounts: {} },
    streak: 0, flash: ["recognise"], newPerDay: 0, cardKinds: ["word"],
  }));
  await render(<SessionProvider><Study /></SessionProvider>);
  expect(await screen.findByTestId("progress")).toHaveTextContent("1/25");
  for (let k = 0; k < 20; k++) {
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("grade-3")); });
  }
  // The second chunk follows by itself and the count goes on from 21.
  expect(await screen.findByTestId("progress")).toHaveTextContent(/^21\/2\d$/);
});
