/* A run picked up where it was left (resume.js; the owner, 2026-10-02: "a
   mechanism to save progress so they can continue where they left off… if the
   app restarts it can prompt them if they'd like to continue where they left
   off or start again"). */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { QuizFlow } from "../src/flows/Lesson";
import Learn from "../src/screens/Learn";
import { Q } from "../src/questions";
import { STAGES, lessonWords } from "../src/data";
import { savedRun, latestRun, loadResume, resetResume, RESUME_MAX_AGE } from "../src/resume";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn(),
              addListener: () => () => {} };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {} };
const unit = STAGES[0].core;
const KEY = `quiz:${unit.id}:0`;

async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

const steps = () => {
  const pool = Q.poolFor(unit);
  return lessonWords(unit, 0).slice(0, 4).map((i) => Q.present({ t: "choose-en", i, pool }));
};
const quiz = (params = {}) => (
  <QuizFlow route={{ params: { unitId: unit.id, index: 0, ...params } }} navigation={nav} />);

async function answer(q) {
  await screen.findByText(q.ask);
  const right = q.options.find((o) => o.right).label;
  await act(async () => { fireEvent.press(screen.getAllByText(right).pop()); });
  await act(async () => { fireEvent.press(screen.getByText("Continue")); });
}

beforeEach(async () => { await flushState(); await AsyncStorage.removeItem("rb.resume.p1"); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("a run left part-way", () => {
  it("is kept after every answer, pointing at the next question", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      await withProfile(quiz());
      await answer(deck[0]);
      await answer(deck[1]);
      const run = savedRun(KEY);
      expect(run).toMatchObject({ route: "Quiz", at: 2, total: 4, params: { unitId: unit.id, index: 0 } });
      expect(run.tally.right).toBe(2);
    } finally { spy.mockRestore(); }
  });

  it("survives a restart, and is offered on opening the quiz again", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      const view = await withProfile(quiz());
      await answer(deck[0]);
      await act(async () => { view.unmount(); });
      resetResume();                                    // memory gone, as after a restart
      await loadResume("p1");
      expect(savedRun(KEY).at).toBe(1);

      // A different deck would be dealt now; Continue brings back the old one.
      spy.mockReturnValue(steps().reverse());
      await withProfile(quiz());
      expect(await screen.findByTestId("resume-prompt")).toBeTruthy();
      // What was left, as a card: the unit large, the step under it, the count
      // apart — not one grey run-on line (the owner, 2026-10-03).
      expect(screen.getByTestId("resume-card")).toBeTruthy();
      expect(screen.getByTestId("resume-step")).toHaveTextContent(/^Lesson \d+ · Quiz$/);
      expect(screen.getByTestId("resume-what")).toHaveTextContent("1 of 4");
      await act(async () => { fireEvent.press(screen.getByText("Continue")); });
      expect(await screen.findByText("2/4")).toBeTruthy();
      await answer(deck[1]);
      await answer(deck[2]);
      await answer(deck[3]);
      expect(await screen.findByText("4 of 4 right")).toBeTruthy();   // the first answer counted
      expect(savedRun(KEY)).toBeNull();                               // and finishing clears it
    } finally { spy.mockRestore(); }
  });

  it("Start again deals afresh and forgets the old run", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      const view = await withProfile(quiz());
      await answer(deck[0]);
      await act(async () => { view.unmount(); });
      await withProfile(quiz());
      await act(async () => { fireEvent.press(await screen.findByText("Start again")); });
      expect(await screen.findByText("1/4")).toBeTruthy();
      expect(savedRun(KEY)).toBeNull();
    } finally { spy.mockRestore(); }
  });

  /* "If the person says they don't want to continue, I'd expect it to prompt
     them for the question types prior to going to question 1" (2026-10-04). */
  it("a drill's Start again opens its options before question 1", async () => {
    const { DrillFlow } = require("../src/flows/Drills");
    const { saveRun } = require("../src/resume");
    await withProfile(<DrillFlow route={{ params: { type: "conjugation" } }} navigation={nav} />);
    // A first visit opens the options; close them and leave a run part-way.
    await act(async () => { fireEvent.press(await screen.findByTestId("drill-apply")); });
    saveRun("drill:conjugation", { route: "Drill", params: { type: "conjugation" }, title: "Conjugation",
                                    queue: steps(), at: 1, total: 4, tally: { right: 1, total: 1 } });
    await flushState();
    const view2 = await withProfile(<DrillFlow route={{ params: { type: "conjugation" } }} navigation={nav} />);
    expect(await screen.findByTestId("resume-prompt")).toBeTruthy();
    expect(screen.queryByTestId("drill-options")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Start again")); });
    expect(await screen.findByTestId("drill-options")).toBeTruthy();
    view2.unmount();
  });

  /* A quiz left part-way is offered on the setup screen, and Start again
     comes back to that screen with the run's own choices ticked. */
  it("a quiz left part-way is offered on its setup screen, and continues with its own choices", async () => {
    const { QuizSetup } = require("../src/flows/Quiz");
    const { saveRun } = require("../src/resume");
    const { QUIZ_KINDS } = require("../src/questions");
    const kind = QUIZ_KINDS[0].id;
    await withProfile(<View />);
    saveRun("custom", { route: "CustomQuiz", params: { kinds: [kind], units: [unit.id], n: 10 }, title: "Quiz",
                         queue: steps(), at: 1, total: 4, tally: { right: 1, total: 1 } });
    await withProfile(<QuizSetup navigation={nav} />);
    expect(await screen.findByTestId("resume-prompt")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(nav.navigate).toHaveBeenCalledWith("CustomQuiz",
      { kinds: [kind], units: [unit.id], n: 10, resume: true });
  });

  it("opened with resume set, it continues without asking", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      const view = await withProfile(quiz());
      await answer(deck[0]);
      await act(async () => { view.unmount(); });
      await withProfile(quiz({ resume: true }));
      expect(await screen.findByText("2/4")).toBeTruthy();
      expect(screen.queryByTestId("resume-prompt")).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it("is not offered once it is a week old", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      await withProfile(quiz());
      await answer(deck[0]);
      expect(savedRun(KEY, Date.now() + RESUME_MAX_AGE + 1)).toBeNull();
      expect(latestRun(Date.now() + RESUME_MAX_AGE + 1)).toBeNull();
    } finally { spy.mockRestore(); }
  });
});

