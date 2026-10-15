/* The AI button in the header (2026-10-08): a question about what is on the
   screen goes to /v1/ask with that screen's question card, a follow-up
   carries the earlier turn, a failure keeps the learner's words, and a build
   with no Worker draws no button. The "?" (help.js) is a separate button. */

import React from "react";
import { render, renderHook, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";

let mockConfigured = true;
jest.mock("../src/lib/feedback", () => ({
  ...jest.requireActual("../src/lib/feedback"),
  config: jest.fn(() => (mockConfigured ? { url: "x", base: "x", token: "t" } : null)),
  ask: jest.fn(),
}));
let mockShown = null;
jest.mock("../src/about", () => ({
  ...jest.requireActual("../src/about"),
  screenAbout: jest.fn(() => mockShown),
}));
const fb = require("../src/lib/feedback");
const { AskButton, useAskThread } = require("../src/askai");
const { HELP, HelpButton, APP_GUIDE } = require("../src/help");

const casesQuestion = {
  screen: "CaseRun", title: "Accusative", params: { caseId: "acc" },
  question: { kind: "cases", prompt: "Я читаю ___.", answer: "кни́гу", said: "книга",
              options: ["кни́гу", "кни́ге"], step: "3 of 10" },
};

async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} } }));
  return render(<SessionProvider><AskButton /></SessionProvider>);
}
async function askIt(words, prefix = "ask") {
  const box = await screen.findByTestId(`${prefix}-input`);
  fireEvent.changeText(box, words);
  await waitFor(() => expect(box.props.value).toBe(words));
  await act(async () => { fireEvent.press(screen.getByTestId(`${prefix}-send`)); });
}

/* A sheet left open at the end of a test leaves the next test's sheet
   undrawn; close it the way a finger would. */
const closeSheets = async () => {
  for (const b of screen.queryAllByTestId("sheet-backdrop")) await act(async () => { fireEvent.press(b); });
};

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear();
  fb.ask.mockReset(); mockConfigured = true; mockShown = casesQuestion;
});

it("sends the question with the card on screen, and a follow-up with the turn before", async () => {
  fb.ask.mockResolvedValueOnce({ ok: true, answer: "«читать» takes the accusative." })
        .mockResolvedValueOnce({ ok: true, answer: "In the plural, «книги»." });
  await open();
  fireEvent.press(await screen.findByTestId("ask-button"));
  await askIt("Why книгу?");
  const sent = fb.ask.mock.calls[0][0];
  expect(sent).toMatchObject({ question: "Why книгу?", screen: "CaseRun", chapter: 1, level: "beginner",
    about: { kind: "cases", prompt: "Я читаю ___.", answer: "кни́гу", said: "книга", topic: "acc" }, history: [] });
  expect(await screen.findByTestId("ask-answer-0")).toBeTruthy();
  expect(screen.getByTestId("ask-input").props.value).toBe("");

  await askIt("And the plural?");
  expect(fb.ask.mock.calls[1][0].history).toEqual([{ q: "Why книгу?", a: "«читать» takes the accusative." }]);
  expect(await screen.findByTestId("ask-answer-1")).toBeTruthy();
  /* A text conversation (2026-10-15, "all the AI interactions"): the
     learner's question with their face on the right, Teddy's answer with
     his on the left. The profile's "yuri" is Monka. */
  expect(within(screen.getByTestId("ask-question-0-face")).getByTestId("face-yuri")).toBeTruthy();
  expect(within(screen.getByTestId("ask-reply-0-face")).getByTestId("face-teddy")).toBeTruthy();
  // Teddy asks, not a label (the owner, 2026-10-08).
  expect(screen.getByTestId("ask-hello").props.children).toBe("How can I help?");
  expect(screen.getByTestId("guide-wave")).toBeTruthy();
  // A conversation, not a glance: the sheet opens tall whatever it holds
  // (the owner, 2026-10-13: "subtle on the bottom fifth of the screen").
  expect(screen.getByTestId("ask-sheet").props.style.height).toBe("88%");
  await closeSheets();
});

/* Driven through the hook: reopening a Modal inside one test leaves the test
   renderer drawing the old sheet (§30be's Modal trap), which says nothing
   about the thread. */
