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
    const last = lessonCount(unit) - 1;
    const ids = components(base, unit, last).map((c) => c.id);
    expect(ids.indexOf("summary")).toBeGreaterThan(ids.indexOf("quiz"));
    // The video, then its questions where it has them (2026-10-05).
    if (unit.v) expect(ids.filter((x) => x !== "vquiz").pop()).toBe("video");
    expect(components(base, unit, 0).find((c) => c.id === "summary").optional).toBe(true);
  });
});

/* One way on (the owner, 2026-10-09: "force it to go to flashcards after the
   summary and then after flashcards they can do the video… Include sentences
   for the upcoming exercise"). The grammar episode's button is gone. */
describe("the summary's Continue", () => {
  const nav = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  it("deals the words with sentences as cards, then the video, on the last lesson", async () => {
    const u = UN.find((x) => x.v && lessonCount(x) > 1);
    const k = lessonCount(u) - 1;
    await withProfile(<Summary route={{ params: { unitId: u.id, index: k } }} navigation={nav} />);
    expect(screen.queryByTestId("summary-episode")).toBeNull();
    expect(screen.queryByTestId("summary-cards")).toBeNull();
    const { fireEvent, act } = require("@testing-library/react-native");
    await act(async () => { fireEvent.press(await screen.findByTestId("summary-continue")); });
    const [route, params] = nav.replace.mock.calls[0];
    expect(route).toBe("ListCards");
    expect(params.next).toEqual(["Video", { videoId: u.v.id, unitId: u.id, index: k }]);
    const words = lessonWords(u, k).map((i) => L[i].b);
    for (const w of words) expect(params.words).toContain(w);
    // Sentences ride with the words (a card key with a space is a sentence).
    expect(params.words.some((w) => / /.test(w))).toBe(true);
  });

  it("goes on to the next lesson from an earlier one", async () => {
    const u = UN.find((x) => lessonCount(x) > 2);
    await withProfile(<Summary route={{ params: { unitId: u.id, index: 0 } }} navigation={nav} />);
    const { fireEvent, act } = require("@testing-library/react-native");
    await act(async () => { fireEvent.press(await screen.findByTestId("summary-continue")); });
    const next = nav.replace.mock.calls[0][1].next;
    expect(next[0]).not.toBe("Summary");
    expect(next).toBeTruthy();
  });
});

/* The video closes the unit (the owner, 2026-10-05: "words for the video
   should be taught prior to the video"): only the last lesson lists it, its
   words and its questions, so it never comes before the words it says. */
describe("the unit's video", () => {
  it("is a step of the unit's last lesson only", () => {
    for (const u of UN.filter((x) => x.v && lessonCount(x) > 1)) {
      const last = lessonCount(u) - 1;
      for (let k = 0; k < last; k++) {
        const ids = components(base, u, k).map((c) => c.id);
        expect({ unit: u.id, lesson: k, video: ids.includes("video") || ids.includes("prep") || ids.includes("vquiz") })
          .toEqual({ unit: u.id, lesson: k, video: false });
      }
      expect(components(base, u, last).map((c) => c.id)).toContain("video");
    }
  });

  it("an earlier lesson is finished without the video", () => {
    const u = UN.find((x) => x.v && lessonCount(x) > 1);
    let st = base;
    for (const c of components(base, u, 0).filter((c) => !c.optional)) st = markComponent(st, u, 0, c.id, 100);
    expect(lessonDone(st, u, 0)).toBe(true);
    expect(lessonDone(st, u, lessonCount(u) - 1)).toBe(false);
  });
});

/* The owner, 2026-10-02: "the overall flow should be vocab, drill, quiz,
   summary, video". Continue walks that order, optional steps included, and
   does not point back at a step the learner chose to skip past. */
describe("a lesson's flow", () => {
  const graded = UN.find((u) => u.v && hasGrammar(u));
  const lastOf = (u) => lessonCount(u) - 1;
  const ids = (u) => components(base, u, lastOf(u)).map((c) => c.id);

  /* The grammar is inside the words' walk now, not a step of its own (the
     learner agents, 2026-10-08: it duplicated the walk on every lesson). */
  it("runs words, quiz, summary, video, its questions", () => {
    const order = ids(graded).filter((x) => x !== "listen" && x !== "case");
    expect(order).toEqual(["vocab", "quiz", "summary", "video"]
      .concat(graded.v.quiz ? ["vquiz"] : []));
  });

  /* The video's questions are an optional step after the video, opened on
     their own (depth 1: back to the lesson), and done once a run is kept. */
  it("lists the video's questions after the video, done once answered", () => {
    const u = UN.find((x) => x.v && x.v.quiz);
    const k = lastOf(u);
    const step = components(base, u, k).find((c) => c.id === "vquiz");
    expect(step.optional).toBe(true);
    expect(stepRoute("vquiz", u, k)).toEqual(["VideoQuiz", { unitId: u.id, index: k, videoId: u.v.id }]);
    const done = { ...base, drills: { [`vquiz:${u.v.id}`]: { best: 80 } } };
    expect(components(done, u, k).find((c) => c.id === "vquiz").done).toBe(true);
  });

  /* The video step opens the video's summary — its words, sentences and
     flashcards — and the video from there (the owner, 2026-10-06). */
  it("the video step opens the video's summary first", () => {
    const k = lastOf(graded);
    expect(stepRoute("video", graded, k)).toEqual(["VideoSummary", { unitId: graded.id, index: k }]);
  });

  it("Continue opens the quiz after the words, and a lesson lists no Grammar step", () => {
    const later = 1;   // a lesson that carries no case module
    const st = { ...base, unit: { [graded.id]: { lessons: { [later]: { v: true } } } } };
    expect(nextComponent(components(st, graded, later)).id).toBe("quiz");
    expect(components(base, graded, later).some((c) => c.id === "grammar")).toBe(false);
  });

  it("a step skipped past is not pointed at again", () => {
    const st = { ...base, unit: { [graded.id]: { lessons: { 1: { v: true, q: 100 } } } } };
    expect(nextComponent(components(st, graded, 1)).id).not.toBe("vocab");
  });

  it("a video watched in an earlier lesson does not skip a later lesson's steps", () => {
    const st = { ...base, unit: { [graded.id]: { video: true, lessons: {} } } };
    expect(nextComponent(components(st, graded, 1)).id).toBe("vocab");
  });
});
