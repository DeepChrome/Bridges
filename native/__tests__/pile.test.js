/* Where a review stands (the owner): the counter spans the day's pile, not the
   chunk — "Still says 157 due but 20 cards" (2026-09-30) — and it counts cards,
   not attempts — "the total count increases per attempt. That's not helpful"
   (2026-10-01). Green done, yellow coming back, the number left, grey total. */

import React from "react";
jest.setTimeout(30000);   // the pile is dealt past twenty cards; slow under a full-suite load
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { sittingTally, masteryOf, MASTERED_AT } from "../src/studycards";
import { L } from "../src/data";
import { dayOf } from "@core/scheduler";

const DAY = 86400000;
const due = () => ({ recognise: { state: 2, s: 3, d: 5, steps: 0, reps: 3, lapses: 0,
                                  lastAt: Date.now() - 4 * DAY, dueAt: Date.now() - DAY } });
const figure = (id) => {
  const node = screen.getByTestId(`tally-${id}`);
  const found = [];
  const walk = (n) => { if (typeof n === "string") found.push(n); else if (n && n.children) n.children.forEach(walk); };
  walk(node);
  return found.join("");
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

/* `n` cards due and a day's goal of the same size (2026-10-05: the pile is the
   goal, and the counter counts it down). */
async function withPile(n) {
  const words = L.slice(0, n).map((w) => w.b);
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "teddy", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: Object.fromEntries(words.map((w) => [w, due()])), trouble: {}, pinned: [],
    sets: ["__path__"], drills: {}, unit: {}, watched: {}, speech: { attempts: [], tagCounts: {} },
    streak: 0, flash: ["recognise"], newPerDay: 0, cardKinds: ["word"],
    goal: { day: dayOf(Date.now()), owed: n, done: 0 },
  }));
  await render(<SessionProvider><Study /></SessionProvider>);
  await global.__startStudy();
  await screen.findByTestId("tally");
}
const answer = async (g) => {
  await act(async () => { fireEvent.press(screen.getByText("Show")); });
  await act(async () => { fireEvent.press(screen.getByTestId(`grade-${g}`)); });
};

it("counts every card due today, and runs on past the first twenty", async () => {
  await withPile(25);
  expect(figure("total")).toBe("25");
  expect(figure("left")).toBe("25 left");
  for (let k = 0; k < 20; k++) await answer(3);
  // The second chunk follows by itself; the count goes on and the total holds.
  await screen.findByTestId("tally");
  expect(figure("done")).toBe("20");
  expect(figure("left")).toBe("5 left");
  expect(figure("total")).toBe("25");
  // The tally is the one count on screen (2026-10-05): no second line of
  // totals under the heading.
  expect(screen.queryByTestId("pile")).toBeNull();
});

it("an Again is one card coming back, and the total does not grow", async () => {
  await withPile(5);
  await answer(1);
  expect(figure("again")).toBe("1");
  expect(figure("done")).toBe("0");
  expect(figure("total")).toBe("5");
  expect(figure("left")).toBe("5 left");
});

it("opens what each figure means", async () => {
  await withPile(5);
  await act(async () => { fireEvent.press(screen.getByTestId("tally")); });
  expect(screen.getByTestId("tally-sheet")).toBeTruthy();
  expect(screen.getByText("Coming back")).toBeTruthy();
  expect(screen.getByText("In this review")).toBeTruthy();
});

describe("the arithmetic", () => {
  it("counts by card: done, coming back, left, total", () => {
    const words = new Set(["a", "b", "c", "d"]);
    expect(sittingTally(words, { a: "done", b: "again" }, 6))
      .toEqual({ done: 1, again: 1, left: 9, total: 10 });
  });

  it("mastery reads familiarity off each word's own card", () => {
    const w = L.slice(0, 3).map((x) => x.b);
    const strong = { recognise: { state: 2, s: 400, d: 3, steps: 0, reps: 9, lapses: 0,
                                  lastAt: Date.now() - DAY, dueAt: Date.now() + 300 * DAY } };
    const weak = { recognise: { state: 2, s: 1, d: 6, steps: 0, reps: 2, lapses: 1,
                                lastAt: Date.now() - DAY, dueAt: Date.now() + DAY } };
    const st = { seen: { [w[0]]: strong, [w[1]]: weak } };
    expect(MASTERED_AT).toBeGreaterThan(0);
    expect(masteryOf(st, w.map((b) => ({ b })))).toEqual({ mastered: 1, learning: 1, fresh: 1 });
  });
});
