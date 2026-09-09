/* The lesson screen's one primary action, and the quiz's result screen telling
   the truth about the relief rule (the interface review, 2026-09-08).

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { LessonScreen } from "../src/screens/Unit";
import { Done } from "../src/screens/Run";
import { nextStep } from "../src/data";

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
