/* One direction ahead of the other (core/lean.js), on the Study screen.
 *
 * The owner, 2026-10-31: a front switched part-way through a sitting should
 * start the cards again from the first; and when Russian → English has run
 * far ahead of English → Russian, a gentle nudge to switch — "don't make the
 * reminders obnoxious".
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { STAGES, L } from "../src/data";
import { DAY, REVIEW } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const due = (extra = {}) => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0, ...extra });
const slot = (s, reps) => ({ dueAt: now + 30 * DAY, lastAt: now - DAY, s, d: 5, state: REVIEW, steps: 0, reps, lapses: 0 });
const WORDS = STAGES[0].core.w.slice(0, 30).map((i) => L[i].b);

const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 5, learnAhead: 20,
  cardKinds: ["words"],
};
async function withProfile(state = {}, start = true) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  const view = await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  if (start) await global.__startStudy();
  return view;
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
const press = async (id) => act(async () => { fireEvent.press(await screen.findByTestId(id)); });

/* Thirty words met from the Russian side only: Russian → English scored,
   English → Russian never asked. */
const leaning = () => {
  const seen = {};
  for (const w of WORDS) seen[w] = { recognise: due({ reps: 6 }), ru2en: slot(20, 6) };
  return seen;
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__players = []; });
afterEach(async () => { await flushState(); });

describe("a front switched part-way", () => {
  it("deals the sitting again from its first card, from the other side", async () => {
    const two = WORDS.slice(0, 2);
    // No new words a day, so the sitting is exactly the two due cards.
    await withProfile({ seen: { [two[0]]: { recognise: due() }, [two[1]]: { recognise: due() } }, newPerDay: 0 });
    // One card graded from the Russian.
    await press("study-go").catch(() => {});
    await screen.findByText("Show");
    expect(screen.getByTestId("card-recognise")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await press("grade-3");
    // Switch the front to English in the options.
    await global.__openOptions();
    await press("flash-produce");
    await press("flash-recognise");
    await act(async () => { fireEvent.press(await screen.findByText("Done")); });
    // The pile starts again at the first card, now with the meaning in front…
    expect(await screen.findByTestId("card-produce")).toBeTruthy();
    expect(screen.getByText("From the top")).toBeTruthy();
    // …and the card already graded is in it again: two cards to go, not one.
    expect(screen.getByText("2 left")).toBeTruthy();
  });
});

describe("the nudge", () => {
  it("is one line on the options, naming the skill behind, with a switch", async () => {
    await withProfile({ seen: leaning() }, false);
    expect(await screen.findByTestId("lean-nudge")).toBeTruthy();
    expect(screen.getByText("English → Russian is behind")).toBeTruthy();
    // Nothing else: no sheet, no badge, no second sentence.
    expect(screen.queryByText(/switch modes/i)).toBeNull();
    await press("lean-switch");
    const st = await saved();
    expect(st.flash).toEqual(["produce"]);
    expect(st.nudged && st.nudged.skill).toBe("en2ru");
    // The behind front is now ticked, so the line is gone.
    await waitFor(() => expect(screen.queryByTestId("lean-nudge")).toBeNull());
  });

  it("says nothing when the behind front is already among the fronts, or the words are few", async () => {
    await withProfile({ seen: leaning(), flash: ["recognise", "produce"] }, false);
    await screen.findByTestId("study-start");
    expect(screen.queryByTestId("lean-nudge")).toBeNull();
  });

  it("stays quiet for days after it was shown", async () => {
    const { dayOf } = require("@core/scheduler");
    await withProfile({ seen: leaning(), nudged: { day: dayOf(now - DAY), skill: "en2ru" } }, false);
    await screen.findByTestId("study-start");
    expect(screen.queryByTestId("lean-nudge")).toBeNull();
  });
});
