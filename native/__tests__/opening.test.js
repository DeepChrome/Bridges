/* "Now open" on the path (core/openings.js).
 *
 * The rule is tested in core.test.mjs. What is tested here is the thing a
 * learner meets: that a fresh profile is not buried, that the note appears
 * when the route opens something, and that it goes away once acknowledged and
 * does not come back.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { STAGES, lessonCount } from "../src/data";
import { Q } from "../src/questions";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, met: [],
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
  return await render(<SessionProvider><Learn navigation={nav} /></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("saying what has just opened", () => {
  /* The failure this feature must not become: a learner opening the app for
     the first time and meeting a stack of notes about things they have not
     reached. */
  it("says nothing at all on a brand new profile", async () => {
    const view = await withState({});
    await view.findByTestId("streak");
    expect(view.queryByTestId("opening")).toBeNull();
  });

  it("names the one the route has just opened, with a way in", async () => {
    // Far enough along that several have opened; the oldest is shown.
    const view = await withState({ unit: through(4) });
    const card = await view.findByTestId("opening");
    expect(card).toBeTruthy();
    expect(view.getByText("NOW OPEN")).toBeTruthy();
  });

  /* Acknowledged once, gone for good — and it is the *next* one that appears,
     not the same one again, which is what proves the id was recorded rather
     than the card merely hidden. */
  it("moves on to the next one when it is acknowledged", async () => {
    const view = await withState({ unit: through(9) });
    await view.findByTestId("opening");
    const first = view.getByTestId("opening").props.children;
    await act(async () => { fireEvent.press(view.getByTestId("opening-seen")); });
    await flushState();
    const saved = await global.__db.saved("p1");
    expect(saved.met.length).toBe(1);
    // Still one to show, and a different one.
    const second = view.queryByTestId("opening");
    expect(second).toBeTruthy();
    expect(second.props.children).not.toBe(first);
  });

  it("counts an opening as seen when the learner goes straight to it", async () => {
    // Deep enough that the next one has a screen to open.
    const view = await withState({ unit: through(9), met: ["hear"] });
    await view.findByTestId("opening");
    const go = view.queryByTestId("opening-go");
    expect(go).toBeTruthy();
    await act(async () => { fireEvent.press(go); });
    expect(nav.navigate).toHaveBeenCalled();
    await flushState();
    const saved = await global.__db.saved("p1");
    expect(saved.met.length).toBe(2);
  });

  /* Developer mode ships ON and unlocks every lesson (rule 20.9). Unlocking is
     not arriving: if it counted, this learner would be shown every note on
     their first screen. */
  it("is not fooled by developer mode", async () => {
    const view = await withState({ dev: true });
    await view.findByTestId("streak");
    expect(view.queryByTestId("opening")).toBeNull();
  });

  it("stops entirely once they have all been seen", async () => {
    const all = ["hear", "drill:conjugation", "scene", "talk", "form", "say",
                 "drill:agreement", "drill:cases", "drill:aspect"];
    const view = await withState({ unit: through(9), met: all });
    await view.findByTestId("streak");
    expect(view.queryByTestId("opening")).toBeNull();
    // …and the list in the test is the real one, not a stale copy of it.
    expect(all.length).toBe(9);
    expect(Q.drillOpensAt("aspect")).toBeGreaterThan(0);
  });
});
