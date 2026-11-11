/* Drive mode's spoken commands and big keys (2026-11-10). Pinned here: the
   ear opens in a pause and listens for English with the commands as its hint,
   never while something plays; "pause" heard mid-pause pauses and the ear
   stays open so "continue" resumes; "repeat" keeps the item coming round and
   "continue" lets it go on; "conjugate" plays the verb's tables with a key per
   tense and Continue returns to the lesson; "forms" on a noun offers its
   cases; a recogniser with no English model ends voice for the sitting and
   says so; the sleep timer ends the drive; nothing is graded. */

import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DriveEpisode, episodes } from "../src/screens/Drive";
import { L } from "../src/data";
import { COMMAND_WORDS } from "@core/drive";

const base = { v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"] };

async function seed(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}
async function openEpisode(id, state) {
  await seed(state);
  return await render(<SessionProvider><DriveEpisode route={{ params: { id } }} /></SessionProvider>);
}
const playing = () => screen.getByTestId("drive-play").props.accessibilityLabel === "Pause";
const ear = () => global.__stt.calls.length;
/* Said into the next pause: waits for the ear to open afresh, then speaks
   into it as a partial — the engine's start and its hearing are one moment
   in the mock, so a fresh start is an open ear. */
const hear = async (transcript, isFinal = false) => {
  const n = ear();
  await waitFor(() => expect(ear()).toBeGreaterThan(n), { timeout: 8000 });
  await act(async () => { global.__stt.emit("result", { results: [{ transcript, confidence: 0.9 }], isFinal }); });
};
const on = (id) => !!screen.getByTestId(id).props.accessibilityState.selected;
/* An episode whose first word is a verb, and one whose first word is a noun. */
const firstWord = (e) => L[e.groups[0].items[0].i];
const episodeWith = (p) => episodes().find((e) => firstWord(e).p === p && (firstWord(e).t || []).length);

/* The pauses are real seconds (waitMs is a clock, and the mock's clips end
   when they end), so a test that lives through three of them needs the room. */
jest.setTimeout(40000);

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); global.__stt.reset();
  global.__spoke = []; global.__players = []; global.__played = [];
});
afterEach(async () => { await flushState(); });

it("listens for English in the pause, with the commands as its hint, and pauses on 'pause'", async () => {
  await openEpisode(1);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  // The ear opens for the pause after the English: an English, self-ending
  // attempt; a command on a partial, with no need to wait the silence out.
  await hear("pause");
  const opts = global.__stt.calls[0];
  expect(opts.lang).toBe("en-US");
  expect(opts.continuous).toBe(true);
  expect(opts.contextualStrings).toEqual(expect.arrayContaining(COMMAND_WORDS.slice(0, 3)));
  expect(playing()).toBe(false);
  expect(screen.getByTestId("drive-heard").props.children).toBe("Pause");
  expect(global.__sounding()).toEqual([]);
  // Paused, the ear reopens so "continue" can be heard.
  await hear("continue");
  await waitFor(() => expect(playing()).toBe(true));
  // Nothing was graded.
  const saved = await global.__db.saved("p1");
  expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
});

it("'repeat' keeps the item coming round until 'continue'", async () => {
  await openEpisode(1);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  await hear("repeat");
  const item = screen.getByTestId("drive-ru").props.children;
  expect(on("drive-repeat")).toBe(true);
  // Three pauses later it is still the same item.
  for (let k = 0; k < 3; k++) { const n = ear(); await waitFor(() => expect(ear()).toBeGreaterThan(n), { timeout: 8000 }); }
  expect(screen.getByTestId("drive-ru").props.children).toBe(item);
  await hear("continue");
  expect(on("drive-repeat")).toBe(false);
  // The key does the same as the word.
  await act(async () => { fireEvent.press(screen.getByTestId("drive-repeat")); });
  expect(on("drive-repeat")).toBe(true);
});

