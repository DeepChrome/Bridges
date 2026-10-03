/* Any word the app shows is in the dictionary (the owner, 2026-10-03: "some
   words dont appear in our dictionary. Any word used in the videos, sentences,
   or anywhere in the app should be available"). A form of a word outside the
   course is a link, and it opens that word's entry. */

import { splitTokens, entryOf, lookup } from "../src/words";
import { deepFormOf } from "../src/data";

const forms = require("../assets/deepforms.json");

describe("words outside the course", () => {
  /* One the course does not teach, as it appears in the app's own text. */
  const key = Object.keys(forms).find((k) => /^[а-я]{5,}$/.test(k) && lookup(k) === null
    && !forms[k].startsWith(k + "|"));

  it("ships forms for them, and none for course words", () => {
    expect(Object.keys(forms).length).toBeGreaterThan(10000);
    expect(Object.keys(forms).filter((k) => lookup(k) !== null).length).toBe(0);
  });

  it("links an inflected form and opens its headword", () => {
    expect(key).toBeTruthy();
    const parts = splitTokens(`Вот ${key}.`).filter((p) => p.i !== undefined);
    expect(parts.map((p) => p.text)).toContain(key);
    const deep = deepFormOf(key);
    const entry = entryOf(key);
    expect(entry && entry.w).toBeTruthy();
    expect(entry.key).toBe(deep.word);
  });

  it("leaves a run nothing knows unlinked", () => {
    expect(splitTokens("ывфывфыв").every((p) => p.i === undefined)).toBe(true);
  });
});
