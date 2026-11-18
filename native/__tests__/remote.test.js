/* External controls on the controls a screen already has (src/remote.js;
   CLAUDE.md 30cy). A headset's play/pause and skip keys, arriving through the
   native bridge, land on the video's play-pause and its back/forward five
   seconds, and on drive mode's play key and Previous/Next. The bridge is a
   mock (jest.setup `__remote`): whether Android delivers the key is the
   phone's to prove, this is where it goes once it has. */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession } from "../src/session";
import { flushState } from "../src/store";
import { Video } from "../src/screens/Video";
import { DriveEpisode } from "../src/screens/Drive";
import { videos } from "../src/data";
import { remoteKey, resetRemote } from "../src/remote";
import * as audio from "../src/audio";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    global.__ytProps = props;
    React.useImperativeHandle(ref, () => ({ seek: jest.fn(), pause: global.__pause, watch: jest.fn(),
      toggle: global.__toggle, rate: jest.fn(), skip: global.__skip, captions: jest.fn(), seekTo: jest.fn() }));
    return React.createElement(View, { testID: "yt-player" });
  }) };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: jest.fn(() => () => {}) };
function WhenReady({ children }) { return useSession().ready ? children : null; }
async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
    speech: { attempts: [], tagCounts: {} }, streak: 0, notices: { immerse: 1 }, dev: false, flash: ["recognise"] }));
  const r = await render(<SessionProvider><WhenReady>{ui}</WhenReady></SessionProvider>);
  await screen.findByTestId("screen-root");
  return r;
}
const press = (key) => act(async () => { global.__remote.press(key); });
const v = videos().find((x) => x.dur > 300);

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); resetRemote();
  // The bridge's listener is subscribed once for the process (remote.js keeps it), so it stays.
  global.__remote.started = null; global.__remote.playing = null; global.__remote.stopped = 0;
  global.__toggle = jest.fn(); global.__skip = jest.fn(); global.__pause = jest.fn();
  global.__spoke = []; global.__players = []; global.__played = [];
});
afterEach(async () => { await flushState(); });

describe("the video player", () => {
  it("holds the session while it plays, and lets go on leaving", async () => {
    const r = await withProfile(<Video route={{ params: { videoId: v.id } }} navigation={nav} />);
    expect(global.__remote.started).toBe(v.title);
    await act(async () => { r.unmount(); });
    expect(global.__remote.stopped).toBe(1);
  });

  it("skip keys are back and forward five seconds; play/pause is the player's", async () => {
    await withProfile(<Video route={{ params: { videoId: v.id } }} navigation={nav} />);
    await press("next");
    expect(global.__skip).toHaveBeenLastCalledWith(5000, 0, 0);
    await press("forward");
    expect(global.__skip).toHaveBeenLastCalledWith(5000, 0, 0);
    await press("previous");
    expect(global.__skip).toHaveBeenLastCalledWith(-5000, 0, 0);
    await press("rewind");
    expect(global.__skip).toHaveBeenLastCalledWith(-5000, 0, 0);
    expect(global.__skip).toHaveBeenCalledTimes(4);
    await press("toggle");
    expect(global.__toggle).toHaveBeenCalledTimes(1);
    await press("pause");
    expect(global.__pause).toHaveBeenCalledTimes(1);
    // Play on a paused video is the player's toggle; on a playing one nothing.
    await press("play");
    expect(global.__toggle).toHaveBeenCalledTimes(2);
  });

  /* The session's own state follows the video, so the lock screen and the
     keys' routing know whether it is playing. */
  it("tells the session when the video plays and pauses", async () => {
    await withProfile(<Video route={{ params: { videoId: v.id } }} navigation={nav} />);
    expect(global.__remote.playing).toBe(false);
    // The player reports playing and paused through onState, as the real one does.
    await act(async () => { global.__ytProps.onState(true); });
    expect(global.__remote.playing).toBe(true);
    await act(async () => { global.__ytProps.onState(false); });
    expect(global.__remote.playing).toBe(false);
  });
});

describe("drive mode", () => {
  async function openEpisode() {
    return withProfile(<DriveEpisode route={{ params: { id: 1 } }} />);
  }
  const label = () => screen.getByTestId("drive-play").props.accessibilityLabel;

  it("takes the keys for the episode, and the drive's own title", async () => {
    await openEpisode();
    expect(global.__remote.started).toBe("Episode 1");
    expect(global.__remote.playing).toBe(false);
  });

  /* The drive's pauses are real seconds (drive.test.js), so this runs long. */
  jest.setTimeout(30000);
  it("play starts, pause pauses, play resumes; skip keys are Previous and Next", async () => {
    await openEpisode();
    await press("play");
    await screen.findByTestId("drive-en", {}, { timeout: 5000 });
    expect(label()).toBe("Pause");
    expect(global.__remote.playing).toBe(true);
    await press("pause");
    expect(label()).toBe("Play");
    expect(global.__sounding()).toEqual([]);
    await press("toggle");
    expect(label()).toBe("Pause");
    // Next and Previous move the mark the big keys move; nothing throws, the drive stays playing.
    const before = global.__spoke.length;
    await press("next");
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(before));
    expect(label()).toBe("Pause");
    await press("previous");
    expect(label()).toBe("Pause");
  });
});

describe("nobody in charge", () => {
  it("pause and toggle stop the app's sound; the rest do nothing", () => {
    const stop = jest.spyOn(audio, "stop").mockImplementation(() => {});
    remoteKey("pause");
    remoteKey("toggle");
    expect(stop).toHaveBeenCalledTimes(2);
    remoteKey("next"); remoteKey("previous"); remoteKey("play");
    expect(stop).toHaveBeenCalledTimes(2);
    stop.mockRestore();
  });
});
