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

  /* None for course words — except the forms a person gave to a noun the
     course does not teach (data/curated/link_overrides.json, 2026-10-05):
     «кружка» is the mug, not the genitive of «кружок». */
  it("ships forms for them, and for course words only what link_overrides names", () => {
    const links = Object.keys(require("../../data/curated/link_overrides.json")).filter((k) => !k.startsWith("_"));
    expect(Object.keys(forms).length).toBeGreaterThan(10000);
    expect(Object.keys(forms).filter((k) => lookup(k) !== null).sort()).toEqual(links.sort());
    const mug = entryOf("кружка");
    expect(mug && mug.key).toBe("кружка");
    expect(entryOf("кружок").key).toBe("кружок");
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
