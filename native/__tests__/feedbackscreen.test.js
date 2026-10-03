/* Send feedback (2026-10-03): the tester's words go to the owner with the
   build and their place attached; with no connection, the share sheet. */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";

jest.mock("../src/lib/feedback", () => ({
  ...jest.requireActual("../src/lib/feedback"),
  report: jest.fn(async () => ({ ok: true })),
  plan: jest.fn(async () => ({ ok: true, used: { conversation: 2 } })),
}));
const fb = require("../src/lib/feedback");
const Feedback = require("../src/screens/Feedback").default;
const { feedbackFacts } = require("../src/screens/Feedback");

const nav = { goBack: jest.fn(), navigate: jest.fn() };
async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} } }));
  return render(<SessionProvider><Feedback route={{ params: { from: "Cards" } }} navigation={nav} /></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });

it("sends the words with the build and the screen attached, and thanks the tester", async () => {
  await open();
  const box = await screen.findByTestId("feedback-text");
  fireEvent.changeText(box, "The slider froze on Listening.");
  await waitFor(() => expect(box.props.value).toBe("The slider froze on Listening."));
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-send")); });
  expect(fb.report).toHaveBeenCalledTimes(1);
  const { text, facts } = fb.report.mock.calls[0][0];
  expect(text).toBe("The slider froze on Listening.");
  expect(facts).toMatchObject({ from: "Cards", chapter: 1 });
  expect(facts.version).toMatch(/beta/);
  expect(await screen.findByTestId("feedback-sent")).toBeTruthy();
});

it("offers the share sheet when it cannot be sent", async () => {
  fb.report.mockResolvedValueOnce({ ok: false, reason: "offline" });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    await open();
    const box = await screen.findByTestId("feedback-text");
    fireEvent.changeText(box, "Hello");
    await waitFor(() => expect(box.props.value).toBe("Hello"));
    await act(async () => { fireEvent.press(screen.getByTestId("feedback-send")); });
    expect(alert).toHaveBeenCalledWith("Not sent", expect.any(String), expect.any(Array));
    expect(screen.queryByTestId("feedback-sent")).toBeNull();
  } finally { alert.mockRestore(); }
});

it("attaches counts, not anything typed elsewhere", () => {
  const f = feedbackFacts({ seen: {}, unit: {}, drills: {} }, { crashes: 2, from: "Path" });
  expect(Object.keys(f).sort()).toEqual(["ai", "chapter", "crashes", "days", "from", "lesson", "lessonsDone",
                                         "mastered", "reviews", "version", "words"].sort());
});
