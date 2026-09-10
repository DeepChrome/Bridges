/* Practice lists a drill as locked until the route has taught its rule
   (the owner, 2026-09-10). Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillList } from "../src/screens/Flows";
import { STAGES, lessonCount } from "../src/data";
import { Q } from "../src/questions";

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
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "conjugation" });
  });

  it("developer mode opens every drill", async () => {
    await withState({ dev: true });
    await screen.findByText("Aspect pairs");
    expect(screen.queryByText(/Opens in chapter/)).toBeNull();
  });
});
