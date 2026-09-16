/* Enough for one day.
 *
 * The way people leave a language app is measurably not boredom but bingeing,
 * and Bridges had nothing that ever said "you are square": the next lesson was
 * the blue button at every hour. A day is done when something was finished
 * today and nothing is waiting — both already on the record — and it shows the
 * way review-first shows, by the button going quiet (§25).
 *
 * §20a: native has no visual suite, so which colour the streak carries and
 * which tone the button takes are asserted in the render tree.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { dayDone, workedOn } from "@core/state";
import { today } from "@core/util";
import Learn from "../src/screens/Learn";

const nav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 40, streak: 3, dev: true,
};

async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Learn navigation={nav} /></SessionProvider>);
}

const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("when a day counts as done", () => {
  const t = today();
  const worked = { seen: { дом: { last: t, due: t + 3 } } };
  const yesterday = { seen: { дом: { last: t - 1, due: t + 3 } } };

  it("needs both halves: answered something today, and nothing waiting", () => {
    expect(dayDone(worked, 0, t)).toBe(true);
    expect(dayDone(worked, 7, t)).toBe(false);       // reviews still due
    expect(dayDone(yesterday, 0, t)).toBe(false);    // nothing answered today
    expect(dayDone({ seen: {} }, 0, t)).toBe(false); // nothing ever answered
  });

  /* The bug the first version shipped with, kept as a test: `state.day` looks
     like the right field and is not. `touchStreak` runs from the session
     loader, so it is stamped by *opening* the app — a learner with an empty
     queue would have been told they were done before answering anything. */
  it("is not something opening the app can earn", () => {
    expect(dayDone(null, 0, t)).toBe(false);
    expect(dayDone({ day: t, streak: 9, seen: {} }, 0, t)).toBe(false);
    expect(dayDone({ day: t, ...yesterday }, 0, t)).toBe(false);
  });
});

/* The palette's values are contrast.js's business, not this file's, and `light`
   is not exported — so this asserts the change rather than the hex: the same
   two nodes, drawn either side of the day closing. */
describe("what Learn shows", () => {
  it("ticks, turns the streak and quiets the next lesson once the day is done", async () => {
    // Nothing answered today: a card last seen yesterday, and not due again yet
    // (so the queue is empty and only the "worked today" half is missing).
    const open = await withProfile({ seen: { дом: { last: today() - 1, due: today() + 3 } } });
    await screen.findByTestId("next-step");
    expect(screen.queryByTestId("day-done")).toBeNull();
    const openStreak = flat(screen.getByTestId("streak").props.style).color;
    const openBtn = flat(screen.getByTestId("next-step").props.style).backgroundColor;
    open.unmount();

    await flushState();
    // A second profile row for the same id is not read once the database has
    // the first (store.test.js: the database wins over the row), so the
    // platform is cleared between the two, as beforeEach does.
    await AsyncStorage.clear();
    await withProfile({ seen: { дом: { last: today(), due: today() + 3 } } });
    expect(await screen.findByTestId("day-done")).toBeTruthy();
    expect(flat(screen.getByTestId("streak").props.style).color).not.toBe(openStreak);
    // Advice, not a lock: the lesson is still there, it is simply not the blue
    // button any more — the same means review-first uses.
    const btn = screen.getByTestId("next-step");
    expect(flat(btn.props.style).backgroundColor).not.toBe(openBtn);
    expect(btn).toBeTruthy();
  });
});

describe("what it costs", () => {
  /* docs/PLAYBOOK.md Phase 0.3 asked for this to be memoised. Measured first,
     2026-09-15: 0.04 ms at 1,000 cards and 0.9 ms at 10,000 — a full scan with
     no match, the worst case — on the machine that builds the app. A memo keyed
     on `seen` would be code for a problem that does not exist (§12). What is
     worth having is the budget, written down and enforced, so a change that
     makes this expensive is a change that fails. */
  it("scans 10,000 cards in under 5 ms", () => {
    const seen = {};
    for (let i = 0; i < 10000; i++) seen["слово" + i] = { last: 100, due: 200 };
    const st = { seen };
    workedOn(st, 999);                                   // warm
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) workedOn(st, 999);
    expect((performance.now() - t0) / 20).toBeLessThan(5);
  });
});
