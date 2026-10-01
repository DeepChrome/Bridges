/* The UI test skin (src/skin.js, docs/ui-test-notebook.md): on, the app is
   the exercise book; off, it is exactly what it was — the owner's condition for
   trying it at all ("do not force this across the app in any way that we
   cannot quickly undo"). */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { setSkin, isNotebook, dateInWords, markOutOfFive, paper } from "../src/skin";
import { radius, faceFor, light } from "../src/theme";
import { Screen, Text } from "../src/ui";
import { Done } from "../src/screens/Run";

afterEach(() => { setSkin("default"); });

describe("the switch", () => {
  it("is off unless it is switched on, and puts everything back when switched off", () => {
    expect(isNotebook()).toBe(false);
    const round = { ...radius }, face = faceFor("700");
    setSkin("notebook");
    expect(radius.md).toBeLessThan(round.md);
    expect(faceFor("700")).toBe("PTSerif_700Bold");
    setSkin("default");
    expect(radius).toEqual(round);
    expect(faceFor("700")).toBe(face);
  });

  it("has every colour the app asks for", () => {
    for (const k of Object.keys(light)) expect(paper[k]).toBeTruthy();
  });
});

describe("the page", () => {
  /* Round two (the owner, 2026-09-30): the grid and the margin rule went —
     "the background is ugly with the squares" — so the page is plain. */
  it("draws no grid or margin rule on the page", async () => {
    setSkin("notebook");
    await render(<Screen><Text>page</Text></Screen>);
    expect(screen.queryByTestId("paper")).toBeNull();
  });

  it("writes labels in words, not capitals", async () => {
    setSkin("notebook");
    await render(<Text testID="label" style={{ textTransform: "uppercase", letterSpacing: 1 }}>Verbs</Text>);
    const style = [].concat(...[screen.getByTestId("label").props.style].flat(3)).filter(Boolean);
    expect(Object.assign({}, ...style).textTransform).toBe("none");
  });
});

describe("the date at the top of the page", () => {
  it("is the ordinal in the neuter and the month in the genitive", () => {
    expect(dateInWords(new Date(2026, 8, 30)).ru).toBe("Тридцатое сентября");
    expect(dateInWords(new Date(2026, 0, 1)).ru).toBe("Первое января");
    expect(dateInWords(new Date(2026, 2, 23)).ru).toBe("Двадцать третье марта");
    expect(dateInWords(new Date(2026, 11, 31)).en).toBe("31 December");
  });
});

describe("the teacher's mark", () => {
  it("is out of five, and never below three", () => {
    expect(markOutOfFive(0.95)).toBe(5);
    expect(markOutOfFive(0.8)).toBe(4);
    expect(markOutOfFive(0.2)).toBe(3);
  });

  it("replaces the percentage badge only in the skin", async () => {
    await render(<Done title="Quiz" score={92} passed onBack={() => {}} />);
    expect(screen.queryByTestId("grade")).toBeNull();
    setSkin("notebook");
    await render(<Done title="Quiz two" score={92} passed onBack={() => {}} />);
    expect(screen.getByTestId("grade")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });
});