it("'conjugate' plays the verb's tables with a key per tense; Continue returns to the lesson", async () => {
  const e = episodeWith("verb");
  expect(e).toBeTruthy();
  await openEpisode(e.id, { drivePrefs: { names: false, sentences: false } });
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  const verb = firstWord(e);
  await hear("conjugate");
  await waitFor(() => expect(screen.getByTestId("drive-focus-choices")).toBeTruthy());
  const tenses = within(screen.getByTestId("drive-focus-choices"));
  expect(tenses.queryByTestId("drive-focus-past") || tenses.queryByTestId("drive-focus-present")
         || tenses.queryByTestId("drive-focus-future")).toBeTruthy();
  expect(screen.queryByTestId("drive-conjugate")).toBeNull();
  // The word stays on screen as the group, a cell of its table as the item.
  await waitFor(() => expect(screen.getByTestId("drive-group").props.children).toBe(verb.w || verb.b), { timeout: 5000 });
  // A tense key narrows to that table.
  const past = tenses.queryByTestId("drive-focus-past");
  if (past) {
    await act(async () => { fireEvent.press(past); });
    expect(on("drive-focus-past")).toBe(true);
  }
  await act(async () => { fireEvent.press(screen.getByTestId("drive-continue")); });
  expect(screen.queryByTestId("drive-focus-choices")).toBeNull();
  expect(screen.getByTestId("drive-conjugate")).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("drive-ru").props.children).toBe(verb.w || verb.b), { timeout: 5000 });
});

it("'forms' on a noun offers its cases; 'conjugate' on it is said to be no verb", async () => {
  const e = episodeWith("noun");
  expect(e).toBeTruthy();
  await openEpisode(e.id, { drivePrefs: { names: false, sentences: false } });
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  await hear("conjugate");
  await waitFor(() => expect(screen.getByTestId("drive-heard").props.children).toBe("Not a verb"));
  expect(global.__spoke).toContain("Not a verb");
  expect(screen.queryByTestId("drive-focus-choices")).toBeNull();
  await hear("genitive");
  await waitFor(() => expect(screen.getByTestId("drive-focus-choices")).toBeTruthy());
  expect(on("drive-focus-genitive")).toBe(true);
  expect(within(screen.getByTestId("drive-focus-choices")).queryByTestId("drive-focus-past")).toBeNull();
});

it("with no English model, voice ends for the sitting and the note offers it", async () => {
  global.__stt.locales = { locales: ["ru-RU", "en-US"], installedLocales: ["ru-RU"] };
  await openEpisode(1);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await waitFor(() => expect(ear()).toBeGreaterThan(0), { timeout: 5000 });
  await act(async () => { global.__stt.emit("error", { error: "language-not-supported", message: "not downloaded" }); });
  expect((await screen.findByTestId("drive-voice-note")).props.children).toBeTruthy();
  expect(screen.getByTestId("drive-voice-note-action").props.children).toBe("Get English");
  expect(screen.getByTestId("drive-voice").props.accessibilityLabel).toBe("Voice commands off");
  const n = ear();
  await act(async () => { await new Promise((r) => setTimeout(r, 3500)); });
  expect(ear()).toBe(n);
  expect(playing()).toBe(true);
});

it("the microphone key turns voice off and no pause listens", async () => {
  await openEpisode(1, { drivePrefs: { voice: false } });
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 3000)); });
  expect(ear()).toBe(0);
  expect(screen.getByTestId("drive-voice").props.accessibilityLabel).toBe("Voice commands off");
});

it("the sleep timer ends the drive, and says so", async () => {
  await openEpisode(1);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-sleep")); });
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-sleep-10")); });
  expect(on("drive-sleep")).toBe(true);
  const realNow = Date.now;
  const start = realNow();
  Date.now = () => start + 11 * 60000;
  try {
    await act(async () => { fireEvent.press(screen.getByTestId("drive-play")); });
    await screen.findByTestId("drive-slept", {}, { timeout: 5000 });
    expect(screen.getByTestId("drive-done")).toBeTruthy();
    expect(global.__sounding()).toEqual([]);
    expect(global.__players[0].freed).toBe(true);
  } finally { Date.now = realNow; }
});
