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

/* The segmented ring (the owner, 2026-11-07): a quarter a skill, the overall
   score in the middle, a chosen quarter lit like a flame and the others
   dimmed, and a drill aimed at that score. Asserted in the render tree, since
   native has no visual suite (§20a): which arcs are drawn, how far, how bright. */
describe("the breakdown", () => {
  const open = async (seen) => {
    await profile({ seen });
    await render(<SessionProvider><WordScreen route={{ params: { word: VERB } }} navigation={nav} /></SessionProvider>);
    await act(async () => { fireEvent.press(await screen.findByTestId("familiarity-open")); });
    expect(await screen.findByTestId("skill-breakdown")).toBeTruthy();
  };
  const scoreOf = (id) => screen.getByTestId(`skill-${id}-score`).props.children;
  const opacity = (id) => screen.getByTestId(`skill-arc-${id}`).props.opacity;

  it("draws a quarter for each skill asked, the overall in the middle", async () => {
    await open({ [VERB]: { recognise: held(30), ru2en: held(30), en2ru: held(0.5, 3) } });
    expect(screen.getByTestId("skill-ring")).toBeTruthy();
    expect(Number(screen.getByTestId("skill-centre").props.children)).toBeGreaterThan(0);
    // Asked skills fill their quarter; the two never asked are the bare track.
    expect(screen.getByTestId("skill-arc-ru2en")).toBeTruthy();
    expect(screen.getByTestId("skill-arc-en2ru")).toBeTruthy();
    expect(screen.queryByTestId("skill-arc-forms")).toBeNull();
    expect(screen.queryByTestId("skill-arc-usage")).toBeNull();
    expect(screen.getByTestId("skill-track-forms")).toBeTruthy();
    expect(scoreOf("forms")).toBe("—");
    // The strong one reads higher than the weak one, and no quarter is lit.
    expect(scoreOf("ru2en")).toBeGreaterThan(scoreOf("en2ru"));
    expect(screen.queryByTestId(/^skill-flame-/)).toBeNull();
    expect(screen.queryByTestId(/^skill-detail-/)).toBeNull();
  });

  it("lights a quarter when pressed, dims the rest, and says what it measures", async () => {
    await open({ [VERB]: { recognise: held(30), ru2en: held(30), en2ru: held(0.5, 3) } });
    await act(async () => { fireEvent.press(screen.getByTestId("skill-hit-en2ru")); });
    expect(screen.getByTestId("skill-flame-en2ru")).toBeTruthy();
    expect(screen.queryByTestId("skill-flame-ru2en")).toBeNull();
    expect(opacity("en2ru")).toBe(1);
    expect(opacity("ru2en")).toBeLessThan(0.5);
    expect(screen.getByTestId("skill-detail-en2ru")).toBeTruthy();
    expect(screen.getByTestId("skill-en2ru-label")).toHaveTextContent(/3 answers/);
    // The middle reads the chosen skill now.
    expect(screen.getByTestId("skill-centre").props.children).toBe(scoreOf("en2ru"));
    expect(screen.getByTestId("skill-centre-label")).toHaveTextContent("EN → RU");
    // Pressed again, it goes out and the overall comes back.
    await act(async () => { fireEvent.press(screen.getByTestId("skill-hit-en2ru")); });
    expect(screen.queryByTestId(/^skill-flame-/)).toBeNull();
    expect(opacity("ru2en")).toBe(1);
  });

  it("offers a drill aimed at the chosen score, and opens it", async () => {
    const { navRef } = require("../src/words");
    const ready = jest.spyOn(navRef, "isReady").mockReturnValue(true);
    const go = jest.spyOn(navRef, "navigate").mockImplementation(() => {});
    try {
      await open({ [VERB]: { recognise: held(30), ru2en: held(30) } });
      // The legend selects as the quarter does; a skill never asked still drills.
      await act(async () => { fireEvent.press(screen.getByTestId("skill-forms")); });
      expect(screen.getByTestId("skill-forms-label")).toHaveTextContent("Not asked yet");
      await act(async () => { fireEvent.press(screen.getByTestId("skill-drill-forms")); });
      expect(go).toHaveBeenCalledWith("WordDrill", { word: VERB, drill: "forms" });
      expect(screen.queryByTestId("skill-breakdown")).toBeNull();
    } finally { ready.mockRestore(); go.mockRestore(); }
  });
});

describe("the ring's drills", () => {
  const at = (b) => L.findIndex((w) => w.b === b);
  it("asks only the questions that move the chosen score", () => {
    const { SKILL_OF_KIND } = require("@core/skills");
    const kniga = at("книга"), chitat = at("читать");
    const ru = Q.wordDrill(kniga, "ru2en"), en = Q.wordDrill(kniga, "en2ru");
    expect(ru.length).toBeGreaterThan(0);
    expect(ru.every((q) => SKILL_OF_KIND[q.kind] === "ru2en" && q.i === kniga)).toBe(true);
    expect(en.every((q) => SKILL_OF_KIND[q.kind] === "en2ru" && q.i === kniga)).toBe(true);
    // A verb's forms run holds its conjugation and its aspect pair both.
    const verb = Q.wordDrill(chitat, "forms");
    expect(new Set(verb.map((q) => q.kind))).toEqual(new Set(["conjugation", "aspect"]));
    expect(verb.every((q) => q.i === chitat)).toBe(true);
    // A noun's: its cases, never the agreement drill, which grades the adjective.
    const noun = Q.wordDrill(kniga, "forms");
    expect(noun.length).toBeGreaterThan(0);
    expect(noun.every((q) => q.kind === "cases" && q.i === kniga)).toBe(true);
    // A preposition has no forms to drill.
    expect(Q.wordDrill(at("в"), "forms")).toEqual([]);
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
