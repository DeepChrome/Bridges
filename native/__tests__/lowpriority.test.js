/* Low priority (the owner, 2026-11-06): "The user should have the option to
 * flag a word low priority and that will remove it from the rotation. The
 * user needs to be able to access this list of low prio words in case they
 * want to remove them from the low priority list later."
 *
 * The card's Low priority button sets the word aside: out of this sitting at
 * once, out of every round after it, and listed under the Study options with
 * Restore. Undo puts it straight back. The schedule is never touched.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { SetPicker } from "../src/studypicker";
import { sessionFor, troubleWords, knownWords } from "../src/studycards";
import { reviewWords, knownPool, lowPriorityIdx, exactIdx, L } from "../src/data";
import { DAY, REVIEW, dayOf } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const due = () => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const held = (s) => ({ dueAt: now + 30 * DAY, lastAt: now - DAY, s, d: 5, state: REVIEW, steps: 0, reps: 9, lapses: 0 });
const A = "город", B = "дом";
const base = {
  v: 10, seen: { [A]: { recognise: due() }, [B]: { recognise: due() } }, trouble: {}, pinned: [], sets: ["__path__"],
  drills: {}, unit: {}, watched: {}, speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"],
  newPerDay: 0, learnAhead: 20, cardKinds: ["words"],
};
async function profile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}
const saved = async () => { await flushState(); return global.__db.saved("p1"); };
// Which of the two words is on the card's back, whatever its stress mark (§23).
const stressed = (w) => new RegExp("^" + [...w].map((c) => c + "[\\u0300\\u0301]?").join("") + "$");
const cardWord = () => [A, B].find((w) => within(screen.getByTestId("card-russian"))
  .queryAllByText(stressed(w)).length > 0);

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

it("sets the card aside from its back, takes it out of the sitting, and Undo puts it back", async () => {
  await profile();
  await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  await act(async () => { fireEvent.press(await screen.findByText("Show")); });
  const word = cardWord();
  expect([A, B]).toContain(word);
  const other = word === A ? B : A;
  await act(async () => { fireEvent.press(screen.getByTestId("set-aside")); });
  // The next card, face down; the one set aside is in the list, its card untouched.
  expect(await screen.findByText("Show")).toBeTruthy();
  let st = await saved();
  expect(Object.keys(st.lowPriority)).toEqual([word]);
  expect(st.seen[word].recognise.reps).toBe(2);
  expect(await global.__db.log("p1")).toEqual([]);
  await act(async () => { fireEvent.press(screen.getByText("Show")); });
  expect(cardWord()).toBe(other);
  // Undo: the card set aside is back on screen, and off the list.
  await act(async () => { fireEvent.press(screen.getByTestId("undo")); });
  expect(cardWord()).toBe(word);
  st = await saved();
  expect(st.lowPriority).toEqual({});
});

/* Out of every named round; in the personal review's make-up draw at a small
   fraction of the weight (the owner, 2026-11-12: "low prio shouldn't eliminate
   a card completely but it should be extremely rare relative to others"). */
it("keeps a card set aside out of every round, and rare in the personal review", () => {
  const st = {
    ...base, lowPriority: { [A]: now },
    seen: { ...base.seen, "кошка": { recognise: held(400) } },
    trouble: { [A]: 1 }, pinned: [A],
  };
  const words = (s) => s.items.map((it) => it.word);
  // Due though it is, it is not dealt as due: its schedule is ignored.
  expect(words(sessionFor(st, { rng: () => 0.5 })).slice(0, 1)).toEqual([B]);
  // Among twenty ordinary cards past the cooldown, it is drawn rarely, not never.
  const cooled = { dueAt: now + 30 * DAY, lastAt: now - 3 * DAY, s: 4, d: 5, state: REVIEW, steps: 0, reps: 4, lapses: 0 };
  const seen = { [A]: { recognise: cooled } };
  const twenty = L.slice(10, 30).map((x) => x.b);
  for (const w of twenty) seen[w] = { recognise: cooled };
  let s0 = 3;
  const lcg = () => { s0 = (s0 * 1103515245 + 12345) & 0x7fffffff; return s0 / 0x7fffffff; };
  let dealt = 0;
  const many = { ...base, seen, lowPriority: { [A]: now }, newPerDay: 0, goal: { day: dayOf(now), owed: 5, done: 0 } };
  for (let k = 0; k < 120; k++) if (words(sessionFor(many, { rng: lcg })).includes(A)) dealt++;
  expect(dealt).toBeGreaterThan(0);
  expect(dealt).toBeLessThan(120 * 5 / 21 * 0.4);
  expect(troubleWords(st)).not.toContain(A);
  expect(knownWords({ ...st, lowPriority: { "кошка": now } })).not.toContain("кошка");
  expect(words(sessionFor(st, { round: "list", words: [A, B] }))).not.toContain(A);
  expect(words(sessionFor(st, { round: "trouble" }))).not.toContain(A);
  // The quiz's review top-up and the drills' "Your words".
  expect(reviewWords(st)).not.toContain(exactIdx(A));
  expect(reviewWords(st)).toContain(exactIdx(B));
  expect(knownPool({ ...st, lowPriority: { "кошка": now } })).not.toContain(exactIdx("кошка"));
  expect(lowPriorityIdx(st).has(exactIdx(A))).toBe(true);
});

it("lists the cards set aside under the Study options, each with Restore", async () => {
  await profile({ lowPriority: { [A]: now } });
  await render(<SessionProvider><SetPicker visible onClose={jest.fn()} /></SessionProvider>);
  await act(async () => { fireEvent.press(await screen.findByTestId("low-priority-open")); });
  expect(screen.getByTestId(`low-${A}`)).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId(`restore-${A}`)); });
  await waitFor(async () => expect((await saved()).lowPriority).toEqual({}));
  expect(screen.queryByTestId("low-priority-open")).toBeNull();
});

it("draws no section while nothing is set aside", async () => {
  await profile();
  await render(<SessionProvider><SetPicker visible onClose={jest.fn()} /></SessionProvider>);
  await screen.findByTestId("set-path");
  expect(screen.queryByTestId("low-priority-open")).toBeNull();
});
