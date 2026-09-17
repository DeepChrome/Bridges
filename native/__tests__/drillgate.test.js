/* Practice lists a drill as locked until the route has taught its rule
   (the owner, 2026-09-10). Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillList } from "../src/screens/Flows";
import { STAGES, lessonCount, drillPool, DRILL_POOL_MIN, DRILL_POOL_STEPS } from "../src/data";
import { Q, DRILL_N } from "../src/questions";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
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

describe("drills open with the route", () => {
  it("locks aspect in chapter 1 and says when it opens", async () => {
    await withState({});
    expect(await screen.findByText("Aspect pairs")).toBeTruthy();
    expect(screen.getByText(`Opens in chapter ${Q.drillOpensAt("aspect") + 1}`)).toBeTruthy();
    // Stress and Grammar are open from the first screen.
    expect(screen.getByText("Hear where the emphasis falls")).toBeTruthy();
    // A locked row does not navigate. RNTL reads onPress off the wrapper, so the
    // guard has to be in the handler, not only on the control (CLAUDE.md §23).
    fireEvent.press(screen.getByTestId("drill-aspect"));
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it("opens conjugation once chapter 2 is done", async () => {
    await withState({ unit: through(2) });
    await screen.findByText("Conjugation");
    expect(screen.getByText("Put a verb with the right person")).toBeTruthy();
    fireEvent.press(screen.getByTestId("drill-conjugation"));
    /* Through the focus screen, because conjugation has something to narrow —
       a tense, or reading a form (the owner, 2026-09-16). A drill with nothing
       to narrow still goes straight in, which the stress row proves below. */
    expect(nav.navigate).toHaveBeenCalledWith("DrillSetup", { type: "conjugation" });
  });

  it("…but a drill with nothing to choose between skips the question", async () => {
    await withState({ unit: through(2) });
    await screen.findByText("Stress");
    fireEvent.press(screen.getByTestId("drill-stress"));
    // A setup screen offering one choice is a tap that buys nothing.
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "stress" });
  });

  it("developer mode opens every drill", async () => {
    await withState({ dev: true });
    await screen.findByText("Aspect pairs");
    expect(screen.queryByText(/Opens in chapter/)).toBeNull();
  });

  /* Opening a drill ahead of the route widens its words to the whole curriculum:
     a chapter-1 learner in developer mode has met eight verbs, and Aspect drawn
     from those asks the same handful every run. */
  it("a drill opened ahead of the route draws on every word", () => {
    const key = (q) => Q.drillKey(q);
    const early = [...new Set(STAGES.slice(0, 1).flatMap((s) => [s.core].concat(s.branches))
      .flatMap((u) => u.w))];
    const narrow = new Set();
    const wide = new Set();
    for (let k = 0; k < 12; k++) {
      Q.drillQuestions("aspect", 20, early).forEach((q) => narrow.add(key(q)));
      Q.drillQuestions("aspect", 20, null).forEach((q) => wide.add(key(q)));
    }
    expect(wide.size).toBeGreaterThan(narrow.size * 3);
  });

  /* …and a drill the route *has* opened still has to fill a run.
   *
   * `drillPool` puts a floor under the number of words, which is not a floor
   * under the number of questions: measured with tools/audit_banks.mjs on
   * 2026-09-16, a 40-word pool yields **seven** distinct aspect questions in
   * total, because the drill needs verbs carrying a recorded partner. Ten
   * sittings is then the same seven questions — the owner's "not just the same
   * 10 questions every time". DrillFlow steps the pool further along the route
   * until a full run comes back. */
  it("fills a run even where the learner's own words cannot", async () => {
    const st = { ...base, unit: through(8) };
    const floor = drillPool(st, DRILL_POOL_MIN);
    expect(floor.length).toBeGreaterThanOrEqual(DRILL_POOL_MIN);
    const thin = Q.drillQuestions("aspect", DRILL_N, floor, undefined, true);
    expect(thin.length).toBeLessThan(DRILL_N);          // the defect, still there

    // What DrillFlow does with it.
    let filled = [];
    for (const min of DRILL_POOL_STEPS) {
      const p = min === Infinity ? null : drillPool(st, min);
      filled = Q.drillQuestions("aspect", DRILL_N, p, undefined, true);
      if (filled.length >= DRILL_N) break;
    }
    expect(filled.length).toBe(DRILL_N);
  });
});
