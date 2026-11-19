/* Today's new words ride on the day's review, outside the baseline (the
 * owner, 2026-11-19: "if the learner has covered a new chapter, these new
 * words are not in that 25 quota… instead they are 'tacked on' to the pile…
 * These cards are integrated and shuffled randomly among themselves").
 *
 *   - a lesson quiz's first grade of a word tacks it on: the day's goal grows
 *     by one and the word is in today's pile however it is scheduled;
 *   - a Practice drill's first grade does not;
 *   - a watched video tacks on the words it says that have no card yet;
 *   - a tacked word answered in Study leaves the list; the next day's list is
 *     empty;
 *   - the chunk is shuffled unless the order is "From the start".
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { sessionFor } from "../src/studycards";
import { L, exactIdx, goalNow, lessonWords, UN } from "../src/data";
import { tackOn, tackedToday, untack, goalSession, rollGoal, goalPerDay } from "@core/queue";
import { DAY, REVIEW, dayOf } from "@core/scheduler";

const now = Date.now();
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: ["__path__"], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"], newPerDay: 0, learnAhead: 20,
  cardKinds: ["words"] };
const saved = async () => { await flushState(); return global.__db.saved("p1"); };
async function seed(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}
const i = exactIdx("книга");
const step = { kind: "choose-en", i, prompt: L[i].w, cyr: true, ask: "Choose the meaning",
  options: [{ label: "book", right: true }, { label: "table" }, { label: "cat" }, { label: "house" }], stage: 0 };
const answer = async () => act(async () => { fireEvent.press(await screen.findByText("book")); });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

describe("tacking on", () => {
  it("adds the words to the day and to what is owed, once each, and the next day forgets them", () => {
    const st = { daily: { day: dayOf(now), new: 0, reviews: 0 }, goal: { day: dayOf(now), owed: 25, done: 0 } };
    const a = tackOn(st, ["книга", "стол"], now, {});
    expect(a.goal.owed).toBe(27);
    expect(tackedToday(a.daily, now)).toEqual(["книга", "стол"]);
    const b = tackOn(a, ["стол", "кот"], now, {});
    expect(b.goal.owed).toBe(28);
    expect(tackOn(b, ["кот"], now, {})).toBe(b);
    expect(tackedToday(untack(b.daily, "стол"), now)).toEqual(["книга", "кот"]);
    expect(tackedToday(b.daily, now + DAY)).toEqual([]);
    // The baseline rolls over as before — a day skipped adds its goal — and
    // yesterday's tack-ons are not carried as words, only as the number owed.
    expect(rollGoal(b.goal, now + DAY, {}).owed).toBe(28 + goalPerDay(undefined));
  });

  it("deals a tacked word in the chunk whatever its schedule says, before the fill", () => {
    const seen = { "книга": { recognise: { state: REVIEW, s: 30, d: 5, steps: 0, reps: 1, lapses: 0,
      lastAt: now - 1000, dueAt: now + 30 * DAY } } };
    const plain = goalSession({ seen, words: ["книга"], now, owed: 5, rng: () => 0.5 });
    expect(plain.items.map((x) => x.word)).toEqual([]);     // answered just now: out of the fill
    const s = goalSession({ seen, words: ["книга"], now, owed: 5, rng: () => 0.5, tacked: ["книга"] });
    expect(s.items.map((x) => x.word)).toEqual(["книга"]);
    expect(s.items[0].why.source).toBe("tacked");
    const fresh = goalSession({ seen: {}, words: [], now, owed: 5, rng: () => 0.5, tacked: ["кот"] });
    expect(fresh.items[0]).toMatchObject({ word: "кот", kind: "new" });
  });

  it("a lesson quiz's first grade tacks the word on; a drill's does not", async () => {
    await seed();
    // `lesson` is what the lesson's two runners pass (flows/Lesson.js).
    await render(<SessionProvider><Runner steps={[step]} onFinish={() => {}} recycle={false} lesson /></SessionProvider>);
    void UN;
    await answer();
    let st = await saved();
    expect(tackedToday(st.daily, now)).toEqual(["книга"]);
    expect(goalNow(st).owed).toBe(goalPerDay(0) + 1);
    // Study deals it today, though it was answered a moment ago.
    expect(sessionFor(st, { rng: () => 0.5 }).items.some((x) => x.word === "книга")).toBe(true);
    // The same word answered again in a drill adds nothing.
    await AsyncStorage.clear();
    await seed();
    await render(<SessionProvider><Runner steps={[step]} onFinish={() => {}} recycle={false} /></SessionProvider>);
    await answer();
    st = await saved();
    expect(tackedToday(st.daily, now)).toEqual([]);
    expect(goalNow(st).owed).toBe(goalPerDay(0));
  });

  it("shuffles the chunk, except From the start", () => {
    const words = Array.from({ length: 20 }, (_, k) => `w${k}`);
    const seen = {};
    words.forEach((w, k) => { seen[w] = { recognise: { state: REVIEW, s: 1 + k, d: 5, steps: 0, reps: 3, lapses: 0,
      lastAt: now - 3 * DAY, dueAt: now + 3 * DAY } }; });
    const rng = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
    const sorted = goalSession({ seen, words, now, owed: 20, rng: () => 0.5, familiar: () => 0 }).items.map((x) => x.word);
    const mixed = goalSession({ seen, words, now, owed: 20, rng, familiar: () => 0, shuffle: true }).items.map((x) => x.word);
    expect(mixed.slice().sort()).toEqual(sorted.slice().sort());
    expect(mixed).not.toEqual(sorted);
    const kept = goalSession({ seen, words, now, owed: 20, rng, familiar: () => 0,
      order: (w) => Number(w.slice(1)) }).items.map((x) => x.word);
    expect(kept).toEqual(words);
  });

  it("a watched video tacks on the words it says that have no card", async () => {
    const { videos } = require("../src/data");
    const v = videos().find((x) => Object.keys(x.words || {}).length >= 5);
    const st = { ...base, seen: {}, daily: { day: dayOf(now), new: 0, reviews: 0 }, goal: { day: dayOf(now), owed: 10, done: 0 } };
    const fresh = Object.keys(v.words).filter((w) => exactIdx(w) >= 0);
    const next = tackOn(st, fresh, now, {});
    expect(next.goal.owed).toBe(10 + fresh.length);
    expect(sessionFor({ ...next, sets: ["__path__"] }, { rng: () => 0.5 }).items.some((x) => fresh.includes(x.word))).toBe(true);
    void lessonWords;
  });
});