it("starts a fresh thread on another question, and keeps it on the same one", async () => {
  fb.ask.mockResolvedValue({ ok: true, answer: "Accusative." });
  await open();
  const { result } = await renderHook(() => useAskThread(), { wrapper: SessionProvider });
  await act(async () => { result.current.open(); });
  await act(async () => { result.current.setText("Why?"); });
  await act(async () => { await result.current.send(); });
  expect(result.current.thread).toHaveLength(1);
  await act(async () => { result.current.open(); });
  expect(result.current.thread).toHaveLength(1);
  mockShown = { ...casesQuestion, question: { ...casesQuestion.question, prompt: "Я вижу ___.", step: "4 of 10" } };
  await act(async () => { result.current.open(); });
  expect(result.current.thread).toHaveLength(0);
});

it("keeps the words in the box when it fails", async () => {
  fb.ask.mockResolvedValueOnce({ ok: false, reason: "offline" });
  await open();
  fireEvent.press(await screen.findByTestId("ask-button"));
  await askIt("And here?");
  expect((await screen.findByTestId("ask-failed")).props.children).toBe("No connection");
  expect(screen.getByTestId("ask-input").props.value).toBe("And here?");
});

it("says when the day's AI is used up", async () => {
  fb.ask.mockResolvedValueOnce({ ok: false, reason: "http", status: 429, detail: "cap" });
  await open();
  fireEvent.press(await screen.findByTestId("ask-button"));
  await askIt("Why?");
  expect((await screen.findByTestId("ask-failed")).props.children).toMatch(/^Today's AI is used up · More /);
});

it("draws nothing in a build with no Worker", async () => {
  mockConfigured = false;
  await open();
  await waitFor(() => expect(screen.queryByTestId("ask-button")).toBeNull());
  expect(HELP.Lesson.lines.some(([w]) => w === "Grammar")).toBe(false);
  expect(HELP.Drill.lines.some(([w]) => w === "Sparkle")).toBe(true);
});

/* The "?" asks how to use the app: the screen's lines, and a question answered
   from the app's map, never from the screen's question card. */
async function openHelp(route) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 6, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} } }));
  return render(<SessionProvider><HelpButton route={route} /></SessionProvider>);
}

it("answers how to use the app from the map and the screen's own lines", async () => {
  fb.ask.mockResolvedValueOnce({ ok: true, answer: "Open Study, then the cog." });
  mockShown = { ...casesQuestion, screen: "Cards", title: "Study", params: {} };
  await openHelp("Cards");
  fireEvent.press(await screen.findByTestId("help-button"));
  expect(await screen.findByTestId("help-sheet")).toBeTruthy();
  expect(screen.getByText("Fifty a day")).toBeTruthy();
  await askIt("How do I see fewer new words?", "help");
  const sent = fb.ask.mock.calls[0][0];
  expect(sent.mode).toBe("app");
  expect(sent.about).toBeUndefined();
  expect(sent.guide).toContain("Five tabs at the bottom");
  expect(sent.guide).toMatch(/This screen \(Study\): Show, then grade/);
  expect(await screen.findByTestId("help-answer-0")).toBeTruthy();
});

it("puts the ? on a screen with no lines once the AI can answer", async () => {
  await openHelp("Settings");
  expect(await screen.findByTestId("help-button")).toBeTruthy();
});

it("and not on such a screen without it", async () => {
  mockConfigured = false;
  await openHelp("Settings");
  await waitFor(() => expect(screen.queryByTestId("help-button")).toBeNull());
});

it("puts the sparkle and the flag in the exercise, and out of its header", () => {
  const { INLINE_TOOLS } = require("../src/askai");
  for (const r of ["Quiz", "Drill", "CaseRun", "GrammarRun", "Vocab", "Cards"]) expect(INLINE_TOOLS.has(r)).toBe(true);
  for (const r of ["Path", "Words", "Episodes", "Word"]) expect(INLINE_TOOLS.has(r)).toBe(false);
  const runSrc = require("fs").readFileSync(require("path").join(__dirname, "../src/screens/Run.js"), "utf8");
  expect(runSrc).toMatch(/<RunTools\b/);
});

it("keeps the map honest: every Practice row and tab it names exists", () => {
  for (const name of ["Build a quiz", "At your level", "Repeat a sentence", "Word building", "Translate",
                      "Talk", "Tutor", "Alphabet", "Word endings", "The rules", "This chapter's grammar", "Cases",
                      "Learn, Study, Practice, Immerse, Search"]) {
    expect(APP_GUIDE).toContain(name);
  }
});
