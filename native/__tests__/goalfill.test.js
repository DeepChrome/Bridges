/* The cards that make up the day's goal when little is due (core/queue.js
 * goalSession). The owner, 2026-10-12, after a week of daily use: "the study
 * cards repeating themselves for the past week. It's not rotating through all
 * my cards."
 *
 * The fill was ordered by familiarity — stability alone, blind to when the
 * card was last seen — and did not know what the sitting's earlier chunk had
 * dealt. An early Good barely moves a held card's stability, so the weakest
 * card this morning was the weakest in the next chunk and again tomorrow,
 * while everything held a little better was never dealt. Three things are
 * asserted: a sitting never deals a card twice while others are left; a week
 * of goals walks the whole pool; and the goal can still be met by a learner
 * with fewer cards than it asks for. Every assertion here failed against the
 * familiarity-ordered fill except the last.
 */
import { goalSession, GOAL_REVIEWS, MASTERED_EVERY } from "@core/queue";
import { applyGrade, familiarity, REVIEW, DAY, dayOf } from "@core/scheduler";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { SCHEMA_VERSION } from "@core/state";
import { sessionFor } from "../src/studycards";
import { L } from "../src/data";

const sched = { fuzz: false };
const opts = { scheduler: sched };
const familiar = (w, c) => familiarity(c) || 0;
/* A seeded shuffle, so a run is repeatable. */
const seeded = (s0 = 7) => { let s = s0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };

/* `n` met cards, stability 1..n days, every one answered yesterday and none
   due for months — the learner who has kept up. Plus `mastered` very strong. */
function learner(words, now, mastered = 0) {
  const seen = {};
  words.forEach((w, k) => {
    const s = k < words.length - mastered ? 1 + k : 400;
    seen[w] = { recognise: { state: REVIEW, s, d: 5, steps: 0, reps: 3, lapses: 0, elapsed: 0, scheduled: s,
                             lastAt: now - DAY, dueAt: now + 90 * DAY } };
  });
  return seen;
}
/* A sitting: every card dealt graded Good, a few seconds apart. */
function goodAll(seen, items, at) {
  let s = seen, t = at;
  for (const it of items) { t += 8000; s = applyGrade(s, {}, it.word, it.direction, 3, t, sched).seen; }
  return { seen: s, at: t };
}
const words = (n) => Array.from({ length: n }, (_, k) => `w${k}`);

describe("the goal's fill, within a sitting", () => {
  it("does not deal in the second chunk a card the first chunk already answered", () => {
    const now = Date.now();
    const pool = words(30);
    const seen = learner(pool, now);
    const first = goalSession({ seen, words: pool, now, owed: 10, rng: seeded(), opts, familiar });
    expect(first.items).toHaveLength(10);
    expect(first.items.every((x) => x.extra)).toBe(true);
    const { seen: after, at } = goodAll(seen, first.items, now);
    const second = goalSession({ seen: after, words: pool, now: at + 60000, owed: 5, rng: seeded(), opts, familiar });
    expect(second.items).toHaveLength(5);
    const dealtBefore = new Set(first.items.map((x) => x.word));
    expect(second.items.filter((x) => dealtBefore.has(x.word)).map((x) => x.word)).toEqual([]);
  });

  it("…through the Study screen's own session", () => {
    const now = Date.now();
    const pool = L.slice(0, 30).map((w) => w.b);
    const st = { v: 11, seen: learner(pool, now), trouble: {}, pinned: [], sets: [], decks: [], drills: {}, unit: {},
                 flash: ["recognise"], newPerDay: 0, learnAhead: 20, cardKinds: ["words"],
                 goal: { day: dayOf(now), owed: 10, done: 0 } };
    const first = sessionFor(st, { rng: seeded() });
    expect(first.items).toHaveLength(10);
    const { seen: after } = goodAll(st.seen, first.items, now);
    const second = sessionFor({ ...st, seen: after, goal: { ...st.goal, owed: 5, done: 10 } }, { rng: seeded() });
    expect(second.items).toHaveLength(5);
    const dealtBefore = new Set(first.items.map((x) => x.word));
    expect(second.items.filter((x) => dealtBefore.has(x.word))).toEqual([]);
  });

  /* A learner with fewer cards than the goal asks for is never dealt one
     twice (the owner, 2026-10-19: "the same exact word even when I'm pressing
     easy"). The session says it is exhausted and the screen counts the rest
     of the goal as met. It used to deal the answered cards again, least
     recently answered first. */
  it("never deals a card answered today, even when the goal asks for more than the learner has", () => {
    const now = Date.now();
    const pool = words(6);
    const seen = learner(pool, now);
    const first = goalSession({ seen, words: pool, now, owed: 10, rng: seeded(), opts, familiar });
    expect(first.items.map((x) => x.word).sort()).toEqual(pool.slice().sort());
    expect(first.exhausted).toBe(true);
    expect(first.remaining).toBe(0);
    const { seen: after, at } = goodAll(seen, first.items, now);
    const second = goalSession({ seen: after, words: pool, now: at + 60000, owed: 4, rng: seeded(), opts, familiar });
    expect(second.items).toEqual([]);
    expect(second.exhausted).toBe(true);
    // Nor past the goal: "Keep going" has nothing to deal either.
    expect(goalSession({ seen: after, words: pool, now: at + 60000, owed: 0, beyond: true, rng: seeded(), opts, familiar }).items)
      .toEqual([]);
  });

  it("…and a pool that can fill the goal is not exhausted", () => {
    const now = Date.now();
    const pool = words(30);
    const sess = goalSession({ seen: learner(pool, now), words: pool, now, owed: 10, rng: seeded(), opts, familiar });
    expect(sess.exhausted).toBe(false);
  });
});

