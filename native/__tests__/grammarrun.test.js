/* A chapter's grammar run (GrammarFlow, 2026-09-30): the grammar point of a
   chapter with that chapter's words, as a lesson's optional step and as the
   unit's own module, on the unit screen and in Practice. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { UnitScreen, LessonScreen } from "../src/screens/Unit";
import { GrammarFlow } from "../src/screens/Flows";
import { UN, components, nextStep, lessonDone, hasGrammar, grammarKey } from "../src/data";

const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "teddy", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

const core1 = UN.find((u) => u.id === "core1");
const core2 = UN.find((u) => u.id === "core2");
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn() });

describe("in a lesson", () => {
  it("is an optional step, from chapter 2 on, that finishes nothing owed", () => {
    expect(components(base, core1, 0).some((c) => c.id === "grammar")).toBe(false);
    const step = components(base, core2, 0).find((c) => c.id === "grammar");
    expect(step).toMatchObject({ optional: true, done: false });
    const done = { ...base, drills: { [grammarKey(core2, 0)]: { best: 90, runs: 1 } } };
    expect(components(done, core2, 0).find((c) => c.id === "grammar").done).toBe(true);
    expect(lessonDone(done, core2, 0)).toBe(false);
    // Continue never lands on it: it is offered, not owed.
    const afterVocab = { ...base, unit: { [core2.id]: { lessons: { 0: { v: true } } } } };
    expect(nextStep(afterVocab).step).not.toBe("grammar");
  });

  it("opens the run on the lesson's words", async () => {
    const n = nav();
    await withProfile(<LessonScreen route={{ params: { unitId: core2.id, index: 0 } }} navigation={n} />);
    fireEvent.press(await screen.findByText("Grammar"));
    expect(n.navigate).toHaveBeenCalledWith("GrammarRun", { unitId: core2.id, index: 0 });
  });
});

describe("on the unit screen", () => {
  it("is offered where the chapter has a grammar point and not in chapter 1", async () => {
    expect(hasGrammar(core1)).toBe(false);
    const n = nav();
    await withProfile(<UnitScreen route={{ params: { unitId: core2.id } }} navigation={n} />);
    fireEvent.press(await screen.findByTestId("unit-grammar"));
    expect(n.navigate).toHaveBeenCalledWith("GrammarRun", { unitId: core2.id });
  });

  it("is absent where there is nothing to practise", async () => {
    await withProfile(<UnitScreen route={{ params: { unitId: core1.id } }} navigation={nav()} />);
    await screen.findByTestId("unit-summary");
    expect(screen.queryByTestId("unit-grammar")).toBeNull();
  });
});

describe("the run", () => {
  it("asks the chapter's point straight away", async () => {
    await withProfile(<GrammarFlow route={{ params: { unitId: core2.id } }} navigation={nav()} />);
    expect(await screen.findByText(/^Choose the (present|future) for/)).toBeTruthy();
  });
});
