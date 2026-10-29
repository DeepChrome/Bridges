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

  /* The owner, 2026-10-20, of «ва́нная»'s example: every word underlined but
     «накра́шенная». The build cut words at the stress mark the app keeps, so
     a stress-marked word outside the course was never looked up; and
     OpenRussian has no participles, which Wiktionary lists under the verb. */
  it("links every word of a stress-marked sentence, a participle to its verb", () => {
    const parts = splitTokens("Она́ вы́шла из ва́нной уже́ накра́шенная и оде́тая.");
    const words = parts.filter((p) => /[а-я]/i.test(p.text));
    expect(words.filter((p) => p.i === undefined).map((p) => p.text)).toEqual([]);
    expect(entryOf("накра́шенная").key).toBe("накрасить");
  });

  /* A sweep rather than one sentence: the dictionary's examples are what most
     of the app's Russian is. 3.8 % of their words were plain text before the
     fix (2,536 of them stress-marked) and 0.65 % after, nearly all names
     (tools/audit_links.mjs prints the rest by reason). */
  it("leaves under one word in a hundred of the dictionary's examples unlinked", () => {
    const { TOKEN } = require("@core/util");
    const sent = require("../assets/sent.json");
    let n = 0, plain = 0;
    for (const [ru] of sent) {
      for (const w of ru.match(new RegExp(TOKEN.source, "g")) || []) {
        n++;
        if (entryOf(w) === null) plain++;
      }
    }
    expect(n).toBeGreaterThan(50000);
    expect(plain / n).toBeLessThan(0.01);
  });

  /* A word OpenRussian lacks, or lists with no meaning, is given Wiktionary's
     — an entry with no table, since nothing is invented (§30). */
  it("opens a word only Wiktionary has, with its meaning and no table", () => {
    const e = entryOf("подкаста");
    expect(e && e.key).toBe("подкаст");
    expect(e.w.e).toMatch(/podcast/);
    expect(e.w.t || []).toEqual([]);
    expect(entryOf("Сочи").w.e).toMatch(/Sochi/);
  });
});
