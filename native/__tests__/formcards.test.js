/* Form cards (flows/FormCards.js, 2026-11-12): flashcards of forms and
 * conjugations in Practice. Pinned: the deck is the grammar drills' own
 * written questions; the front names the word and the cell; Show turns it;
 * a grade moves the word's "Cases & forms" score and nothing else — the
 * card's schedule is untouched. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { FormCardsFlow, formDeck, askLabel, FORM_CARD_KINDS } from "../src/flows/FormCards";
import { DrillList } from "../src/screens/Practice";
import { L, chapterWords } from "../src/data";
import { REVIEW, DAY } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
// Held well: familiarity past 40, so knownPool takes them.
const held = { dueAt: now + 60 * DAY, lastAt: now - 3 * DAY, s: 60, d: 5, state: REVIEW, steps: 0, reps: 9, lapses: 0 };
const nouns = chapterWords([0, 1]).filter((i) => L[i].p === "noun" && (L[i].t || []).some((t) => /Declension/.test(t.title))).slice(0, 12);
const seen = {};
for (const i of nouns) seen[L[i].b] = { recognise: { ...held } };
const base = {
  v: 10, seen, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 0, learnAhead: 20,
  drillPrefs: { formcards: { kinds: ["cases"] } },
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return render(<SessionProvider>{ui}</SessionProvider>);
}
const saved = async () => { await flushState(); return global.__db.saved("p1"); };

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("form cards", () => {
  it("is a row in Practice's grammar section", async () => {
    await withProfile(<DrillList navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("drill-formcards")); });
    expect(nav.navigate).toHaveBeenCalledWith("FormCards");
  });

  it("builds its deck from the drills' written questions, mixed, and names the cell asked", () => {
    const deck = formDeck(FORM_CARD_KINDS, nouns, undefined, 10);
    expect(deck.length).toBeGreaterThan(0);
    for (const q of deck) {
      expect(q.typed).toBe(true);
      expect(typeof q.answer).toBe("string");
      expect(FORM_CARD_KINDS).toContain(q.kind);
      expect(askLabel(q)).not.toMatch(/^Write/);
      expect(askLabel(q).length).toBeGreaterThan(0);
    }
    // Only nouns here, so only the cases drill can ask; nothing is invented.
    expect(deck.every((q) => q.kind === "cases")).toBe(true);
    expect(formDeck(["cases"], [], undefined, 10)).toEqual([]);
  });

  it("opens on its options, shows a card, turns it, and grades the forms score alone", async () => {
    await withProfile(<FormCardsFlow navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("formcards-apply")); });
    const front = await screen.findByTestId("formcard-word");
    expect(front.props.children).toBeTruthy();
    expect(screen.getByTestId("formcard-ask")).toBeTruthy();
    expect(screen.queryByTestId("formcard-back")).toBeNull();
    expect(screen.queryByTestId("formcard-grade-3")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("formcard-show")); });
    expect(screen.getByTestId("formcard-answer").props.children).toBeTruthy();
    expect(screen.getByTestId("formcard-table")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("formcard-grade-3")); });
    const st = await saved();
    const graded = Object.keys(st.seen).filter((w) => st.seen[w].forms);
    expect(graded).toHaveLength(1);
    expect(st.seen[graded[0]].forms.reps).toBe(1);
    // The card itself — the word's schedule — is as it was, for every word.
    for (const w of Object.keys(st.seen)) expect(st.seen[w].recognise.reps).toBe(held.reps);
    // The next card is face down.
    expect(screen.getByText(/^2 \/ \d+$/)).toBeTruthy();
    expect(screen.queryByTestId("formcard-back")).toBeNull();
  });

  it("says so when there is nothing to ask", async () => {
    await withProfile(<FormCardsFlow navigation={nav} />, { seen: {} });
    await act(async () => { fireEvent.press(await screen.findByTestId("formcards-apply")); });
    expect(await screen.findByText("No words at 40 yet")).toBeTruthy();
  });
});
