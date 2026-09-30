/* Shadowing (ROADMAP P10.6): hear a sentence, say it straight back.
 *
 * What is asserted is what separates it from the two sentence activities the
 * app already had. The Russian must not be on screen before the attempt — with
 * it there this is reading aloud, which is Say — and replaying the model must
 * not cost the grade, because repetition is the method rather than a hint.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, VIEWS } from "../src/screens/Run";
import { Q } from "../src/questions";
import { STAGES, AUDIO } from "../src/data";
import { probeVoices, hasRealAudio } from "../src/audio";
import { fold } from "@core/util";
import { SPEECH_SKIP_TOP } from "@core/speech";

/* A sentence with a content word in it — only those are graded (§30c). */
const units = STAGES.slice(0, 4).flatMap((s) => [s.core].concat(s.branches));
const step = (() => {
  for (let k = 0; k < 40; k++) {
    const d = Q.shadowDrill(units, 6);
    const hit = d.find((x) => x.lemmas.some((i) => i >= SPEECH_SKIP_TOP));
    if (hit) return hit;
  }
  return null;
})();

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withShadow(onFinish = jest.fn()) {
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

async function speak(transcript) {
  const hold = screen.getByTestId("say-hold");
  await act(async () => { fireEvent(hold, "pressIn"); });
  await act(async () => { fireEvent(hold, "pressOut"); });
  await act(async () => {
    global.__stt.emit("result", { isFinal: true, results: [{ transcript, confidence: 0.9 }] });
  });
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  if (global.__stt) global.__stt.reset();
  global.__played = [];
  global.__spoke = [];
  await probeVoices();
});
afterEach(async () => { await flushState(); });

describe("the shadowing drill", () => {
  it("draws only sentences that have a real recording", () => {
    expect(step).toBeTruthy();
    const drill = Q.shadowDrill(units, 6);
    expect(drill.length).toBeGreaterThan(0);
    // Shadowing a device voice would be shadowing a robot's rhythm, which is
    // the one thing the exercise is for.
    drill.forEach((s) => {
      expect(s.kind).toBe("shadow");
      expect(typeof VIEWS[s.kind]).toBe("function");
      // A recording from the collection, or one bought for the video's own
      // sentences (2026-09-29): either is a real recording, never the device.
      expect(hasRealAudio(s.target)).toBe(true);
    });
  });

  it("plays the model on arrival and hides the Russian until the answer is in", async () => {
    await withShadow();
    await screen.findByTestId("shadow-play");
    expect(global.__played.length + global.__spoke.length).toBeGreaterThan(0);
    expect(screen.queryByText(step.target)).toBeNull();
    expect(screen.queryByText(step.en)).toBeNull();
  });

  it("replays as often as asked, and it costs nothing", async () => {
    await withShadow();
    const play = await screen.findByTestId("shadow-play");
    const before = global.__played.length + global.__spoke.length;
    for (let k = 0; k < 4; k++) await act(async () => { fireEvent.press(play); });
    expect(global.__played.length + global.__spoke.length).toBe(before + 4);
    // A perfect repeat is still perfect after four plays: this is not Hear,
    // where the recording is the question.
    await speak(step.target);
    expect(await screen.findByText("Correct")).toBeTruthy();
  });

  it("shows the sentence and its meaning once the attempt is made", async () => {
    await withShadow();
    await screen.findByTestId("shadow-play");
    await speak(step.target);
    await waitFor(() => expect(screen.getByText(step.en)).toBeTruthy());
  });

  it("logs the attempt as shadowing, with how many plays it took", async () => {
    await withShadow();
    await screen.findByTestId("shadow-play");
    await speak(step.target);
    await screen.findByTestId("verdict");
    await flushState();
    const st = (await global.__db.saved("p1"));
    const last = st.speech.attempts[st.speech.attempts.length - 1];
    expect(last.kind).toBe("shadow");
    expect(typeof last.plays).toBe("number");
  });
});
