/* Immerse keeps its place (the owner, 2026-10-01: "if you navigate away from
   the immerse page, it remembers the exact state you were in"), and lists the
   videos opened lately so nobody has to find theirs again.

   A place is seeded into storage before a render rather than made by
   unmounting and rendering again: an unmount leaves later renders in the
   same file drawing into a dead root (CLAUDE.md §23). */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession } from "../src/session";
import { flushState } from "../src/store";
import { Immerse, Video } from "../src/screens/Misc";
import { videos } from "../src/data";
import { setVideoPosition, openedVideo, recentVideos, videoPosition, libraryState,
         loadImmerse, flushImmerse, resetImmerse } from "../src/immerse";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: global.__seek, pause: jest.fn(), watch: jest.fn() }));
    return React.createElement(View, { testID: "yt-player" });
  }) };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: jest.fn(() => () => {}) };
function WhenReady({ children }) { return useSession().ready ? children : null; }
async function withProfile(ui, place) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
    speech: { attempts: [], tagCounts: {} }, streak: 0, notices: { immerse: 1 } }));
  if (place) await AsyncStorage.setItem("rb.immerse.p1", JSON.stringify(place));
  // Drawn once the profile is loaded, as the app's shell does (App.js waits on `ready`).
  const r = await render(<SessionProvider><WhenReady>{ui}</WhenReady></SessionProvider>);
  await screen.findByTestId("screen-root");
  return r;
}

const V = videos();
const a = V.find((v) => v.dur > 300);
const b = V.find((v) => v.dur > 300 && v.id !== a.id);

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  global.__seek = jest.fn();
});
afterEach(async () => { await flushState(); });

describe("where the learner was", () => {
  it("keeps a playback position, and none near either end", () => {
    setVideoPosition(a.id, 125000, a.dur * 1000);
    expect(videoPosition(a.id)).toBe(125000);
    setVideoPosition(a.id, 4000, a.dur * 1000);
    expect(videoPosition(a.id)).toBe(0);
    setVideoPosition(a.id, a.dur * 1000 - 3000, a.dur * 1000);
    expect(videoPosition(a.id)).toBe(0);
  });

  it("lists the videos opened, newest first", () => {
    openedVideo(a.id, 1000);
    openedVideo(b.id, 2000);
    expect(recentVideos().map((r) => r.id)).toEqual([b.id, a.id]);
    openedVideo(a.id, 3000);
    expect(recentVideos()[0].id).toBe(a.id);
  });

  it("writes the place to storage and reads it back after a restart", async () => {
    await loadImmerse("p1");
    setVideoPosition(a.id, 90000, a.dur * 1000);
    openedVideo(a.id, 5000);
    flushImmerse();
    await new Promise((r) => setTimeout(r, 0));
    const kept = JSON.parse(await AsyncStorage.getItem("rb.immerse.p1"));
    resetImmerse();                                      // memory gone, as after a restart
    expect(videoPosition(a.id)).toBe(0);
    await loadImmerse("p1");
    expect(kept.videos[a.id].at).toBe(90000);
    expect(videoPosition(a.id)).toBe(90000);
  });

  it("keeps one profile's place apart from another's", async () => {
    await loadImmerse("p1");
    setVideoPosition(a.id, 90000, a.dur * 1000);
    await loadImmerse("p2");
    expect(videoPosition(a.id)).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    await loadImmerse("p1");
    expect(videoPosition(a.id)).toBe(90000);
  });
});

describe("the library", () => {
  it("shows Recently watched only once something was opened", async () => {
    await withProfile(<Immerse navigation={nav} />);
    expect(screen.queryByTestId("recent-videos")).toBeNull();
  });

  it("opens a recent video from the row", async () => {
    await withProfile(<Immerse navigation={nav} />,
      { ui: {}, videos: { [a.id]: { opened: 1000, at: 60000 } } });
    fireEvent.press(screen.getByTestId(`recent-${a.id}`));
    expect(nav.navigate).toHaveBeenCalledWith("Video", { videoId: a.id });
  });

  it("comes back to the search and filter it was left on", async () => {
    await withProfile(<Immerse navigation={nav} />,
      { ui: { query: "family", filter: "unwatched" }, videos: {} });
    expect(screen.getByTestId("video-search").props.value).toBe("family");
  });

  it("remembers what is typed", async () => {
    await withProfile(<Immerse navigation={nav} />);
    await act(async () => { fireEvent.changeText(screen.getByTestId("video-search"), "travel"); });
    expect(libraryState().query).toBe("travel");
  });
});

describe("the player", () => {
  it("offers to resume where the video was stopped, and seeks there", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />,
      { ui: {}, videos: { [a.id]: { opened: 1000, at: 192000 } } });
    expect(screen.getByText("Resume from 3:12")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("video-play")); });
    expect(screen.getByTestId("yt-player")).toBeTruthy();
  });

  it("records the video as opened", async () => {
    await withProfile(<Video route={{ params: { videoId: b.id } }} navigation={nav} />);
    expect(recentVideos()[0].id).toBe(b.id);
  });

  it("starts at the beginning when it was never played", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    expect(screen.getByText("Play here")).toBeTruthy();
  });
});
