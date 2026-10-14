/* A lesson is named by the groups of related words it teaches (data.js
   lessonGroups; COURSE-ROADMAP WP6). Lessons are cut from whole groups, so
   every lesson on the route names at least one, and the names are the
   build's own (`gr`), never a word list. */

import { UN, lessonCount, lessonGroups, lessonWords } from "../src/data";

describe("a lesson's name", () => {
  it("is its groups, and every lesson has one", () => {
    const bare = [];
    for (const u of UN) {
      for (let i = 0; i < lessonCount(u); i++) {
        const g = lessonGroups(u, i);
        if (!g.length) bare.push(`${u.id}:${i}`);
        // Each named group really holds a word of this lesson.
        const words = new Set(lessonWords(u, i));
        for (const name of g) {
          const grp = u.gr.find(([n]) => n === name);
          expect(grp[2].some((w) => words.has(w))).toBe(true);
        }
      }
    }
    expect(bare).toEqual([]);
    // Chapter 1 opens on the greetings (§30bz).
    expect(lessonGroups(UN[0], 0)[0]).toBe("Greetings");
  });
});
