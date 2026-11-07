/* The daily goal is a moment, not a wall (the owner, 2026-11-02: "Remove the
 * 25 study cap. Just have a little temporary pop-up when player hits 25 and
 * offer to pivot to something else").
 *
 * A sitting that reaches the goal gets one line above the buttons, and the
 * pile runs on under it; Stop here ends the sitting on the ways on. A sitting
 * opened after the goal was met gets no line.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { STAGES, L } from "../src/data";
import { DAY, REVIEW, dayOf } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const WORDS = STAGES[0].core.w.slice(0, 4).map((i) => L[i].b);
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
// Met yesterday and not due: what a chunk past the goal is made of.
const met = () => ({ dueAt: now + 5 * DAY, lastAt: now - DAY, s: 6, d: 5, state: REVIEW, steps: 0, reps: 3, lapses: 0 });

const base = {
  v: 10, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 0, learnAhead: 20,
  cardKinds: ["words"],
  seen: { [WORDS[0]]: { recognise: due() }, [WORDS[1]]: { recognise: met() }, [WORDS[2]]: { recognise: met() } },
};
async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  const view = await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  return view;
}
const press = async (id) => act(async () => { fireEvent.press(await screen.findByTestId(id)); });
const gradeGood = async () => {
  await screen.findByText("Show");
  await act(async () => { fireEvent.press(screen.getByText("Show")); });
  await press("grade-3");
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__players = []; });
afterEach(async () => { await flushState(); });

describe("reaching the goal", () => {
  // One card owed today: the goal is met on the first grade.
  const oneOwed = { goal: { day: dayOf(now), owed: 1, done: 24 } };

  /* Since 2026-11-06 the goal is a line above the buttons, not a bubble, and
     the pile runs on under it without being asked (the owner: "Default to
     the personal review. Don't have a hard limit. Just let it keep going
     until the user stops"). */
  it("says so once, in a line, while the pile runs on unasked", async () => {
    await withProfile(oneOwed);
    await gradeGood();
    expect(await screen.findByTestId("goal-met")).toBeTruthy();
    expect(screen.getByTestId("goal-met-count").props.children).toBe("25 cards today");
    // Nothing to dismiss: the next card is already up.
    expect(screen.getByText("Show")).toBeTruthy();
    expect(screen.queryByTestId("study-state")).toBeNull();
    await gradeGood();
    expect(screen.getAllByTestId("goal-met")).toHaveLength(1);
  });

  it("Stop here ends the sitting on the ways on", async () => {
    await withProfile(oneOwed);
    await gradeGood();
    await screen.findByTestId("goal-met");
    await press("goal-pivot");
    expect(await screen.findByTestId("study-state")).toBeTruthy();
    expect(screen.getByText("Daily goal met")).toBeTruthy();
    expect(screen.getByTestId("study-ways-on")).toBeTruthy();
    expect(screen.queryByText("Show")).toBeNull();
  });

  /* The goal was met before this sitting began: nothing to announce, and
     Finish is the way out of a review that has no end of its own. */
  it("says nothing in a sitting that began with the goal already met, and Finish ends it", async () => {
    await withProfile({ goal: { day: dayOf(now), owed: 0, done: 25 } });
    // Nothing owed: the options say so and Personal review deals past the goal.
    await screen.findByText("Show");
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await press("grade-3");
    expect(screen.queryByTestId("goal-met")).toBeNull();
    await press("study-finish");
    expect(await screen.findByTestId("study-ways-on")).toBeTruthy();
  });
});