describe("opening the app", () => {
  it("offers the run on the path, once", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    try {
      const view = await withProfile(quiz());
      await answer(deck[0]);
      await act(async () => { view.unmount(); });
      resetResume();                                    // a fresh launch

      const learn = await withProfile(<Learn navigation={nav} />);
      expect(await screen.findByTestId("resume-sheet")).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByTestId("resume-continue")); });
      expect(nav.navigate).toHaveBeenCalledWith("Quiz", { unitId: unit.id, index: 0, resume: true });
      await act(async () => { learn.unmount(); });

      await withProfile(<Learn navigation={nav} />);
      await screen.findByTestId("next-step");
      expect(screen.queryByTestId("resume-sheet")).toBeNull();   // not again this launch
    } finally { spy.mockRestore(); }
  });

  /* The owner, 2026-10-29: "every time I open the app, I get a continue where
     you left off prompt… it should only do that if I was halfway through an
     exercise and closed the app". A run passed over at one launch is not
     offered at the next; one more answer in it, and it is. */
  it("a run passed over is not offered at the next launch, until it is worked on again", async () => {
    const deck = steps();
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(deck);
    const relaunch = async () => { resetResume(); await flushState(); await loadResume("p1"); };
    try {
      const view = await withProfile(quiz());
      await answer(deck[0]);
      await act(async () => { view.unmount(); });

      await relaunch();
      const learn = await withProfile(<Learn navigation={nav} />);
      expect(await screen.findByTestId("resume-sheet")).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });   // passed over
      await act(async () => { learn.unmount(); });

      await relaunch();
      const learn2 = await withProfile(<Learn navigation={nav} />);
      await screen.findByTestId("next-step");
      expect(screen.queryByTestId("resume-sheet")).toBeNull();     // not again at the next launch
      expect(savedRun(KEY)).toMatchObject({ at: 1 });               // but the run is kept
      await act(async () => { learn2.unmount(); });

      // Its own screen still asks: leaving a quiz and coming back to it.
      const again = await withProfile(quiz());
      expect(await screen.findByTestId("resume-prompt")).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByText("Continue")); });
      await answer(deck[1]);                                        // worked on again
      await act(async () => { again.unmount(); });

      await relaunch();
      await withProfile(<Learn navigation={nav} />);
      expect(await screen.findByTestId("resume-sheet")).toBeTruthy();
      expect(screen.getByTestId("resume-what")).toHaveTextContent("2 of 4");
    } finally { spy.mockRestore(); }
  });
});

/* A saved deck goes through JSON, so a question must come back from it whole. */
describe("a dealt question", () => {
  it("survives being written down", () => {
    const deck = Q.quizSteps(STAGES[1].core, 0, [], {});
    expect(JSON.parse(JSON.stringify(deck))).toEqual(deck);
  });
});
