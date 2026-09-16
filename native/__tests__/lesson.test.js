/* The lesson screen's one primary action, and the quiz's result screen telling
   the truth about the relief rule (the interface review, 2026-09-08).

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { LessonScreen } from "../src/screens/Unit";
import { QuizFlow } from "../src/screens/Flows";
import { Done } from "../src/screens/Run";
import { Q } from "../src/questions";
import { nextStep, lessonDone, STAGES, L, lessonWords } from "../src/data";
import { fold } from "@core/util";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn() };
const base = { v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, dev: true };

async function withProfile(ui, state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the lesson screen", () => {
  const route = { params: { unitId: "food", index: 0 } };

  it("offers the next undone step as its one primary action", async () => {
    await withProfile(<LessonScreen route={route} navigation={nav} />,
                      { unit: { food: { lessons: { 0: { v: true } } } } });
    fireEvent.press(await screen.findByText("Take the quiz"));
    expect(nav.navigate).toHaveBeenCalledWith("Quiz", { unitId: "food", index: 0 });
  });

  it("knows the next step of the next lesson, for Continue", () => {
    const st = { ...base, unit: { core1: { video: true, lessons: { 0: { v: true, q: 90 }, 1: { v: true } } } } };
    expect(nextStep(st)).toMatchObject({ index: 1, step: "quiz" });
    expect(nextStep(base)).toMatchObject({ index: 0, step: "vocab" });
  });
});

/* A lesson quiz end to end through the real flow and the real session: the
   questions are the generator's own (pinned through a spy so the right answers
   are known), the marks land in the profile row, the lesson clears, Continue
   would open the next one (the engineering review's first missing test). */
describe("a quiz, end to end", () => {
  it("marks the lesson passed in the saved profile and points at the next", async () => {
    const unit = STAGES[0].core;
    const words = lessonWords(unit, 0);
    const pool = Q.poolFor(unit);
    const steps = words.slice(0, 3).map((i) => Q.present({ t: "choose-en", i, pool }))
      .concat([Q.present({ t: "type", i: words[3], pool })]);
    const spy = jest.spyOn(Q, "quizSteps").mockReturnValue(steps);
    try {
      // The video component is shared by the whole unit, so it is already done
      // here: this test is about the quiz clearing the lesson.
      await withProfile(<QuizFlow route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />,
                        { unit: { [unit.id]: { video: true, lessons: { 0: { v: true } } } } });
      for (const q of steps) {
        await screen.findByText(q.ask);
        if (q.typed) {
          const input = screen.getByTestId("type-input");
          fireEvent.changeText(input, fold(q.target));
          await waitFor(() => expect(input.props.value).toBe(fold(q.target)));
          await act(async () => { fireEvent.press(screen.getByText("Check")); });
        } else {
          const right = q.options.find((o) => o.right).label;
          await act(async () => { fireEvent.press(screen.getAllByText(right).pop()); });
        }
        expect(await screen.findByText("Correct")).toBeTruthy();
        await act(async () => { fireEvent.press(screen.getByText("Continue")); });
      }
      expect(await screen.findByText("Quiz passed")).toBeTruthy();
      expect(screen.getByText("4 of 4 right")).toBeTruthy();

      await flushState();
      const saved = (await global.__db.saved("p1"));
      expect(saved.unit[unit.id].lessons[0]).toMatchObject({ v: true, q: 100, tries: 1 });
      expect(lessonDone(saved, unit, 0)).toBe(true);
      expect(nextStep(saved)).toMatchObject({ index: 1, step: "vocab" });
      // The words were reviewed: each has a schedule now.
      for (const i of words.slice(0, 4)) expect(saved.seen[L[i].b]).toBeTruthy();

      await act(async () => { fireEvent.press(screen.getByText("Next lesson")); });
      expect(nav.replace).toHaveBeenCalledWith("Vocab", { unitId: unit.id, index: 1 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the result screen", () => {
  it("points forward after a pass, and to another try after a fail", async () => {
    const onContinue = jest.fn(), onAgain = jest.fn(), onBack = jest.fn();
    await render(<Done title="Quiz passed" score={90} passed onContinue={onContinue} continueLabel="Next lesson"
                       onAgain={onAgain} againLabel="Try again" onBack={onBack} />);
    await act(async () => { fireEvent.press(await screen.findByText("Next lesson")); });
    expect(onContinue).toHaveBeenCalled();
    expect(screen.getByText("Try again")).toBeTruthy();

    await render(<Done title="Not quite" score={40} passed={false} onAgain={onAgain} againLabel="Try again" onBack={onBack} />);
    expect(screen.queryByText("Next lesson")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Try again")); });
    expect(onAgain).toHaveBeenCalled();
  });
});
