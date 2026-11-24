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
import { Immerse, VideoHistory } from "../src/screens/Immerse";
import { Video, VideoOverlay, VIDEO_SPEEDS } from "../src/screens/Video";
import { videos } from "../src/data";
import { DEFAULT_SKIP } from "../src/video";
import { setVideoPosition, openedVideo, watchHistory, videoPosition, libraryState,
         loadImmerse, flushImmerse, resetImmerse } from "../src/immerse";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: global.__seek, pause: jest.fn(), watch: jest.fn(),
      toggle: global.__toggle, rate: global.__rate, skip: global.__skip,
      captions: global.__captions, seekTo: jest.fn() }));
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
  global.__captions = jest.fn();
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

  /* The owner, 2026-11-23: "a whole list of reputable Russian movies, songs,
     podcasts, and other media". A second tab, kept like the rest of the
     library's place; a row opens its link. */
  it("has a Recommended tab of films, music, channels and tools, each opening its link", async () => {
    const { Linking } = require("react-native");
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await withProfile(<Immerse navigation={nav} />);
    await act(async () => { fireEvent.press(screen.getByTestId("immerse-tabs-picks")); });
    expect(screen.getByTestId("media-list")).toBeTruthy();
    expect(screen.queryByTestId("video-search")).toBeNull();
    expect(libraryState().tab).toBe("picks");
    await act(async () => { fireEvent.press(screen.getByTestId("media-films-Брат")); });
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/www\.youtube\.com\/results/));
    spy.mockRestore();
  });
});

