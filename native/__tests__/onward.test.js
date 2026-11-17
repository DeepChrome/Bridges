/* Where a finished lesson step goes (data.js onwardFrom; the owner,
 * 2026-11-17: "if someone is continuing in a track, it should flow properly
 * into the next track component or next track. Sometimes after I complete a
 * lesson, it dumps me off somewhere unexpected"). One rule for the
 * vocabulary step, the quiz, the case lesson and the summary: the rest of
 * this lesson, then the next lesson, then the next thing on the path.
 *
 * Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { VocabFlow } from "../src/flows/Lesson";
import { Q } from "../src/questions";
import { STAGES, UN, components, markComponent, onwardFrom, nextRoute, nextStep, lessonCount } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn(), addListener: () => () => {} };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {} };

/* Every required step of a lesson done, and its optional ones too — each by
   the mechanism that records it (data.js components). */
const finish = (st, u, k, all) => components(st, u, k)
  .filter((c) => all || !c.optional)
  .reduce((acc, c) => {
    const key = c.id === "listen" ? `scene:${u.id}:${k}` : c.id === "case" ? `case:${c.caseId}`
      : c.id === "vquiz" ? `vquiz:${u.v.id}` : null;
    if (key) return { ...acc, drills: { ...acc.drills, [key]: { best: 100 } } };
    return markComponent(acc, u, k, c.id, 100);
  }, st);

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("where a step leads", () => {
  const unit = STAGES[0].core;

  it("the vocabulary step leads to the quiz, and the quiz to the rest of the lesson", () => {
    let st = { ...base };
    expect(onwardFrom(st, unit, 0, "vocab")).toEqual(["Quiz", { unitId: unit.id, index: 0 }]);
    st = markComponent(st, unit, 0, "vocab");
    st = markComponent(st, unit, 0, "quiz", 100);
    // What follows the quiz is the lesson's own next step, whatever it is.
    const after = components(st, unit, 0).find((c) => !c.done && c.id !== "vocab" && c.id !== "quiz");
    expect(onwardFrom(st, unit, 0, "quiz")[0]).toBe(after ? { summary: "Summary", listen: "Scenes", video: "VideoSummary", vquiz: "VideoQuiz", case: "CaseRun" }[after.id] : "Vocab");
  });

  it("the end of a lesson leads to the next lesson of the unit", () => {
    let st = { ...base };
    st = finish(st, unit, 0, true);
    expect(onwardFrom(st, unit, 0, "quiz")).toEqual(["Vocab", { unitId: unit.id, index: 1 }]);
    expect(onwardFrom(st, unit, 0, "summary", ["video", "vwords"])).toEqual(["Vocab", { unitId: unit.id, index: 1 }]);
  });

  it("the end of a unit leads on along the path, never to a Back", () => {
    let st = { ...base };
    const last = lessonCount(unit) - 1;
    for (let k = 0; k <= last; k++) st = finish(st, unit, k, true);
    st = { ...st, watched: { ...(unit.v ? { [unit.v.id]: 1 } : {}) } };
    if (unit.v) st = markComponent(st, unit, last, "video");
    const onward = onwardFrom(st, unit, last, "quiz");
    expect(onward).toEqual(nextRoute(st));
    expect(onward).not.toBeNull();
    // Somewhere else: the next lesson on the path, not this unit's.
    const n = nextStep(st);
    expect(n.unit.id === unit.id && n.index === last).toBe(false);
  });

  it("is null only at the end of the course", () => {
    let st = { ...base, dev: true };
    for (const u of UN) for (let k = 0; k < lessonCount(u); k++) st = finish(st, u, k, true);
    for (const u of UN) if (u.v) { st = markComponent(st, u, lessonCount(u) - 1, "video"); st.watched[u.v.id] = 1; }
    expect(nextRoute(st)).toBeNull();
    const u = UN[UN.length - 1];
    expect(onwardFrom(st, u, lessonCount(u) - 1, "quiz")).toBeNull();
  });
});

describe("the vocabulary step's end", () => {
  const unit = UN.find((u) => u.id === "food");

  it("offers Continue into the quiz rather than Back alone", async () => {
    // One card and nothing else, so the walk is one press long.
    const spy = jest.spyOn(Q, "vocabSteps").mockReturnValue([{ t: "list", words: unit.w.slice(0, 1) }]);
    try {
      await AsyncStorage.setItem("rb.accounts", JSON.stringify({
        list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
      await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, dev: true }));
      await render(<SessionProvider><VocabFlow route={{ params: { unitId: unit.id, index: 1 } }} navigation={nav} /></SessionProvider>);
      await screen.findByTestId("vocab-list");
      await act(async () => { fireEvent.press(screen.getByText("Start learning")); });
      expect(await screen.findByText("Vocabulary done")).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByTestId("done-continue")); });
      expect(nav.replace).toHaveBeenCalledWith("Quiz", { unitId: unit.id, index: 1 });
      expect(nav.goBack).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
