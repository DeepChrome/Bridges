/* The study queue's rules.
 *
 * Two of them are the owner's, 2026-09-11, and both are about a set of cards
 * appearing that the learner did not ask for and could not switch off:
 *
 *   - "Due today" is switched on by the path's Review button and had no row in
 *     the picker, so it could be turned on and never off. `cardsIn` is what
 *     decides a set's contents, and what proves the queue is only ever the
 *     ticked sets;
 *   - "For you" deals a pile whose size the learner types, and an empty or
 *     nonsense box must fall back to twenty rather than to nothing.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { cardsIn, buildQueue, pickN, FOR_YOU_N } from "../src/screens/Study";
import { today } from "@core/util";

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, decks: [],
};

describe("how many cards For you deals", () => {
  it("is twenty unless the learner says otherwise", () => {
    expect(pickN("")).toBe(FOR_YOU_N);
    expect(pickN(undefined)).toBe(FOR_YOU_N);
    expect(pickN("abc")).toBe(FOR_YOU_N);
    // A pile of none is not a thing anybody asked for.
    expect(pickN("0")).toBe(FOR_YOU_N);
    expect(pickN("-5")).toBe(FOR_YOU_N);
  });

  it("takes the number typed, within reason", () => {
    expect(pickN("7")).toBe(7);
    expect(pickN("150")).toBe(150);
    expect(pickN("99999")).toBe(999);
  });
});

describe("which cards a set holds", () => {
  const st = {
    ...base,
    seen: {
      "я": { s: 1, d: 5, due: today() - 1, reps: 2, lapses: 0 },
      "не": { s: 1, d: 5, due: today(), reps: 1, lapses: 0 },
      "город": { s: 9, d: 5, due: today() + 30, reps: 4, lapses: 0 },
    },
  };

  it("gives Due today exactly what the scheduler wants today", () => {
    const due = cardsIn(st, ["__due__"]).map((c) => c.b).sort();
    expect(due).toEqual(["не", "я"]);
  });

  /* The set the Review button switches on is a set like any other, which is the
     whole point: the picker can now untick it. */
  it("holds nothing when nothing is ticked", () => {
    expect(cardsIn(st, [])).toEqual([]);
    expect(buildQueue({ ...st, sets: [] })).toEqual([]);
  });

  it("builds the queue from the ticked sets and no others", () => {
    const q = buildQueue({ ...st, sets: ["__due__"] }).map((c) => c.b).sort();
    expect(q).toEqual(["не", "я"]);
    // Not due, so not asked — until the learner chooses to study ahead.
    expect(q).not.toContain("город");
    expect(buildQueue({ ...st, sets: ["__due__"] }, undefined, true).length)
      .toBeGreaterThanOrEqual(q.length);
  });
});
