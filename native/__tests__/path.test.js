/* The path's four node states.
 *
 * The disc is the whole interface here: there is no text saying "underway" or
 * "finished", so if the ring is wrong the screen lies silently. Both bugs these
 * tests pin were found by rendering the states with progress seeded — every other
 * suite runs a fresh account, where three of the four states never appear.
 *
 * Kept in its own file: screens.test.js documents that matchers start timing out
 * cumulatively past roughly the sixth test in a file under this React 19 / RNTL 14
 * combination, so adding these there would have made an unrelated suite flaky.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { light } from "../src/theme";
import { lessonCount, UN } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

const base = {
  v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: false, xp: 0, streak: 0,
};

async function withState(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Learn navigation={nav} /></SessionProvider>);
}

/* react-native-svg normalises a colour prop into {type, payload}, where payload is
   the ARGB integer — 4280448845 is 0xFF22774D. Compare hex to hex rather than
   asserting on that representation, which is an implementation detail of the library
   and would fail on an upgrade that changed nothing visible. */
const strokeHex = (node) => {
  const s = node.props.stroke;
  if (typeof s === "string") return s.toUpperCase();
  const n = s && typeof s.payload === "number" ? s.payload : null;
  return n === null ? String(s)
    : "#" + (n & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
};

/* Every lesson of a unit finished, video included. */
const finished = (id) => {
  const unit = UN.find((u) => u.id === id);
  const lessons = {};
  for (let i = 0; i < lessonCount(unit); i++) lessons[i] = { v: true, q: 100 };
  return { lessons, video: true };
};

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await flushState();
});

describe("path node states", () => {
  /* The bug this pins: an available-but-untouched unit used to draw a full brand
     ring, so with developer mode unlocking everything a fresh unit and a finished
     one were indistinguishable. A ring must mean progress. */
  it("draws no ring on a unit that has not been started", async () => {
    await withState({});
    await screen.findByTestId("node-core1");
    expect(screen.queryByTestId("arc-core1")).toBeNull();
  });

  it("draws a full ring in the finished colour on a completed unit", async () => {
    await withState({ unit: { core1: finished("core1") } });
    const arc = await screen.findByTestId("arc-core1");
    expect(strokeHex(arc)).toBe(light.good.toUpperCase());
    // A finished unit's ring is closed: no dash offset left to draw.
    expect(Number(arc.props.strokeDashoffset)).toBeCloseTo(0, 5);
  });

  /* The second bug: "underway" keyed on completed lessons, so progress inside a
     lesson showed nothing. A unit carrying a video is the sharp case — the video
     must be watched before any of its lessons counts as done — but the invariant is
     the same for a half-finished lesson anywhere, which is what this uses, so the
     test does not depend on which units happen to have an episode. */
  it("counts a unit as underway on progress inside a lesson", async () => {
    await withState({ unit: { core1: { lessons: { 0: { v: true } } } } });
    const arc = await screen.findByTestId("arc-core1");
    expect(strokeHex(arc)).toBe(light.brand.toUpperCase());
    // Underway, not finished: part of the ring is still undrawn.
    expect(Number(arc.props.strokeDashoffset)).toBeGreaterThan(0);
  });

  it("locks a later chapter and offers it no ring", async () => {
    await withState({});
    const later = await screen.findByTestId("node-core4");
    expect(later.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId("arc-core4")).toBeNull();
  });

  /* The fork: side quests sit in a row under their chapter's spine unit, locked
     with dashed lanes until FORK_AT spine lessons are done, then open — and the
     next chapter never depends on them. */
  it("keeps side quests locked behind the fork, then opens them after two spine lessons", async () => {
    await withState({});
    const spine = await screen.findByTestId("node-core1");
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    expect(flat(spine.props.style).transform[0].translateX).toBe(0);
    expect(screen.getByTestId("fork-core1").props.accessibilityLabel).toMatch(/after lesson 2/);
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("lane-family").props.strokeDasharray).toBeTruthy();
    // family is left of time: the row keeps the curriculum's order.
    const left = screen.getByTestId("node-family").parent;
    const right = screen.getByTestId("node-time").parent;
    expect(flat(left.props.style).left).toBeLessThan(flat(right.props.style).left);
  });

  it("opens the fork once two spine lessons are done, and Continue stays on the spine", async () => {
    await withState({ unit: { core1: { video: true, lessons: { 0: { v: true, q: 90 }, 1: { v: true, q: 85 } } } } });
    await screen.findByTestId("node-core1");
    expect(screen.getByTestId("fork-core1").props.accessibilityLabel).toBe("Side quests");
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId("lane-family").props.strokeDasharray).toBeUndefined();
    // The main road: lesson 3 of the spine, not a side quest.
    expect(screen.getByText(/Continue · Pronouns & Being · Lesson 3/)).toBeTruthy();
  });
});
