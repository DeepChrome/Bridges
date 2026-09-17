/* Numbered senses, from a source that has them (§30q).
 *
 * The owner, 2026-09-11, with a dictionary entry beside the app: *"every single
 * word should have a detailed entry with multiple uses of the word"*. The app
 * was not hiding them — OpenRussian's glosses are lists of translations, and 89%
 * of the studied words had exactly one sense group, so there was one line to
 * draw. Wiktionary has senses; these assert that what shipped is what the entry
 * needs, because a payload that quietly loses them looks exactly like a word
 * that only has one meaning.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

import { sensesOf, idxOfWord, L } from "../src/data";
import { SenseList, BRIEF_EXAMPLE_WORDS } from "../src/ui";

describe("what a word means", () => {
  it("ships senses for nearly every studied word", () => {
    let found = 0, multi = 0;
    for (let i = 0; i < L.length; i++) {
      const s = sensesOf(i);
      if (!s) continue;
      found++;
      if (s.length > 1) multi++;
    }
    /* Measured when this was written: 3,968 of 4,017 found, 2,334 with more
       than one. The floor is what matters — a join that breaks drops these to
       nothing, and every entry silently becomes one line again. */
    expect(found).toBeGreaterThan(L.length * 0.9);
    expect(multi).toBeGreaterThan(L.length * 0.4);
  });

  it("gives a word with several meanings all of them, in order", () => {
    const senses = sensesOf(idxOfWord("стол"));
    expect(senses.length).toBeGreaterThan(2);
    expect(senses[0].g).toMatch(/table/i);
    // Every sense says something, and none repeats the one before it.
    const seen = new Set();
    for (const s of senses) {
      expect(typeof s.g).toBe("string");
      expect(s.g.trim()).not.toBe("");
      expect(seen.has(s.g)).toBe(false);
      seen.add(s.g);
    }
  });

  /* A sense that only says "genitive plural of ..." is not a meaning, and the
     extract is mostly those. Letting one through would put grammar where the
     meaning goes, on every card that word appears on. */
  it("carries no form-of rows", () => {
    const bad = [];
    for (let i = 0; i < L.length; i++) {
      for (const s of sensesOf(i) || []) {
        if (/^(genitive|dative|accusative|inflection|plural) .*\bof\b/i.test(s.g)) {
          bad.push(`${L[i].b}: ${s.g}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("says nothing for a word it does not have", () => {
    expect(sensesOf(-1)).toBe(null);
    expect(sensesOf(undefined)).toBe(null);
    expect(sensesOf(999999)).toBe(null);
  });
});

describe("how they are drawn", () => {
  const senses = [
    { g: "table", x: [{ ru: "Свеча горела на столе.", en: "A candle was burning on the table." }] },
    { g: "throne", t: ["archaic"] },
    { g: "department" },
  ];

  it("numbers them, labels them, and shows the example under its own sense", async () => {
    await render(<SenseList senses={senses} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("archaic ")).toBeTruthy();
    expect(screen.getByText("Свеча горела на столе.")).toBeTruthy();
    expect(screen.getByText("A candle was burning on the table.")).toBeTruthy();
  });

  /* One meaning is not a numbered list. A lone "1" in front of a single line is
     how an interface tells a learner there is more when there is not. */
  it("does not number a word with one meaning", async () => {
    await render(<SenseList senses={[{ g: "and" }]} />);
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.getByText("and")).toBeTruthy();
  });

  it("caps a card's list and says how many are left", async () => {
    await render(<SenseList senses={senses} max={2} />);
    expect(screen.getByText("+1 more")).toBeTruthy();
    expect(screen.queryByText("department")).toBeNull();
  });

  /* A dictionary entry may quote; a flashcard may not (ROADMAP 13.34).
     Wiktionary illustrates common words with literature, and the owner met the
     back of a card carrying twenty-five words of War and Peace. */
  describe("a card, not an entry", () => {
    const long = { ru: new Array(BRIEF_EXAMPLE_WORDS + 4).fill("слово").join(" "),
                   en: "a sentence far too long to read on a flashcard" };
    const short = { ru: "Это стол.", en: "This is a table." };

    /* **Do not call `unmount()` here.** In this project's RNTL, unmounting
       tears down the root that every later `render` in the same file draws
       into: the next render returns a tree of `null` and every query on it
       fails. These two tests passed on their own and failed together for
       exactly that reason, and it looked like a bug in the filter rather than
       in the test. Each render below uses a different gloss instead, so
       `screen` can never be ambiguous about which one it is reading. */
    it("leaves a quotation off a card", async () => {
      await render(<SenseList senses={[{ g: "quotation-card", x: [long] }]} brief />);
      expect(screen.queryByTestId("sense-example")).toBeNull();
      expect(screen.getByText("quotation-card")).toBeTruthy();   // the meaning still shows
    });

    it("…and keeps it in an entry, which may quote", async () => {
      await render(<SenseList senses={[{ g: "quotation-entry", x: [long] }]} />);
      expect(screen.getAllByTestId("sense-example").length).toBeGreaterThanOrEqual(1);
    });

    it("keeps a short one, and only one", async () => {
      const two = { ru: "Это дом.", en: "This is a house." };
      await render(<SenseList senses={[{ g: "desk", x: [short, two, long] }]} brief />);
      expect(screen.getByText("This is a table.")).toBeTruthy();
      expect(screen.queryByText("This is a house.")).toBeNull();   // only the first
    });

    /* The bound is a measurement, not a guess: the median shipped example is
       four words and three quarters are inside ten. */
    it("draws the line where the examples actually are", () => {
      expect(BRIEF_EXAMPLE_WORDS).toBeGreaterThanOrEqual(10);
      expect(BRIEF_EXAMPLE_WORDS).toBeLessThanOrEqual(15);
    });
  });
});

/* The pipeline's half of it: nothing shipped may be a cut-off translation.
   `clean()` in ingest_wiktionary.py used to end `s[:MAX_GLOSS]`, which applied
   a gloss cap to example sentences and sliced 504 of them mid-word. */
describe("what the pipeline shipped", () => {
  it("carries no example longer than the ingest's bound", () => {
    let total = 0, over = 0;
    for (let i = 0; i < L.length; i++) {
      for (const s of sensesOf(i) || []) {
        for (const x of s.x || []) {
          total++;
          if (String(x.ru || "").length > 180 || String(x.en || "").length > 180) over++;
        }
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(over).toBe(0);
  });
});
