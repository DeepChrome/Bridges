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

/* The form manifest, stood in for: which forms happen to be bought at any
   moment is data; what the speaker does with a bought one and an unbought
   one is the contract. «ру́ки» has a recording here and «руки́» does not —
   the shape of the real manifest, where a second stress is never bought. */
jest.mock("../src/formaudio", () => ({
  formClip: (f) => (String(f).normalize("NFC") === "ру́ки".normalize("NFC") ? 4242 : null),
}));

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
  /* «руки́» (genitive) has no recording — in the real manifest a spelling
     with two stresses is never bought — so the device voice reads it, and
     the acute is the only thing telling it which of the two this is. */
  it("say an unbought form with the device voice, stress mark kept", async () => {
    await render(<Table table={PARADIGM} speak />);
    await act(async () => { fireEvent.press(screen.getByTestId("say-1-1-0")); });
    expect(global.__spoke).toContain("руки́");
    expect(screen.getByTestId("say-1-1-0").props.accessibilityLabel).toMatch(/device voice/);
  });

  /* «ру́ки» has its own recording, found by the accented spelling. Not the
     folded one: that is shared with «руки́», and is the key that would have
     played the wrong stress. */
  it("play a bought form's own recording, found by its accented spelling", async () => {
    global.__players = [];
    await render(<Table table={PARADIGM} speak />);
    const cell = screen.getByTestId("say-0-2-0");
    expect(cell.props.accessibilityLabel).not.toMatch(/device voice/);
    await act(async () => { fireEvent.press(cell); });
    expect(global.__spoke).not.toContain("ру́ки");
    expect(global.__players.length).toBeGreaterThan(0);
  });

  it("label the phone's voice as the phone's voice (§27)", async () => {
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

  /* The ending's own button plays the ending cut from a word said well
     (tools/build_ending_clips.mjs), never the phone reading the letters:
     reading «ого» as written is the mistake the entry exists to correct, and
     the phone reading a respelled fragment was inaccurate too (2026-09-29). */
  it("plays the ending cut from a recorded word, not the device voice", async () => {
    const { ENDING_CLIPS } = require("../src/endingaudio");
    expect(Object.keys(ENDING_CLIPS)).toHaveLength(ENDINGS.length);
    await render(<Endings />);
    const before = (global.__players || []).length;
    await act(async () => { fireEvent.press(await screen.findByTestId("ending-say-ogo")); });
    expect((global.__players || []).length).toBeGreaterThan(before);
    expect(global.__spoke).not.toContain("ого");
    expect(global.__spoke).not.toContain("ово");
    expect(screen.getByTestId("ending-say-ogo").props.accessibilityLabel).not.toMatch(/device voice/);
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
