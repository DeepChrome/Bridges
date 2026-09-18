/* The lesson's listening step (§30af).
 *
 * The owner asked for the conversation to be *listed with the lesson content*
 * rather than spliced into the quiz. Two things about that are easy to get
 * wrong and invisible when they are:
 *
 *   - it must appear only on the 32 lessons that actually have a conversation;
 *   - it must **not** un-finish a lesson somebody has already completed, which
 *     would shrink `lessonsDone` and move where the path thinks they are.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { LessonScreen } from "../src/screens/Unit";
import { components, lessonDone, featuresListening, SCRIPTS, UN, STAGES } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn() };
const base = { v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, dev: true };

/* A lesson that features a conversation, and one that does not — found from the
   shipped payload rather than named, so a re-cut cannot leave this test
   asserting against a lesson that changed. */
const featured = (() => {
  for (const u of UN) for (let i = 0; i < 6; i++) if (featuresListening(u, i)) return { u, i };
  return null;
})();
const scriptedUnit = featured.u.id, scriptedIdx = featured.i;
const scriptedKey = `${scriptedUnit}:${scriptedIdx}`;
const plain = (() => {
  for (const u of UN) {
    for (let i = 0; i < 5; i++) if (!featuresListening(u, i)) return { id: u.id, i };
  }
  return null;
})();

/* Every required step finished, the conversation not. */
const finished = {
  unit: { [scriptedUnit]: { best: 100, done: true, video: true,
                            lessons: { [scriptedIdx]: { v: true, q: 100, tries: 1 } } } },
};

async function withProfile(ui, state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

test("a lesson with a conversation lists it as a step", async () => {
  await withProfile(
    <LessonScreen navigation={nav} route={{ params: { unitId: scriptedUnit, index: scriptedIdx } }} />, {});
  expect(screen.getByTestId("step-listen")).toBeTruthy();
});

test("a lesson without one does not", async () => {
  expect(plain).toBeTruthy();
  await withProfile(
    <LessonScreen navigation={nav} route={{ params: { unitId: plain.id, index: plain.i } }} />, {});
  expect(screen.queryByTestId("step-listen")).toBeNull();
});

test("opening it plays that lesson's own conversation", async () => {
  await withProfile(
    <LessonScreen navigation={nav} route={{ params: { unitId: scriptedUnit, index: scriptedIdx } }} />, {});
  fireEvent.press(screen.getByTestId("step-listen"));
  expect(nav.navigate).toHaveBeenCalledWith("Scenes", { key: scriptedKey });
});

/* The one that protects existing progress. */
test("the lesson is still finished with the conversation undone", () => {
  const st = { ...base, ...finished };
  const u = UN.find((x) => x.id === scriptedUnit);
  const cs = components(st, u, scriptedIdx);
  expect(cs.some((c) => c.id === "listen" && !c.done)).toBe(true);
  expect(lessonDone(st, u, scriptedIdx)).toBe(true);
});

/* The owner's rule: one or two per chapter, not one per lesson. Chapter 1 had
   all fourteen of its lessons carrying one, because "has a script" was being
   read as "features it". */
test("one or two lessons a chapter feature it, never every lesson", () => {
  const perChapter = new Map();
  for (const s of STAGES) {
    let n = 0;
    for (const u of [s.core, ...(s.branches || [])]) {
      for (let i = 0; i < 6; i++) if (featuresListening(u, i)) n++;
    }
    perChapter.set(s.n ?? s.core.id, n);
  }
  for (const [chapter, n] of perChapter) {
    expect({ chapter, n }).toEqual({ chapter, n: expect.any(Number) });
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(2);
  }
});

test("and is marked done once that conversation has been listened to", () => {
  const st = { ...base, ...finished, drills: { [`scene:${scriptedKey}`]: { best: 80 } } };
  const u = UN.find((x) => x.id === scriptedUnit);
  expect(components(st, u, scriptedIdx).find((c) => c.id === "listen").done).toBe(true);
});
