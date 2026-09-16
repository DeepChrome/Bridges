/* The listening scenario on screen (§30k).
 *
 * Rebuilt 2026-09-10 with the activity. The generator is covered in
 * tools/core.test.mjs and the Russian itself by tools/check_scripts.mjs; the
 * timeline arithmetic has its own file (scenario.test.js). What is asserted
 * here is what a person sees and presses:
 *
 *   - the five questions are readable before anything plays, and nothing plays
 *     until Play is pressed — the owner's "the questions are available for them
 *     before the audio even starts";
 *   - the conversation runs as one piece, in the voices of its speakers;
 *   - it can be moved backwards and started again, any number of times;
 *   - nothing says in Russian what is being said out loud until it is answered.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { Q } from "../src/questions";
import { UN, SCRIPTS } from "../src/data";
import { probeVoices } from "../src/audio";

/* The first scripted lesson that builds — the first chapter's opening lesson in
   practice, which is the whole point: the scenario a learner meets on day one. */
const byId = new Map(UN.map((u) => [u.id, u]));
const question = (() => {
  for (const key of Object.keys(SCRIPTS)) {
    const [id, i] = key.split(":");
    const s = Q.scriptScene(byId.get(id), Number(i));
    if (s && s.scenario) return s;
  }
  return null;
})();

/* The same scenario with one word changed, so its text no longer hashes to the
   audio that was bought for it. That is how a lesson reaches the device voices
   now: a corpus scene, a phone without the assets, or a script edited without
   re-running the audio tools. Both paths ship, so both are tested. */
const spoken = question && {
  ...question,
  lines: question.lines.map((l, i) => (i ? l : { ...l, ru: `${l.ru} Правда?` })),
};

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withScene(onFinish = jest.fn(), step = question) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(
    <SessionProvider>
      <Runner steps={[step]} recycle={false} onFinish={onFinish} />
    </SessionProvider>
  );
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__played = [];
  global.__spoke = [];
  global.__spokeOpts = [];
  // A written conversation has no recording, so every line is the device voice
  // — and the device voice is silent until the voice probe has landed. The
  // shell awaits it at boot; a test rendering the activity alone must too.
  await probeVoices();
});

afterEach(async () => {
  global.__audioNeverFinish = false;
  await flushState();
});

