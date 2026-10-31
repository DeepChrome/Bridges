/* Study comes back to its options after a tab press, and to its card after a
 * screen pushed over it.
 *
 * The focus listener that reopens the options (the owner, 2026-10-05: "each
 * time the person clicks study, they'll encounter the options") fired on any
 * refocus, so a drill or an entry opened from the back of the first card —
 * nothing graded yet — came back to the start panel with the pile gone
 * (the emulator, 2026-10-31). On blur the stack says which it was.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { DAY, REVIEW } from "@core/scheduler";

const now = Date.now();
const WORD = "город";
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const base = {
  v: 10, seen: { [WORD]: { recognise: due() } }, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 5, learnAhead: 20, cardKinds: ["words"],
};
const ME = { key: "Cards-1", name: "Cards", params: {} };

/* A navigator whose listeners a test can fire, and whose stack state it sets:
   `over` is a screen pushed on top of this one. */
function fakeNav() {
  const listeners = {};
  let over = null;
  return {
    nav: {
      navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(),
      addListener: (name, fn) => { listeners[name] = fn; return () => { delete listeners[name]; }; },
      getState: () => (over
        ? { index: 1, routes: [ME, { key: "x", name: over }] }
        : { index: 0, routes: [ME] }),
    },
    leave: async (pushed) => {
      over = pushed || null;
      await act(async () => { listeners.blur && listeners.blur(); });
    },
    comeBack: async () => {
      over = null;
      await act(async () => { listeners.focus && listeners.focus(); });
    },
  };
}

async function mount() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  const f = fakeNav();
  await render(<SessionProvider><Study navigation={f.nav} route={ME} /></SessionProvider>);
  await global.__startStudy();
  await screen.findByText("Show");
  return f;
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("Study after leaving and coming back", () => {
  it("keeps the card after a screen pushed over it", async () => {
    const f = await mount();
    await f.leave("WordDrill");
    await f.comeBack();
    expect(screen.getByText("Show")).toBeTruthy();
    expect(screen.queryByTestId("study-start")).toBeNull();
  });

  it("returns to the options after a tab press with nothing graded", async () => {
    const f = await mount();
    await f.leave(null);
    await f.comeBack();
    expect(await screen.findByTestId("study-start")).toBeTruthy();
    expect(screen.queryByText("Show")).toBeNull();
  });

  it("keeps a sitting under way across a tab press", async () => {
    const f = await mount();
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("grade-3")); });
    await f.leave(null);
    await f.comeBack();
    expect(screen.queryByTestId("study-start")).toBeNull();
  });
});
