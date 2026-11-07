/* A word that will not stick (the owner, 2026-11-06: "I don't want the user
 * to get caught on the same word forever so if it's not sticking like 10
 * times in a row maybe it's time to just move on to a new word. I've seen it
 * just float in the same area for a while").
 *
 * The tenth Again in a row (core/queue.js STUCK_AT, counted across sittings)
 * rests the word: out of the sitting and the review for REST_DAYS, a new
 * word in its place, a line saying so with a way to drill it. Undo takes all
 * of it back. Before that, each further miss in a sitting comes back after a
 * longer gap.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { sessionFor } from "../src/studycards";
import { STUCK_AT, REST_DAYS, requeue, againGap } from "@core/queue";
import { DAY, REVIEW, dayOf } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 8, state: REVIEW, steps: 0, reps: 12, lapses: 6 });
const A = "город", B = "дом";
const base = {
  v: 10, seen: { [A]: { recognise: due() }, [B]: { recognise: due() } }, trouble: {}, pinned: [], sets: ["__path__"],
  drills: {}, unit: {}, watched: {}, speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"],
  newPerDay: 0, learnAhead: 20, cardKinds: ["words"], goal: { day: dayOf(now), owed: 2, done: 0 },
};
async function profile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}
const saved = async () => { await flushState(); return global.__db.saved("p1"); };
const stressed = (w) => new RegExp("^" + [...w].map((c) => c + "[\\u0300\\u0301]?").join("") + "$");
const onCard = (w) => within(screen.getByTestId("card-russian")).queryAllByText(stressed(w)).length > 0;

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

it("rests a word at its tenth Again in a row, puts a new word in its place, and Undo takes it back", async () => {
  // Both words have missed STUCK_AT − 1 times running: whichever comes first,
  // one more Again rests it.
  const run = { [A]: { run: STUCK_AT - 1 }, [B]: { run: STUCK_AT - 1 } };
  await profile({ rest: run });
  await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  await act(async () => { fireEvent.press(await screen.findByText("Show")); });
  const word = [A, B].find(onCard);
  await act(async () => { fireEvent.press(screen.getByTestId("grade-1")); });
  expect(await screen.findByTestId("word-rested")).toBeTruthy();
  expect(screen.getByTestId("word-rested-days").props.children).toBe(`Back in ${REST_DAYS} days`);
  let st = await saved();
  expect(st.rest[word]).toEqual({ until: dayOf(now) + REST_DAYS });
  // The next card is a new word, not the one rested.
  expect(screen.getByTestId("flag-new")).toBeTruthy();
  // The review leaves it out until its days are up.
  expect(sessionFor(st, { beyond: true }).items.map((x) => x.word)).not.toContain(word);
  // Drill it opens that word's drills.
  await act(async () => { fireEvent.press(screen.getByTestId("rested-drill")); });
  expect(nav.navigate).toHaveBeenCalledWith("WordDrill", { word });
  // Undo: the word is back on screen and its run is as it was.
  await act(async () => { fireEvent.press(screen.getByTestId("undo")); });
  expect(onCard(word)).toBe(true);
  st = await saved();
  expect(st.rest[word]).toEqual({ run: STUCK_AT - 1 });
});

it("counts a run of misses and lets any other answer break it", async () => {
  await profile({ rest: { [A]: { run: 4 }, [B]: { run: 4 } } });
  await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  await act(async () => { fireEvent.press(await screen.findByText("Show")); });
  const first = [A, B].find(onCard);
  await act(async () => { fireEvent.press(screen.getByTestId("grade-1")); });
  await act(async () => { fireEvent.press(await screen.findByText("Show")); });
  const second = [A, B].find(onCard);
  await act(async () => { fireEvent.press(screen.getByTestId("grade-3")); });
  const st = await saved();
  expect(st.rest[first]).toEqual({ run: 5 });
  expect(st.rest[second]).toBeUndefined();
  expect(screen.queryByTestId("word-rested")).toBeNull();
});

it("brings a missed card back after a gap that grows with each miss", () => {
  const items = Array.from({ length: 20 }, (_, k) => ({ word: `w${k}` }));
  const at = (n) => requeue(items, 0, items[0], againGap(n)).findIndex((x, k) => k > 0 && x.word === "w0");
  expect([1, 2, 3, 4, 5].map(at)).toEqual([4, 7, 10, 13, 13]);
});
