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

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  // A stamped build (update.js): the report names the build it came from.
  global.__build = { code: 29800000, name: "1.0.0-beta.10+abc1234" };
});
afterEach(() => { global.__build = { code: null, name: null }; });

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
  expect(facts.version).toBe("1.0.0-beta.10+abc1234 (29800000)");   // the installed package's, not app.json's
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

/* A report on a question (2026-10-05): severity, kind, the fix, two
   recordings, and what was on screen — all of it reaching the Worker. */
it("sends severity, kind, the fix, recordings and the question it is about", async () => {
  const about = { screen: "Quiz", title: "Family & People",
                  question: { kind: "choose-ru", prompt: "how much", answer: "сколько" } };
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} } }));
  await render(<SessionProvider><Feedback route={{ params: { about, from: "Quiz" } }} navigation={nav} /></SessionProvider>);
  expect(await screen.findByTestId("feedback-about")).toBeTruthy();
  expect(screen.getByText("how much → сколько")).toBeTruthy();
  // Nothing to send yet.
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-send")); });
  expect(fb.report).not.toHaveBeenCalled();
  // The scale is explained behind the (i).
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-severity-info")); });
  expect(screen.getByText(/teaches something seriously wrong/)).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-sev-major")); });
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-kind-pronunciation")); });
  for (let k = 0; k < 2; k++) {
    await act(async () => { fireEvent.press(screen.getByTestId("feedback-record")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    await act(async () => { fireEvent.press(screen.getByTestId("feedback-record")); });
  }
  expect(screen.getByTestId("feedback-clip-1")).toBeTruthy();
  const fix = screen.getByTestId("feedback-fix");
  fireEvent.changeText(fix, "ско́лько");
  await waitFor(() => expect(fix.props.value).toBe("ско́лько"));
  await act(async () => { fireEvent.press(screen.getByTestId("feedback-send")); });
  expect(fb.report).toHaveBeenCalledTimes(1);
  const sent = fb.report.mock.calls[0][0];
  expect(sent).toMatchObject({ severity: "major", kind: "pronunciation", fix: "ско́лько", about });
  expect(sent.clips).toHaveLength(2);
  expect(await screen.findByTestId("feedback-sent")).toBeTruthy();
});

/* The top of the form names the thing itself, not only the screen (the
   owner, 2026-10-05: a flashcard's report said only "Cards · Study"). */
it("names the card, the video or the word at the top", () => {
  const { aboutLines } = require("../src/screens/Feedback");
  expect(aboutLines({ screen: "Study", title: "Cards",
    question: { kind: "word card", word: "книга", answer: "book", step: "3 of 20" } }))
    .toEqual({ where: "Cards · 3 of 20", what: "книга → book" });
  expect(aboutLines({ screen: "Video", title: "Episode", unit: "Family & People", lesson: 2,
    video: "Learn Russian with Family Photos" }))
    .toEqual({ where: "Episode · Family & People · Lesson 2", what: "Learn Russian with Family Photos" });
  expect(aboutLines({ screen: "Word", params: { word: "дом" } }).what).toBe("дом");
});

/* What the flag attaches is what the screen registered (about.js). */
it("describes a question by its word, prompt, answer and options", () => {
  const { describe: about } = require("../src/about");
  const { L } = require("../src/data");
  const i = L.findIndex((x) => x.b === "сколько");
  const d = about({ kind: "choose-ru", i, prompt: "how much",
                    options: [{ label: "сколько", right: true }, { label: "колено" }] });
  expect(d).toMatchObject({ kind: "choose-ru", word: "сколько", prompt: "how much", answer: "сколько",
                            options: ["сколько", "колено"] });
});

it("attaches counts, not anything typed elsewhere", () => {
  const f = feedbackFacts({ seen: {}, unit: {}, drills: {} }, { crashes: 2, from: "Path" });
  expect(Object.keys(f).sort()).toEqual(["ai", "chapter", "crashes", "days", "from", "lesson", "lessonsDone",
                                         "mastered", "reviews", "version", "words"].sort());
});