describe("the listening scenario", () => {
  it("ships one that builds, with a cast and five questions", () => {
    expect(question).toBeTruthy();
    expect(question.written).toBe(true);
    expect(question.cast.length).toBeGreaterThanOrEqual(2);
    expect(question.lines.length).toBeGreaterThanOrEqual(8);
    expect(question.questions).toHaveLength(5);
    // Every line belongs to somebody in the cast.
    const ids = new Set(question.cast.map((c) => c.id));
    expect(question.lines.every((l) => ids.has(l.s))).toBe(true);
  });

  it("shows the questions and plays nothing until Play is pressed", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    question.questions.forEach((_, k) => expect(screen.getByTestId(`scene-q-${k}`)).toBeTruthy());
    expect(global.__played).toHaveLength(0);
    expect(global.__spoke).toHaveLength(0);
  });

  it("keeps the Russian off the screen until it has been answered", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    expect(screen.queryByTestId("scene-transcript")).toBeNull();
    // Not even one line of it: reading along is not listening.
    expect(screen.queryByText(question.lines[0].ru)).toBeNull();
  });

  it("says what this is, and says nothing about voices when the audio is real", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    /* The conversation is played from a file made for it, so there is nothing
       to disclose: §27's note exists to stop the phone's own reading being
       mistaken for a recording, and a note over audio that is neither the
       phone's nor the collection's would be the same lie pointed the other
       way. The recorded line is the one that needs no note. */
    expect(screen.queryByTestId("scene-voice")).toBeNull();
    /* The conversation's own title heads the activity, and the unit's name sits
       under the transport: a learner who listened to a scene could not say what
       it had been called. */
    expect(String(screen.getByTestId("scene-title").props.children)).toBe(question.topic);
    expect(String(screen.getByTestId("scene-about").props.children)).toBe(question.level);
  });

  it("says it is the device when the text has moved on from the audio", async () => {
    await withScene(jest.fn(), spoken);
    await screen.findByTestId("scene-play");
    expect(String(screen.getByTestId("scene-voice").props.children)).toContain("device voice");
  });

  it("plays the conversation as one piece", async () => {
    await withScene();
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    // One file, one player — not a line at a time, and not the device.
    await waitFor(() => expect(global.__played.length).toBe(1));
    expect(global.__spoke).toHaveLength(0);
    expect(global.__players[0].play).toHaveBeenCalled();
  });

  /* Three-quarter speed (PLAYBOOK 3.4). The slow button is the one control a
     listener reaches for that the app did not have; what it has to do is
     reach the player, not merely change its own label. */
  it("plays slower when asked, and back at full speed when asked again", async () => {
    await withScene();
    const slow = await screen.findByTestId("scene-slow");
    // It offers the thing it will do, not the state it is in.
    expect(slow).toHaveTextContent("¾×");
    await act(async () => { fireEvent.press(slow); });
    expect(screen.getByTestId("scene-slow")).toHaveTextContent("1×");

    await act(async () => { fireEvent.press(screen.getByTestId("scene-play")); });
    // `global.__players` accumulates across this file (only `__played` is
    // cleared between tests), so the one that matters is the newest.
    await waitFor(() => expect(global.__played).toHaveLength(1));
    const player = global.__players[global.__players.length - 1];
    expect(player.setPlaybackRate).toHaveBeenCalledWith(0.75, "high");

    await act(async () => { fireEvent.press(screen.getByTestId("scene-slow")); });
    expect(screen.getByTestId("scene-slow")).toHaveTextContent("¾×");
  });

  it("reads each speaker in their own voice when it falls back", async () => {
    await withScene(jest.fn(), spoken);
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(1));
    expect(global.__spoke[0]).toBe(spoken.lines[0].ru);
    expect(global.__spoke[1]).toBe(spoken.lines[1].ru);
    // The first two lines are different people, and they do not sound the same.
    expect(spoken.lines[0].s).not.toBe(spoken.lines[1].s);
    const voiceOf = (o) => `${o.voice}/${o.pitch}`;
    expect(voiceOf(global.__spokeOpts[0])).not.toBe(voiceOf(global.__spokeOpts[1]));
  });

  /* The owner, 2026-09-11: *"if the listening window is closed, it should cut
     any actively playing audio"* — and *"when I pause the app, it just
     continues"*. Both are the same thing: a player let go with `remove()` alone
     keeps making a noise, so what has to be asserted is silence, not that the
     app dropped its handle. */
  it("goes quiet when it is paused", async () => {
    // A half-minute conversation is still running when the button is pressed.
    global.__audioNeverFinish = true;
    await withScene();
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    await waitFor(() => expect(global.__sounding().length).toBe(1));
    await act(async () => { fireEvent.press(screen.getByTestId("scene-play")); });
    expect(global.__sounding()).toHaveLength(0);
  });

  it("goes quiet when the screen is closed", async () => {
    global.__audioNeverFinish = true;
    const view = await withScene();
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    await waitFor(() => expect(global.__sounding().length).toBe(1));
    await act(async () => { view.unmount(); });
    expect(global.__sounding()).toHaveLength(0);
  });

  /* The bar is a control now, and what makes it one is in the tree: a target big
     enough to hit and the responder handlers a gesture needs. Where a touch
     lands is arithmetic and is tested as arithmetic (scenario.test.js `msFor`);
     driving PanResponder from here would be asserting the framework, as
     motion.test.js says of two of its own cases. */
  it("offers the bar as something to press and drag", async () => {
    await withScene();
    const bar = await screen.findByTestId("scene-scrub");
    expect(bar.props.style.height).toBe(44);
    expect(bar.props.accessibilityRole).toBe("adjustable");
    expect(typeof bar.props.onStartShouldSetResponder).toBe("function");
    expect(typeof bar.props.onResponderMove).toBe("function");
  });

  it("can be moved back and played again as often as wanted", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    // The transport is three controls and no more: back, play, from the start.
    expect(screen.getByTestId("scene-back")).toBeTruthy();
    expect(screen.getByTestId("scene-restart")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("scene-back")); });
    await waitFor(() => expect(global.__played.length).toBeGreaterThan(0));
    const after = global.__played.length;
    const first = global.__players[global.__players.length - 1];
    await act(async () => { fireEvent.press(screen.getByTestId("scene-restart")); });
    await waitFor(() => expect(global.__played.length).toBeGreaterThan(after));
    /* Every replay is a new player: the one before it is removed rather than
       paused, or it would sit on the Android audio session (§23). */
    expect(first.remove).toHaveBeenCalled();
    // Replays are never counted against the learner (the owner's rule, §30c).
    expect(screen.queryByText(/replay/i)).toBeNull();
  });

  it("grades the answers and shows the conversation with its meaning", async () => {
    const onFinish = jest.fn();
    await withScene(onFinish);
    await screen.findByTestId("scene-play");
    for (let k = 0; k < question.questions.length; k++) {
      const right = question.questions[k].options.find((o) => o.right);
      // Scoped to its own question: two questions may legitimately offer the
      // same English, and a bare text lookup then matches both.
      const box = within(screen.getByTestId(`scene-q-${k}`));
      await act(async () => { fireEvent.press(box.getByText(right.label)); });
    }
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    // Now the transcript: every line, who said it, and what it meant.
    await waitFor(() => expect(screen.getByTestId("scene-transcript")).toBeTruthy());
    expect(screen.getAllByText(question.lines[0].en).length).toBeGreaterThan(0);
    const who = question.cast.find((c) => c.id === question.lines[0].s);
    expect(screen.getAllByText(who.ru.toUpperCase()).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onFinish.mock.calls[0][0].right).toBe(1);
  });
});
