/* The two faces of a flashcard after its first turn:
 *
 *   - the front stays the front (the owner, 2026-11-19: "keep the front side
 *     of the flash card clean when flipped over. Keep it to the original card
 *     (pre flipped)") — from 2026-10-31 to then both sides were the full card
 *     after the first turn;
 *   - "put the drills and the more buttons near the top of the entry";
 *   - "the words and definitions for English to Russian don't always match
 *     the key definitions from the Russian to English".
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { L, sensesOf, exactIdx } from "../src/data";
import { DAY, REVIEW } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const WORD = "город";
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const base = {
  v: 10, seen: { [WORD]: { recognise: due() } }, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 0, learnAhead: 20,
  cardKinds: ["words"],
};
async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  const view = await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  await screen.findByText("Show");
  return view;
}
const show = async () => act(async () => { fireEvent.press(screen.getByText("Show")); });
const turn = async () => act(async () => { fireEvent.press(screen.getByTestId("card-turn")); });
/* Where a node sits in the rendered tree, for "A is above B". */
const order = (root, id) => JSON.stringify(root.toJSON()).indexOf(`"testID":"${id}"`);

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__players = []; });
afterEach(async () => { await flushState(); });

describe("the card after its first turn", () => {
  it("shows nothing but the word before Show, the full card on the back, and the clean front again when turned back", async () => {
    const view = await withProfile();
    expect(screen.queryByTestId("sense-list")).toBeNull();
    expect(screen.queryByTestId("card-actions")).toBeNull();
    await show();
    expect(await screen.findByTestId("sense-list")).toBeTruthy();
    expect(screen.getByTestId("card-actions")).toBeTruthy();
    // Turned back: the original front — the word and its speaker, nothing else.
    await turn();
    expect(screen.queryByTestId("sense-list")).toBeNull();
    expect(screen.queryByTestId("card-actions")).toBeNull();
    expect(screen.getByTestId("card-hint")).toBeTruthy();          // the front's own partial hint
    // …and over again: the full card.
    await turn();
    expect(await screen.findByTestId("sense-list")).toBeTruthy();
    void view;
  });

  /* At the top of the card, above the word, and boxed (the owner,
     2026-11-06: "the more and drills button should be more clearly indicated
     as buttons and they should be at the top of the card"). Two of them:
     Low priority is a sitting's action and sits in the footer with Undo and
     Skip, so the top row is one line beside the ring (the owner, 2026-11-10:
     "buttons chaotically strewn about"). */
  it("puts Drills and More at the top of the card as boxed buttons, and Low priority in the footer", async () => {
    const view = await withProfile();
    await show();
    await screen.findByTestId("card-actions");
    expect(order(view, "card-actions")).toBeLessThan(order(view, "card-russian"));
    expect(order(view, "card-actions")).toBeLessThan(order(view, "sense-list"));
    const actions = within(screen.getByTestId("card-actions"));
    for (const label of ["Drills", "More"]) expect(actions.getByText(label)).toBeTruthy();
    expect(actions.queryByText("Low priority")).toBeNull();
    expect(screen.getByTestId("set-aside")).toBeTruthy();
    expect(order(view, "set-aside")).toBeGreaterThan(order(view, "undo"));
    // A box: a fill and a hairline, not grey words on the card.
    for (const id of ["word-drills-open", "full-entry"]) {
      const style = [].concat(screen.getByTestId(id).props.style).reduce((a, s) => ({ ...a, ...s }), {});
      expect(style.borderWidth).toBe(1);
      expect(style.backgroundColor).toBeTruthy();
      expect(style.backgroundColor).not.toBe("transparent");
    }
  });

  /* The English front names the same first meaning the Russian side numbers
     1 — the entry's own senses, not the gloss's first group. */
  it("gives the English side the same primary meaning as the Russian side", async () => {
    await withProfile({ flash: ["produce"] });
    const senses = sensesOf(exactIdx(WORD));
    expect(senses && senses.length).toBeTruthy();
    expect(screen.getByTestId("card-meaning-front").props.children).toBe(senses[0].g);
    await show();
    // The back of a produce card: the meaning on top, the Russian answer under
    // it, and the actions; its first sense is the same text.
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(screen.getAllByText(new RegExp(esc(senses[0].g))).length).toBeGreaterThan(0);
    expect(screen.getByTestId("card-russian")).toBeTruthy();
    expect(screen.getByTestId("card-actions")).toBeTruthy();
    // Turned back: the English front alone again.
    await turn();
    expect(screen.queryByTestId("card-russian")).toBeNull();
    expect(screen.getByTestId("card-meaning-front").props.children).toBe(senses[0].g);
  });

  /* A card shows translations, never Wiktionary's explanation (the owner,
     2026-11-11, of «такой»: "out of control and looks extremely
     unprofessional"; 2026-11-12, of «по»: "says the same thing in white and
     grey"). «по» opens "used broadly to indicate action…", so the whole card
     falls back to the gloss; «такой» opens "such (a), such, that/this
     kind/sort/type of…", cut to the translation before the bracket. */
  it("cuts a card's meaning to its translation, or falls back to the gloss", async () => {
    const po = exactIdx("по");
    expect(sensesOf(po)[0].g.length).toBeGreaterThan(60);
    await withProfile({ seen: { "по": { recognise: due() } }, flash: ["recognise"] });
    await show();
    expect(screen.queryByTestId("sense-list")).toBeNull();
    expect(screen.getByTestId("senses")).toBeTruthy();
    expect(screen.queryByText(/used broadly/)).toBeNull();
    void po;
  });

  it("shows «такой» as \"such\", not its definition", async () => {
    await withProfile({ seen: { "такой": { recognise: due() } }, flash: ["produce"] });
    expect(screen.getByTestId("card-meaning-front").props.children).toBe("such");
    await show();
    // The back of a recognise card carries the sense list; a produce card's
    // back has the meaning as its head. Deal it from the Russian for the list.
    await act(async () => { fireEvent.press(screen.getByTestId("grade-3")); });
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, seen: { "такой": { recognise: due() } }, flash: ["recognise"] }));
  });

  it("…and its back lists \"such\" first", async () => {
    await withProfile({ seen: { "такой": { recognise: due() } }, flash: ["recognise"] });
    await show();
    expect(within(await screen.findByTestId("sense-list")).getByTestId("sense-primary")).toHaveTextContent("such");
    // The definition's wording is gone; a later sense's real translation
    // ("a kind/sort/type of") may stay.
    expect(screen.queryByText(/that\/this kind\/sort\/type of/)).toBeNull();
    expect(screen.queryByText(/used with/)).toBeNull();
  });
});
