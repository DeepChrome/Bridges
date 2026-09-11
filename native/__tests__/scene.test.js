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

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withScene(onFinish = jest.fn()) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(
    <SessionProvider>
      <Runner steps={[question]} recycle={false} onFinish={onFinish} />
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

afterEach(async () => { await flushState(); });

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

  it("says what this is and whose voices read it", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    // Nobody has ever said these sentences, so this is the device — §27 says
    // that is never left to be assumed.
    expect(String(screen.getByTestId("scene-voice").props.children)).toContain("device voice");
    const about = String(screen.getByTestId("scene-about").props.children);
    expect(about).toContain(question.topic);
  });

  it("runs the conversation from the top, each speaker in their own voice", async () => {
    await withScene();
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(1));
    expect(global.__spoke[0]).toBe(question.lines[0].ru);
    expect(global.__spoke[1]).toBe(question.lines[1].ru);
    // The first two lines are different people, and they do not sound the same.
    expect(question.lines[0].s).not.toBe(question.lines[1].s);
    const voiceOf = (o) => `${o.voice}/${o.pitch}`;
    expect(voiceOf(global.__spokeOpts[0])).not.toBe(voiceOf(global.__spokeOpts[1]));
  });

  it("can be moved back and played again as often as wanted", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    // The transport is three controls and no more: back, play, from the start.
    expect(screen.getByTestId("scene-back")).toBeTruthy();
    expect(screen.getByTestId("scene-restart")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("scene-back")); });
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(0));
    const after = global.__spoke.length;
    await act(async () => { fireEvent.press(screen.getByTestId("scene-restart")); });
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(after));
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
