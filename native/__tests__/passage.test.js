/* A listening passage: the player's controls, and that nothing is asked until it
   has been heard (ROADMAP P10.3). Own file, per the note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { ListeningList } from "../src/screens/Flows";
import { passages, L, STAGES } from "../src/data";
import { Q } from "../src/questions";
import { today } from "@core/util";

/* The real player is a WebView; here it records what it was told to do. */
const calls = [];
jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    YouTube: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        seek: (ms, hold) => calls.push(["seek", ms, hold]),
        pause: () => calls.push(["pause"]),
        skip: (d, lo, hi) => calls.push(["skip", d, lo, hi]),
        watch: (on) => calls.push(["watch", on]),
      }));
      global.__ytTime = props.onTime;
      global.__ytError = props.onError;
      return <View testID="yt-player" />;
    }),
  };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  dev: true, xp: 0, streak: 0,
};

const P = passages();
/* Words from well along the route, so a passage actually fits. */
const known = () => {
  const seen = {};
  for (const u of STAGES.slice(0, 12).flatMap((s) => [s.core].concat(s.branches))) {
    for (const i of u.w) {
      seen[L[i].b] = { due: today() + 5, last: today(), s: 3, d: 5, reps: 2, lapses: 0 };
    }
  }
  return seen;
};

async function withProfile(ui, state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  calls.length = 0;
});
afterEach(async () => { await flushState(); });

describe("a listening passage", () => {
  const passage = P[0];
  const step = {
    kind: "passage", video: passage.v, title: passage.title,
    start: passage.start, end: passage.end,
  };

  it("plays, skips five seconds either way, and stays inside its own span", async () => {
    await withProfile(<Runner steps={[step]} onFinish={jest.fn()} gradeWords={false} />);
    await screen.findByTestId("yt-player");
    // Nothing is asked before it has been heard.
    expect(screen.queryByTestId("passage-done")).toBeNull();
    expect(screen.getByText(/Listen once through/)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId("passage-play")); });
    expect(calls.find((c) => c[0] === "seek")).toEqual(["seek", passage.start, 0]);
    // Position reports start with playback. The mount turns them off first, so
    // it is the latest call that matters, not the first.
    expect(calls.filter((c) => c[0] === "watch").pop()).toEqual(["watch", true]);

    await act(async () => { fireEvent.press(screen.getByTestId("skip-back")); });
    await act(async () => { fireEvent.press(screen.getByTestId("skip-fwd")); });
    const skips = calls.filter((c) => c[0] === "skip");
    expect(skips).toHaveLength(2);
    // Clamped to the passage, so five back at the start does not land in the
    // middle of whatever came before it in the video.
    for (const s of skips) {
      expect(s[2]).toBe(passage.start);
      expect(s[3]).toBe(passage.end);
    }
    expect(skips[0][1]).toBeLessThan(0);
    expect(skips[1][1]).toBeGreaterThan(0);
  });

  /* The control the activity exists for. It used to be dead after the first
     listen: play() left `at` past the end, so the stop effect paused again the
     moment it re-ran. */
  it("plays again after it has run to the end", async () => {
    await withProfile(<Runner steps={[step]} onFinish={jest.fn()} gradeWords={false} />);
    await screen.findByTestId("yt-player");
    await act(async () => { fireEvent.press(screen.getByTestId("passage-play")); });
    await act(async () => { global.__ytTime(passage.end + 100); });
    expect(await screen.findByText("Again")).toBeTruthy();

    calls.length = 0;
    await act(async () => { fireEvent.press(screen.getByTestId("passage-play")); });
    expect(calls.find((c) => c[0] === "seek")).toEqual(["seek", passage.start, 0]);
    // …and it keeps playing rather than stopping on the spot.
    expect(calls.some((c) => c[0] === "pause")).toBe(false);
    expect(screen.getByText("Pause")).toBeTruthy();
  });

  it("offers the questions once the passage has played out", async () => {
    const onFinish = jest.fn();
    await withProfile(<Runner steps={[step]} onFinish={onFinish} gradeWords={false} />);
    await screen.findByTestId("yt-player");
    await act(async () => { fireEvent.press(screen.getByTestId("passage-play")); });
    // The player reports its way to the end of the span.
    await act(async () => { global.__ytTime(passage.end + 100); });
    expect(await screen.findByTestId("passage-done")).toBeTruthy();
    expect(calls.some((c) => c[0] === "pause")).toBe(true);
    await act(async () => { fireEvent.press(screen.getByTestId("passage-done")); });
    // The runner shows its verdict first; Continue is what ends a run.
    await act(async () => { fireEvent.press(await screen.findByText("Continue")); });
    expect(onFinish).toHaveBeenCalled();
    /* The passage is a gate, not a question. Recording it as right handed every
       learner a free mark and inflated the score the list shows, so it is
       skipped — which the runner leaves out of the total. */
    const r = onFinish.mock.calls[0][0];
    expect(r.skipped).toBe(1);
    expect(r.right).toBe(0);
  });

  /* Some videos refuse to embed at all (youtube.js, errors 101 and 150). The
     player is hidden here, so its own message would never be seen: without this
     the learner presses Play, hears nothing, and is told to listen once through
     for ever. */
  it("names a video that will not play and lets the learner move on", async () => {
    const onFinish = jest.fn();
    await withProfile(<Runner steps={[step]} onFinish={onFinish} gradeWords={false} />);
    await screen.findByTestId("yt-player");
    await act(async () => { global.__ytError(150, true); });
    expect(await screen.findByTestId("passage-dead")).toBeTruthy();
    expect(screen.queryByTestId("passage-done")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Skip it")); });
    await act(async () => { fireEvent.press(await screen.findByText("Continue")); });
    expect(onFinish.mock.calls[0][0].skipped).toBe(1);
  });
});

describe("the listening list", () => {
  it("offers nothing to a learner with no words, and passages once there are some", async () => {
    await withProfile(<ListeningList navigation={nav} />);
    expect(await screen.findByText("Not yet")).toBeTruthy();

    await flushState();
    await AsyncStorage.clear();
    await withProfile(<ListeningList navigation={nav} />, { seen: known() });
    const fitted = Q.passagesFor(P, new Set(Object.keys(known())), 30);
    expect(fitted.length).toBeGreaterThan(0);
    expect(await screen.findByText(`${fitted.length} passages`)).toBeTruthy();
    // Richest in the learner's own words first, and each says how many.
    expect(screen.getByTestId(`passage-${fitted[0].id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`passage-${fitted[0].id}`));
    expect(nav.navigate).toHaveBeenCalledWith("Passage", { id: fitted[0].id });
  });
});
