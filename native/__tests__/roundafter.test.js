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
import { sessionFor } from "../src/studycards";
import { SCHEMA_VERSION } from "@core/state";
import { REVIEW, DAY } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: SCHEMA_VERSION, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  mined: {}, dev: true, xp: 0, streak: 0,
};

async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
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

  /* A round with somewhere to go on to (the summary's, 2026-10-09) ends on
     Continue, which goes there rather than back. */
  it("goes on to `next` with a Continue, not back", async () => {
    nav.replace = jest.fn();
    const words = ["город", "хотеть"];
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words, title: "Lesson", next: ["Video", { videoId: "x" }] } }} />);
    await playThrough(words.length);
    const on = await screen.findByTestId("round-after");
    expect(screen.getByText("Continue")).toBeTruthy();
    await act(async () => { fireEvent.press(on); });
    expect(nav.replace).toHaveBeenCalledWith("Video", { videoId: "x" });
  });

  /* A card already held (80+) is left out of a list handed in (the owner,
     2026-10-05: "they probably don't need to view it before the video"). */
  const held = () => ({ recognise: { state: REVIEW, s: 400, d: 3, reps: 9, lapses: 0, steps: 0,
                                     lastAt: Date.now() - DAY, dueAt: Date.now() + 300 * DAY } });
  it("leaves out the cards already mastered", () => {
    const st = { ...base, flash: ["recognise"], seen: { "город": held() } };
    const s = sessionFor(st, { round: "list", words: ["город", "хотеть"], title: "Before the video" });
    expect(s.items.map((x) => x.word)).toEqual(["хотеть"]);
  });

  it("goes straight to the way on when every card is mastered", async () => {
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Before the video", after: "Continue to video" } }} />,
      { seen: { "город": held() } });
    expect(await screen.findByTestId("round-after")).toBeTruthy();
    expect(screen.queryByText("Show")).toBeNull();
  });

  /* A second look the same day is practice (2026-10-05: «ребёнок» at 98
     after a few Easy presses in one sitting). */
  it("keeps the schedule of a card already answered today when the round's answer is right", async () => {
    const today = { recognise: { state: REVIEW, s: 2.3, d: 5, reps: 3, lapses: 0, steps: 0,
                                 lastAt: Date.now() - 30 * 60000, dueAt: Date.now() + 2 * DAY } };
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Gaps" } }} />, { seen: { "город": today } });
    await act(async () => { fireEvent.press(await screen.findByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("grade-4")); });
    await flushState();
    expect((await global.__db.saved("p1")).seen["город"].recognise.s).toBe(2.3);
  });

  it("…but an Again still counts", async () => {
    const today = { recognise: { state: REVIEW, s: 2.3, d: 5, reps: 3, lapses: 0, steps: 0,
                                 lastAt: Date.now() - 30 * 60000, dueAt: Date.now() + 2 * DAY } };
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Gaps" } }} />, { seen: { "город": today } });
    await act(async () => { fireEvent.press(await screen.findByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("grade-1")); });
    await flushState();
    expect((await global.__db.saved("p1")).seen["город"].recognise.s).not.toBe(2.3);
  });

  /* The card on screen is what a tester's report is about (about.js). */
  it("registers the card on screen for a report", async () => {
    const { currentAbout } = require("../src/about");
    await withProfile(<Study navigation={nav}
      route={{ params: { round: "list", words: ["город"], title: "Gaps" } }} />);
    await screen.findByText("Show");
    expect(currentAbout()).toMatchObject({ kind: "word card", word: "город", step: "1 of 1" });
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
