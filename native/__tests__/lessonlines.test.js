/* The video sentences at the end of a lesson (data.js linesWith; the owner,
   2026-10-02: "the tea is tasty" then "the hot tea is tasty" are "not unique
   enough to be helpful"). Swept over every lesson on the route. */

import { UN, lessonCount, lessonWords, linesWith, LINE_OVERLAP, IX } from "../src/data";
import { fold } from "@core/util";

const words = (ru) => new Set((ru.match(/[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*/g) || []).map(fold));
const overlap = (a, b) => [...a].filter((i) => b.has(i)).length / Math.max(1, Math.min(a.size, b.size));

it("never shows two near-copies at the end of a lesson", () => {
  const bad = [];
  for (const u of UN) {
    for (let k = 0; k < lessonCount(u); k++) {
      const shown = linesWith(u, lessonWords(u, k), 4);
      for (let a = 0; a < shown.length; a++) {
        for (let b = a + 1; b < shown.length; b++) {
          if (overlap(words(shown[a].ru), words(shown[b].ru)) >= LINE_OVERLAP) {
            bad.push(`${u.id}:${k} «${shown[a].ru}» / «${shown[b].ru}»`);
          }
        }
      }
    }
  }
  expect(bad).toEqual([]);
});

it("shows only lines that say one of the lesson's words", () => {
  for (const u of UN.slice(0, 6)) {
    for (let k = 0; k < lessonCount(u); k++) {
      const want = new Set(lessonWords(u, k));
      for (const l of linesWith(u, lessonWords(u, k), 4)) {
        const lem = (l.ru.match(/[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*/g) || []).map((t) => (IX[fold(t)] || [])[0]);
        expect(lem.some((i) => want.has(i))).toBe(true);
      }
    }
  }
});
