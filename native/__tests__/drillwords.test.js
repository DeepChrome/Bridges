/* A drill's words and its "All the forms" door (the owner, 2026-10-08).
 *
 * - "Your words" are the words held at familiarity 40 or above, and nothing
 *   widens them: *"the 'your words' setting still brings up random new
 *   words… should only show words with a mastery score of 40 or higher"*.
 * - "All the forms" starts at once with every case in play: *"if they press
 *   that, the exercise should just start and assume all cases are in play"*.
 *
 * Own file: a sheet left open by one test leaves the next one's undrawn
 * (§30by), and both of these open with or without the options sheet.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillFlow } from "../src/screens/Flows";
import { STAGES, L } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
const base = { v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, dev: false, streak: 0,
               flash: ["recognise"] };
const known = (n) => {
  const seen = {}, now = Date.now();
  for (const s of STAGES.slice(0, n)) for (const u of [s.core].concat(s.branches)) {
    for (const i of u.w) seen[L[i].b] = { recognise: { state: 2, s: 400, d: 5, reps: 8, lapses: 0,
                                                       dueAt: now + 86400000 * 300, lastAt: now } };
  }
  return seen;
};
async function open(state, params) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><DrillFlow navigation={nav} route={{ params }} /></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

it("All the forms starts at once with every case in play", async () => {
  await open({ seen: known(6), drillPrefs: { cases: { only: ["Dative"] } } }, { type: "cases", all: true });
  expect(await screen.findByTestId("answer-block")).toBeTruthy();
  expect(screen.queryByTestId("drill-options")).toBeNull();
});

it("Your words asks nothing of words below 40, and says so", async () => {
  await open({ seen: {} }, { type: "cases" });
  await act(async () => { fireEvent.press(await screen.findByTestId("drill-apply")); });
  expect(await screen.findByText("No words at 40 yet")).toBeTruthy();
  expect(screen.queryByTestId("answer-block")).toBeNull();
});
