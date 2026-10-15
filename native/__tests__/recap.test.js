/* The day's recap (the owner, 2026-10-01: "a daily recap feature that reviews
 * things you specifically did that day. Maybe 10-20 questions").
 *
 * What is asserted: the path offers it only once there is a day's work to
 * recap and stops offering it once it is done; it asks about today's words and
 * no others, today's misses first; and with nothing done it says so rather than
 * drawing an empty run. The question mix itself is core.test.mjs's.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { UN, L, todaysWork, recapKey, RECAP_FROM } from "../src/data";
import { DAY, REVIEW } from "@core/scheduler";
import { today } from "@core/util";
import Learn from "../src/screens/Learn";
import { RecapFlow } from "../src/flows/Quiz";

const nav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()),
              setOptions: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 1,
};

async function withProfile(state, el) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "teddy", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{el}</SessionProvider>);
}

// A card graded at noon on `day`.
const card = (day, s = 3) => ({ recognise: { lastAt: day * DAY + 12 * 3600000, dueAt: (day + 3) * DAY,
                                             s, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 } });

// Chapter 1's own words, so every one is a curriculum lemma with a stable index.
const words = UN[0].w.map((i) => L[i].b);
const seenOn = (day, n) => Object.fromEntries(words.slice(0, n).map((w) => [w, card(day)]));

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("what counts as today's work", () => {
  /* In the order the day met them, so the recap can walk the whole day; the
     weakest go to `focus`, which the recap leans on and is never made of. */
  it("is today's graded words in the order they were met, and not yesterday's", () => {
    const t = today();
    const at = (h, s) => ({ recognise: { lastAt: t * DAY + h * 3600000, dueAt: (t + 3) * DAY,
                                         s, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 } });
    const st = { seen: { ...seenOn(t - 1, 3), [words[5]]: at(9, 9), [words[6]]: at(15, 1) } };
    const work = todaysWork(st, t);
    expect(work.words.map((i) => L[i].b)).toEqual([words[5], words[6]]);
    expect(L[work.focus[0]].b).toBe(words[6]);
  });

  it("carries today's misses, and leaves a sentence card out", () => {
    const t = today();
    const at = t * DAY + 13 * 3600000;
    const st = { seen: { "я дома": card(t) },
                 misses: [{ w: words[2], at }, { w: words[2], at }, { w: words[3], at: at - DAY }] };
    const work = todaysWork(st, t);
    expect(work.words).toEqual([]);
    expect(work.missed.map((i) => L[i].b)).toEqual([words[2]]);
  });
});

describe("the path offers it", () => {
  it("not before there is enough to recap", async () => {
    await withProfile({ seen: seenOn(today(), RECAP_FROM - 1) }, <Learn navigation={nav} />);
    await screen.findByTestId("next-step");
    expect(screen.queryByTestId("recap-open")).toBeNull();
  });

  it("once there is, and not again once it is done", async () => {
    const r = await withProfile({ seen: seenOn(today(), RECAP_FROM) }, <Learn navigation={nav} />);
    await screen.findByTestId("recap-open");
    r.unmount();
    await flushState();
    await AsyncStorage.clear();
    await withProfile({ seen: seenOn(today(), RECAP_FROM), drills: { [recapKey()]: { best: 80 } } },
                      <Learn navigation={nav} />);
    await screen.findByTestId("next-step");
    expect(screen.queryByTestId("recap-open")).toBeNull();
  });
});

describe("the recap itself", () => {
  it("says so when there is nothing to recap", async () => {
    await withProfile({}, <RecapFlow navigation={nav} />);
    expect(await screen.findByText("Nothing to recap yet")).toBeTruthy();
  });

  it("runs a quiz on today's words", async () => {
    await withProfile({ seen: seenOn(today(), 8) }, <RecapFlow navigation={nav} />);
    expect(await screen.findByTestId("question-block")).toBeTruthy();
    expect(screen.queryByText("Nothing to recap yet")).toBeNull();
  });
});
