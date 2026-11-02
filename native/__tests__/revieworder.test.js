/* The personal review's order (the owner, 2026-11-02: "personal review
 * English to Russian gets really hung up on recent words even if there's
 * earlier gaps in their learning… the option to build up or continue where
 * they were struggling").
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { SetPicker } from "../src/studypicker";
import { sessionFor } from "../src/studycards";
import { STAGES, L, lessonCount, lessonWords, pathRank } from "../src/data";
import { DAY, REVIEW, dayOf } from "@core/scheduler";

const now = Date.now();
const UNIT = STAGES[0].core;
const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["produce"], newPerDay: 0, learnAhead: 20,
  cardKinds: ["words"],
};
/* The first unit's lessons done; every word met, none due, the early ones
   held longer (less faded) than the recent ones. */
function learner() {
  const lessons = {};
  for (let k = 0; k < lessonCount(UNIT); k++) lessons[k] = { v: true, q: 100 };
  const words = [];
  for (let k = 0; k < lessonCount(UNIT); k++) words.push(...lessonWords(UNIT, k));
  const seen = {};
  words.forEach((i, k) => {
    // Earlier words held a fortnight, recent ones a few days, all answered
    // yesterday — the recent ones are the most faded. None mastered: a
    // mastered word is the sprinkle whichever order is chosen.
    const early = k < words.length / 2;
    seen[L[i].b] = { recognise: { dueAt: now + 40 * DAY, lastAt: now - DAY, s: early ? 6 : 1.5, d: 5,
                                  state: REVIEW, steps: 0, reps: 5, lapses: 0 } };
  });
  return { ...base, seen, unit: { [UNIT.id]: { lessons, video: true } }, goal: { day: dayOf(now), owed: 10, done: 0 } };
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the review's order", () => {
  it("most faded first by default, so the recent words lead", () => {
    const st = learner();
    const s = sessionFor(st, {});
    const rank = pathRank(st);
    const first = s.items.slice(0, 5).map((x) => rank(x.word));
    // The recent half of the route — the later words — comes first.
    expect(Math.min(...first)).toBeGreaterThanOrEqual(Math.floor(Object.keys(st.seen).length / 2));
  });

  it("walks the route from the start when asked", () => {
    const st = { ...learner(), reviewOrder: "path" };
    const s = sessionFor(st, {});
    const rank = pathRank(st);
    const ranks = s.items.map((x) => rank(x.word));
    expect(ranks[0]).toBe(0);
    expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b));
  });

  it("is chosen on the Study options, under the personal review", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
    await render(<SessionProvider><SetPicker visible onClose={() => {}} /></SessionProvider>);
    expect(await screen.findByTestId("review-order")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("From the start")); });
    await flushState();
    expect((await global.__db.saved("p1")).reviewOrder).toBe("path");
  });
});
