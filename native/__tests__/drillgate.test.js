/* Practice lists a drill as locked until the route has taught its rule
   (the owner, 2026-09-10). Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillList } from "../src/screens/Practice";
import { STAGES, lessonCount, knownPool, KNOWN_AT } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 8, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: false, xp: 0, streak: 0,
};

/* Every lesson of every unit up to and including chapter `n` (1-based) done. */
const through = (n) => {
  const unit = {};
  for (const s of STAGES.slice(0, n)) {
    for (const u of [s.core].concat(s.branches)) {
      const lessons = {};
      for (let i = 0; i < lessonCount(u); i++) lessons[i] = { v: true, q: 100 };
      unit[u.id] = { lessons, video: true };
    }
  }
  return unit;
};

async function withState(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><DrillList navigation={nav} /></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("every drill is open from the first screen", () => {
  /* Nothing in Practice is locked and nothing on it carries a score (the
     owner, 2026-09-23). The drills opened with the chapter that taught their
     rule until then — a "locks aspect in chapter 1" test stood here. */
  it("offers aspect on day one, with no 'opens in' line and no score", async () => {
    await withState({ drills: { aspect: { best: 100, runs: 1 }, quiz: { best: 100, runs: 1 } } });
    expect(await screen.findByText("Aspect pairs")).toBeTruthy();
    expect(screen.queryByText(/Opens in chapter/)).toBeNull();
    expect(screen.queryByText(/Opens after chapter/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    fireEvent.press(screen.getByTestId("drill-aspect"));
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "aspect" });
  });

  /* Every drill goes straight in (2026-09-26). What it asks about is on the
     drill's own cog now (drillcog.test.js); the setup screen that stood in
     front of conjugation and aspect is gone. */
  it("opens every drill directly, with no setup screen in front of it", async () => {
    await withState({ unit: through(2) });
    await screen.findByText("Conjugation");
    fireEvent.press(screen.getByTestId("drill-conjugation"));
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "conjugation" });
    fireEvent.press(screen.getByTestId("drill-stress"));
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "stress" });
    expect(nav.navigate).not.toHaveBeenCalledWith("DrillSetup", expect.anything());
  });

});

/* "Your words" are the words held at familiarity 40 or above, and nothing
   widens them (the owner, 2026-10-08: "the 'your words' setting still brings
   up random new words… should only show words with a mastery score of 40 or
   higher"). The drill used to step along the route to the whole curriculum
   until a run filled. */
describe("Your words", () => {
  const DAY = 86400000;
  const { L } = require("../src/data");
  const units = STAGES.flatMap((s) => [s.core].concat(s.branches)).flatMap((u) => u.w);
  const card = (stability) => ({ recognise: { state: 2, s: stability, d: 5, reps: 6, lapses: 0,
                                              dueAt: Date.now() + DAY, lastAt: Date.now() - DAY } });
  it("holds only words at 40 or above, and only the units' words", () => {
    const [held, shaky] = units.filter((i) => L[i].p === "noun").slice(0, 2).map((i) => L[i].b);
    const st = { seen: { [held]: card(400), [shaky]: card(0.5) } };
    const pool = knownPool(st).map((i) => L[i].b);
    expect(pool).toEqual([held]);
    expect(knownPool({ seen: {} })).toEqual([]);
    expect(KNOWN_AT).toBe(40);
  });
});
