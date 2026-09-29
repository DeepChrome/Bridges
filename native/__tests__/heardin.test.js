/* "Heard in" on a dictionary entry: where a native speaker says this word.
 *
 * The heading counts every video that says it — 130 for the commonest — and the
 * list showed four with no way to the rest, which made the count a promise the
 * screen could not keep (ROADMAP P11.9). 22 % of the words the library says are
 * said in more than four videos, so this is not an edge case.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Word from "../src/screens/Word";
import { L, heardIn } from "../src/data";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: jest.fn(), pause: jest.fn() }));
    return React.createElement(View, { testID: "yt-player" });
  }) };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};
async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

describe("“Heard in” on a dictionary entry", () => {
  it("opens the whole list from the row after the last one, and closes it again", async () => {
    const many = L.map((e) => ({ b: e.b, n: heardIn(e.b).length }))
                  .filter((x) => x.n > 4)
                  .sort((a, b) => b.n - a.n)[0];
    expect(many).toBeTruthy();
    const rows = heardIn(many.b);

    await withProfile(<Word route={{ params: { word: many.b } }} navigation={nav} />);
    expect(await screen.findByText(`Heard in · ${rows.length}`)).toBeTruthy();
    // Closed until asked for (2026-09-29): nothing listed, then four.
    expect(screen.queryByTestId(`heard-${rows[0].id}`)).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("heard-toggle")); });
    // Four to begin with, and the way to the rest says how many there are.
    const shown = () => rows.filter((r) => screen.queryByTestId(`heard-${r.id}`)).length;
    expect(shown()).toBe(4);
    expect(screen.getByText(`Show all ${rows.length}`)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId("heard-more")); });
    expect(shown()).toBe(rows.length);
    expect(screen.getByText("Show fewer")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId("heard-more")); });
    expect(shown()).toBe(4);
  });

  it("says nothing about showing more when four is all there is", async () => {
    const few = L.map((e) => ({ b: e.b, n: heardIn(e.b).length }))
                 .filter((x) => x.n > 0 && x.n <= 4)[0];
    expect(few).toBeTruthy();
    await withProfile(<Word route={{ params: { word: few.b } }} navigation={nav} />);
    expect(await screen.findByText(`Heard in · ${few.n}`)).toBeTruthy();
    expect(screen.queryByTestId("heard-more")).toBeNull();
  });
});
