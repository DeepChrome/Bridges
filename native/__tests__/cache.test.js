/* Offline audio (P5.12): a unit's audio and the next's are fetched when the
   setting is on, playback prefers the copy, other units' files are dropped, and
   the relief rule on lesson quizzes.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { UnitScreen } from "../src/screens/Unit";
import You from "../src/screens/You";
import { prefetchUnit, filesForUnit, nextUnit, cachedUri, cacheStats, clearCache, configureCache } from "../src/cache";
import { say } from "../src/audio";
import { STAGES, AUDIO, AUDIO_BASE, L, components, markComponent, UN } from "../src/data";
import { quizPassed, PASS_MARK, RELIEF_MARK, RELIEF_AFTER } from "@core/state";
import { fold } from "@core/util";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {}, decks: [],
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  global.__fs.dirs.clear(); global.__fs.files.clear(); global.__downloads = [];
  global.__downloadFail = null; global.__played = [];
  configureCache({});
});
afterEach(async () => { await flushState(); });

const unit = STAGES[0].core;

describe("the audio cache", () => {
  it("knows a unit's files: its words and its pools' sentences, each once", () => {
    const files = filesForUnit(unit);
    expect(files.length).toBeGreaterThan(10);
    expect(new Set(files).size).toBe(files.length);
    const wordFile = AUDIO[fold(L[unit.w[0]].b)];
    if (wordFile) expect(files).toContain(wordFile);
    expect(nextUnit(unit)).toBe(STAGES[0].branches[0] || STAGES[1].core);
  });

  it("fetches this unit and the next, prefers the copy, and drops the rest", async () => {
    // A stray file from some other unit is already on disk.
    const dir = "file:///cache/audio";
    global.__fs.dirs.add(dir);
    global.__fs.files.set(dir + "/stale.mp3", 1000);
    const r = await prefetchUnit(unit);
    const want = new Set(filesForUnit(unit).concat(filesForUnit(nextUnit(unit))));
    expect(r.fetched).toBe(want.size);
    expect(r.removed).toBe(1);
    expect(global.__fs.files.has(dir + "/stale.mp3")).toBe(false);
    expect(global.__downloads.every((u) => u.startsWith(AUDIO_BASE))).toBe(true);
    // Playback now takes the local file for a cached word.
    const word = L[unit.w[0]].b;
    if (AUDIO[fold(word)]) {
      expect(cachedUri(word)).toBe(dir + "/" + AUDIO[fold(word)]);
      await say(word);
      expect(global.__played[0]).toBe(dir + "/" + AUDIO[fold(word)]);
    }
    expect(cachedUri("несуществующееслово")).toBeNull();
    // A second pass downloads nothing new.
    global.__downloads = [];
    const again = await prefetchUnit(unit);
    expect(again.fetched).toBe(0);
    expect(global.__downloads).toHaveLength(0);
    expect(cacheStats().files).toBe(want.size);
    clearCache();
    expect(cacheStats().files).toBe(0);
  });

  it("counts a failed download and carries on", async () => {
    global.__downloadFail = (u) => u.endsWith(filesForUnit(unit)[0]);
    const r = await prefetchUnit(unit);
    expect(r.failed).toBe(1);
    expect(r.fetched).toBeGreaterThan(0);
  });

  it("downloads on opening a unit only with the setting on", async () => {
    await withProfile(<UnitScreen route={{ params: { unitId: unit.id } }} navigation={nav} />);
    await screen.findByText("Lesson 1");
    expect(global.__downloads).toHaveLength(0);
    expect(screen.queryByTestId("offline-status")).toBeNull();
    await flushState(); await AsyncStorage.clear();
    await withProfile(<UnitScreen route={{ params: { unitId: unit.id } }} navigation={nav} />, { offline: true });
    expect(await screen.findByText("Audio saved for offline")).toBeTruthy();
    expect(global.__downloads.length).toBeGreaterThan(10);
  });

  it("has a switch in settings and a way to clear what was saved", async () => {
    await prefetchUnit(unit);
    await withProfile(<You navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByText("Settings")); });
    expect(screen.getByText(/files, .* MB saved/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Clear downloaded audio")); });
    expect(screen.getByText(/nothing saved yet/)).toBeTruthy();
    await act(async () => { fireEvent(screen.getByTestId("offline-switch"), "valueChange", true); });
    await flushState();
    expect((await global.__db.saved("p1")).offline).toBe(true);
  });
});

describe("the relief rule", () => {
  it("passes at the mark, or at the relief mark from the third try", () => {
    expect(quizPassed({ q: PASS_MARK })).toBe(true);
    expect(quizPassed({ q: RELIEF_MARK, tries: 1 })).toBe(false);
    expect(quizPassed({ q: RELIEF_MARK, tries: RELIEF_AFTER })).toBe(true);
    expect(quizPassed({ q: RELIEF_MARK - 1, tries: 9 })).toBe(false);
    expect(quizPassed({})).toBe(false);
  });

  it("counts tries when a quiz is marked, and the lesson clears on relief", () => {
    const u = UN[0];
    let st = { ...base };
    st = markComponent(st, u, 0, "vocab");
    st = markComponent(st, u, 0, "quiz", 70);
    st = markComponent(st, u, 0, "quiz", 60);
    expect(st.unit[u.id].lessons[0].tries).toBe(2);
    expect(components(st, u, 0).find((c) => c.id === "quiz").done).toBe(false);
    st = markComponent(st, u, 0, "quiz", 65);
    expect(st.unit[u.id].lessons[0].q).toBe(70);          // the best score is kept
    expect(components(st, u, 0).find((c) => c.id === "quiz").done).toBe(true);
  });
});
