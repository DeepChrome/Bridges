/* Case cards (flows/CaseCards.js; core/casecards.js): a stack of flashcards
 * on the cases, as Study's Cases tab. Pinned: the tab and the tile that opens
 * it; a front is never word-linked (a word's sheet names its form, which is
 * the answer); a case card is checked by a tap, a choice card by one of four,
 * a production card graded by the learner; every answer grades at once — the
 * trigger or rule in `caseCards`, a word's forms score and never its meaning
 * card; the stack runs across many kinds of card; Finish ends on what was
 * met. */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { CaseStack } from "../src/flows/CaseCards";
import { Practice } from "../src/screens/Practice";
import { review } from "@core/scheduler";
import { CARD_TYPES } from "@core/casecards";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn(),
              addListener: () => () => {} };
const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 0, learnAhead: 20,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return render(<SessionProvider>{ui}</SessionProvider>);
}
const saved = async () => { await flushState(); return global.__db.saved("p1"); };
const stack = (state, key = "cards-1") => withProfile(<CaseStack route={{ key, name: "Cards" }} />, state);
const only = (types, extra = {}) => ({ drillPrefs: { casecards: { types, ...extra } } });
const links = (node) => within(node).queryAllByRole("link");
const start = async () => { await act(async () => { fireEvent.press(await screen.findByTestId("casecards-start")); }); };

