/* A chapter's grammar run (GrammarFlow, 2026-09-30): the grammar point of a
   chapter with that chapter's words, as the unit's own module, on the unit
   screen and in Practice. Inside a lesson the rule is practised at the end of
   the vocabulary walk; the run is not a lesson step (2026-10-08). */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { UnitScreen } from "../src/screens/Unit";
import { GrammarFlow } from "../src/screens/Flows";
import { UN, components, hasGrammar } from "../src/data";

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
  it("is not a step: the words' walk practises the rule", () => {
    for (let i = 0; i < 3; i++) expect(components(base, core2, i).some((c) => c.id === "grammar")).toBe(false);
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
    expect(await screen.findByText(/^(Choose|Write) the present for/)).toBeTruthy();
  });
});
