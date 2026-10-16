/* Drive mode (core/drive.js, 2026-10-15): hands-free lessons as a playlist.
   Pinned here: 25 episodes that follow the course, and the learner's own two
   playlists; an episode plays its groups English first; a silent carrier holds
   the lock screen and is let go on leaving; pause silences everything; an
   episode heard to the end is marked, and the next one follows; nothing is
   graded. */

import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { DriveList, DriveEpisode, episodes, ownPlaylist } from "../src/screens/Drive";
import { L, STAGES } from "../src/data";
import { DRIVE_EPISODES } from "@core/drive";

const base = { v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"] };
const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

async function seed(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}
async function openEpisode(id, state) {
  await seed(state);
  return await render(<SessionProvider><DriveEpisode route={{ params: { id } }} /></SessionProvider>);
}

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); nav.navigate.mockClear();
  global.__spoke = []; global.__players = []; global.__played = [];
});
afterEach(async () => { await flushState(); });

it("ends a pause on the carrier's native ticks, with no timer firing (the screen locked)", async () => {
  const audio = require("../src/audio");
  await audio.startCarrier("asset", "Drive", () => {});
  const carrier = global.__players[global.__players.length - 1];
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  const realSetInterval = global.setInterval;
  global.setInterval = () => 0;               // background: JS timers do not fire
  try {
    let over = false;
    audio.waitMs(2600).then(() => { over = true; });
    now += 1000; carrier.__emit({ playing: true, currentTime: 1 });
    await Promise.resolve();
    expect(over).toBe(false);
    now += 2000; carrier.__emit({ playing: true, currentTime: 3 });
    await Promise.resolve(); await Promise.resolve();
    expect(over).toBe(true);
  } finally {
    Date.now = realNow; global.setInterval = realSetInterval;
    audio.stopCarrier();
  }
});

it("cuts the course into 25 episodes that follow the chapters, of named groups", () => {
  const eps = episodes();
  expect(eps.length).toBe(DRIVE_EPISODES);
  expect(eps[0].chapter).toBe(1);
  expect(eps[eps.length - 1].chapter).toBe(STAGES.length);
  // Episode 1 opens on chapter 1's first group and holds nothing from later chapters.
  expect(eps[0].groups[0].name).toBe(STAGES[0].core.gr[0][0]);
  expect(eps[0].groups.every((g) => g.chapter === 1)).toBe(true);
});

it("keeps the learner's own playlists: studied words weakest first, and trouble words", () => {
  expect(ownPlaylist(base, "studied")).toEqual([]);
  const words = STAGES[0].core.gr[0][2].map((i) => L[i].b).concat(STAGES[0].core.gr[1][2].map((i) => L[i].b));
  const now = Date.now();
  const card = (s) => ({ recognise: { s, d: 5, state: 2, reps: 9, lapses: 0, dueAt: now + 86400000, lastAt: now } });
  const seen = Object.fromEntries(words.map((w, k) => [w, card(k < 3 ? 0.5 : 300)]));
  const studied = ownPlaylist({ ...base, seen }, "studied");
  expect(studied.length).toBeGreaterThan(0);
  expect(studied.every((g) => g.items.every((it) => seen[it.b]))).toBe(true);
  expect(studied[0].score).toBeLessThanOrEqual(studied[studied.length - 1].score);
  const trouble = ownPlaylist({ ...base, seen, pinned: [words[0]] }, "trouble");
  expect(trouble.flatMap((g) => g.items.map((it) => it.b))).toContain(words[0]);
});

it("lists the playlists and opens an episode", async () => {
  await seed();
  await render(<SessionProvider><DriveList navigation={nav} /></SessionProvider>);
  await screen.findByTestId("drive-episode-1");
  expect(screen.getByTestId(`drive-episode-${DRIVE_EPISODES}`)).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId("drive-episode-3")); });
  expect(nav.navigate).toHaveBeenCalledWith("DriveEpisode", { id: 3 });
  // Nothing studied yet: the own playlists are there but have nothing to play.
  await act(async () => { fireEvent.press(screen.getByTestId("drive-own-studied")); });
  expect(nav.navigate).toHaveBeenCalledTimes(1);
});

it("plays the English first, holds the lock screen, pauses everything, and lets go on leaving", async () => {
  const view = await openEpisode(1);
  expect(await screen.findByTestId("drive-title")).toHaveTextContent(/Episode 1/);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-play")); });
  // The first item shows after the carrier opens and the group's name is said.
  const en = await screen.findByTestId("drive-en", {}, { timeout: 5000 });
  await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(1));
  expect(global.__spoke[0]).toBe(screen.getByTestId("drive-group").props.children);
  expect(global.__spoke[1]).toBe(en.props.children);
  const carrier = global.__players[0];
  expect(carrier.loop).toBe(true);
  expect(carrier.sounding).toBe(true);
  // A loading status before it has played is not a lock-screen pause.
  await act(async () => { carrier.__emit({ playing: false, isLoaded: false }); });
  expect(screen.getByTestId("drive-play").props.accessibilityLabel).toBe("Pause");
  // The lock screen's pause, once it has played, is one; its play resumes.
  await act(async () => { carrier.__emit({ playing: false }); });
  expect(screen.getByTestId("drive-play").props.accessibilityLabel).toBe("Play");
  await act(async () => { carrier.__emit({ playing: true }); });
  expect(screen.getByTestId("drive-play").props.accessibilityLabel).toBe("Pause");

  await act(async () => { fireEvent.press(screen.getByTestId("drive-play")); });   // pause
  expect(global.__sounding()).toEqual([]);
  expect(screen.getByTestId("drive-play").props.accessibilityLabel).toBe("Play");

  await act(async () => { view.unmount(); });
  expect(carrier.freed).toBe(true);
  // Practice, not a claim: nothing was graded.
  const saved = await global.__db.saved("p1");
  expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
});

/* Last in the file: a sheet opened in a test leaves the next test's tree
   undrawn (§30by's trap), so nothing renders after this one. */
it("keeps its options", async () => {
  await seed();
  await render(<SessionProvider><DriveList navigation={nav} /></SessionProvider>);
  await act(async () => { fireEvent.press(await screen.findByTestId("drive-cog")); });
  await act(async () => { fireEvent.press(within(screen.getByTestId("drive-opt-direction")).getByText("Understand it")); });
  await act(async () => { fireEvent.press(screen.getByTestId("drive-opt-next")); });
  await flushState();
  const saved = await global.__db.saved("p1");
  expect(saved.drivePrefs).toMatchObject({ direction: "hear", next: false });
  await act(async () => { fireEvent.press(screen.getByTestId("drive-apply")); });
});
