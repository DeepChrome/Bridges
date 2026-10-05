/* The summary (2026-09-29): a lesson's words, sentences and rule as one list to
   study before the quiz, and the unit's before its test. A reference: it asks
   nothing, and opening it only marks its own optional step. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Summary from "../src/screens/Summary";
import {
  UN, L, lessonWords, lessonCount, components, lessonDone, nextComponent, hasGrammar, grammarKey,
  stepRoute, markComponent,
} from "../src/data";

const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

const unit = UN[0];

describe("the summary", () => {
  it("lists a lesson's words by kind, with sentences and the rule, and marks its step", async () => {
    const words = lessonWords(unit, 0).map((i) => L[i].b);
    await withProfile(<Summary route={{ params: { unitId: unit.id, index: 0 } }} />);
    expect(await screen.findByTestId("summary-count")).toBeTruthy();
    for (const w of words) expect(screen.getByTestId(`summary-${w}`)).toBeTruthy();
    expect(screen.getByTestId("summary-count").props.children).toBe(`${words.length} words`);
    if (unit.g) expect(screen.getByTestId("summary-grammar")).toBeTruthy();

    await flushState();
    const saved = await global.__db.saved("p1");
    expect(saved.unit[unit.id].lessons[0].s).toBe(true);
    // Opening it finishes nothing that is owed: the lesson is still undone.
    expect(lessonDone(saved, unit, 0)).toBe(false);
  });

  it("lists the whole unit when no lesson is named", async () => {
    const all = Array.from({ length: lessonCount(unit) }, (_, k) => lessonWords(unit, k)).flat();
    await withProfile(<Summary route={{ params: { unitId: unit.id } }} />);
    expect((await screen.findByTestId("summary-count")).props.children).toBe(`${all.length} words`);
  });

  it("is an optional step, before the video", () => {
    const ids = components(base, unit, 0).map((c) => c.id);
    expect(ids.indexOf("summary")).toBeGreaterThan(ids.indexOf("quiz"));
    if (unit.v) expect(ids[ids.length - 1]).toBe("video");
    expect(components(base, unit, 0).find((c) => c.id === "summary").optional).toBe(true);
  });
});

/* The owner, 2026-10-02: "the overall flow should be vocab, drill, quiz,
   summary, video". Continue walks that order, optional steps included, and
   does not point back at a step the learner chose to skip past. */
describe("a lesson's flow", () => {
  const graded = UN.find((u) => u.v && hasGrammar(u));
  const ids = (u) => components(base, u, 0).map((c) => c.id);

  it("runs words, grammar, quiz, summary, the video's words, video", () => {
    const order = ids(graded).filter((x) => x !== "listen");
    expect(order).toEqual(["vocab", "grammar", "quiz", "summary", "prep", "video"]);
  });

  /* The video's own words as cards, just before it (2026-10-05): optional,
     opened as a round of the video's list, ticked when played through, and
     leading on to the video. */
  it("the video's words are an optional round that leads to the video", () => {
    const prep = components(base, graded, 0).find((c) => c.id === "prep");
    expect(prep.optional).toBe(true);
    const [route, params] = stepRoute("prep", graded, 0);
    expect(route).toBe("ListCards");
    expect(params.round).toBe("list");
    expect(params.words).toEqual(expect.arrayContaining(Object.keys(graded.v.heard)));
    expect(params.next).toEqual(["Video", { unitId: graded.id, index: 0 }]);
    const done = markComponent(base, graded, 0, "prep");
    expect(components(done, graded, 0).find((c) => c.id === "prep").done).toBe(true);
    expect(lessonDone(done, graded, 0)).toBe(false);
  });

  it("Continue opens the grammar after the words, then the quiz", () => {
    const s = (l, drills = {}) => ({ ...base, drills,
      unit: { [graded.id]: { lessons: { 0: l } } } });
    const cs = (st) => components(st, graded, 0);
    expect(nextComponent(cs(s({ v: true }))).id).toBe("grammar");
    expect(nextComponent(cs(s({ v: true }, { [grammarKey(graded, 0)]: { best: 1 } }))).id)
      .toBe("quiz");
  });

  it("a step skipped past is not pointed at again", () => {
    const st = { ...base, unit: { [graded.id]: { lessons: { 0: { v: true, q: 100 } } } } };
    expect(nextComponent(components(st, graded, 0)).id).not.toBe("grammar");
  });

  it("a video watched in an earlier lesson does not skip a later lesson's steps", () => {
    const st = { ...base, unit: { [graded.id]: { video: true, lessons: {} } } };
    expect(nextComponent(components(st, graded, 1)).id).toBe("vocab");
  });
});
