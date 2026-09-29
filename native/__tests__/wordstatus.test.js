/* The dictionary entry, reorganised (the owner, 2026-09-28): the tables are
 * sections that open and close rather than grids stacked whole, and the entry
 * says where the learner stands with the word (CLAUDE.md §30bb). */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import WordScreen from "../src/screens/Word";
import { L } from "../src/data";
import { REVIEW } from "@core/scheduler";

const DAY = 86400000, now = Date.now();
const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), setParams: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};
const card = (s) => ({ recognise: { dueAt: now + DAY, lastAt: now - DAY, s, d: 5, state: REVIEW,
                                    steps: 0, reps: 6, lapses: 0 } });

async function open(word, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  await render(<SessionProvider><WordScreen route={{ params: { word } }} navigation={nav} /></SessionProvider>);
  return screen.findByTestId("word-status");
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

// The commonest verb with three or more tables, so there is something closed.
const VERB = L.find((w) => w.p === "verb" && (w.t || []).length >= 3).b;

describe("the entry", () => {
  it("opens the first table and leaves the rest a tap away", async () => {
    await open(VERB);
    expect(screen.getByTestId("word-tables-0")).toBeTruthy();
    expect(screen.queryByTestId("word-tables-1")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("word-tables-head-1")); });
    expect(screen.getByTestId("word-tables-1")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("word-tables-head-0")); });
    expect(screen.queryByTestId("word-tables-0")).toBeNull();
  });

  it("says a word has not been studied, and draws no score for it", async () => {
    await open(VERB);
    expect(screen.getByText("Not studied yet")).toBeTruthy();
    expect(screen.queryByTestId("familiarity")).toBeNull();
  });

  /* A month held: mastered for a word as common as this one. */
  it("shows the score and a word for it once the word is studied", async () => {
    await open(VERB, { seen: { [VERB]: card(30) } });
    expect(screen.getByTestId("familiarity")).toBeTruthy();
    expect(screen.getByText("Mastered")).toBeTruthy();
  });
});
