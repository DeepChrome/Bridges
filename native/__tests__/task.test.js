/* The chapter-end task (ROADMAP P10.5).
 *
 * The two things worth holding here are both refusals. It must not be scored —
 * a percentage would turn the app's only open-ended exercise back into the quiz
 * it exists to be an alternative to — and it must still open and still show the
 * goal when there is nothing to mark it with, rather than being an empty screen
 * that does not say why.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { ChapterTask } from "../src/screens/Task";
import Learn from "../src/screens/Learn";
import { STAGES, lessonCount } from "../src/data";
import { TASKS, taskFor } from "@core/tasks";

jest.mock("../src/lib/feedback", () => ({
  __esModule: true,
  config: jest.fn(() => ({ url: "https://example.invalid/v1/task", token: "t" })),
  markTask: jest.fn(),
}));
const api = require("../src/lib/feedback");

const nav = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
const route = { params: { chapter: 1 } };
const task = taskFor(1);

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

/* A profile with chapter 1's spine finished, so the path offers its task. */
function withSpineDone() {
  const u = STAGES[0].core;
  const lessons = {};
  for (let k = 0; k < lessonCount(u); k++) lessons[k] = { v: true, q: 100, tries: 1 };
  return { ...base, unit: { [u.id]: { best: 100, done: true, lessons, video: true } } };
}

async function withProfile(node, st = base) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(st));
  return await render(<SessionProvider>{node}</SessionProvider>);
}

const marked = (met) => ({
  ok: true,
  points: task.must.map((m, i) => ({ must: m, met: met[i], note: met[i] ? "" : "Not said." })),
  done: met.every(Boolean),
  grammar: [],
  praise: "Clear and short.",
});

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api.config.mockReturnValue({ url: "https://example.invalid/v1/task", token: "t" });
});
afterEach(async () => { await flushState(); });

describe("the chapter task", () => {
  it("shows the goal and everything the answer has to get across", async () => {
    await withProfile(<ChapterTask route={route} navigation={nav} />);
    await screen.findByTestId("task-goal");
    expect(screen.getByText(task.title)).toBeTruthy();
    expect(screen.getByText(task.goal)).toBeTruthy();
    task.must.forEach((m) => expect(screen.getByText(`· ${m}`)).toBeTruthy());
  });

  it("marks each requirement and never puts a score on it", async () => {
    api.markTask.mockResolvedValue(marked(task.must.map(() => true)));
    await withProfile(<ChapterTask route={route} navigation={nav} />);
    await act(async () => { fireEvent.changeText(screen.getByTestId("task-input"), "Это я."); });
    await waitFor(() => expect(screen.getByTestId("task-input").props.value).toBe("Это я."));
    await act(async () => { fireEvent.press(screen.getByTestId("task-send")); });
    await waitFor(() => expect(screen.getByText("Task done")).toBeTruthy());
    // No percentage anywhere on the screen.
    expect(screen.queryByText(/%/)).toBeNull();
    task.must.forEach((m) => expect(screen.getByText(m)).toBeTruthy());
  });

  it("records the chapter as done only when every requirement was met", async () => {
    api.markTask.mockResolvedValue(marked(task.must.map((_, i) => i === 0)));
    await withProfile(<ChapterTask route={route} navigation={nav} />);
    await act(async () => { fireEvent.changeText(screen.getByTestId("task-input"), "Это я."); });
    await waitFor(() => expect(screen.getByTestId("task-input").props.value).toBe("Это я."));
    await act(async () => { fireEvent.press(screen.getByTestId("task-send")); });
    await waitFor(() => expect(screen.getByText("Not there yet")).toBeTruthy());
    await flushState();
    const st = JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
    expect((st.tasks || {})["1"]).toBeUndefined();
  });

  it("still opens, and says why, when the build cannot mark anything", async () => {
    api.config.mockReturnValue(null);
    await withProfile(<ChapterTask route={route} navigation={nav} />);
    await screen.findByTestId("task-goal");
    expect(screen.getByTestId("task-unmarked")).toBeTruthy();
    expect(screen.getByText(task.goal)).toBeTruthy();
  });

  it("says so plainly when the marker cannot be reached, and keeps the answer", async () => {
    api.markTask.mockResolvedValue({ ok: false, reason: "network" });
    await withProfile(<ChapterTask route={route} navigation={nav} />);
    await act(async () => { fireEvent.changeText(screen.getByTestId("task-input"), "Это я."); });
    await waitFor(() => expect(screen.getByTestId("task-input").props.value).toBe("Это я."));
    await act(async () => { fireEvent.press(screen.getByTestId("task-send")); });
    await waitFor(() => expect(screen.getByTestId("task-failed")).toBeTruthy());
    expect(screen.getByTestId("task-input").props.value).toBe("Это я.");
  });
});

describe("where the task is offered", () => {
  it("is not on the path until the chapter's spine is finished", async () => {
    await withProfile(<Learn navigation={nav} />);
    expect(screen.queryByTestId("chapter-task-1")).toBeNull();
  });

  it("appears once it is, and side quests do not hold it back", async () => {
    await withProfile(<Learn navigation={nav} />, withSpineDone());
    expect(await screen.findByTestId("chapter-task-1")).toBeTruthy();
    expect(screen.queryByTestId("chapter-task-2")).toBeNull();
  });

  it("has one for every chapter", () => {
    expect(TASKS).toHaveLength(STAGES.length);
    STAGES.forEach((s, i) => expect(taskFor(i + 1)).toBeTruthy());
  });
});
