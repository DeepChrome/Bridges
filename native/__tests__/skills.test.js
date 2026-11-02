/* Four scores behind the one (the owner, 2026-10-29: *"when someone clicks
 * the score, they get a blown up detail of their mastery, where they're good
 * and where they need to work"*). The ring on an entry opens the breakdown;
 * a profile from before the scores has them rebuilt from its review log at
 * boot; a restored backup likewise; the drills lean on the weakest words. */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState, loadState } from "../src/store";
import WordScreen from "../src/screens/Word";
import { L, skillWeight, WEIGHT_UNASKED } from "../src/data";
import { REVIEW, cardFor } from "@core/scheduler";
import { Q } from "../src/questions";

const DAY = 86400000, now = Date.now();
const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), setParams: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};
const held = (s, reps = 6) => ({ dueAt: now + DAY, lastAt: now - DAY, s, d: 5, state: REVIEW, steps: 0, reps, lapses: 0 });

async function profile(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

const VERB = L.find((w) => w.p === "verb" && (w.t || []).length >= 3).b;

describe("the breakdown", () => {
  it("opens from the entry's ring and shows each skill, asked or not", async () => {
    await profile({ seen: { [VERB]: { recognise: held(30), ru2en: held(30), en2ru: held(0.5, 3) } } });
    await render(<SessionProvider><WordScreen route={{ params: { word: VERB } }} navigation={nav} /></SessionProvider>);
    await act(async () => { fireEvent.press(await screen.findByTestId("familiarity-open")); });
    expect(await screen.findByTestId("skill-breakdown")).toBeTruthy();
    expect(screen.getByTestId("skill-overall")).toBeTruthy();
    expect(screen.getByTestId("skill-ru2en-score")).toBeTruthy();
    expect(screen.getByTestId("skill-ru2en-label")).toHaveTextContent(/6 answers/);
    expect(screen.getByTestId("skill-en2ru-score")).toBeTruthy();
    expect(screen.getByTestId("skill-en2ru-label")).toHaveTextContent(/3 answers/);
    // The two never asked say so and draw no ring.
    expect(screen.getByTestId("skill-forms-label")).toHaveTextContent("Not asked yet");
    expect(screen.queryByTestId("skill-forms-score")).toBeNull();
    expect(screen.getByTestId("skill-usage-label")).toHaveTextContent("Not asked yet");
    // And the strong one reads higher than the weak one.
    const score = (id) => Number(within(screen.getByTestId(`skill-${id}-score`)).getByTestId("familiarity-score").props.children);
    expect(score("ru2en")).toBeGreaterThan(score("en2ru"));
  });
});

describe("filling the scores in from the log", () => {
  it("rebuilds a profile's skill slots from its review log once, and stamps it", async () => {
    const repo = global.__db.repos.get("p1") || (global.__db.repos.set("p1", require("@core/repo").memoryRepo()), global.__db.repos.get("p1"));
    const rows = [
      { word: VERB, direction: "recognise", grade: 3, day: 1, at: now - 3 * DAY, source: "choose-en" },
      { word: VERB, direction: "produce", grade: 3, day: 2, at: now - 2 * DAY, source: "cloze" },
      { word: VERB, direction: "produce", grade: 4, day: 3, at: now - DAY, source: "study" },
    ];
    await repo.replace({ ...base, seen: { [VERB]: { recognise: held(10, 3) } } }, rows);
    const { state } = await loadState("p1");
    const e = state.seen[VERB];
    expect(cardFor(e)).toMatchObject({ s: 10, reps: 3 });          // the card is the log's product already
    expect(e.ru2en).toMatchObject({ reps: 1 });
    expect(e.usage).toMatchObject({ reps: 1 });
    expect(e.en2ru).toMatchObject({ reps: 1 });
    expect(e.forms).toBeUndefined();
    // Written at once, and stamped: a second boot replays nothing.
    const saved = await global.__db.saved("p1");
    expect(saved.seen[VERB].usage).toMatchObject({ reps: 1 });
    expect(JSON.parse(await repo.getMeta("skills"))).toMatchObject({ rows: 3 });
    const again = await loadState("p1");
    expect(again.state.seen[VERB].usage).toMatchObject({ reps: 1 });
  });
});

describe("the drills lean on the weakest", () => {
  it("weights a word never asked three times a mastered one, and the drill still reaches every word", () => {
    const words = L.map((w, i) => i).filter((i) => L[i].p === "noun" && (L[i].t || []).length).slice(0, 12);
    const st = { seen: { [L[words[0]].b]: { recognise: held(400), forms: held(400, 20) } } };
    const weight = skillWeight(st, "forms");
    expect(weight(words[0])).toBeCloseTo(1, 1);
    expect(weight(words[1])).toBe(WEIGHT_UNASKED);
    /* Weighted down, never left out. Aimed, not sampled (§23): against
       eleven unasked words the mastered one is drawn in about one question
       in thirty-four, and twelve runs missed it about one time in thirty.
       Against one unasked word it is drawn in one question in four, and a
       hundred and twenty draws cannot miss it. */
    const pair = new Set();
    for (let k = 0; k < 12; k++) {
      for (const q of Q.drillQuestions("cases", 10, words.slice(0, 2), undefined, true, undefined, weight)) pair.add(q.i);
    }
    expect(pair.has(words[0])).toBe(true);
    expect(pair.has(words[1])).toBe(true);
    // …and over the whole pool the drill still reaches most words.
    const asked = new Set();
    for (let k = 0; k < 12; k++) {
      for (const q of Q.drillQuestions("cases", 10, words, undefined, true, undefined, weight)) asked.add(q.i);
    }
    expect(asked.size).toBeGreaterThan(words.length / 2);
  });
});
