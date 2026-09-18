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
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { light } from "../src/theme";
import { lessonCount, UN, STAGES } from "../src/data";

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
    expect(screen.getByTestId("merge-family").props.strokeDasharray).toBeTruthy();
    // family is left of time: the row keeps the curriculum's order.
    const left = screen.getByTestId("node-family").parent;
    const right = screen.getByTestId("node-time").parent;
    expect(flat(left.props.style).left).toBeLessThan(flat(right.props.style).left);
  });

  /* Eight quests in one row overlapped their names (the owner, 2026-09-08):
     they sit in ranks of three now, each disc a full disc's width from the next. */
  it("lays a chapter's side quests out in ranks of three, none overlapping", async () => {
    await withState({});
    const { questRanks } = require("../src/screens/Learn");
    // The rule, on a chapter wider than the drawing: eight quests read 3 · 3 · 2.
    const eight = STAGES.flatMap((s) => s.branches).slice(0, 8);
    expect(questRanks(eight).map((r) => r.length)).toEqual([3, 3, 2]);
    expect(questRanks(eight).flat()).toEqual(eight);
    // The drawing, on the widest chapter the curriculum has.
    const big = STAGES.reduce((a, s) => (s.branches.length > a.branches.length ? s : a));
    expect(big.branches.length).toBeGreaterThanOrEqual(3);
    const ranks = questRanks(big.branches);
    expect(ranks.every((r) => r.length <= 3)).toBe(true);
    expect(ranks.flat()).toEqual(big.branches);
    await screen.findByTestId(`node-${big.core.id}`);
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    ranks.forEach((rank, r) => {
      expect(screen.getByTestId(`rank-${big.core.id}-${r}`)).toBeTruthy();
      const lefts = rank.map((u) => flat(screen.getByTestId(`node-${u.id}`).parent.props.style).left);
      for (let k = 1; k < lefts.length; k++) expect(lefts[k] - lefts[k - 1]).toBeGreaterThanOrEqual(96);
      for (const u of rank) expect(screen.getByTestId(`lane-${u.id}`)).toBeTruthy();
    });
    // The road comes back from the last rank.
    for (const u of ranks[ranks.length - 1]) expect(screen.getByTestId(`merge-${u.id}`)).toBeTruthy();
  });

  it("opens the fork once two spine lessons are done, and Continue stays on the spine", async () => {
    await withState({ unit: { core1: { video: true, lessons: { 0: { v: true, q: 90 }, 1: { v: true, q: 85 } } } } });
    await screen.findByTestId("node-core1");
    expect(screen.getByTestId("fork-core1").props.accessibilityLabel).toBe("Side quests");
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId("lane-family").props.strokeDasharray).toBeUndefined();
    // The main road: the spine unit, not a side quest — and Continue opens the
    // next lesson's first undone step, not the unit's list of lessons.
    const cont = screen.getByText("Continue (Pronouns & Being)");
    fireEvent.press(cont);
    expect(nav.navigate).toHaveBeenCalledWith("Vocab", { unitId: "core1", index: 2 });
    // The lanes come back to the road after the quests, solid once open.
    expect(screen.getByTestId("merge-family").props.strokeDasharray).toBeUndefined();
  });
});

/* Where you are, on a screen whose whole meaning is in its discs (§20a: native
   has no visual suite, so a visual contract is asserted in the render tree).
   The owner's complaint was that every open disc looked the same — an empty
   white ring — so nothing said which one to press. */
describe("the disc you are on", () => {
  /* Any descendant View painted in this colour. The face is a child of the
     node, not a prop on it, so this walks rather than reading `props.style`. */
  const walk = (n, out = []) => {
    if (!n || typeof n !== "object") return out;
    out.push(n);
    for (const k of n.children || []) walk(k, out);
    return out;
  };
  const painted = (node, hex) =>
    walk(node).filter((n) => {
      const s = n.props && n.props.style;
      const flat = Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : s;
      return !!flat && typeof flat.backgroundColor === "string"
        && flat.backgroundColor.toUpperCase() === hex.toUpperCase();
    }).length;

  test("exactly one disc on the path is filled, and it is the one Continue opens", async () => {
    await withState({});
    const filled = UN.filter((u) => painted(screen.getByTestId(`node-${u.id}`), light.brand) > 0);
    expect(filled.map((u) => u.id)).toEqual(["core1"]);
    expect(screen.getByText(/^Start \(Pronouns & Being\)$/)).toBeTruthy();
  });

  test("a locked unit is not filled", async () => {
    await withState({});
    expect(painted(screen.getByTestId("node-core4"), light.brand)).toBe(0);
  });

  test("and the fill moves on with the learner", async () => {
    /* Chapter 1's spine finished: Continue has moved to chapter 2, so the fill
       must have moved with it rather than staying where it started. */
    const lessons = {};
    for (let i = 0; i < lessonCount(STAGES[0].core); i++) lessons[i] = { v: true, q: 100, tries: 1 };
    await withState({ unit: { core1: { best: 100, done: true, video: true, lessons } } });
    expect(painted(screen.getByTestId("node-core1"), light.brand)).toBe(0);
    expect(painted(screen.getByTestId("node-core2"), light.brand)).toBeGreaterThan(0);
  });
});
