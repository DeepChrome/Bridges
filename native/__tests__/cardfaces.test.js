/* The two faces of a flashcard after its first turn (the owner, 2026-10-31):
 *
 *   - "when a card is flipped for the first time, flipping back should give
 *     the full card on the other side… fully detailed cards after the initial
 *     flip";
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
  it("shows nothing but the word before Show, and the full card on both sides after", async () => {
    const view = await withProfile();
    expect(screen.queryByTestId("sense-list")).toBeNull();
    expect(screen.queryByTestId("card-actions")).toBeNull();
    await show();
    expect(await screen.findByTestId("sense-list")).toBeTruthy();
    // Turned back: still the full card, not the bare word.
    await turn();
    expect(screen.getByTestId("sense-list")).toBeTruthy();
    expect(screen.getByTestId("card-actions")).toBeTruthy();
    void view;
  });

  it("puts Drills and More right under the word, above the meanings", async () => {
    const view = await withProfile();
    await show();
    await screen.findByTestId("card-actions");
    expect(order(view, "card-actions")).toBeGreaterThan(order(view, "card-russian"));
    expect(order(view, "card-actions")).toBeLessThan(order(view, "sense-list"));
    expect(within(screen.getByTestId("card-actions")).getByText("Drills")).toBeTruthy();
    expect(within(screen.getByTestId("card-actions")).getByText("More")).toBeTruthy();
  });

  /* The English front names the same first meaning the Russian side numbers
     1 — the entry's own senses, not the gloss's first group. */
  it("gives the English side the same primary meaning as the Russian side", async () => {
    await withProfile({ flash: ["produce"] });
    const senses = sensesOf(exactIdx(WORD));
    expect(senses && senses.length).toBeTruthy();
    expect(screen.getByTestId("card-meaning-front").props.children).toBe(senses[0].g);
    await show();
    // Turned back after the first turn, the Russian side is the full card
    // and its first sense is the same text.
    await turn();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(within(screen.getByTestId("sense-list")).getAllByText(new RegExp(esc(senses[0].g))).length).toBeGreaterThan(0);
    expect(screen.getByTestId("card-actions")).toBeTruthy();
  });
});
