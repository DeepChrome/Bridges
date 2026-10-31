/* One word's drill, run (flows/Drills.js WordDrillFlow; worddrills.test.js
 * is the button and the sheet).
 *
 * The Meaning run is walked end to end — chosen, heard, chosen, written — to
 * its Done, and the saved profile is read back: the card and both meaning
 * scores moved. The Cases run is answered once and the profile shows the
 * form-drill rule held: the "Cases & forms" score moved and the card did not
 * (§30by). Both are the things a drill could get silently wrong while every
 * screen looked right.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { WordDrillFlow } from "../src/flows/Drills";
import { L } from "../src/data";
import { firstSense } from "@core/util";
import { DAY, REVIEW } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(),
              addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
const now = Date.now();
const NOUN = "город";
const CARD = { dueAt: now + 3 * DAY, lastAt: now - DAY, s: 4, d: 5, state: REVIEW, steps: 0, reps: 3, lapses: 0 };
/* The headword is drawn with its stress mark («го́род»), so it is matched with
   the accent allowed after any letter (§23). */
const accented = (w) => new RegExp("^" + w.split("").map((c) => c + "́?").join("") + "$");

const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"],
};
async function open(drill, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, seen: { [NOUN]: { recognise: CARD } }, ...state }));
  return await render(
    <SessionProvider>
      <WordDrillFlow navigation={nav} route={{ params: { word: NOUN, drill } }} />
    </SessionProvider>,
  );
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
const press = async (el) => act(async () => { fireEvent.press(el); });
const next = async () => press(await screen.findByText("Continue"));

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__players = []; });
afterEach(async () => { await flushState(); });

describe("one word's drill", () => {
  it("walks Meaning from chosen to written and grades the card and both meaning scores", async () => {
    await open("meaning");
    const i = L.findIndex((w) => w.b === NOUN);
    // 1. the meaning, chosen
    await press(await screen.findByText(firstSense(L[i])));
    expect(await screen.findByText("Correct")).toBeTruthy();
    await next();
    // 2. the word heard, its Russian chosen
    await press(await screen.findByText(accented(NOUN)));
    await next();
    // 3. the Russian chosen from the meaning
    await press(await screen.findByText(accented(NOUN)));
    await next();
    // 4. written
    const input = await screen.findByTestId("type-input");
    await act(async () => { fireEvent.changeText(input, NOUN); });
    await press(await screen.findByText("Check"));
    await next();
    expect(await screen.findByText("Meaning")).toBeTruthy();
    expect(screen.getByText("4 of 4 right")).toBeTruthy();
    const st = await saved();
    const e = st.seen[NOUN];
    expect(e.recognise.reps).toBeGreaterThan(CARD.reps);
    expect(e.ru2en.reps).toBeGreaterThanOrEqual(2);     // chosen meaning, heard
    expect(e.en2ru.reps).toBeGreaterThanOrEqual(2);     // Russian chosen, written
  });

  it("asks a cases question about this word and grades its forms score, never its card", async () => {
    await open("cases");
    // Every question in the run is about the word: its headword is the prompt.
    expect(await screen.findByText(accented(NOUN))).toBeTruthy();
    expect(screen.getByText(/^Write /)).toBeTruthy();
    const input = await screen.findByTestId("type-input");
    await act(async () => { fireEvent.changeText(input, "дом"); });
    await press(await screen.findByText("Check"));
    await screen.findByText("Continue");
    const st = await saved();
    const e = st.seen[NOUN];
    expect(e.forms.reps).toBe(1);
    expect(e.recognise.reps).toBe(CARD.reps);
    expect(e.recognise.s).toBe(CARD.s);
  });

  /* A word the course does not know, or a drill it has not got, is said
     plainly rather than drawn as an empty runner. */
  it("says so for a drill the word has not got", async () => {
    await open("conjugation");
    expect(await screen.findByText("Nothing to drill here")).toBeTruthy();
  });
});
