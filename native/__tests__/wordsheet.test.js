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
