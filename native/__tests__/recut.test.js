/* Progress carried across a re-cut curriculum (Phase 14, V7). Lessons are
   stored by index and a rebuild puts different words in each, so on the first
   load of a new curriculum the lesson flags are re-derived from what was
   studied — finished units stay finished, nothing is deleted. */

import { UN, L, lessonWords, lessonCount, lessonDone, CURRICULUM } from "../src/data";

// The real one: jest.setup.js turns it off for the suites that seed progress.
const { reconcileCurriculum } = jest.requireActual("../src/data");

const DAY = 86400000;
const card = (reps) => ({ recognise: { state: 2, s: 10, d: 5, steps: 0, reps, lapses: 0,
                                       dueAt: Date.now() + DAY, lastAt: Date.now() - DAY } });
const base = { v: 10, seen: {}, unit: {}, watched: {}, drills: {} };

describe("carrying progress across a new curriculum", () => {
  it("is stamped with the build's fingerprint", () => {
    expect(typeof CURRICULUM).toBe("string");
    expect(CURRICULUM.length).toBeGreaterThan(6);
  });

  it("leaves a profile on the current curriculum alone, and stamps an empty one", () => {
    const same = { ...base, curriculum: CURRICULUM, unit: { core1: { lessons: { 0: { v: true } } } } };
    expect(reconcileCurriculum(same)).toBe(same);
    expect(reconcileCurriculum(base)).toEqual({ ...base, curriculum: CURRICULUM });
  });

  it("marks a lesson done when every word in it was studied, and keeps the old record", () => {
    const u = UN.find((x) => x.id === "core2");
    const words = lessonWords(u, 0).map((i) => L[i].b);
    const seen = Object.fromEntries(words.map((w) => [w, card(3)]));
    // Old flags for a lesson whose words the learner never met: not carried.
    const old = { core2: { best: 90, lessons: { 3: { v: true, q: 90 } }, video: false, done: false } };
    const st = reconcileCurriculum({ ...base, seen, unit: old, watched: { [u.v.id]: 20000 } });
    expect(st.curriculum).toBe(CURRICULUM);
    expect(st.unitBefore).toEqual(old);
    expect(st.unit.core2.lessons[0]).toMatchObject({ v: true, q: 90 });
    expect(st.unit.core2.lessons[3]).toBeUndefined();
    expect(st.unit.core2.video).toBe(true);          // its current video was watched
    expect(lessonDone(st, u, 0)).toBe(true);
    // A word met but never reviewed does not count as studied.
    const once = reconcileCurriculum({ ...base, seen: { ...seen, [words[0]]: card(0) }, unit: old });
    expect(once.unit.core2 && once.unit.core2.lessons[0]).toBeFalsy();
  });

  it("keeps a finished unit finished, video step and all", () => {
    const u = UN.find((x) => x.id === "core1");
    const old = { core1: { best: 85, lessons: {}, video: true, done: true } };
    const st = reconcileCurriculum({ ...base, unit: old });
    for (let i = 0; i < lessonCount(u); i++) expect(lessonDone(st, u, i)).toBe(true);
    expect(st.unit.core1.done).toBe(true);
  });
});
