/* The UI test skin (src/skin.js, docs/ui-test-notebook.md): on, the app is
   ink on paper; off, it is exactly what it was — the owner's condition for
   trying it at all ("do not force this across the app in any way that we
   cannot quickly undo"). */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setSkin, loadSkin, useSkin, isNotebook, dateInWords, markOutOfFive, paper, board } from "../src/skin";
import { radius, faceFor, light, dark } from "../src/theme";
import { Text } from "../src/ui";
import { Done } from "../src/screens/Run";

afterEach(async () => { await setSkin("default"); await AsyncStorage.clear(); });

describe("the switch", () => {
  it("is off unless it is switched on, and puts everything back when switched off", async () => {
    expect(isNotebook()).toBe(false);
    const round = { ...radius }, face = faceFor("700");
    await setSkin("notebook");
    expect(radius.md).toBeLessThan(round.md);
    expect(faceFor("700")).toBe("PTSerif_700Bold");
    await setSkin("default");
    expect(radius).toEqual(round);
    expect(faceFor("700")).toBe(face);
  });

  /* The bug the review found: after a restart with the skin on, the saved
     choice reached the radius but not the app's own state, so switching off
     later changed nothing the app could see and it stayed half-skinned. */
  it("tells the app the saved choice at startup, so switching off afterwards reaches it", async () => {
    await AsyncStorage.setItem("rb.uitest", "notebook");
    function Probe() { return <Text testID="probe">{useSkin()}</Text>; }
    await render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("default");
    await act(async () => { await loadSkin(); });
    expect(screen.getByTestId("probe")).toHaveTextContent("notebook");
    await act(async () => { await setSkin("default"); });
    expect(screen.getByTestId("probe")).toHaveTextContent("default");
  });

  it("has every colour the app asks for, in both schemes", () => {
    for (const k of Object.keys(light)) expect(paper[k]).toBeTruthy();
    for (const k of Object.keys(dark)) expect(board[k]).toBeTruthy();
  });
});

/* tools/contrast.js audits theme.js only, so the skin's palettes are held
   here, with the same minimums: text 4.5:1 on what it sits on, accents 3:1. */
describe("the skin's contrast", () => {
  const lum = (h) => {
    const c = h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [["ink", "bg", 4.5], ["ink", "surface", 4.5], ["ink2", "surface", 4.5], ["ink3", "bg", 4.5],
    ["ink3", "surface", 4.5], ["ink3", "surface2", 4.5], ["brand", "bg", 3], ["brandInk", "brandBg", 4.5],
    ["brandOn", "brand", 4.5], ["good", "bg", 3], ["good", "goodBg", 4.5], ["bad", "bg", 3],
    ["bad", "badBg", 4.5], ["goodOn", "good", 4.5], ["badOn", "bad", 4.5], ["pen", "bg", 3]];
  for (const [name, p] of [["paper", paper], ["board", board]]) {
    it(`clears every minimum on ${name}`, () => {
      const low = pairs.filter(([f, b, min]) => ratio(p[f], p[b]) < min).map(([f, b]) => `${f} on ${b}`);
      expect(low).toEqual([]);
    });
  }
});

describe("the page", () => {
  it("writes labels in words, not capitals", async () => {
    await setSkin("notebook");
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

  it("replaces the percentage badge only in the skin, and only on a pass", async () => {
    await render(<Done title="Quiz" score={92} passed onBack={() => {}} />);
    expect(screen.queryByTestId("grade")).toBeNull();
    await setSkin("notebook");
    await render(<Done title="Quiz two" score={92} passed onBack={() => {}} />);
    expect(screen.getByTestId("grade")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    await render(<Done title="Quiz three" score={40} passed={false} onBack={() => {}} />);
    expect(screen.queryByTestId("grade")).toBeNull();   // screen is the latest render: the failed quiz
  });
});
