/* Reviews before new words, on the path (core/state.js reviewFirst).
 *
 * The whole message is which of the two buttons is the loud one, so — as with the
 * path's rings — the test has to read the render tree rather than the words: a
 * screen that swapped the labels but not the emphasis would say nothing.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { light } from "../src/theme";
import { L, STAGES } from "../src/data";
import { REVIEW_FIRST, reviewFirst } from "@core/state";
import { today } from "@core/util";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

const base = {
  v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: false, xp: 0, streak: 0,
};

/* `n` words due today, keyed on the Russian string as all learner state is.
   Drawn across the route because one spine unit holds only thirty words. */
const ROUTE_WORDS = STAGES.flatMap((s) => [s.core].concat(s.branches)).flatMap((u) => u.w);
const due = (n) => {
  const seen = {};
  for (const i of ROUTE_WORDS.slice(0, n)) {
    seen[L[i].b] = { due: today(), last: today() - 1, s: 2, d: 5, reps: 1, lapses: 0 };
  }
  expect(Object.keys(seen).length).toBe(n);
  return seen;
};

async function withState(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Learn navigation={nav} /></SessionProvider>);
}

/* A Btn's fill says which action the screen is pushing: brand is primary. */
const fillOf = (node) => {
  const style = node.props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  return (flat.backgroundColor || "").toUpperCase();
};
const btnFor = (label) => screen.getByText(label).parent;

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

describe("reviews before new words", () => {
  it("is a threshold on the due count, not a lock", () => {
    expect(reviewFirst(REVIEW_FIRST - 1)).toBe(false);
    expect(reviewFirst(REVIEW_FIRST)).toBe(true);
    expect(reviewFirst(0)).toBe(false);
    expect(reviewFirst(undefined)).toBe(false);
  });

  it("keeps the lesson primary while the backlog is small", async () => {
    await withState({ seen: due(REVIEW_FIRST - 1) });
    const lesson = await screen.findByText(/^(Start|Continue) \(/);
    expect(fillOf(lesson.parent)).toBe(light.brand.toUpperCase());
    expect(fillOf(btnFor(`Review · ${REVIEW_FIRST - 1} due`))).not.toBe(light.brand.toUpperCase());
  });

  /* The swap *is* the message. There used to be a line under it reading "Clear
     these before new words", and asserting that line was really asserting that
     the app narrates its own rule (the owner, 2026-09-10). What has to hold is
     which button is blue and that the lesson is still one press away. */
  it("makes reviewing primary once the backlog is real, without saying so", async () => {
    await withState({ seen: due(REVIEW_FIRST) });
    const review = await screen.findByText(`Review · ${REVIEW_FIRST} due`);
    expect(fillOf(review.parent)).toBe(light.brand.toUpperCase());
    // …and the lesson is still there, still one press away.
    const lesson = screen.getByText(/^(Start|Continue) \(/);
    expect(fillOf(lesson.parent)).not.toBe(light.brand.toUpperCase());
    fireEvent.press(lesson);
    expect(nav.navigate).toHaveBeenCalled();
  });

  it("opens the flashcards on exactly the due words", async () => {
    await withState({ seen: due(REVIEW_FIRST) });
    fireEvent.press(await screen.findByTestId("review-due"));
    expect(nav.navigate).toHaveBeenCalledWith("Study");
  });
});
