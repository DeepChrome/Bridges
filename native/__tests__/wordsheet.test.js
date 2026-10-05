/* The first tap: the summary sheet behind every Russian word on every screen.
 *
 * The gloss is what the sheet is for, and it was the one surface in the app
 * that showed it as a run of prose — worse, as `firstSense` alone, so «стол»
 * read "table" and the learner had no way to know the entry also holds "diet"
 * and "department" (ROADMAP P11.9). The entry, the flashcard back and the
 * vocabulary card all number the sense groups; so does this now.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";

import { WordsProvider, Linked } from "../src/words";
import { senseGroups } from "../src/ui";
import { L, IX, sensesOf } from "../src/data";
import { fold } from "@core/util";

/* A word the dictionary reaches by its own headword, with `n` sense groups. */
const wordWith = (n) => L.find((e) => {
  const hit = IX[fold(e.b || "")];
  return hit && L[hit[0]] === e && senseGroups(e.e).length === n;
});

const open = async (word) => {
  await render(<WordsProvider><Linked text={word} /></WordsProvider>);
  await act(async () => { fireEvent.press(screen.getByText(word)); });
};

/* The walkthrough, 2026-09-30: the glance was the one surface where a tapped
   word could not be heard, and its gender pill read a bare "f". */
describe("the word sheet's head", () => {
  it("can be heard, and says the gender in words", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "noun" && e.g === "f";
    });
    expect(w).toBeTruthy();
    await open(w.b);
    // Flags right under the word, in words (the owner, 2026-10-04).
    expect(flagsOf("grammar-fact")).toEqual(["noun", "feminine"]);
    expect(screen.queryByText("f")).toBeNull();
    expect(screen.getAllByLabelText(/Hear it/).length).toBeGreaterThan(0);
  });

  /* «книгу» tapped in a sentence: the form as met, large; flags for its case
     and number read out of the word's table; then the dictionary form with its
     top meaning, which opens the full entry. */
  it("is a snapshot of the tapped form: flags, then the dictionary form", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "noun" && e.g === "f" && /а$/.test(e.b)
        && IX[fold(e.b.replace(/а$/, "у"))] && L[IX[fold(e.b.replace(/а$/, "у"))][0]] === e;
    });
    expect(w).toBeTruthy();
    const form = w.b.replace(/а$/, "у");
    await open(form);
    expect(screen.getByTestId("sheet-word")).toHaveTextContent(form);
    expect(flagsOf("grammar-flag")).toEqual(["accusative", "singular"]);
    expect(screen.getByTestId("sheet-root")).toHaveTextContent(/Dictionary form/);
  });

  /* A verb says its aspect, and the partner of the other aspect. */
  it("gives a verb its aspect and partner", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "verb" && e.a === "imperfective" && e.pt;
    });
    expect(w).toBeTruthy();
    await open(w.b);
    expect(flagsOf("grammar-fact")).toEqual(["verb", "imperfective"]);
    const partner = w.pt.split(/,\s*/)[0];
    expect(flat(screen.getByTestId("grammar-partner"))).toBe(`(${partner})`);
    // The partner is a link: pressing it opens that word's glance.
    await act(async () => { fireEvent.press(screen.getByTestId("grammar-partner")); });
    expect(fold(flat(screen.getByTestId("sheet-word")))).toBe(fold(partner));
  });

  /* The flag's explanation is behind a tap, in a bubble (2026-10-04). */
  it("opens a fact's detail in a bubble", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "verb" && e.a === "imperfective" && e.pt;
    });
    await open(w.b);
    expect(screen.queryByTestId("fact-bubble")).toBeNull();
    const aspect = screen.getAllByTestId("grammar-fact").find((n) => flat(n) === "imperfective");
    await act(async () => { fireEvent.press(aspect); });
    expect(screen.getByTestId("fact-bubble")).toHaveTextContent(/process/);
    await act(async () => { fireEvent.press(screen.getByTestId("bubble-backdrop")); });
    expect(screen.queryByTestId("fact-bubble")).toBeNull();
  });

  /* The rule opens as a screen; the sheet it was read from must not stay drawn
     over it (the review, 2026-10-04). */
  it("puts the word sheet away when the rule is opened from a fact", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "verb" && e.a === "imperfective" && e.pt;
    });
    await open(w.b);
    const aspect = screen.getAllByTestId("grammar-fact").find((n) => flat(n) === "imperfective");
    await act(async () => { fireEvent.press(aspect); });
    await act(async () => { fireEvent.press(screen.getByTestId("fact-rule")); });
    expect(screen.queryByTestId("fact-bubble")).toBeNull();
    expect(screen.queryByTestId("sheet-word")).toBeNull();
  });

  /* «после»: OpenRussian's "other" is not a word class, and is not shown. */
  it("never flags a word 'other'", async () => {
    const w = L.find((e) => {
      const hit = IX[fold(e.b || "")];
      return hit && L[hit[0]] === e && e.p === "other";
    });
    expect(w).toBeTruthy();
    await open(w.b);
    expect(screen.queryByText("other")).toBeNull();
  });
});

const flagsOf = (id) => screen.queryAllByTestId(id).map((n) => flat(n));

/* Every string under a Text, nested spans included. */
const flat = (node) => {
  const kids = node.props.children;
  const walk = (k) => (k == null || k === false ? "" : typeof k === "string" || typeof k === "number" ? String(k)
    : Array.isArray(k) ? k.map(walk).join("") : k.props ? walk(k.props.children) : "");
  return walk(kids);
};

/* The glance shows the top two meanings, numbered, one to a line, and More
   at the foot for the rest (the owner, 2026-10-04: "just grab the top two
   numbered definitions and leave the more button at the bottom"). */
describe("the word sheet's meanings", () => {
  const headword = (pred) => L.findIndex((e) => {
    const hit = IX[fold(e.b || "")];
    return hit && L[hit[0]] === e && pred(e, L.indexOf(e));
  });

  it("shows the dictionary's top two senses and nothing after them", async () => {
    const i = headword((e, k) => (sensesOf(k) || []).length >= 3);
    expect(i).toBeGreaterThanOrEqual(0);
    const senses = sensesOf(i);
    await open(L[i].b);
    const lines = screen.getAllByTestId("sense-list")[0];
    expect(flat(lines)).toContain(senses[0].g);
    expect(flat(lines)).toContain(senses[1].g);
    expect(flat(lines)).not.toContain(senses[2].g);
    expect(screen.queryByTestId("sense-example")).toBeNull();
    expect(screen.queryByTestId("senses-more")).toBeNull();
    expect(screen.getByText("More")).toBeTruthy();
    expect(screen.queryByText("Full entry")).toBeNull();
  });

  it("numbers a bare gloss the same way when there are no senses", async () => {
    const i = headword((e, k) => !sensesOf(k) && senseGroups(e.e).length >= 3);
    if (i < 0) return; // every taught word with a long gloss has senses
    const groups = senseGroups(L[i].e);
    await open(L[i].b);
    expect(screen.getByText(`1. ${groups[0]}`)).toBeTruthy();
    expect(screen.getByText(`2. ${groups[1]}`)).toBeTruthy();
    expect(screen.queryByText(`3. ${groups[2]}`)).toBeNull();
    expect(screen.queryByTestId("senses-more")).toBeNull();
  });
});
