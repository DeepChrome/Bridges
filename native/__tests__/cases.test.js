/* The case modules (core/cases.js; the owner, 2026-10-08): the five cases in
 * order on their own screen under Practice, each a lesson on the situations
 * that call for it and a drill on real sentences, and each also a step in
 * the chapter that brings it in. */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { CaseHub, CaseModule, CaseFlow, CASE_DRILL_N } from "../src/screens/Flows";
import { STAGES, components, stepRoute, caseLearnKey } from "../src/data";
import { CASES } from "@core/cases";
import { SCHEMA_VERSION } from "@core/state";

const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn(),
              addListener: jest.fn(() => () => {}) };
const base = { v: SCHEMA_VERSION, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, mined: {} };

async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the case hub", () => {
  it("lists the five cases in the order they are taught, and opens one", async () => {
    await withProfile(<CaseHub navigation={nav} />);
    for (const c of CASES) expect(await screen.findByTestId(`case-${c.id}`)).toBeTruthy();
    expect(CASES.map((c) => c.id)).toEqual(["prepositional", "accusative", "genitive", "dative", "instrumental"]);
    await act(async () => { fireEvent.press(screen.getByTestId("case-genitive")); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseModule", { caseId: "genitive" });
    // Every case mixed is the forms drill.
    await act(async () => { fireEvent.press(screen.getByTestId("case-mixed")); });
    expect(nav.navigate).toHaveBeenCalledWith("Drill", { type: "cases" });
  });
});

describe("a case's page", () => {
  it("leads with Learn until the lesson is done, then with Drill", async () => {
    await withProfile(<CaseModule route={{ params: { caseId: "dative" } }} navigation={nav} />);
    for (const u of CASES.find((c) => c.id === "dative").uses) {
      expect(await screen.findByTestId(`case-use-${u.id}`)).toBeTruthy();
    }
    await act(async () => { fireEvent.press(screen.getByText("Learn")); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseRun", { caseId: "dative", mode: "learn" });
  });

  it("…and with Drill once learned", async () => {
    await withProfile(<CaseModule route={{ params: { caseId: "dative" } }} navigation={nav} />,
      { drills: { [caseLearnKey("dative")]: { best: 90, runs: 1 } } });
    await act(async () => { fireEvent.press(await screen.findByText("Drill")); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseRun", { caseId: "dative", mode: "drill" });
    expect(screen.getByText("Learn again")).toBeTruthy();
  });
});

describe("a case's lesson", () => {
  it("opens on the case's card and then teaches each use", async () => {
    await withProfile(<CaseFlow route={{ params: { caseId: "prepositional", mode: "learn" } }} navigation={nav} />);
    expect(await screen.findByText("The prepositional case")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("case-card-next")); });
    expect(await screen.findByText("в or на: where something is")).toBeTruthy();
  });
});

describe("a case's drill", () => {
  it(`asks ${CASE_DRILL_N} questions`, async () => {
    await withProfile(<CaseFlow route={{ params: { caseId: "genitive", mode: "drill" } }} navigation={nav} />);
    expect(await screen.findByText(new RegExp(`^1\\s*/\\s*${CASE_DRILL_N}$`))).toBeTruthy();
  });
});

describe("the case in its chapter", () => {
  it("is a step of the spine's first lesson in the chapter that brings it in", () => {
    for (const c of CASES) {
      const core = STAGES[c.stage].core;
      const step = components(base, core, 0).find((x) => x.id === "case");
      expect(step && step.optional).toBe(true);
      expect(step.label).toBe(`${c.name} case`);
      expect(stepRoute("case", core, 0)).toEqual(["CaseRun", { caseId: c.id, mode: "learn", unitId: core.id, index: 0 }]);
      // Not in a later lesson, and not in another chapter.
      expect(components(base, core, 1).some((x) => x.id === "case")).toBe(false);
    }
    expect(components(base, STAGES[0].core, 0).some((x) => x.id === "case")).toBe(false);
  });

  it("is done once its lesson has been run", () => {
    const core = STAGES[CASES[0].stage].core;
    const st = { ...base, drills: { [caseLearnKey(CASES[0].id)]: { best: 70, runs: 1 } } };
    expect(components(st, core, 0).find((x) => x.id === "case").done).toBe(true);
  });
});
