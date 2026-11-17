/* The developer's panel on a flashcard (src/whycard.js; the owner,
 * 2026-11-17: "a diagnostic panel that's just specific for dev mode when
 * it's deciding which flash card to show… a small little wrench icon on the
 * card before it flips"). The wrench is on the front, in developer mode
 * only, and the sheet reads the deal's own `why` off the item.
 *
 * Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { whyRows } from "../src/whycard";
import { DAY, REVIEW, dayOf } from "@core/scheduler";
import { goalSession } from "@core/queue";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: () => () => {} };
const now = Date.now();
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const held = () => ({ dueAt: now + 3 * DAY, lastAt: now - 3 * DAY, s: 4, d: 6, state: REVIEW, steps: 0, reps: 5, lapses: 1 });
const base = {
  v: 10, seen: { "город": { recognise: due() } }, trouble: {}, pinned: [], sets: ["__path__"], drills: {}, unit: {},
  watched: {}, flash: ["recognise"], newPerDay: 0, learnAhead: 20, cardKinds: ["words"],
  goal: { day: dayOf(now), owed: 5, done: 0 },
};
async function profile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  await render(<SessionProvider><Study navigation={nav} route={{ params: {} }} /></SessionProvider>);
  await global.__startStudy();
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the wrench", () => {
  it("is on the front in developer mode, and opens why the card came up", async () => {
    await profile({ dev: true });
    await screen.findByText("Show");
    await act(async () => { fireEvent.press(screen.getByTestId("why-card")); });
    expect(await screen.findByTestId("why-sheet")).toBeTruthy();
    expect(screen.getByTestId("why-word")).toHaveTextContent("город");
    expect(screen.getByText("Due by the schedule")).toBeTruthy();
    expect(screen.getByText("Stability")).toBeTruthy();
    expect(screen.getByText("Retrievability now")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });
    // Turned, the front's wrench gives way to the card's own actions.
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    expect(screen.queryByTestId("why-card")).toBeNull();
  });

  it("is not there outside developer mode", async () => {
    await profile({ dev: false });
    await screen.findByText("Show");
    expect(screen.queryByTestId("why-card")).toBeNull();
  });
});

describe("what the panel says", () => {
  it("spells out the make-up draw's priority, each part, the key and the hold", () => {
    const seen = { "дом": { recognise: held() }, "кот": { recognise: held() } };
    const sess = goalSession({ seen, words: ["дом", "кот"], now, owed: 2, rng: () => 0.5,
                               familiar: () => 30 });
    const rows = whyRows(sess.items[0], { seen }, now);
    const keys = rows.map(([k]) => k.trim());
    expect(rows[0]).toEqual(["Source", "Make-up draw, not due"]);
    for (const k of ["Stability", "Difficulty", "Reps · lapses", "Last answered", "Due", "Interval", "Hold",
                     "fade", "since", "score", "hole", "hard", "Priority p", "Weight", "Draw key", "Drawn"]) {
      expect(keys).toContain(k);
    }
    const hold = rows.find(([k]) => k === "Hold")[1];
    expect(hold.startsWith("3.0 d")).toBe(true);   // half a six-day interval
    expect(rows.find(([k]) => k === "Drawn")[1]).toBe("1 of 2");
  });

  it("names a learning step, a new card and a round for what they are", () => {
    expect(whyRows({ word: "x", why: { source: "learning" }, card: due() }, { seen: {} }, now)[0][1]).toBe("Learning step due today");
    expect(whyRows({ word: "x", why: { source: "new", rank: 12 }, card: null }, { seen: {} }, now)[0][1]).toBe("New card, within the day's ration");
    expect(whyRows({ word: "x", why: { source: "round" }, card: due(), again: true }, { seen: {} }, now)
      .some(([k]) => k === "Again")).toBe(true);
    expect(whyRows({ word: "x", card: due() }, { seen: {} }, now)[0][1]).toBe("unknown");
  });
});
