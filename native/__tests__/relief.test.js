/* The relief rule on lesson quizzes (ROADMAP A29): 80 % to pass, or 70 % from
   the third attempt on, with tries counted on the lesson slot.

   This file also held the offline audio cache's tests until 2026-09-19, when
   every word and sentence a lesson plays became a bundled clip and the cache
   had nothing left to download. */

import { components, markComponent, UN } from "../src/data";
import { quizPassed, PASS_MARK, RELIEF_MARK, RELIEF_AFTER } from "@core/state";

const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {}, decks: [],
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};

describe("the relief rule", () => {
  it("passes at the mark, or at the relief mark from the third try", () => {
    expect(quizPassed({ q: PASS_MARK })).toBe(true);
    expect(quizPassed({ q: RELIEF_MARK, tries: 1 })).toBe(false);
    expect(quizPassed({ q: RELIEF_MARK, tries: RELIEF_AFTER })).toBe(true);
    expect(quizPassed({ q: RELIEF_MARK - 1, tries: 9 })).toBe(false);
    expect(quizPassed({})).toBe(false);
  });

  it("counts tries when a quiz is marked, and the lesson clears on relief", () => {
    const u = UN[0];
    let st = { ...base };
    st = markComponent(st, u, 0, "vocab");
    st = markComponent(st, u, 0, "quiz", 70);
    st = markComponent(st, u, 0, "quiz", 60);
    expect(st.unit[u.id].lessons[0].tries).toBe(2);
    expect(components(st, u, 0).find((c) => c.id === "quiz").done).toBe(false);
    st = markComponent(st, u, 0, "quiz", 65);
    expect(st.unit[u.id].lessons[0].q).toBe(70);          // the best score is kept
    expect(components(st, u, 0).find((c) => c.id === "quiz").done).toBe(true);
  });
});
