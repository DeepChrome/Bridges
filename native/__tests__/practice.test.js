/* The Practice tab, reorganised (2026-11-18): the activities as a grid of
   tiles, the grammar and the reference as rows, and no caption under any
   row — the chapter's grammar used to print its card's title. */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillList } from "../src/screens/Practice";
import { currentGrammarUnit, grammarNoteOf } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: true, flash: ["recognise"] };

async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  await render(<SessionProvider><DrillList navigation={nav} /></SessionProvider>);
  await screen.findByTestId("practice-activities");
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); nav.navigate.mockClear(); });
afterEach(async () => { await flushState(); });

it("lays the eight activities out as tiles, each a button that opens its screen", async () => {
  await open();
  const grid = screen.getByTestId("practice-activities");
  for (const id of ["practice-quiz", "practice-listen", "practice-drive", "practice-shadow",
                    "practice-buildup", "practice-translate", "practice-talk", "practice-tutor"]) {
    expect(within(grid).getByTestId(id)).toBeTruthy();
  }
  await act(async () => { fireEvent.press(screen.getByTestId("practice-drive")); });
  expect(nav.navigate).toHaveBeenLastCalledWith("Drive");
  await act(async () => { fireEvent.press(screen.getByTestId("practice-tutor")); });
  expect(nav.navigate).toHaveBeenLastCalledWith("Tutor");
  // The one word under a name says which kind of thing it is.
  expect(within(screen.getByTestId("practice-drive")).getByText("Listening")).toBeTruthy();
});

it("keeps the grammar and the reference as rows, with no caption under the chapter's grammar", async () => {
  await open();
  for (const id of ["open-grammar", "drill-cases", "drill-formcards", "open-alphabet", "open-endings"]) {
    expect(screen.getByTestId(id)).toBeTruthy();
  }
  const unit = currentGrammarUnit(base);
  if (unit) {
    const row = screen.getByTestId("chapter-grammar");
    expect(within(row).getByText("This chapter's grammar")).toBeTruthy();
    expect(within(row).queryByText(grammarNoteOf(unit).title)).toBeNull();
  }
});
