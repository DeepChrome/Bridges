/* Practice drills draw from what the learner has met, not from all 4,000 words.
   Found on the emulator walkthrough: "genitive plural of рис" for a learner who
   knew six words. */

import { drillPool, DRILL_POOL_MIN, STAGES, L, idxOfWord, lessonWords, lessonCount } from "../src/data";
import { Q } from "../src/questions";

describe("lesson ramp", () => {
  /* The ramp is a target; lessons end where a group of related words ends
     (build_topics.py cut_lessons), so they run near it rather than at it. */
  it("lessons run near five words in chapter 1 and near seven in chapter 3, covering every word", () => {
    for (const [u, n] of [[STAGES[0].core, 5], [STAGES[2].core, 7]]) {
      const sizes = Array.from({ length: lessonCount(u) }, (_, k) => lessonWords(u, k).length);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(u.w.length);
      for (const m of sizes) { expect(m).toBeGreaterThanOrEqual(3); expect(m).toBeLessThanOrEqual(n + 3); }
    }
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
