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
  v: 8, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: false, xp: 0, streak: 0,
};

/* A unit finished, as the state records it: every lesson's vocabulary read and
   its quiz passed, and the unit's video watched where it has one. `part` is the
   same thing stopped after n lessons. */
const part = (u, n) => {
  const lessons = {};
  for (let i = 0; i < Math.min(n, lessonCount(u)); i++) lessons[i] = { v: true, q: 100, tries: 1 };
  return { unit: { [u.id]: { video: true, lessons } } };
};
const done = (u) => part(u, lessonCount(u));

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

  /* Finished, the path encircles the disc (the owner, 2026-09-23): a full ring
     in the brand colour — the colour the lit track arrives in — not a
     separate green mark. */
  it("draws a full ring in the track's colour on a completed unit", async () => {
    await withState({ unit: { core1: finished("core1") } });
    const arc = await screen.findByTestId("arc-core1");
    expect(strokeHex(arc)).toBe(light.brand.toUpperCase());
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

  it("locks a later chapter, greys it, and offers it no ring", async () => {
    await withState({});
    const later = await screen.findByTestId("node-core4");
    expect(later.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId("arc-core4")).toBeNull();
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    expect(flat(later.props.style).opacity).toBeLessThan(1);
    expect(flat(screen.getByTestId("node-core1").props.style).opacity).toBe(1);
  });

  /* Developer mode is off unless switched on (2026-09-23): a fresh profile
     walks from the top, and a profile from before is brought to the same
     place by the v8 migration. On, it still opens everything (rule 20.9). */
  it("ships with developer mode off, and the switch still opens the course", async () => {
    const { DEFAULTS } = require("../src/store");
    expect(DEFAULTS.dev).toBe(false);
    await withState({ v: 7, dev: true });
    expect((await screen.findByTestId("node-core4")).props.accessibilityState.disabled).toBe(true);
  });

  it("…and on, every disc opens", async () => {
    await withState({ dev: true });
    expect((await screen.findByTestId("node-core4")).props.accessibilityState.disabled).toBe(false);
  });

  /* **Every track is drawn, and every track is empty until the node above it
     is done** (the owner, 2026-09-23: "empty lines, almost like a negative
     track… once a lesson is complete, it unlocks the next node by connecting
     it with a line"). A fresh learner sees the whole map: the quests
     padlocked at the end of pale tracks, nothing lit. The first cut hid the
     quests and lanes altogether until the spine was done, which left nothing
     to connect. */
  it("draws every quest and every track empty until the chapter's spine is finished", async () => {
    await withState({});
    const spine = await screen.findByTestId("node-core1");
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    expect(flat(spine.props.style).transform[0].translateX).toBe(0);
    // The quest is on the map, locked, at the end of a track that is not lit.
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("rank-core1-0")).toBeTruthy();
    expect(strokeHex(screen.getByTestId("track-lane-family"))).toBe(light.lineSoft.toUpperCase());
    expect(screen.queryByTestId("lane-family")).toBeNull();
    expect(screen.getByTestId("track-merge-family")).toBeTruthy();
    expect(screen.queryByTestId("merge-family")).toBeNull();
    // Nor the road on to chapter 2 — and there is no road drawn through the
    // middle of the fork at all (the owner, 2026-09-24): the lanes are the road.
    expect(screen.queryByTestId("track-road-family")).toBeNull();
    expect(screen.queryByTestId("track-road-out-core1")).toBeNull();
    expect(screen.queryByTestId("road-on-core1-lit")).toBeNull();
    expect(screen.getByTestId("node-core2").props.accessibilityState.disabled).toBe(true);
  });

  it("two lessons in is not enough: the whole spine is", async () => {
    await withState(part(STAGES[0].core, 2));
    await screen.findByTestId("node-core1");
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId("lane-family")).toBeNull();
  });

  /* A finished quest connects itself back to the road; the road runs on only
     once the chapter's required quests are all done. Optional quests are on
     the map like any other and light their own lane when finished. */
  it("lights a quest's lane back when it is finished, and the road on when the chapter is", async () => {
    const { required } = require("../src/data");
    const first = required(STAGES[0])[0];
    await withState({ unit: { ...done(STAGES[0].core).unit, ...done(first).unit } });
    await screen.findByTestId("node-core1");
    // The lane out is lit for every quest; the lane back only for the one done.
    for (const u of STAGES[0].branches) expect(strokeHex(screen.getByTestId(`lane-${u.id}`))).toBe(light.brand.toUpperCase());
    for (const u of required(STAGES[0])) {
      if (u.id === first.id) expect(screen.getByTestId(`merge-${u.id}`)).toBeTruthy();
      else expect(screen.queryByTestId(`merge-${u.id}`)).toBeNull();
    }
    expect(screen.queryByTestId("road-on-core1-lit")).toBeNull();
    expect(screen.getByTestId("node-core2").props.accessibilityState.disabled).toBe(true);
  });

  /* An optional quest takes a lane in and none out — it unlocks nothing, so a
     line leaving it would lead nowhere (the owner, 2026-09-24). Required
     quests come first in the ranks so the chain has something to continue
     from. */
  it("draws no lane out of an optional quest, and puts the required ones first", async () => {
    const { questOrder } = require("../src/screens/Learn");
    const withOpt = STAGES.find((s) => s.branches.some((u) => u.opt) && s.branches.some((u) => !u.opt));
    const order = questOrder(withOpt.branches);
    const firstOpt = order.findIndex((u) => u.opt);
    expect(order.slice(0, firstOpt).every((u) => !u.opt)).toBe(true);
    expect(order.slice(firstOpt).every((u) => u.opt)).toBe(true);
    await withState({ dev: true });
    await screen.findByTestId(`node-${withOpt.core.id}`);
    for (const u of withOpt.branches) {
      expect(screen.getByTestId(`track-lane-${u.id}`)).toBeTruthy();
      if (u.opt) expect(screen.queryByTestId(`track-merge-${u.id}`)).toBeNull();
    }
    expect(withOpt.branches.filter((u) => !u.opt).some((u) => screen.queryByTestId(`track-merge-${u.id}`))).toBe(true);
  });

  it("…and the road on to the next chapter once the required quests are done", async () => {
    const { required } = require("../src/data");
    const all = Object.assign({}, done(STAGES[0].core).unit,
      ...required(STAGES[0]).map((u) => done(u).unit));
    await withState({ unit: all });
    await screen.findByTestId("node-core1");
    expect(screen.getByTestId("road-on-core1-lit")).toBeTruthy();
    expect(screen.getByTestId("node-core2").props.accessibilityState.disabled).toBe(false);
    // Chapter 2's own tracks are still empty: its spine is not done.
    expect(screen.queryByTestId(`lane-${STAGES[1].branches[0].id}`)).toBeNull();
  });

  /* Eight quests in one row overlapped their names (the owner, 2026-09-08):
     they sit in ranks of three now, each disc a full disc's width from the next. */
  it("lays a chapter's side quests out in ranks of three, none overlapping", async () => {
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
    // Developer mode, so every lane is lit as well as drawn (rule 20.9).
    await withState({ dev: true });
    await screen.findByTestId(`node-${big.core.id}`);
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    ranks.forEach((rank, r) => {
      expect(screen.getByTestId(`rank-${big.core.id}-${r}`)).toBeTruthy();
      const lefts = rank.map((u) => flat(screen.getByTestId(`node-${u.id}`).parent.props.style).left);
      for (let k = 1; k < lefts.length; k++) expect(lefts[k] - lefts[k - 1]).toBeGreaterThanOrEqual(96);
      for (const u of rank) expect(screen.getByTestId(`lane-${u.id}`)).toBeTruthy();
    });
    // A required quest has a lane back — the track is there for each; lit only
    // for a finished quest, which developer mode does not fake.
    for (const u of big.branches.filter((u) => !u.opt)) expect(screen.getByTestId(`track-merge-${u.id}`)).toBeTruthy();
  });

  it("connects the quests once the spine is finished, and Continue leads into them", async () => {
    await withState(done(STAGES[0].core));
    await screen.findByTestId("node-core1");
    expect(screen.getByTestId("node-family").props.accessibilityState.disabled).toBe(false);
    // The lane is lit, in the brand colour, over its track; the road through
    // the fork with it. The way back is not: nothing has been finished there.
    expect(strokeHex(screen.getByTestId("lane-family"))).toBe(light.brand.toUpperCase());
    expect(screen.getByTestId("stem-core1-lit")).toBeTruthy();
    expect(screen.queryByTestId("merge-family")).toBeNull();
    // family is left of time: the row keeps the curriculum's order.
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);
    expect(flat(screen.getByTestId("node-family").parent.props.style).left)
      .toBeLessThan(flat(screen.getByTestId("node-time").parent.props.style).left);

    /* **Continue goes into the fork**, because the chapter now requires these.
       It used to follow the spine alone, which was right while every quest was
       optional — and would have left this learner with no Continue at all. */
    const first = require("../src/data").required(STAGES[0])[0];
    fireEvent.press(screen.getByText(`Start (${first.name})`));
    expect(nav.navigate).toHaveBeenCalledWith("Vocab", { unitId: first.id, index: 0 });
  });

  /* Which quests the chapter requires and which it merely offers — decided in
     the pipeline (`OPTIONAL` in build_topics.py) and said on the disc, because
     otherwise a learner clearing a chapter cannot tell what is left. */
  it("marks the optional quests, and gates the next chapter on the rest", async () => {
    const withOpt = STAGES.find((s) => s.branches.some((u) => u.opt)
                                    && s.branches.some((u) => !u.opt));
    expect(withOpt).toBeTruthy();
    await withState({ dev: true });
    await screen.findByTestId(`node-${withOpt.core.id}`);
    for (const u of withOpt.branches) {
      if (u.opt) expect(screen.getByTestId(`optional-${u.id}`)).toBeTruthy();
      else expect(screen.queryByTestId(`optional-${u.id}`)).toBeNull();
    }

    // A finished spine alone no longer opens the next chapter.
    const { stageDone, required } = require("../src/data");
    const spineOnly = { ...base, ...done(STAGES[0].core) };
    expect(required(STAGES[0]).length).toBeGreaterThan(0);
    expect(stageDone(spineOnly, STAGES[0])).toBe(false);
    const all = { ...base, unit: { ...spineOnly.unit,
      ...Object.assign({}, ...required(STAGES[0]).map((u) => done(u).unit)) } };
    expect(stageDone(all, STAGES[0])).toBe(true);
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
    // The whole map is on the screen from the first day (2026-09-23).
    const shown = UN.filter((u) => screen.queryByTestId(`node-${u.id}`));
    expect(shown.map((u) => u.id)).toEqual(UN.map((u) => u.id));
    const filled = shown.filter((u) => painted(screen.getByTestId(`node-${u.id}`), light.brand) > 0);
    expect(filled.map((u) => u.id)).toEqual(["core1"]);
    expect(screen.getByText(`Start (${STAGES[0].core.name})`)).toBeTruthy();
  });

  test("a locked unit is not filled", async () => {
    await withState({});
    expect(painted(screen.getByTestId("node-core4"), light.brand)).toBe(0);
  });

  test("and the fill moves on with the learner", async () => {
    /* Chapter 1's spine finished: Continue has moved into the fork, to the
       first quest the chapter requires, so the fill moves there rather than
       staying on the spine or jumping to a chapter that is not open yet. */
    const { required } = require("../src/data");
    const first = required(STAGES[0])[0];
    await withState(done(STAGES[0].core));
    expect(painted(screen.getByTestId("node-core1"), light.brand)).toBe(0);
    expect(painted(screen.getByTestId(`node-${first.id}`), light.brand)).toBeGreaterThan(0);
    expect(painted(screen.getByTestId("node-core2"), light.brand)).toBe(0);
  });

  /* Its own test rather than a second half of the one above: two `render`s in
     one test leave two trees mounted and `screen` reads the wrong one — the
     assertion then fails on code that is correct, which is §23's null-render
     trap wearing a different hat. */
  test("…and on to the next chapter once the whole of this one is behind them", async () => {
    const { required } = require("../src/data");
    const all = Object.assign({}, done(STAGES[0].core).unit,
      ...required(STAGES[0]).map((u) => done(u).unit));
    await withState({ unit: all });
    expect(painted(screen.getByTestId("node-core2"), light.brand)).toBeGreaterThan(0);
    expect(painted(screen.getByTestId("node-core1"), light.brand)).toBe(0);
  });
});
