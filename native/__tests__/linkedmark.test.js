/* A card's word drawn out of its examples.
 *
 * A tester, 2026-10-15, on the back of «весь»: *"Why is it spelled in
 * different ways in the example sentences"* — «Всему своё время», «Прошу
 * все́х встать», «Один за всех, и все за одного». They are one word inflected,
 * and nothing on the card said so. `Linked` takes the word the card is about
 * (`mark`) and draws each of its forms as `Marked` draws Russian: brand
 * colour, bold.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Linked, formsOf } from "../src/words";
import { L, exactIdx } from "../src/data";

const fold = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
const ves = L[exactIdx("весь")];

describe("the card's word in its examples", () => {
  it("knows every spelling the word takes", () => {
    const forms = formsOf(ves);
    for (const f of ["весь", "всему", "всех", "все", "вся"]) expect(forms.has(f)).toBe(true);
    expect(forms.has("свое")).toBe(false);
  });

  it("marks the word's forms and nothing else", async () => {
    await render(<Linked text="Один за всех, и все за одного." mark={ves} />);
    const own = screen.getAllByTestId("linked-own").map((n) => fold(String(n.props.children)));
    expect(own).toEqual(["всех", "все"]);
    const style = StyleSheet.flatten(screen.getAllByTestId("linked-own")[0].props.style);
    expect(style.fontFamily).toMatch(/Bold|700/i);
  });

  it("marks nothing without a word to mark", async () => {
    await render(<Linked text="Всему своё время." />);
    expect(screen.queryAllByTestId("linked-own")).toHaveLength(0);
  });
});
