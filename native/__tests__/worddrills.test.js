/* The Drills button on the back of a flashcard (worddrills.js; the owner,
 * 2026-10-31: "a little drills button on the back of the card… a submenu of
 * drills for that word… all drill options for that word").
 *
 * What is asserted: the button is on the back of a word's card and not on a
 * sentence's; the sheet lists the drills *this* word can take — a noun's
 * cases, never a conjugation — and a row opens the run with the word and the
 * drill named. The run itself is worddrillflow.test.js.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { L, SPEECH } from "../src/data";
import { Q } from "../src/questions";
import { DAY, REVIEW } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const NOUN = "город";
const VERB = "читать";
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });

const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
  /* No new cards, so the seeded card is the pile: the day's chunk is shuffled
     since 2026-11-19 and a new sentence card could otherwise come first. */
  flash: ["recognise"], newPerDay: 0, learnAhead: 20, cardKinds: ["words"],
};
async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  const view = await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  return view;
}
const show = async () => {
  await screen.findByText("Show");
  await act(async () => { fireEvent.press(screen.getByText("Show")); });
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the Drills button on the back of a card", () => {
  it("is on the back of a word's card, beside More, and not on its front", async () => {
    await withProfile({ seen: { [NOUN]: { recognise: due() } } });
    await screen.findByText("Show");
    expect(screen.queryByTestId("word-drills-open")).toBeNull();
    await show();
    expect(await screen.findByTestId("word-drills-open")).toBeTruthy();
    expect(screen.getByTestId("full-entry")).toBeTruthy();
  });

  /* A sentence card has no paradigm to drill and no entry to open: neither
     button. */
  it("is not on a sentence card", async () => {
    const sentence = SPEECH.rows.find((r) => /\s/.test(r[0]))[0];
    await withProfile({ seen: { [sentence]: { recognise: due() } }, cardKinds: ["sentences"] });
    await show();
    expect(screen.queryByTestId("word-drills-open")).toBeNull();
    expect(screen.queryByTestId("full-entry")).toBeNull();
  });

  /* The sheet is this word's drills: what core/questions.js wordDrills says
     the word can take, no more — a noun is never offered a conjugation. */
  it("lists exactly the drills the word can take, a noun's cases among them", async () => {
    await withProfile({ seen: { [NOUN]: { recognise: due() } } });
    await show();
    await act(async () => { fireEvent.press(screen.getByTestId("word-drills-open")); });
    expect(await screen.findByTestId("word-drills")).toBeTruthy();
    const i = L.findIndex((w) => w.b === NOUN);
    const offered = Q.wordDrills(i).map((d) => d.id);
    expect(offered).toEqual(expect.arrayContaining(["meaning", "sentence", "cases"]));
    expect(offered).not.toContain("conjugation");
    expect(offered).not.toContain("aspect");
    for (const id of ["meaning", "sentence", "cases", "agreement", "conjugation", "aspect", "stress", "say"]) {
      expect([id, !!screen.queryByTestId(`word-drill-${id}`)]).toEqual([id, offered.includes(id)]);
    }
    // The row says how long the run is, and nothing has asked the forms yet.
    expect(within(screen.getByTestId("word-drill-cases")).getByText(/^\d+ questions$/)).toBeTruthy();
    expect(screen.queryByTestId("word-drill-cases-score")).toBeNull();
  });

  /* The score each drill will move, on its row: the word's own skill slot
     (core/skills.js), as the ring's breakdown reports it. */
  it("wears the word's score for the skill the drill feeds", async () => {
    const forms = { state: REVIEW, s: 30, d: 5, reps: 6, lapses: 0, lastAt: now - DAY, dueAt: now + 20 * DAY };
    await withProfile({ seen: { [NOUN]: { recognise: due(), forms } } });
    await show();
    await act(async () => { fireEvent.press(screen.getByTestId("word-drills-open")); });
    await screen.findByTestId("word-drills");
    expect(screen.getByTestId("word-drill-cases-score")).toBeTruthy();
    // Stress is not in this menu (the owner, 2026-10-31).
    expect(screen.queryByTestId("word-drill-stress")).toBeNull();
    // Meaning's two skills have not been asked: no ring.
    expect(screen.queryByTestId("word-drill-meaning-score")).toBeNull();
  });

  it("opens the chosen drill with the word and the drill named", async () => {
    await withProfile({ seen: { [NOUN]: { recognise: due() } } });
    await show();
    await act(async () => { fireEvent.press(screen.getByTestId("word-drills-open")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("word-drill-cases")); });
    expect(nav.navigate).toHaveBeenCalledWith("WordDrill", { word: NOUN, drill: "cases" });
  });

  it("offers a verb its conjugation and aspect pair and never its cases", async () => {
    await withProfile({ seen: { [VERB]: { recognise: due() } } });
    await show();
    await act(async () => { fireEvent.press(screen.getByTestId("word-drills-open")); });
    await screen.findByTestId("word-drills");
    expect(screen.getByTestId("word-drill-conjugation")).toBeTruthy();
    expect(screen.getByTestId("word-drill-aspect")).toBeTruthy();
    expect(screen.queryByTestId("word-drill-cases")).toBeNull();
  });
});
