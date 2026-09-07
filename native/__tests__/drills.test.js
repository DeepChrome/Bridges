/* Practice drills draw from what the learner has met, not from all 4,000 words.
   Found on the emulator walkthrough: "genitive plural of рис" for a learner who
   knew six words. */

import { drillPool, DRILL_POOL_MIN, STAGES, L, idxOfWord, lessonWords, lessonCount } from "../src/data";
import { Q } from "../src/questions";

describe("lesson ramp", () => {
  it("chapter 1 teaches five words a lesson, chapter 3 seven", () => {
    expect(lessonWords(STAGES[0].core, 0)).toHaveLength(5);
    expect(lessonCount(STAGES[0].core)).toBe(Math.ceil(STAGES[0].core.w.length / 5));
    expect(lessonWords(STAGES[2].core, 0)).toHaveLength(7);
  });
});

const fresh = { seen: {}, trouble: {}, unit: {}, dev: false };

describe("drill pool", () => {
  it("a fresh learner drills the first units' words, in route order", () => {
    const pool = drillPool(fresh);
    expect(pool.length).toBeGreaterThanOrEqual(DRILL_POOL_MIN);
    const first = STAGES[0].core.w;
    expect(pool.slice(0, first.length)).toEqual(first);
  });

  it("a learner with enough words met drills exactly those", () => {
    const seen = {};
    const words = STAGES[2].core.w.concat(STAGES[2].branches[0].w).slice(0, DRILL_POOL_MIN + 5);
    for (const i of words) seen[L[i].b] = { reps: 1, due: 0 };
    const pool = drillPool({ ...fresh, seen });
    expect(pool).toHaveLength(words.length);
    expect(pool.every((i) => seen[L[i].b])).toBe(true);
    const qs = Q.drillQuestions("cases", 5, pool);
    expect(qs.every((q) => seen[L[q.i].b])).toBe(true);
  });

  it("a learner with a few words met gets those plus the route from where they are", () => {
    const seen = { [L[STAGES[0].core.w[0]].b]: { reps: 1, due: 0 } };
    const pool = drillPool({ ...fresh, seen });
    expect(pool[0]).toBe(idxOfWord(L[STAGES[0].core.w[0]].b));
    expect(pool.length).toBeGreaterThanOrEqual(DRILL_POOL_MIN);
  });
});
