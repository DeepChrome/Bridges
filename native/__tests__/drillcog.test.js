/* The cog on a drill (2026-09-26): what it asks about, where its words come
 * from, written or chosen — kept per drill, and a change deals a fresh run.
 * The owner: *"let's make sure we have a settings cog to customize the
 * exercises where possible… For cases, you should be able to select each case
 * or all cases… For all of them, maybe you want to select which chapters."*
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DrillFlow } from "../src/screens/Flows";
import { STAGES, chapterWords, lessonCount } from "../src/data";
import { Q } from "../src/questions";
import { CASE_ROWS, ADJ_STEMS, adjStem } from "@core/questions";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: false, streak: 0, flash: ["recognise"],
};

const through = (n) => {
  const unit = {};
  for (const s of STAGES.slice(0, n)) {
    for (const u of [s.core].concat(s.branches)) {
      const lessons = {};
      for (let i = 0; i < lessonCount(u); i++) lessons[i] = { v: true, q: 100 };
      unit[u.id] = { lessons, video: true };
    }
  }
  return unit;
};

async function open(type, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(
    <SessionProvider><DrillFlow navigation={nav} route={{ params: { type } }} /></SessionProvider>,
  );
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
const press = async (id) => act(async () => { fireEvent.press(await screen.findByTestId(id)); });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the drill cog", () => {
  it("sits beside the progress and opens the options, all six cases on offer", async () => {
    await open("cases", { unit: through(2) });
    await press("drill-cog");
    expect(await screen.findByTestId("drill-options")).toBeTruthy();
    // Every case can be ticked, not only the route's (the owner, 2026-09-26).
    for (const c of CASE_ROWS) expect(screen.getByTestId(`focus-${c}`)).toBeTruthy();
    // "Your words" is the default source, and written answers the default.
    expect(screen.getByTestId("words-mine").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("drill-apply")).toBeTruthy();
  });

  /* The route's cases are the default ticks, so an untouched cog is the drill
     as it was (§30i: a chapter-3 learner is not asked the instrumental) — and
     before any case chapter, everything is ticked rather than "not yet"
     (§30au: nothing in Practice is locked). */
  it("ticks the route's cases by default, and all of them before the first case chapter", async () => {
    const route = STAGES.flatMap((s) => [s.core].concat(s.branches));
    let cut = 0;
    while (cut < route.length && !Q.defaultFocus("cases", route.slice(0, cut))) cut++;
    const early = Q.defaultFocus("cases", route.slice(0, cut));
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(CASE_ROWS.length);
    expect(Q.defaultFocus("cases", [])).toBeNull();
    expect(Q.drillFocus("cases").map((o) => o.id)).toEqual(CASE_ROWS);
  });

  it("remembers what was ticked, and a change deals a fresh run of only that", async () => {
    await open("conjugation", { unit: through(3) });
    await screen.findByTestId("answer-block");
    await press("drill-cog");
    // Untick everything but the imperative.
    await press("focus-present");
    await press("focus-past");
    await press("focus-who");
    await press("drill-apply");
    const st = await saved();
    expect(st.drillPrefs.conjugation.only).toEqual(["imperative"]);
    // The run dealt is imperatives only — the ask says so on every question.
    expect((await screen.findByText(/imperative/i))).toBeTruthy();
  });

  it("the last tick cannot be removed", async () => {
    await open("aspect", { unit: through(8) });
    await press("drill-cog");
    await press("focus-which");
    await press("focus-partner");                       // the last one: stays
    await press("drill-apply");
    const st = await saved();
    expect(st.drillPrefs.aspect.only).toEqual(["partner"]);
  });

  /* Chapters chosen are drawn on whole and are not widened. */
  it("draws on the chosen chapters' words when chapters are picked", async () => {
    await open("cases", { unit: through(4) });
    await press("drill-cog");
    await press("words-ch1");
    await press("words-ch2");
    expect(screen.getByTestId("words-mine").props.accessibilityState.selected).toBe(false);
    await press("drill-apply");
    const st = await saved();
    expect(st.drillPrefs.cases.chapters).toEqual([0, 1]);
    const pool = new Set(chapterWords([0, 1]));
    expect(pool.size).toBeGreaterThan(0);
    // Every question on a cases run from those chapters is about one of their words.
    const qs = Q.drillQuestions("cases", 10, chapterWords([0, 1]), undefined, true, null);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => pool.has(q.i))).toBe(true);
    // "Your words" clears the chapters again.
    await press("drill-cog");
    await press("words-mine");
    await press("drill-apply");
    expect((await saved()).drillPrefs.cases.chapters).toEqual([]);
  });

  it("switches every drill between written and chosen answers from the cog", async () => {
    await open("cases", { unit: through(4) });
    await press("drill-cog");
    fireEvent.press(screen.getByText("Multiple choice"));
    await press("drill-apply");
    expect((await saved()).typedDrills).toBe(false);
    // A chosen run shows options.
    expect(screen.queryByTestId("type-input")).toBeNull();
  });

  /* Agreement narrows by the adjective's stem as well as by case. */
  it("agreement offers the stem classes, and narrowing to one asks only that class", () => {
    const ids = Q.drillFocus("agreement").map((o) => o.id);
    expect(ids).toEqual(CASE_ROWS.concat(ADJ_STEMS.map((s) => s.id)));
    expect(adjStem("новый")).toBe("stem:hard");
    expect(adjStem("синий")).toBe("stem:soft");
    expect(adjStem("русский")).toBe("stem:soft");
    expect(adjStem("большой")).toBe("stem:stressed");
    for (const s of ADJ_STEMS) {
      const qs = Q.drillQuestions("agreement", 8, null, undefined, true, CASE_ROWS.concat([s.id]));
      expect(qs.length).toBeGreaterThan(0);
      expect(qs.every((q) => adjStem(q.sub.split(" ")[0].normalize("NFD").replace(/[̀́]/g, "").normalize("NFC")) === s.id)).toBe(true);
    }
  });
});
