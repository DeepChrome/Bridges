/* The You screen's grammar section: the tags speech feedback attached, counted,
   most frequent first, each a way into the unit that teaches the point.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import You, { grammarTrouble, gapsOf, learnedByUnit, finishedLessons } from "../src/screens/You";
import { L, lessonDone, lessonWords, components, markComponent } from "../src/data";
import { REVIEW } from "@core/scheduler";
import { tagInfo } from "@core/errortags";
import { UN } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withYou(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><You navigation={nav} /></SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await flushState();
});

/* Naming the corpora and their licences is a condition of using them (rule
   20.10), not decoration. The web build has carried it since 2026-09-04; the
   native app — the product — showed nothing at all until 2026-09-10. */
describe("attribution", () => {
  it("names every corpus and its licence in Settings", async () => {
    const { STATS } = require("../src/data");
    expect((STATS.credits || []).length).toBeGreaterThan(0);
    await withYou({});
    fireEvent.press(await screen.findByText("Settings"));
    for (const c of STATS.credits) {
      expect(await screen.findByText(`${c.n} · ${c.l}`)).toBeTruthy();
    }
  });
});

describe("grammar trouble", () => {
  it("orders tags by count and drops unknown ones", () => {
    const g = grammarTrouble({ speech: { tagCounts: { CASE: 2, PERSON: 5, BOGUS: 9, STRESS: 0 } } });
    expect(g.map((x) => x.id)).toEqual(["PERSON", "CASE"]);
    expect(g[0].info).toBe(tagInfo("PERSON"));
    expect(grammarTrouble({})).toEqual([]);
  });

  /* The lists live behind tiles now (2026-09-28: "hide those personalized
     feedback in some tiles"): the profile shows a count, the tap shows the
     list — and an empty list says so rather than opening on nothing. */
  it("shows a count on each tile, and nothing-yet behind an empty one", async () => {
    await withYou({});
    const tile = await screen.findByTestId("tile-grammar");
    expect(tile.props.accessibilityLabel).toBe("Grammar to work on: 0");
    expect(screen.getByTestId("tile-trouble").props.accessibilityLabel).toBe("Trouble words: 0");
    await act(async () => { fireEvent.press(tile); });
    expect(within(screen.getByTestId("grammar-sheet")).getByText("Nothing yet")).toBeTruthy();
  });

  it("counts a lesson as cleared only when it is done, not merely attempted", async () => {
    const u = UN[0];
    // Three lessons done (vocabulary met, quiz passed, the shared video watched)
    // and a fourth only attempted — quiz failed at 75, no vocabulary. Counting
    // attempts would say 4. Three and four appear nowhere else on the screen.
    await withYou({ unit: { [u.id]: { best: 90, done: false, video: true,
      lessons: { 0: { v: true, q: 90 }, 1: { v: true, q: 85 }, 2: { v: true, q: 100 }, 3: { q: 75 } } } } });
    expect(await screen.findByText("lessons cleared")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("lists a tag with its count and opens the unit that teaches it", async () => {
    await withYou({ speech: { attempts: [], tagCounts: { CASE: 3, WORD_ORDER: 1 } } });
    const tile = await screen.findByTestId("tile-grammar");
    expect(tile.props.accessibilityLabel).toBe("Grammar to work on: 2");
    await act(async () => { fireEvent.press(tile); });
    expect(await screen.findByText(tagInfo("CASE").en)).toBeTruthy();
    expect(screen.getByText("3×")).toBeTruthy();
    const unit = UN.find((u) => u.id === tagInfo("CASE").unit);
    expect(screen.getByText(unit.name)).toBeTruthy();
    fireEvent.press(screen.getByText(tagInfo("CASE").en));
    expect(nav.navigate).toHaveBeenCalledWith("Learn", { screen: "Unit", params: { unitId: unit.id } });
    // WORD_ORDER has no unit to send anyone to: listed, not pressable.
    fireEvent.press(screen.getByText(tagInfo("WORD_ORDER").en));
    expect(nav.navigate).toHaveBeenCalledTimes(1);
  });
});

/* "Words learned and lessons cleared can also be clickable… at the top, a
   recommendation for where the holes are" (the owner, 2026-10-03). */
describe("what was learned, and the gaps", () => {
  const unit = UN[0];
  const finishLesson = (st, k) => components(st, unit, k).filter((c) => !c.optional)
    .reduce((acc, c) => markComponent(acc, unit, k, c.id, 100), st);
  const held = { state: REVIEW, s: 30, d: 5, dueAt: Date.now() + 9 * 864e5, lastAt: Date.now() - 864e5, reps: 4, lapses: 0 };

  it("counts a finished lesson's unlearned words as gaps, and its learned ones as learned", () => {
    let st = { ...base, unit: {}, drills: {} };
    st = finishLesson(st, 0);
    expect(lessonDone(st, unit, 0)).toBe(true);
    const words = lessonWords(unit, 0);
    st.seen = { [L[words[0]].b]: { recognise: held } };
    const gaps = gapsOf(st);
    expect(gaps).not.toContain(words[0]);
    expect(gaps).toEqual(expect.arrayContaining(words.slice(1)));
    expect(learnedByUnit(st).units[0].words).toEqual([words[0]]);
    expect(finishedLessons(st)[0]).toMatchObject({ unit, done: [1] });
  });

  it("opens both lists from the band, the gaps first with a way to study them", async () => {
    let st = { ...base, unit: {}, drills: {} };
    st = finishLesson(st, 0);
    await withYou(st);
    await act(async () => { fireEvent.press(await screen.findByTestId("stat-learned")); });
    expect(await screen.findByTestId("gaps")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("gaps-study")); });
    expect(nav.navigate).toHaveBeenCalledWith("Study", expect.objectContaining({ screen: "Cards" }));
    await act(async () => { fireEvent.press(await screen.findByTestId("stat-lessons")); });
    expect(await screen.findByTestId("lessons-sheet")).toBeTruthy();
    expect(screen.getByText(unit.name)).toBeTruthy();
  });
});

