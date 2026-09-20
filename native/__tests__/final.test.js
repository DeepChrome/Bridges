/* The final test at the foot of the path (the owner, 2026-09-19): locked until
   the spine is walked, open in developer mode, and a run of FINAL_N questions.
   Own file, per the cumulative-timeout note in screens.test.js. */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { FinalFlow } from "../src/screens/Flows";
import { FINAL_N } from "../src/questions";
import { lessonCount, UN, STAGES } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false,
};
async function withState(ui, state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
const finished = (id) => {
  const unit = UN.find((u) => u.id === id);
  const lessons = {};
  for (let i = 0; i < lessonCount(unit); i++) lessons[i] = { v: true, q: 100 };
  return { lessons, video: true, done: true };
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

test("locked at the foot of the path until the spine is walked", async () => {
  await withState(<Learn navigation={nav} />, {});
  const card = await screen.findByTestId("final-test");
  expect(card.props.accessibilityState).toEqual({ disabled: true });
  expect(within(card).getByText("locked")).toBeTruthy();       // the chapters say "locked" too
  await act(async () => { fireEvent.press(card); });
  expect(nav.navigate).not.toHaveBeenCalledWith("Final");
});

test("open once every chapter's spine is done, and opens the test", async () => {
  const unit = {};
  for (const s of STAGES) unit[s.core.id] = finished(s.core.id);
  await withState(<Learn navigation={nav} />, { unit, drills: { final: { best: 84, runs: 1 } } });
  const card = await screen.findByTestId("final-test");
  expect(card.props.accessibilityState).toEqual({ disabled: false });
  expect(screen.getByText("84%")).toBeTruthy();
  await act(async () => { fireEvent.press(card); });
  expect(nav.navigate).toHaveBeenCalledWith("Final");
});

test("developer mode opens it too (rule 20.9)", async () => {
  await withState(<Learn navigation={nav} />, { dev: true });
  const card = await screen.findByTestId("final-test");
  expect(card.props.accessibilityState).toEqual({ disabled: false });
});

test(`the run is ${FINAL_N} questions long`, async () => {
  await withState(<FinalFlow navigation={nav} />, { dev: true });
  expect(await screen.findByText(`1/${FINAL_N}`)).toBeTruthy();
});
