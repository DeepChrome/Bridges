/* The summary (2026-09-29): a lesson's words, sentences and rule as one list to
   study before the quiz, and the unit's before its test. A reference: it asks
   nothing, and opening it only marks its own optional step. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Summary from "../src/screens/Summary";
import { UN, L, lessonWords, lessonCount, components, lessonDone, nextStep } from "../src/data";

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

  it("is an optional step that Continue walks past", () => {
    const cs = components(base, unit, 0);
    expect(cs.map((c) => c.id).slice(0, 3)).toEqual(["vocab", "summary", "quiz"]);
    expect(cs.find((c) => c.id === "summary").optional).toBe(true);
    const afterVocab = { ...base, unit: { [unit.id]: { lessons: { 0: { v: true } } } } };
    expect(nextStep(afterVocab)).toMatchObject({ step: "quiz" });
  });
});
