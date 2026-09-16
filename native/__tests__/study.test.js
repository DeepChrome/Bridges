/* The study pile's rules.
 *
 * One is the owner's, 2026-09-11, about a set of cards appearing that the
 * learner did not ask for and could not switch off: "Due today" is switched
 * on by the path's Review button and had no row in the picker. `cardsIn` is
 * what decides a set's contents, and what proves the session is only ever
 * the ticked sets. The session's order is core/queue.js's business, proved in
 * core.test.mjs; here it is that the screen hands the builder the right words.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { cardsIn, sessionFor } from "../src/screens/Study";
import { DAY, REVIEW, NEW } from "@core/scheduler";

const now = Date.now();
const review = (plus, s = 1) => ({ dueAt: now + plus * DAY, lastAt: now - s * DAY, s, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, decks: [],
  flash: ["recognise"], newPerDay: 15, reviewsPerDay: 200, learnAhead: 20,
};

describe("which cards a set holds", () => {
  const st = {
    ...base,
    seen: {
      "я": { recognise: review(-1) },
      "не": { recognise: review(0) },
      "город": { recognise: review(30, 9) },
      // Added by the learner (Read, or a video): new, and wanted.
      "дом": { recognise: { dueAt: now, s: 0, d: 0, state: NEW, steps: 0, reps: 0, lapses: 0 } },
    },
  };

  it("gives Due today exactly what the scheduler wants today", () => {
    const due = cardsIn(st, ["__due__"]).map((c) => c.b).sort();
    expect(due).toEqual(["дом", "не", "я"]);
  });

  /* The set the Review button switches on is a set like any other, which is the
     whole point: the picker can now untick it. */
  it("holds nothing when nothing is ticked", () => {
    expect(cardsIn(st, [])).toEqual([]);
    expect(sessionFor({ ...st, sets: [] }).items).toEqual([]);
  });

  it("deals the session from the ticked sets and no others", () => {
    const s = sessionFor({ ...st, sets: ["__due__"] });
    const words = s.items.map((x) => x.word).sort();
    expect(words).toEqual(["дом", "не", "я"]);
    expect(s.items.find((x) => x.word === "дом").kind).toBe("new");
    expect(s.items.filter((x) => x.kind === "review").map((x) => x.word).sort()).toEqual(["не", "я"]);
    // Not due, so not asked — and not in the set at all.
    expect(words).not.toContain("город");
    expect(s.due).toBe(2);
  });

  it("deals a word once per direction the learner studies", () => {
    const both = sessionFor({ ...st, sets: ["__due__"], flash: ["recognise", "produce"] });
    const дом = both.items.filter((x) => x.word === "дом");
    expect(дом.map((x) => x.direction).sort()).toEqual(["produce", "recognise"]);
    expect(both.items.filter((x) => x.word === "я" && x.direction === "produce")[0].kind).toBe("new");
  });
});
