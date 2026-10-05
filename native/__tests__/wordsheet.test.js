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
import { L, IX } from "../src/data";
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

describe("the word sheet's gloss", () => {
  it("numbers the sense groups rather than showing one run", async () => {
    const w = wordWith(3);
    expect(w).toBeTruthy();
    const groups = senseGroups(w.e);
    await open(w.b);
    expect(screen.getByTestId("senses")).toBeTruthy();
    groups.forEach((g, k) => {
      expect(screen.getByText(`${k + 1}. ${g}`)).toBeTruthy();
    });
    // Nothing is quietly dropped at three, so there is nothing to count.
    expect(screen.queryByTestId("senses-more")).toBeNull();
  });

  /* The sheet is the glance; "Full entry" is in the footer, one press away, and
     that is the escape hatch the cap assumes. A long gloss says how many it is
     holding back rather than running down the sheet. */
  it("caps a long gloss and counts what it is holding back", async () => {
    const w = [6, 7, 8, 5].map(wordWith).find(Boolean);
    expect(w).toBeTruthy();
    const groups = senseGroups(w.e);
    await open(w.b);
    expect(screen.getByText(`4. ${groups[3]}`)).toBeTruthy();
    expect(screen.queryByText(`5. ${groups[4]}`)).toBeNull();
    expect(screen.getByTestId("senses-more").props.children).toBe(`+${groups.length - 4} more`);
    expect(screen.getByText("Full entry")).toBeTruthy();
  });
});
