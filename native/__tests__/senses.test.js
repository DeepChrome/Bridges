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
import { SenseList } from "../src/ui";

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
});