/* The screen, when the pool runs out before the goal does: the day ends on
   "Daily goal met", the number on the tab is 0, and Keep going is not offered
   — there is nothing it could deal but the cards just answered. */
describe("the goal, met by running out of cards", () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: () => () => {} };

  beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
  afterEach(async () => { await flushState(); });

  it("ends on the goal met, with nothing more to keep going on", async () => {
    const now = Date.now();
    const pool = L.slice(0, 4).map((w) => w.b);
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
      v: SCHEMA_VERSION, seen: learner(pool, now), trouble: {}, pinned: [], sets: ["__path__"], decks: [], drills: {},
      unit: {}, mined: {}, flash: ["recognise"], newPerDay: 0, learnAhead: 20, cardKinds: ["words"],
      goal: { day: dayOf(now), owed: 10, done: 0 },
    }));
    await render(<SessionProvider><Study navigation={nav} route={{ params: {} }} /></SessionProvider>);
    expect((await screen.findByTestId("study-goal")).props.children).toBe("10");
    await act(async () => { fireEvent.press(screen.getByTestId("study-go")); });
    for (let k = 0; k < pool.length; k++) {
      await act(async () => { fireEvent.press(await screen.findByText("Show")); });
      await act(async () => { fireEvent.press(screen.getByTestId("grade-4")); });
    }
    expect(await screen.findByText("Daily goal met")).toBeTruthy();
    expect(screen.queryByTestId("keep-going")).toBeNull();
    expect(screen.queryByText("Show")).toBeNull();
    await flushState();
    expect((await global.__db.saved("p1")).goal.owed).toBe(0);
  });
});

describe("the goal's fill, over a week", () => {
  it("walks the whole pool rather than the same weakest cards every day", () => {
    const start = Date.now();
    const pool = words(30);
    let seen = learner(pool, start);
    const days = 7, perDay = 10;
    const count = new Map(pool.map((w) => [w, 0]));
    const daysDealt = new Map(pool.map((w) => [w, 0]));
    for (let d = 0; d < days; d++) {
      const now = start + d * DAY;
      const today = new Set();
      let at = now, owed = perDay;
      // Chunks until the day's goal is met, as the screen deals them.
      while (owed > 0) {
        const sess = goalSession({ seen, words: pool, now: at, owed, rng: seeded(d), opts, familiar });
        if (!sess.items.length) break;
        for (const it of sess.items) {
          // A learning step coming round within the sitting is Anki's own repeat, not this fill's.
          if (it.kind !== "learning") expect(today.has(it.word)).toBe(false);
          today.add(it.word);
          count.set(it.word, count.get(it.word) + 1);
        }
        ({ seen, at } = goodAll(seen, sess.items, at));
        owed -= sess.items.length;
      }
      for (const w of today) daysDealt.set(w, daysDealt.get(w) + 1);
    }
    const never = pool.filter((w) => count.get(w) === 0);
    expect(never).toEqual([]);
    const most = Math.max(...daysDealt.values());
    // Seventy deals over thirty cards: the most-repeated card is seen on well
    // under every day. The familiarity-ordered fill dealt its weakest on six.
    expect(most).toBeLessThanOrEqual(4);
  });

  it("still sprinkles a mastered card in now and then, least recently seen first", () => {
    const now = Date.now();
    const pool = words(40);
    const seen = learner(pool, now, 10);
    // Two of the mastered cards were seen longer ago than the rest.
    seen.w30.recognise.lastAt = now - 20 * DAY;
    seen.w31.recognise.lastAt = now - 10 * DAY;
    const sess = goalSession({ seen, words: pool, now, owed: 16, rng: seeded(), opts, familiar });
    const mastered = sess.items.filter((x) => seen[x.word].recognise.s === 400).map((x) => x.word);
    expect(mastered).toEqual(["w30", "w31"]);
    expect(mastered).toHaveLength(Math.floor(16 / MASTERED_EVERY));
    expect(GOAL_REVIEWS).toBeGreaterThan(0);
  });
});
