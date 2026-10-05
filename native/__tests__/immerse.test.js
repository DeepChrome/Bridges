/* Immerse keeps its place (the owner, 2026-10-01: "if you navigate away from
   the immerse page, it remembers the exact state you were in"), and lists the
   videos opened lately so nobody has to find theirs again.

   A place is seeded into storage before a render rather than made by
   unmounting and rendering again: an unmount leaves later renders in the
   same file drawing into a dead root (CLAUDE.md §23). */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession } from "../src/session";
import { flushState } from "../src/store";
import { Immerse, Video, VideoHistory, VideoControls, VIDEO_SPEEDS } from "../src/screens/Misc";
import { videos } from "../src/data";
import { setVideoPosition, openedVideo, watchHistory, videoPosition, libraryState,
         loadImmerse, flushImmerse, resetImmerse } from "../src/immerse";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: global.__seek, pause: jest.fn(), watch: jest.fn(),
      toggle: global.__toggle, rate: global.__rate, skip: global.__skip }));
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
  global.__toggle = jest.fn();
  global.__rate = jest.fn();
  global.__skip = jest.fn();
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
    expect(watchHistory().map((r) => r.id)).toEqual([b.id, a.id]);
    openedVideo(a.id, 3000);
    expect(watchHistory()[0].id).toBe(a.id);
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

describe("History", () => {
  /* A button beside the filters, not a row forced above the library (the
     owner, 2026-10-01). */
  it("is a button in the library, not a row in it", async () => {
    await withProfile(<Immerse navigation={nav} />,
      { ui: {}, videos: { [a.id]: { opened: 1000, at: 60000 } } });
    expect(screen.queryByTestId(`history-${a.id}`)).toBeNull();
    fireEvent.press(screen.getByTestId("video-history"));
    expect(nav.navigate).toHaveBeenCalledWith("VideoHistory");
  });

  it("lists every video opened, newest first, under its day", async () => {
    const now = Date.now();
    await withProfile(<VideoHistory navigation={nav} />,
      { ui: {}, videos: { [a.id]: { opened: now - 2 * 86400000, at: 60000 }, [b.id]: { opened: now } } });
    const ids = screen.getAllByTestId(/^history-/).map((n) => n.props.testID);
    expect(ids).toEqual([`history-${b.id}`, `history-${a.id}`]);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText(/stopped at 1:00/)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`history-${a.id}`));
    expect(nav.navigate).toHaveBeenCalledWith("Video", { videoId: a.id });
  });

  it("says so when nothing was watched", async () => {
    await withProfile(<VideoHistory navigation={nav} />);
    expect(screen.getByTestId("history-empty")).toBeTruthy();
  });

  it("holds far more than the old row's eight", () => {
    for (let i = 0; i < 30; i++) openedVideo(V[i].id, 1000 + i);
    expect(watchHistory()).toHaveLength(30);
    expect(watchHistory()[0].id).toBe(V[29].id);
  });
});

describe("the library", () => {

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
    expect(screen.getByText("Resume 3:12")).toBeTruthy();
    // …beside a way to start from the beginning (the owner, 2026-10-05).
    expect(screen.getByTestId("video-restart")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("video-play")); });
    expect(screen.getByTestId("yt-player")).toBeTruthy();
  });

  it("records the video as opened", async () => {
    await withProfile(<Video route={{ params: { videoId: b.id } }} navigation={nav} />);
    expect(watchHistory()[0].id).toBe(b.id);
  });

  /* Controls under the player, so nobody has to use the video's own (the
     owner, 2026-10-01): back and forward five seconds, one play/pause, speed
     down and up through the API's own steps. */
  it("offers back 5, play/pause, forward 5 and speed under the player", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    expect(screen.queryByTestId("video-controls")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("video-play")); });
    // Every press awaited inside act: an un-awaited one overlapping the others
    // left the renderer a render behind and broke the tests after this one.
    const press = (id) => act(async () => { fireEvent.press(screen.getByTestId(id)); });
    await press("video-back5");
    expect(global.__skip).toHaveBeenCalledWith(-5000, 0, 0);
    await press("video-fwd5");
    expect(global.__skip).toHaveBeenCalledWith(5000, 0, 0);
    await press("video-toggle");
    expect(global.__toggle).toHaveBeenCalled();
    expect(screen.getByTestId("video-rate").props.children).toBe("1×");
    await press("video-faster");
    expect(screen.getByTestId("video-rate").props.children).toBe("1.25×");
    await press("video-slower");
    await press("video-slower");
    expect(screen.getByTestId("video-rate").props.children).toBe("0.75×");
    expect(global.__rate).toHaveBeenLastCalledWith(0.75);
  });

  it("steps the speed down and up through the API's own rates, and stops at the ends", async () => {
    const rate = jest.fn();
    function Host() {
      const [r, setR] = React.useState(1);
      const player = React.useRef({ rate, skip: jest.fn(), toggle: jest.fn() });
      return <VideoControls player={player} playing={false} rate={r} onRate={setR} />;
    }
    await render(<Host />);
    const label = () => screen.getByTestId("video-rate").props.children;
    await act(async () => { fireEvent.press(screen.getByTestId("video-faster")); });
    expect(label()).toBe("1.25×");
    await act(async () => { fireEvent.press(screen.getByTestId("video-slower")); });
    await act(async () => { fireEvent.press(screen.getByTestId("video-slower")); });
    expect(label()).toBe("0.75×");
    expect(rate).toHaveBeenLastCalledWith(0.75);
    for (let k = 0; k < 6; k++) await act(async () => { fireEvent.press(screen.getByTestId("video-slower")); });
    expect(label()).toBe(`${VIDEO_SPEEDS[0]}×`);            // stops at the slowest
  });

  it("starts at the beginning when it was never played", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    expect(screen.getByText("Play")).toBeTruthy();
  });
});
