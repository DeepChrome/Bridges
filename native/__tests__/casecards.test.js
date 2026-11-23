/* Case cards (flows/CaseCards.js; docs/case-cards.md): a stack of flashcards
 * on the words that decide a case, as Study's Cases tab. Pinned: the tab and
 * the tile that opens it; the stack shows one card at a time and never names
 * a path; a front is never word-linked (a word's sheet names its form, which
 * is the answer); a case card is checked by a tap and a production card graded
 * by the learner; a path grades its trigger once and moves the forms score of
 * the words it produced, never their meaning card; the stack runs on past a
 * path, onto another trigger; Finish ends on what was met. */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { CaseStack } from "../src/flows/CaseCards";
import { Practice } from "../src/screens/Practice";

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
const onlyOne = (id) => ({ drillPrefs: { casecards: { focus: id } } });

/* Every link inside a node: a word-linked sentence renders its words with the
   link role (words.js Linked). */
const links = (node) => within(node).queryAllByRole("link");

/* Answers the card on top: the case named, or Show and a grade. */
async function answer(caseId, g = 3) {
  if (screen.queryByTestId("casecard-show")) {
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
    await act(async () => { fireEvent.press(screen.getByTestId(`casecard-grade-${g}`)); });
    return "said";
  }
  await act(async () => { fireEvent.press(await screen.findByTestId(`casecard-pick-${caseId}`)); });
  await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
  return "checked";
}
const start = async () => { await act(async () => { fireEvent.press(await screen.findByTestId("casecards-start")); }); };

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

  it("opens on a card to look at, unlinked, with five cases to tap — and no path named", async () => {
    await stack({ drillPrefs: { casecards: { focus: "v-where", order: "example" } } });
    await start();
    expect(screen.getByTestId("casecard-stack")).toBeTruthy();
    expect(screen.queryByText(/path/i)).toBeNull();
    const card = screen.getByTestId("casecard-notice");
    expect(links(card)).toHaveLength(0);
    expect(within(card).getByTestId("casecard-noun")).toBeTruthy();
    for (const c of ["prepositional", "accusative", "genitive", "dative", "instrumental"]) {
      expect(screen.getByTestId(`casecard-pick-${c}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("casecard-next")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-prepositional")); });
    expect(screen.getByTestId("casecard-why")).toBeTruthy();
    expect(screen.getByTestId("casecard-next")).toBeTruthy();
  });

  it("walks a path: checks the cases, takes the learner's grades, grades the trigger once, and runs on", async () => {
    await stack(onlyOne("v-where"));
    await start();
    // A trigger never met is a four-card path.
    let said = 0;
    for (let k = 0; k < 4; k++) {
      if (screen.queryByTestId("casecard-show")) {
        // A production card: plain on the front, the answer only on Show.
        expect(screen.queryByTestId("casecard-answer")).toBeNull();
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
        expect(screen.getByTestId("casecard-answer")).toBeTruthy();
        await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-3")); });
        said++;
      } else await answer("prepositional");
    }
    expect(said).toBeGreaterThanOrEqual(1);
    const st = await saved();
    expect(st.caseCards["v-where"].reps).toBe(1);
    expect(Object.keys(st.caseCards)).toEqual(["v-where"]);
    // The produced nouns moved their forms score, and no meaning card.
    const forms = Object.keys(st.seen).filter((w) => st.seen[w].forms);
    expect(forms.length).toBeGreaterThanOrEqual(1);
    for (const w of forms) expect(st.seen[w].recognise).toBeUndefined();
    expect(st.drills.casecards.recent).toHaveLength(4);
    // The stack goes on: another card is on top, and the count says four.
    expect(screen.getByTestId("casecard-stack")).toBeTruthy();
    expect(screen.getByTestId("casecards-count").props.children).toBe("4 cards");
  });

  it("runs on to another trigger when not focused", async () => {
    await stack({});
    await start();
    const seen = new Set();
    for (let guard = 0; guard < 24; guard++) {
      const why = async () => {
        // Answer whatever is on top with the wrong case if need be; read the trigger off the back.
        if (screen.queryByTestId("casecard-show")) {
          await act(async () => { fireEvent.press(screen.getByTestId("casecard-show")); });
        } else {
          await act(async () => { fireEvent.press(screen.getByTestId("casecard-pick-genitive")); });
        }
        seen.add(within(screen.getByTestId("casecard-why")).getByTestId("casecard-case").props.children);
        if (screen.queryByTestId("casecard-grade-3")) await act(async () => { fireEvent.press(screen.getByTestId("casecard-grade-3")); });
        else await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
      };
      await why();
    }
    // Twenty-four cards cross more than one case.
    expect(seen.size).toBeGreaterThan(1);
    const st = await saved();
    expect(Object.keys(st.caseCards).length).toBeGreaterThan(2);
  });

  it("a wrong case marks the pick red and the trigger is graded Again", async () => {
    await stack({ drillPrefs: { casecards: { focus: "v-where", order: "example" } } });
    await start();
    await act(async () => { fireEvent.press(await screen.findByTestId("casecard-pick-dative")); });
    expect(screen.getByTestId("casecard-case")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecard-next")); });
    for (let k = 1; k < 4; k++) await answer("prepositional", 4);
    const st = await saved();
    // Again on a new card is a learning step, not a review.
    expect(st.caseCards["v-where"].state).not.toBe(2);
  });

  it("Finish ends on the triggers met, and Keep going deals again", async () => {
    await stack(onlyOne("za-instr"));
    await start();
    for (let k = 0; k < 5; k++) await answer("instrumental");
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-finish")); });
    expect(screen.getByTestId("casecards-end")).toBeTruthy();
    expect(screen.getAllByTestId(/^casecards-result-/).length).toBeGreaterThanOrEqual(2);
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-keep-going")); });
    expect(await screen.findByTestId("casecard-stack")).toBeTruthy();
  });

  it("keeps its options in drillPrefs, from the + menu: one trigger, cases, kinds, opener", async () => {
    await stack({});
    await screen.findByTestId("casecards-start");
    await act(async () => { global.__openOptions(); });
    expect(await screen.findByTestId("casecards-options")).toBeTruthy();
    for (const id of ["focus", "cases", "kinds", "order"]) expect(screen.getByTestId(`casecards-${id}`)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("casecards-focus")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("casecards-focus-opt-za-instr")); });
    const st = await saved();
    expect(st.drillPrefs.casecards.focus).toBe("za-instr");
  });
});
