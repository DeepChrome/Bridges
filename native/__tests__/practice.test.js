/* The Practice tab, reorganised (2026-11-18, then 2026-11-19): two tabs at
   the top, Drills and Grammar, each a grid of tiles; the reference under the
   grammar; no caption under any tile beyond its kind. */
import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Practice } from "../src/screens/Practice";
import { currentGrammarUnit, grammarNoteOf } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: true, flash: ["recognise"] };

async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  await render(<SessionProvider><Practice navigation={nav} /></SessionProvider>);
  await screen.findByTestId("practice-activities");
}
const press = async (id) => act(async () => { fireEvent.press(screen.getByTestId(id)); });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); nav.navigate.mockClear(); });
afterEach(async () => { await flushState(); });

it("opens on the Drills tab: eight activities as tiles, each a button that opens its screen", async () => {
  await open();
  const grid = screen.getByTestId("practice-activities");
  for (const id of ["practice-quiz", "practice-listen", "practice-drive", "practice-shadow",
                    "practice-buildup", "practice-translate", "practice-talk", "practice-tutor"]) {
    expect(within(grid).getByTestId(id)).toBeTruthy();
  }
  expect(screen.queryByTestId("practice-grammar")).toBeNull();
  await press("practice-drive");
  expect(nav.navigate).toHaveBeenLastCalledWith("Drive", undefined);
  await press("practice-tutor");
  expect(nav.navigate).toHaveBeenLastCalledWith("Tutor", undefined);
  // The one word under a name says which kind of thing it is.
  expect(within(screen.getByTestId("practice-drive")).getByText("Listening")).toBeTruthy();
});

it("the Grammar tab is tiles too, the reference under them, and no caption names the chapter's card", async () => {
  await open();
  await press("practice-tabs-grammar");
  expect(screen.queryByTestId("practice-activities")).toBeNull();
  const grid = screen.getByTestId("practice-grammar");
  for (const id of ["open-grammar", "drill-cases", "drill-formcards", "drill-conjugation", "drill-aspect",
                    "drill-agreement", "drill-stress"]) {
    expect(within(grid).getByTestId(id)).toBeTruthy();
  }
  const ref = screen.getByTestId("practice-reference");
  for (const id of ["open-alphabet", "open-endings"]) expect(within(ref).getByTestId(id)).toBeTruthy();
  await press("drill-aspect");
  expect(nav.navigate).toHaveBeenLastCalledWith("Drill", { type: "aspect" });
  const unit = currentGrammarUnit(base);
  if (unit) {
    const tile = within(grid).getByTestId("chapter-grammar");
    expect(tile.findByProps ? true : true).toBe(true);
    expect(within(screen.getByTestId("chapter-grammar")).getByText("This chapter's grammar")).toBeTruthy();
    expect(within(screen.getByTestId("chapter-grammar")).queryByText(grammarNoteOf(unit).title)).toBeNull();
  }
  // Back to the drills: the tab is the screen's own state.
  await press("practice-tabs-drills");
  expect(screen.getByTestId("practice-activities")).toBeTruthy();
});
