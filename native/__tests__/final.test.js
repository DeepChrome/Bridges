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
  v: 8, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
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

/* Hidden until it opens (the owner, 2026-09-28: "you can leave it hidden
   until it's unlocked"). It used to sit locked at the foot of the path. */
test("absent from the path until the spine is walked", async () => {
  await withState(<Learn navigation={nav} />, {});
  await screen.findByTestId(`node-${STAGES[0].core.id}`);
  expect(screen.queryByTestId("final-test")).toBeNull();
});

/* And it says what it is and nothing else: "Don't put the random extra words
   'every chapter' and 50 questions. It can just say Final Test." */
test("once every chapter's spine is done: there, named, and it opens the test", async () => {
  const unit = {};
  for (const s of STAGES) unit[s.core.id] = finished(s.core.id);
  await withState(<Learn navigation={nav} />, { unit, drills: { final: { best: 84, runs: 1 } } });
  const card = await screen.findByTestId("final-test");
  expect(within(card).getByText("Final Test")).toBeTruthy();
  expect(within(card).queryByText(/questions|every chapter/)).toBeNull();
  expect(screen.getByText("84%")).toBeTruthy();
  await act(async () => { fireEvent.press(card); });
  expect(nav.navigate).toHaveBeenCalledWith("Final");
});

test("developer mode shows it too (rule 20.9)", async () => {
  await withState(<Learn navigation={nav} />, { dev: true });
  expect(await screen.findByTestId("final-test")).toBeTruthy();
});

test(`the run is ${FINAL_N} questions long`, async () => {
  await withState(<FinalFlow navigation={nav} />, { dev: true });
  expect(await screen.findByText(`1/${FINAL_N}`)).toBeTruthy();
});