/* Answers whatever card is on top, and moves on. */
async function answerAny(g = 3) {
  if (screen.queryByTestId("casecard-show")) {
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
    await act(async () => { fireEvent.press(screen.getByTestId(`casecard-grade-${g}`)); });
    return;
  }
  const pick = screen.queryByTestId("casecard-pick-genitive") || screen.getByTestId("casecard-opt-0");
  await act(async () => { fireEvent.press(pick); });
  await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("case cards", () => {
  it("is Study's second tab, Vocabulary first", async () => {
    await withProfile(<Study navigation={nav} route={{ key: "cards-0", name: "Cards" }} />);
    expect(await screen.findByTestId("study-tabs-words")).toBeTruthy();
    expect(screen.getByTestId("study-heading")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("study-tabs-cases")); });
    expect(await screen.findByTestId("casecards-start")).toBeTruthy();
  });

  it("a round handed in from a lesson has no tabs", async () => {
    await withProfile(<Study navigation={nav} route={{ key: "list-0", name: "ListCards", params: {} }} />);
    expect(await screen.findByTestId("study-heading")).toBeTruthy();
    expect(screen.queryByTestId("study-tabs")).toBeNull();
  });

  it("the Practice tile opens Study on the Cases tab", async () => {
    await withProfile(<Practice navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("practice-tabs-grammar")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("drill-casecards")); });
    expect(nav.navigate).toHaveBeenCalledWith("Study", { screen: "Cards", params: { tab: "cases" } });
  });

  it("a sentence card: unlinked, five cases to tap, checked at once and graded at once", async () => {
    await stack(only(["sentence-case"], { focus: "v-where" }));
    await start();
    const card = screen.getByTestId("casecard-sentence-case");
    expect(links(card)).toHaveLength(0);
    expect(within(card).getByTestId("casecard-noun")).toBeTruthy();
    for (const c of ["prepositional", "accusative", "genitive", "dative", "instrumental"]) {
      expect(screen.getByTestId(`casecard-pick-${c}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("casecard-next")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-prepositional")); });
    expect(screen.getByTestId("casecard-why")).toBeTruthy();
    expect(screen.getByTestId("casecard-next")).toBeTruthy();
    const st = await saved();
    expect(st.caseCards["v-where"].reps).toBe(1);
  });

  it("a wrong case is Again", async () => {
    await stack(only(["trigger-case"], { focus: "v-where" }));
    await start();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-dative")); });
    const st = await saved();
    expect(st.caseCards["v-where"].state).not.toBe(2);
  });

  it("a word card moves the word's forms score and never its meaning card", async () => {
    const now = Date.now();
    const seen = { "книга": { recognise: review(null, 4, now - 9 * 86400000) } };
    await stack({ seen, ...only(["make-case"]) });
    await start();
    expect(screen.getByTestId("casecard-make-case")).toBeTruthy();
    expect(screen.queryByTestId("casecard-answer")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
    expect(screen.getByTestId("casecard-answer")).toBeTruthy();
    expect(screen.getByTestId("casecard-table")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-3")); });
    const st = await saved();
    const forms = Object.keys(st.seen).filter((w) => st.seen[w].forms);
    expect(forms).toHaveLength(1);
    if (forms[0] !== "книга") expect(st.seen[forms[0]].recognise).toBeUndefined();
    expect(st.seen["книга"].recognise.reps).toBe(seen["книга"].recognise.reps);
    expect(st.caseCards || {}).toEqual({});
  });

  it("a choice card offers four and checks the one picked", async () => {
    await stack(only(["trigger-meaning"]));
    await start();
    for (const k of [0, 1, 2, 3]) expect(screen.getByTestId(`casecard-opt-${k}`)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-opt-0")); });
    expect(screen.getByTestId("casecard-next")).toBeTruthy();
    const st = await saved();
    expect(Object.keys(st.caseCards)).toHaveLength(1);
  });

  it("runs on across many kinds of card", async () => {
    await stack({ seen: { "стол": { recognise: review(null, 3, Date.now() - 86400000) } } });
    await start();
    const kinds = new Set();
    for (let k = 0; k < 30; k++) {
      for (const x of CARD_TYPES) if (screen.queryByTestId(`casecard-${x.id}`)) kinds.add(x.id);
      await answerAny();
    }
    expect(kinds.size).toBeGreaterThanOrEqual(6);
    expect(screen.getByTestId("casecards-count").props.children).toBe("30 cards");
  });

  it("Finish ends on what was met, and Keep going deals again", async () => {
    await stack(only(["trigger-case", "sentence-case"], { focus: "za-instr" }));
    await start();
    for (let k = 0; k < 3; k++) await answerAny();
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-finish")); });
    expect(screen.getByTestId("casecards-end").props.children).toMatch(/of 3 right/);
    expect(screen.getByTestId("casecards-result-za-instr")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-keep-going")); });
    expect(await screen.findByTestId("casecard-stack")).toBeTruthy();
  });

  /* The owner, 2026-11-23: "confusing what's even being asked but more
     confusing that we don't know the rule that makes the answer correct…
     the learner needs the ability to review why they were wrong at the end". */
  it("says what it asks, gives the rule and the wrong pick's meaning, and lists the misses at the end", async () => {
    await stack(only(["trigger-case"], { focus: "v-where" }));
    await start();
    expect(screen.getByTestId("casecard-ask").props.children).toBe("Which case does it take?");
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-dative")); });
    expect(screen.getByTestId("casecard-rule-0")).toBeTruthy();
    expect(screen.getByTestId("casecard-miss")).toBeTruthy();
    // The table, a tap away.
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-show-table")); });
    expect(screen.getByTestId("casecard-table")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-finish")); });
    expect(screen.getByTestId("casecards-missed")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-miss-0")); });
    expect(await screen.findByTestId("casecards-review")).toBeTruthy();
    expect(within(screen.getByTestId("casecards-review")).getByTestId("casecard-table")).toBeTruthy();
  });

  it("Back steps to the card before, as it was answered, without grading it again", async () => {
    const { BackHandler } = require("react-native");
    const handlers = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((ev, fn) => {
      handlers.push(fn);
      return { remove: () => { const k = handlers.indexOf(fn); if (k >= 0) handlers.splice(k, 1); } };
    });
    const pressBack = async () => { let took; await act(async () => { took = handlers[handlers.length - 1](); }); return took; };
    await stack(only(["trigger-case"], { focus: "v-where" }));
    await start();
    // Nothing to step back to on the first card: the gesture is the app's.
    expect(await pressBack()).toBe(false);
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-prepositional")); });
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
    expect(await pressBack()).toBe(true);
    // The card before, answered, with the way forward.
    expect(screen.getByTestId("casecard-why")).toBeTruthy();
    expect(screen.queryByTestId("casecards-finish")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-forward")); });
    expect(screen.queryByTestId("casecard-why")).toBeNull();
    expect(screen.getByTestId("casecards-finish")).toBeTruthy();
    const st = await saved();
    expect(st.caseCards["v-where"].reps).toBe(1);
    spy.mockRestore();
  });

  it("keeps its options in drillPrefs, from the + menu", async () => {
    await stack({});
    await screen.findByTestId("casecards-start");
    await act(async () => { global.__openOptions(); });
    expect(await screen.findByTestId("casecards-options")).toBeTruthy();
    for (const id of ["types", "cases", "numbers", "kinds", "focus"]) expect(screen.getByTestId(`casecards-${id}`)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-focus")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("casecards-focus-opt-za-instr")); });
    const st = await saved();
    expect(st.drillPrefs.casecards.focus).toBe("za-instr");
  });
});
