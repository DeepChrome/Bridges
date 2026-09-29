/* Every form can be heard, and so can every ending (2026-09-28).
 *
 * The owner: *"an audio button next to every pronunciation of a word so I can
 * hear how the word is said in all forms"*, and *"demos of how word endings
 * are pronounced… One button will pronounce the termination. The other area
 * will have maybe 3 examples of each."*
 *
 * What a speaker *says* is the contract, and it is checked against what the
 * device voice was actually handed (`global.__spoke`), because the render
 * tree cannot hear. Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";

import { Table } from "../src/rules";
import Endings from "../src/screens/Endings";
import { endingsByFrequency } from "../src/data";
import { ENDINGS } from "@core/endings";

const PARADIGM = {
  title: "Declension", columns: ["Case", "Singular", "Plural"],
  rows: [["Nominative", ["рука́"], ["ру́ки"]], ["Genitive", ["руки́"], ["рук"]]],
};

beforeEach(() => { global.__spoke = []; });

describe("a table's forms", () => {
  it("each say themselves, with the stress mark kept", async () => {
    await render(<Table table={PARADIGM} speak />);
    await act(async () => { fireEvent.press(screen.getByTestId("say-1-1-0")); });
    /* «руки́» and «ру́ки» are the same letters; the acute is the only thing
       telling the voice which one this is, so it must reach the voice. */
    expect(global.__spoke).toContain("руки́");
    await act(async () => { fireEvent.press(screen.getByTestId("say-0-2-0")); });
    expect(global.__spoke).toContain("ру́ки");
  });

  it("are labelled as the phone's voice (§27)", async () => {
    await render(<Table table={PARADIGM} speak />);
    expect(screen.getByTestId("say-0-1-0").props.accessibilityLabel).toMatch(/device voice/);
  });

  /* The grammar reference's tables hold endings — «-ов», «-ами» — and a voice
     reading a lone ending says something no Russian would. */
  it("stay silent where the table does not ask for speakers", async () => {
    await render(<Table table={PARADIGM} />);
    expect(screen.queryByTestId("say-0-1-0")).toBeNull();
  });

  it("never give the row label a speaker", async () => {
    await render(<Table table={PARADIGM} speak />);
    expect(screen.queryByTestId("say-0-0-0")).toBeNull();
  });
});

describe("Word endings", () => {
  it("lists every ending, commonest first", async () => {
    await render(<Endings />);
    const ranked = endingsByFrequency();
    await waitFor(() => expect(screen.getByTestId(`ending-${ranked[0].id}`)).toBeTruthy());
    for (const e of ENDINGS) expect(screen.getByTestId(`ending-${e.id}`)).toBeTruthy();
    for (let k = 1; k < ranked.length; k++) {
      expect(ranked[k - 1].count).toBeGreaterThanOrEqual(ranked[k].count);
    }
    // In running Russian the unstressed vowels are at the end of most words.
    expect(ranked[0].id).toBe("a");
  });

  /* The ending's own button says the respelling, not the letters: reading
     «ого» as written is the mistake the entry exists to correct. */
  it("says the ending as it sounds, not as it is spelled", async () => {
    await render(<Endings />);
    await act(async () => { fireEvent.press(await screen.findByTestId("ending-say-ogo")); });
    expect(global.__spoke).toContain("ово");
    expect(global.__spoke).not.toContain("ого");
  });

  it("plays each example", async () => {
    await render(<Endings />);
    const ex = ENDINGS.find((e) => e.id === "tsa").examples[0];
    await act(async () => { fireEvent.press(await screen.findByTestId(`ending-ex-tsa-${ex}`)); });
    // A recording or the phone's voice — either way something was asked to play.
    const played = global.__spoke.length > 0 || (global.__players || []).length > 0;
    expect(played).toBe(true);
  });
});
