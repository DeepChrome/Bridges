/* Case cards (flows/CaseCards.js; docs/case-cards.md, 2026-11-23): paths of
 * flashcards on the words that decide a case. Pinned: the tile and the list;
 * a front is never word-linked (a word's sheet names its form, which is the
 * answer); a case card is checked by a tap and a production card graded by
 * the learner; a path grades its trigger once and moves the forms score of
 * the words it produced, never their meaning card; the sentences shown are
 * kept so the next session draws others. */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { CaseCards, CaseCardsRun, triggerTitle } from "../src/flows/CaseCards";
import { Practice } from "../src/screens/Practice";
import { Q } from "../src/questions";
import { offered } from "@core/casecards";
import { triggerById } from "@core/triggers";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn() };
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
const focusOn = (id) => ({ key: "run-1", params: { focus: id } });

/* Every link inside a node: a word-linked sentence renders its words with the
   link role (words.js Linked). */
const links = (node) => within(node).queryAllByRole("link");

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("case cards", () => {
  it("is a tile on Practice's Grammar tab", async () => {
    await withProfile(<Practice navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("practice-tabs-grammar")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("drill-casecards")); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseCards", undefined);
  });

  it("lists the offered triggers by case, new ones marked New; a tap practices one, Start a session", async () => {
    await withProfile(<CaseCards navigation={nav} route={{ key: "list-1" }} />);
    const list = offered(Q.triggerSightings());
    expect(list.length).toBeGreaterThan(30);
    const za = await screen.findByTestId("trigger-za-instr");
    expect(within(za).getByText(triggerTitle(triggerById("za-instr")))).toBeTruthy();
    expect(screen.getByTestId("trigger-new-za-instr")).toBeTruthy();
    await act(async () => { fireEvent.press(za); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseCardsRun", { focus: "za-instr" });
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-start")); });
    expect(nav.navigate).toHaveBeenCalledWith("CaseCardsRun", {});
  });

  it("shows a held trigger's ring instead of New", async () => {
    const now = Date.now();
    const card = { dueAt: now + 9e8, lastAt: now - 864e5, s: 30, d: 5, state: 2, steps: 0, reps: 4, lapses: 0 };
    await withProfile(<CaseCards navigation={nav} route={{ key: "list-2" }} />, { caseCards: { "v-where": card } });
    expect(await screen.findByTestId("trigger-score-v-where")).toBeTruthy();
    expect(screen.queryByTestId("trigger-new-v-where")).toBeNull();
  });

  it("opens example first on a trigger never met: a sentence, unlinked, and five cases to tap", async () => {
    await withProfile(<CaseCardsRun navigation={nav} route={focusOn("v-where")} />);
    const card = await screen.findByTestId("casecard-notice");
    expect(links(card)).toHaveLength(0);
    expect(within(card).getByTestId("casecard-noun")).toBeTruthy();
    for (const c of ["prepositional", "accusative", "genitive", "dative", "instrumental"]) {
      expect(screen.getByTestId(`casecard-pick-${c}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("casecard-next")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-prepositional")); });
    expect(screen.getByTestId("casecard-why")).toBeTruthy();
    expect(screen.getByTestId("casecard-next")).toBeTruthy();
    // Answered, the sentence's words are links, as everywhere else.
    expect(links(screen.getByTestId("casecard-notice")).length).toBeGreaterThan(0);
  });

  it("walks a path: checks the cases, takes the learner's grades, grades the trigger once", async () => {
    await withProfile(<CaseCardsRun navigation={nav} route={focusOn("v-where")} />);
    let shown = 0;
    for (let k = 0; k < 4; k++) {
      if (screen.queryByTestId("casecard-show")) {
        // A production card: plain on the front, the answer only on Show.
        expect(screen.queryByTestId("casecard-answer")).toBeNull();
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
        expect(screen.getByTestId("casecard-answer")).toBeTruthy();
        expect(screen.getByTestId("casecard-back")).toBeTruthy();
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-3")); });
        shown++;
      } else {
        await act(async () => { fireEvent.press(await screen.findByTestId("casecard-pick-prepositional")); });
        // The back is linked like any sentence, once answered.
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
      }
    }
    expect(shown).toBe(2);
    expect(await screen.findByTestId("casecards-progress")).toBeTruthy();
    const st = await saved();
    expect(st.caseCards["v-where"].reps).toBe(1);
    expect(Object.keys(st.caseCards)).toEqual(["v-where"]);
    // The two produced nouns moved their forms score, and no meaning card.
    const forms = Object.keys(st.seen).filter((w) => st.seen[w].forms);
    expect(forms.length).toBeGreaterThanOrEqual(1);
    for (const w of forms) expect(st.seen[w].recognise).toBeUndefined();
    expect(st.drills.casecards.recent).toHaveLength(4);
  });

  it("a wrong case marks the pick red and the trigger is graded Again", async () => {
    await withProfile(<CaseCardsRun navigation={nav} route={focusOn("v-where")} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("casecard-pick-dative")); });
    expect(screen.getByTestId("casecard-case")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
    for (let k = 1; k < 4; k++) {
      if (screen.queryByTestId("casecard-show")) {
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-4")); });
      } else {
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-prepositional")); });
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
      }
    }
    const st = await saved();
    // Again on a new card is a learning step, not a review.
    expect(st.caseCards["v-where"].state).not.toBe(2);
  });

  it("ends on the triggers met, with Again and Done", async () => {
    await withProfile(<CaseCardsRun navigation={nav} route={focusOn("za-instr")} />);
    for (let guard = 0; guard < 40 && !screen.queryByTestId("casecards-end"); guard++) {
      if (screen.queryByTestId("casecard-show")) {
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-3")); });
      } else if (screen.queryByTestId("casecard-pick-instrumental")) {
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-instrumental")); });
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
      }
    }
    expect(screen.getByTestId("casecards-end")).toBeTruthy();
    expect(screen.getAllByTestId(/^casecards-result-/).length).toBeGreaterThanOrEqual(1);
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-done")); });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it("keeps its options in drillPrefs, from the + menu", async () => {
    await withProfile(<CaseCards navigation={nav} route={{ key: "list-3" }} />);
    await screen.findByTestId("trigger-v-where");
    await act(async () => { global.__openOptions(); });
    expect(await screen.findByTestId("casecards-options")).toBeTruthy();
    expect(screen.getByTestId("casecards-cases")).toBeTruthy();
    expect(screen.getByTestId("casecards-order")).toBeTruthy();
  });
});
