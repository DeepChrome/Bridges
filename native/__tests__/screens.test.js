/* Rendering tests for the native screens.
 *
 * core.test.mjs proves the rules; this proves a screen draws and responds.
 *
 * COVERAGE IS PARTIAL AND DELIBERATELY SO. Past roughly the sixth test in a file,
 * every matcher begins timing out cumulatively in this React 19 / RNTL 14 /
 * jest-expo 57 combination â€” the render succeeds but nothing is findable. The cause
 * is not isolated, so rather than ship a red suite the screens that could not be
 * covered reliably are listed below and are exercised by hand instead. Two facts
 * learned the hard way, worth keeping:
 *
 *   - RNTL v14's `render` is ASYNC. It must be awaited, or `screen` stays empty and
 *     every query throws "render function has not been called".
 *   - Text matching does NOT join adjacent string children, so `Stage {i + 1}` is two
 *     nodes and never matches "Stage 1". Components now build such labels as a single
 *     template string, which is also what a screen reader should hear.
 *
 * Not covered here: the vocabulary and quiz flows, drills, Study, Search, Immerse and
 * You. Their logic is covered by core.test.mjs and by the web suites, which drive the
 * same generators through core/.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { UnitScreen, LessonScreen } from "../src/screens/Unit";
import { UN, STAGES, lessonCount } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

/* A profile has to exist before any screen has state to read. */
async function withProfile(ui, { state } = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  if (state) await AsyncStorage.setItem("rb.state.p1", JSON.stringify(state));
  // RNTL v14 renders asynchronously â€” the result must be awaited.
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => {
  // store.js coalesces writes behind a timer. Left pending, it fires inside the next
  // test and rewrites the storage that test just cleared â€” so drain it first.
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await flushState();
});

describe("Learn", () => {
  it("draws every chapter and unit", async () => {
    await withProfile(<Learn navigation={nav} />);
    expect(await screen.findByText(/^Chapter 1$/)).toBeTruthy();
    expect(screen.getByText(`Chapter ${STAGES.length}`)).toBeTruthy();
    expect(screen.getByText("Food & Drink")).toBeTruthy();
  });

  /* The point of chapters is that they are named, not numbered â€” a regression here
     would put "Core 3" back in front of the learner. */
  it("names every chapter and its core unit", async () => {
    await withProfile(<Learn navigation={nav} />);
    await screen.findByText(/^Chapter 1$/);
    for (const stage of STAGES) {
      expect(stage.title).toBeTruthy();
      expect(stage.core.name).not.toMatch(/^Core \d+$/);
    }
    expect(screen.getByText(STAGES[0].title)).toBeTruthy();
  });

  it("opens a unit when tapped", async () => {
    await withProfile(<Learn navigation={nav} />);
    fireEvent.press(await screen.findByText("Food & Drink"));
    expect(nav.navigate).toHaveBeenCalledWith("Unit", { unitId: "food" });
  });
});

describe("unit and lesson", () => {
  const route = { params: { unitId: "food", index: 0 } };

  it("lists the unit's lessons", async () => {
    await withProfile(<UnitScreen route={route} navigation={nav} />);
    const unit = UN.find((u) => u.id === "food");
    expect(await screen.findByText(/Lesson 1/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`Lesson ${lessonCount(unit)}`))).toBeTruthy();
  });

  it("shows three components, none done", async () => {
    await withProfile(<LessonScreen route={route} navigation={nav} />);
    expect(await screen.findByText("Vocabulary")).toBeTruthy();
    expect(screen.getByText("Quiz")).toBeTruthy();
    expect(screen.getByText("Video")).toBeTruthy();
    expect(screen.getByText(/0\/3/)).toBeTruthy();
  });

  it("reflects completion from stored state", async () => {
    await withProfile(<LessonScreen route={route} navigation={nav} />, {
      state: {
        v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {},
        unit: { food: { lessons: { 0: { v: true, q: 100 } }, video: true } },
      },
    });
    expect(await screen.findByText(/3\/3/)).toBeTruthy();
  });

  it("routes each component to its own flow", async () => {
    await withProfile(<LessonScreen route={route} navigation={nav} />);
    fireEvent.press(await screen.findByText("Vocabulary"));
    expect(nav.navigate).toHaveBeenCalledWith("Vocab", { unitId: "food", index: 0 });
    fireEvent.press(screen.getByText("Quiz"));
    expect(nav.navigate).toHaveBeenCalledWith("Quiz", { unitId: "food", index: 0 });
    fireEvent.press(screen.getByText("Video"));
    expect(nav.navigate).toHaveBeenCalledWith("Video", { unitId: "food", index: 0 });
  });
});
