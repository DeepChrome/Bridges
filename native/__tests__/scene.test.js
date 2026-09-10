/* The written lesson passage on screen (§30j).
 *
 * The generator is covered in tools/core.test.mjs and the Russian itself by
 * tools/check_scripts.mjs. What is asserted here is only what a person sees and
 * presses: that nothing plays until Play is pressed, that the sentences are read
 * one at a time with a way back to any of them, that the screen says whose voice
 * this is, and that the answers grade.
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
import { probeVoices, hasRealAudio } from "../src/audio";

/* The first scripted lesson that builds — the first chapter's opening lesson in
   practice, which is the whole point: the passage a learner meets on day one. */
const byId = new Map(UN.map((u) => [u.id, u]));
const question = (() => {
  for (const key of Object.keys(SCRIPTS)) {
    const [id, i] = key.split(":");
    const s = Q.scriptScene(byId.get(id), Number(i));
    if (s) return s;
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
  // These sentences have no recording, so every one of them is the device
  // voice — and the device voice is silent until the voice probe has landed.
  // The shell awaits it at boot; a test rendering the activity alone must too.
  await probeVoices();
});

afterEach(async () => { await flushState(); });

describe("the written lesson passage", () => {
  it("ships one that builds", () => {
    expect(question).toBeTruthy();
    expect(question.written).toBe(true);
    expect(question.rows.length).toBeGreaterThanOrEqual(4);
  });

  it("shows the questions and plays nothing until Play is pressed", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    question.questions.forEach((_, k) => expect(screen.getByTestId(`scene-q-${k}`)).toBeTruthy());
    expect(global.__played).toHaveLength(0);
    expect(global.__spoke).toHaveLength(0);
  });

  it("says which passage this is and whose voice reads it", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    // No recording exists for a sentence nobody has ever said, so this is the
    // device voice and §27 says the screen must not leave that to be assumed.
    // The collection turns out to hold recordings for some written sentences —
    // «Кто это?» is a thing people say — so the note has to match what will
    // actually sound, in both directions: no silent TTS passed off as a
    // recording, and no recording apologised for as TTS.
    const real = question.rows.filter((r) => hasRealAudio(r.ru)).length;
    const line = String(screen.getByTestId("scene-voice").props.children);
    expect(/device voice/.test(line)).toBe(real < question.rows.length);
    const about = String(screen.getByTestId("scene-about").props.children);
    expect(about).toContain(question.topic);
    expect(about).toContain(question.level);
  });

  it("reads the first sentence when Play is pressed", async () => {
    await withScene();
    const play = await screen.findByTestId("scene-play");
    await act(async () => { fireEvent.press(play); });
    await waitFor(() => expect(global.__spoke.length + global.__played.length).toBeGreaterThan(0));
    // A real recording where the collection has one, the device voice otherwise.
    if (hasRealAudio(question.rows[0].ru)) expect(global.__played[0]).toContain("/audio/");
    else expect(global.__spoke[0]).toBe(question.rows[0].ru);
  });

  it("has a button per sentence that plays that sentence again", async () => {
    await withScene();
    await screen.findByTestId("scene-play");
    // The owner asked for the YouTube-style five-second skip. For one continuous
    // recording that is right; five separate sentences have a better unit, and
    // the sentence is it — nobody wants to land three words into the third line.
    const last = question.rows.length - 1;
    expect(screen.getByTestId(`scene-again-${last}`)).toBeTruthy();
    expect(screen.queryByTestId(`scene-again-${last + 1}`)).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId(`scene-again-${last}`)); });
    await waitFor(() => expect(global.__spoke.length + global.__played.length).toBeGreaterThan(0));
    if (hasRealAudio(question.rows[last].ru)) expect(global.__played).toHaveLength(1);
    else expect(global.__spoke[global.__spoke.length - 1]).toBe(question.rows[last].ru);
  });

  it("grades the answers and shows the sentences with their meanings", async () => {
    const onFinish = jest.fn();
    await withScene(onFinish);
    await screen.findByTestId("scene-play");
    for (let k = 0; k < question.questions.length; k++) {
      const right = question.questions[k].options.find((o) => o.right);
      // Scoped to its own question: two questions in one passage may legitimately
      // offer the same English, and a bare text lookup then matches both.
      const box = within(screen.getByTestId(`scene-q-${k}`));
      await act(async () => { fireEvent.press(box.getByText(right.label)); });
    }
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    // Every sentence and its meaning are readable afterwards, so a missed one
    // can be gone back over.
    await waitFor(() => expect(screen.getAllByText(question.rows[0].en).length).toBeGreaterThan(0));
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onFinish.mock.calls[0][0].right).toBe(1);
  });
});
