/* The beta's Premium switch (2026-10-01): in the AI usage sheet, drawn only
   when the Worker says this install may choose its plan, and showing what the
   Worker answered rather than what was wished. Own file because it mocks the
   Worker client. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("../src/lib/feedback", () => {
  const actual = jest.requireActual("../src/lib/feedback");
  return { ...actual, plan: jest.fn(), setPlan: jest.fn() };
});

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import You from "../src/screens/You";
import { plan, setPlan } from "../src/lib/feedback";
import { PLANS } from "@core/plans";

const nav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
const used = { conversation: 0, review: 0, explain: 0, feedback: 0, translate: 0 };

async function withProfile() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "curls", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 10, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, streak: 0, speech: { attempts: [], tagCounts: {} } }));
  return render(<SessionProvider><You navigation={nav} /></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); plan.mockReset(); setPlan.mockReset(); });
afterEach(async () => { await flushState(); });

it("is not drawn when the Worker does not offer it", async () => {
  plan.mockResolvedValue({ ok: true, plan: "free", caps: PLANS.free, used, selfServe: false });
  await withProfile();
  await act(async () => { fireEvent.press(await screen.findByTestId("plan")); });
  expect(await screen.findByTestId("plan-sheet")).toBeTruthy();
  expect(screen.queryByTestId("plan-premium")).toBeNull();
});

/* The learner decides what the allowance is spent on (the owner, 2026-10-05):
   the one use that spends without being asked — the spoken-answer check —
   carries a switch, and turning it off is saved. Conversation, translation
   and questions to Teddy are asked for and carry none (2026-10-08: a wrong
   answer is no longer explained unasked). */
it("lets the automatic use be turned off, and saves the choice", async () => {
  plan.mockResolvedValue({ ok: true, plan: "free", caps: PLANS.free, used, selfServe: false });
  await withProfile();
  await act(async () => { fireEvent.press(await screen.findByTestId("plan")); });
  const fb = await screen.findByTestId("plan-use-feedback");
  expect(fb.props.value).toBe(true);
  for (const c of ["explain", "conversation", "translate"]) expect(screen.queryByTestId(`plan-use-${c}`)).toBeNull();
  await act(async () => { fireEvent(fb, "valueChange", false); });
  // Held in the learner's state (repo.js SETTING_KEYS): closed and opened
  // again, the sheet still says off.
  await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });
  await act(async () => { fireEvent.press(await screen.findByTestId("plan")); });
  expect((await screen.findByTestId("plan-use-feedback")).props.value).toBe(false);
});

it("switches to Premium through the Worker and shows what it answered", async () => {
  plan.mockResolvedValue({ ok: true, plan: "free", caps: PLANS.free, used, selfServe: true });
  setPlan.mockResolvedValue({ ok: true, plan: "premium", caps: PLANS.premium, used, selfServe: true });
  await withProfile();
  await act(async () => { fireEvent.press(await screen.findByTestId("plan")); });
  const sw = await screen.findByTestId("plan-premium");
  expect(sw.props.value).toBe(false);
  await act(async () => { fireEvent(sw, "valueChange", true); });
  expect(setPlan).toHaveBeenCalledWith("premium");
  expect(screen.getByText("Premium · left today")).toBeTruthy();
  expect(screen.getByTestId("plan-premium").props.value).toBe(true);
  // By row, not by text: two of Premium's allowances are the same number.
  const { within } = require("@testing-library/react-native");
  expect(within(screen.getByTestId("plan-explain")).getByText(String(PLANS.premium.explain))).toBeTruthy();
});
