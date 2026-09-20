/* The tour demonstrates what it says (the owner, 2026-09-19): the sentence on
   the first card is a real `Linked`, one tap opens the word sheet, and the
   second opens the full entry — as a sheet, because at first run there is no
   navigator yet. Rendered without a NavigationContainer for exactly that case. */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import { Intro } from "../src/screens/Intro";

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

test("tap a word for its sheet, tap again for the whole entry", async () => {
  await render(
    <SessionProvider><WordsProvider><Intro onDone={jest.fn()} /></WordsProvider></SessionProvider>
  );
  expect(await screen.findByTestId("tour-sentence")).toBeTruthy();
  const word = screen.getByLabelText("читаю, open word");
  await act(async () => { fireEvent.press(word); });
  // The glance: the headword and the way through.
  expect(await screen.findByText("Full entry")).toBeTruthy();
  expect(screen.getByText("чита́ть")).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText("Full entry")); });
  // The entry, whole, without a screen to push it onto.
  const full = await screen.findByTestId("word-full-sheet");
  expect(full).toBeTruthy();
  expect(screen.getByText(/№ \d+ by frequency/)).toBeTruthy();
  expect(screen.queryByText(/Heard in/)).toBeNull();          // no player to open from here
});

test("the last card is the five tabs, drawn from the bar's own list", async () => {
  await render(
    <SessionProvider><WordsProvider><Intro onDone={jest.fn()} /></WordsProvider></SessionProvider>
  );
  await screen.findByTestId("tour-sentence");
  for (let k = 0; k < 3; k++) await act(async () => { fireEvent.press(screen.getByText("Next")); });
  expect(await screen.findByTestId("tour-tabs")).toBeTruthy();
  for (const name of ["Learn", "Study", "Practice", "Immerse", "Search"]) {
    expect(screen.getByText(name)).toBeTruthy();
  }
  expect(screen.getByText("Start")).toBeTruthy();       // the last card starts, not Next
  expect(screen.queryByText("Skip")).toBeNull();
});

test("the copy says less than it used to", async () => {
  await render(
    <SessionProvider><WordsProvider><Intro onDone={jest.fn()} /></WordsProvider></SessionProvider>
  );
  await screen.findByTestId("tour-sentence");
  expect(screen.queryByText(/Latin|Cyrillic|recognised/)).toBeNull();
});
