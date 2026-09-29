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

/* A Btn's fill says which action the screen is pushing: brand is primary.
 *
 * Walks up for it rather than reading the label's immediate parent. That used
 * to be the Pressable itself, so the fill was one hop away — and when `Btn`
 * grew a padding wrapper inside its Pressable (the press-travel rework,
 * 2026-09-17) the assertion started reading an empty style and failing on a
 * button that was plainly blue. What this test is about is which control
 * carries the brand fill, not how many Views deep it sits. */
const fillOf = (node) => {
  for (let n = node, hops = 0; n && hops < 6; n = n.parent, hops++) {
    const style = n.props && n.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(9).filter(Boolean)) : style;
    const bg = flat && flat.backgroundColor;
    if (typeof bg === "string" && bg) return bg.toUpperCase();
  }
  return "";
};

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

/* The path is the path (the owner, 2026-09-29: "remove the review from the
   top of the Learn page"; the streak "can just be on the profile page"). What
   is due is badged on the Study tab; nothing about it sits on Learn, and the
   lesson stays the primary action however large the backlog. `reviewFirst`
   survives in core for the simulator, which models a learner who reviews
   first by choice. */
describe("the top of the path", () => {
  it("is still a threshold in core, for the simulator", () => {
    expect(reviewFirst(REVIEW_FIRST - 1)).toBe(false);
    expect(reviewFirst(REVIEW_FIRST)).toBe(true);
  });

  it("carries no review button and no streak, and the lesson stays primary", async () => {
    await withState({ seen: due(REVIEW_FIRST + 5), streak: 11 });
    const lesson = await screen.findByText(/^(Start|Continue) \(/);
    expect(fillOf(lesson.parent)).toBe(light.brand.toUpperCase());
    expect(screen.queryByTestId("review-due")).toBeNull();
    expect(screen.queryByText(/in a row/)).toBeNull();
    fireEvent.press(lesson);
    expect(nav.navigate).toHaveBeenCalled();
  });
});
