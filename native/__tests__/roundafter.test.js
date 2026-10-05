/* A round handed in from a screen the learner is going back to ends on the
   way back (the owner, 2026-10-04: "After completing the flash cards for the
   video, the option should be to continue to video, not those other
   options"). Own file, per the note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";
import { SCHEMA_VERSION } from "@core/state";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: SCHEMA_VERSION, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  mined: {}, dev: true, xp: 0, streak: 0,
};

async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

async function playThrough(n) {
  for (let k = 0; k < n; k++) {
    await act(async () => { fireEvent.press(await screen.findByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("grade-4")); });
  }
}

describe("a list round with a way back", () => {
  it("ends on that one button, and it goes back", async () => {
    const words = ["город", "хотеть"];
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words, title: "Before the video", after: "Continue to video" } }} />);
    await playThrough(words.length);
    const back = await screen.findByTestId("round-after");
    expect(screen.getByText("Continue to video")).toBeTruthy();
    // Not the day's options: those belong to the Study tab, not to the video.
    expect(screen.queryByTestId("trouble-round")).toBeNull();
    expect(screen.queryByTestId("study-ahead")).toBeNull();
    expect(screen.queryByTestId("known-round")).toBeNull();
    expect(screen.queryByTestId("continue")).toBeNull();
    await act(async () => { fireEvent.press(back); });
    expect(nav.goBack).toHaveBeenCalled();
  });

  /* The back of a word card carries the grammar line under the word, and the
     front does not — the class and gender would be a hint before the turn. */
  it("says what the word is on the back, not the front", async () => {
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Gaps" } }} />);
    await screen.findByText("Show");
    expect(screen.queryByTestId("grammar-line")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    expect(await screen.findByTestId("grammar-line")).toBeTruthy();
  });

  it("without one, ends on the day's options as before", async () => {
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Gaps" } }} />);
    await playThrough(1);
    expect(await screen.findByTestId("study-state")).toBeTruthy();
    expect(screen.queryByTestId("round-after")).toBeNull();
  });
});