describe("the player", () => {
  /* The player starts on arrival (the owner, 2026-10-06: "no play video
     button"), from where it was stopped, with a way back to the beginning. */
  it("plays on arrival, and offers the beginning when it resumed", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />,
      { ui: {}, videos: { [a.id]: { opened: 1000, at: 192000 } } });
    expect(screen.getByTestId("yt-player")).toBeTruthy();
    expect(screen.queryByTestId("video-play")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("video-restart")); });
    expect(global.__seek).toHaveBeenCalledWith(0, 0);
  });

  it("records the video as opened", async () => {
    await withProfile(<Video route={{ params: { videoId: b.id } }} navigation={nav} />);
    expect(watchHistory()[0].id).toBe(b.id);
  });

  /* The transport sits over the picture, maximised or not (the owner,
     2026-10-05): back and forward five seconds always in the corner, the rest
     on a touch — play/pause, speed, the cog — and no row under the player. */
  it("puts back 5 and forward 5 over the picture always, the rest on a touch", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    // Every press awaited inside act: an un-awaited one overlapping the others
    // left the renderer a render behind and broke the tests after this one.
    const press = (id) => act(async () => { fireEvent.press(screen.getByTestId(id)); });
    expect(screen.getByTestId("video-overlay")).toBeTruthy();
    // By the set skip (video.js skipMsOf), the default here.
    await press("overlay-back5");
    expect(global.__skip).toHaveBeenCalledWith(-DEFAULT_SKIP * 1000, 0, 0);
    await press("overlay-fwd5");
    expect(global.__skip).toHaveBeenCalledWith(DEFAULT_SKIP * 1000, 0, 0);
    expect(screen.getByTestId("overlay-scrub")).toBeTruthy();
    // Paused (the player has not reported playing), the rest stay up.
    await press("overlay-toggle");
    expect(global.__toggle).toHaveBeenCalled();
    expect(screen.getByTestId("overlay-rate").props.children).toBe("1×");
    await press("overlay-faster");
    expect(screen.getByTestId("overlay-rate").props.children).toBe("1.25×");
    await press("overlay-slower");
    await press("overlay-slower");
    expect(screen.getByTestId("overlay-rate").props.children).toBe("0.75×");
    expect(global.__rate).toHaveBeenLastCalledWith(0.75);
  });

  it("steps the speed down and up through the API's own rates, and stops at the ends", async () => {
    const rate = jest.fn();
    function Host() {
      const [r, setR] = React.useState(1);
      const player = React.useRef({ rate, skip: jest.fn(), toggle: jest.fn() });
      return <VideoOverlay player={player} playing={false} rate={r} onRate={setR}
                           full={false} onFull={() => {}} onCog={() => {}} />;
    }
    await render(<Host />);
    const label = () => screen.getByTestId("overlay-rate").props.children;
    await act(async () => { fireEvent.press(screen.getByTestId("overlay-faster")); });
    expect(label()).toBe("1.25×");
    await act(async () => { fireEvent.press(screen.getByTestId("overlay-slower")); });
    await act(async () => { fireEvent.press(screen.getByTestId("overlay-slower")); });
    expect(label()).toBe("0.75×");
    expect(rate).toHaveBeenLastCalledWith(0.75);
    for (let k = 0; k < 6; k++) await act(async () => { fireEvent.press(screen.getByTestId("overlay-slower")); });
    expect(label()).toBe(`${VIDEO_SPEEDS[0]}×`);            // stops at the slowest
  });

  /* Playing, everything but the five-second skips leaves after a moment, and
     a touch on the picture brings it back. */
  it("hides the rest of the controls shortly after a touch while playing", async () => {
    jest.useFakeTimers();
    try {
      const player = { current: { rate: jest.fn(), skip: jest.fn(), toggle: jest.fn() } };
      await render(<VideoOverlay player={player} playing rate={1} onRate={() => {}}
                                 full={false} onFull={() => {}} onCog={() => {}} />);
      expect(screen.queryByTestId("overlay-toggle")).toBeNull();
      expect(screen.getByTestId("overlay-back5")).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByTestId("overlay-touch")); });
      expect(screen.getByTestId("overlay-toggle")).toBeTruthy();
      expect(screen.getByTestId("overlay-cog")).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(2000); });
      expect(screen.queryByTestId("overlay-toggle")).toBeNull();
      expect(screen.getByTestId("overlay-fwd5")).toBeTruthy();
    } finally { jest.useRealTimers(); }
  });

  /* The scrubber seeks once, on release, to where the finger let go. */
  it("seeks from the scrubber on release", async () => {
    const seekTo = jest.fn();
    const player = { current: { rate: jest.fn(), skip: jest.fn(), toggle: jest.fn(), seekTo } };
    await render(<VideoOverlay player={player} playing={false} rate={1} onRate={() => {}} length={100000}
                               full={false} onFull={() => {}} onCog={() => {}} />);
    const bar = screen.getByTestId("overlay-scrub");
    await act(async () => { fireEvent(bar, "layout", { nativeEvent: { layout: { width: 200 } } }); });
    await act(async () => { fireEvent(bar, "responderGrant", { nativeEvent: { locationX: 50 } }); });
    expect(seekTo).not.toHaveBeenCalled();
    await act(async () => { fireEvent(bar, "responderRelease", { nativeEvent: { locationX: 100 } }); });
    expect(seekTo).toHaveBeenCalledWith(50000);
  });

  /* The cog: subtitles (on by default) and a way out to YouTube. */
  it("turns subtitles off from the cog, and remembers", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    await act(async () => { fireEvent.press(screen.getByTestId("overlay-cog")); });
    expect(screen.getByTestId("video-captions").props.value).toBe(true);
    expect(screen.getByTestId("video-youtube")).toBeTruthy();
    await act(async () => { fireEvent(screen.getByTestId("video-captions"), "valueChange", false); });
    expect(global.__captions).toHaveBeenLastCalledWith(false);
    expect(libraryState().cc).toBe(false);
  });

  it("starts at the beginning when it was never played", async () => {
    await withProfile(<Video route={{ params: { videoId: a.id } }} navigation={nav} />);
    expect(screen.getByTestId("yt-player")).toBeTruthy();
    expect(screen.queryByTestId("video-restart")).toBeNull();
  });
});
