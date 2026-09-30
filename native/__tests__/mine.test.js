/* Taking a word out of a video and into review, with where it was heard
   (ROADMAP P10.4). Own file, per the note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState, normalise } from "../src/store";
import { Video } from "../src/screens/Misc";
import Study from "../src/screens/Study";
import { videos, unitById, L, idxOfWord } from "../src/data";
import { migrate, SCHEMA_VERSION } from "@core/state";
import { today } from "@core/util";
import { fromLegacy } from "@core/scheduler";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    YouTube: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ seek: jest.fn(), pause: jest.fn(), watch: jest.fn() }));
      return <View testID="yt-player" />;
    }),
  };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: SCHEMA_VERSION, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  mined: {}, dev: true, xp: 0, streak: 0,
};

const unitVideo = videos().find((v) => v.unit && unitById(v.unit).v
                                       && unitById(v.unit).v.heard);

async function withProfile(ui, state) {
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

describe("mining a word from a video", () => {
  const unit = unitById(unitVideo.unit);
  const word = Object.keys(unit.v.heard)[0];

  it("adds it to review and keeps the video and the second", async () => {
    await withProfile(<Video route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />);
    await screen.findByText("Play here");
    // Tapping the word opens its moment; the moment offers the one tap.
    await act(async () => { fireEvent.press(screen.getByTestId(`heard-${word}`)); });
    await act(async () => { fireEvent.press(await screen.findByTestId("mine")); });

    await flushState();
    const saved = (await global.__db.saved("p1"));
    expect(saved.pinned).toContain(word);
    expect(saved.mined[word]).toMatchObject({ v: unitVideo.id });
    expect(saved.mined[word].t).toBe(unit.v.heard[word][0].t);
    expect(typeof saved.mined[word].s).toBe("string");
    /* "Add to review" has to mean the scheduler owns it: the word gets a card,
       due today, so it is counted by "Review · N due" and reached by the quiz
       top-up. Pinning alone was read only by the Study picker's Trouble set. */
    expect(saved.seen[word].recognise).toMatchObject({ s: 0, reps: 0, lapses: 0, state: 0 });
    expect(saved.seen[word].recognise.dueAt).toBeLessThanOrEqual(Date.now());
    const { reviewWords } = require("../src/data");
    const { cardsIn } = require("../src/screens/Study");
    expect(reviewWords(saved)).toContain(idxOfWord(word));
    expect(cardsIn(saved, ["__due__"]).map((c) => c.b)).toContain(word);
    // Said once, and it says so rather than offering to add it again.
    expect(await screen.findByTestId("mined")).toBeTruthy();
    expect(screen.queryByTestId("mine")).toBeNull();
  });

  it("mining the same word twice does not duplicate it", async () => {
    const mined = { [word]: { v: unitVideo.id, t: 1234, s: "…" } };
    await withProfile(<Video route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />,
                      { pinned: [word], mined });
    await screen.findByText("Play here");
    await act(async () => { fireEvent.press(screen.getByTestId(`heard-${word}`)); });
    expect(await screen.findByTestId("mined")).toBeTruthy();
  });

  /* A word already being studied keeps its schedule: mining must not hand a
     mature card back to the scheduler as new. */
  it("leaves an existing card's schedule alone", async () => {
    const card = { s: 12, d: 6, due: today() + 9, last: today() - 3, reps: 5, lapses: 1 };
    await withProfile(<Video route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />,
                      { seen: { [word]: card } });
    await screen.findByText("Play here");
    await act(async () => { fireEvent.press(screen.getByTestId(`heard-${word}`)); });
    await act(async () => { fireEvent.press(await screen.findByTestId("mine")); });
    await flushState();
    const saved = (await global.__db.saved("p1"));
    expect(saved.seen[word]).toEqual({ recognise: fromLegacy(card) });
    expect(saved.mined[word]).toBeTruthy();
  });
});

describe("a mined word's card", () => {
  const unit = unitById(unitVideo.unit);
  const word = Object.keys(unit.v.heard)[0];

  it("sends you back to where you heard it", async () => {
    const i = idxOfWord(word);
    expect(i).toBeGreaterThanOrEqual(0);
    // The trouble round, as the You screen asks for it (2026-09-28).
    await withProfile(<Study navigation={nav} route={{ params: { round: "trouble" } }} />, {
      pinned: [word],
      mined: { [word]: { v: unitVideo.id, t: 4321, s: "… что-то про это …" } },
    });
    await act(async () => { fireEvent.press(await screen.findByText("Show")); });
    const link = await screen.findByTestId("from-video");
    expect(screen.getByText("… что-то про это …")).toBeTruthy();
    await act(async () => { fireEvent.press(link); });
    expect(nav.navigate).toHaveBeenCalledWith("Video",
      { videoId: unitVideo.id, word, at: 4321 });
  });
});

describe("the schema", () => {
  it("gives an older save an empty mined map rather than undefined", () => {
    const old = { v: 6, seen: {}, trouble: {}, pinned: [], watched: {}, decks: [] };
    const out = migrate(old, 6);
    expect(out.v).toBe(SCHEMA_VERSION);
    expect(out.mined).toEqual({});
    // …and normalise, which is what a real load runs, agrees.
    expect(normalise(old).mined).toEqual({});
  });
});
