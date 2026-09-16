/* Word building (core/buildup.js, activities/Build.js).
 *
 * The splitting is tested in core.test.mjs. What is tested here is the thing a
 * learner meets: the word and its meaning staying put, the two readings that
 * open a word, the fragment they hear being the fragment on the screen, one
 * voice throughout, and a mouth drill putting no word into the scheduler.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { BuildDrillFlow } from "../src/screens/Flows";
import { probeVoices } from "../src/audio";
import { buildupDrill, buildup } from "@core/buildup";

const WORD = { ru: "понима́ю", en: "I understand" };
const OTHER = { ru: "спаси́бо", en: "thank you" };
const steps = buildupDrill([WORD], 1);

/* What reaches the voice: the stress marks come off on the way to the speech
   engine (audio.js), which never sees a combining accent. The screen keeps
   them, so the two are compared through this. */
const spokenForm = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");

const accounts = { list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" };

async function withBuild(onFinish = jest.fn(), use = steps, props = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
    speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
  }));
  return await render(
    <SessionProvider>
      <Runner steps={use} recycle={false} onFinish={onFinish} {...props} />
    </SessionProvider>,
  );
}

/* Past the two readings that open a word, without waiting out the pauses.
   Pressing Start is what a learner who has heard enough does, so the shortcut
   is a real control rather than a test-only hatch. */
async function begin() {
  await act(async () => { fireEvent.press(await screen.findByText("Start")); });
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__spoke = [];
  global.__played = [];
  if (global.__stt) global.__stt.reset();
  await probeVoices();
});
afterEach(async () => { await flushState(); });

describe("building a word", () => {
  it("ships a drill whose fragments grow forwards", () => {
    expect(steps).toHaveLength(1);
    const f = buildup(WORD.ru);
    expect(f[0]).toBe("по");
    expect(f[f.length - 1]).toBe(WORD.ru);
    expect(f.every((x, i) => i === 0 || x.startsWith(f[i - 1]))).toBe(true);
    expect(steps[0].steps).toEqual(f);
    // Off unless the learner asked for it on the way in (Flows.js).
    expect(steps[0].listen).toBe(false);
  });

  /* "Start by having the prompt say the full word twice with a brief pause in
     between, and then starting with the syllables" — the owner, 2026-09-16.
     You cannot aim at a target you have not heard. */
  it("reads a new word out twice before any syllable", async () => {
    await withBuild();
    const whole = spokenForm(WORD.ru);
    await waitFor(() => expect(global.__spoke.filter((s) => s === whole)).toHaveLength(2));
    // The whole word is what is on the card while it is being read, not a syllable.
    expect(screen.getByTestId("build-fragment")).toHaveTextContent(WORD.ru);
    // …and then the first syllable, on its own.
    await waitFor(() => expect(screen.getByTestId("build-fragment")).toHaveTextContent("по"));
    await waitFor(() => expect(global.__spoke[global.__spoke.length - 1]).toBe("по"));
  });

  it("keeps the word and its meaning on screen the whole way", async () => {
    await withBuild();
    await begin();
    const want = buildup(WORD.ru);
    for (let k = 1; k < want.length; k++) {
      expect(screen.getByTestId("build-word")).toHaveTextContent(WORD.ru);
      expect(screen.getByTestId("build-meaning")).toHaveTextContent("I understand");
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
      expect(screen.getByTestId("build-fragment")).toHaveTextContent(want[k]);
      await waitFor(() => expect(global.__spoke[global.__spoke.length - 1]).toBe(spokenForm(want[k])));
    }
    expect(screen.getByTestId("build-fragment")).toHaveTextContent(WORD.ru);
  });

  /* The owner, 2026-09-16: "the voice sometimes changes to a female pronouncing
     the word when it's the complete word. The voice throughout needs to be the
     same voice." `say()` prefers a recording from the collection; `speakLine`
     is the device throughout, the same rule a written scenario follows (§30l). */
  it("never reaches for a recording, so one voice says every fragment", async () => {
    await withBuild();
    await begin();
    const want = buildup(WORD.ru);
    for (let k = 1; k < want.length; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    }
    await waitFor(() => expect(global.__spoke).toContain(spokenForm(WORD.ru)));
    // Not one player opened: a recording is what a second voice would have been.
    expect(global.__played).toEqual([]);
    expect(screen.getByTestId("build-voice")).toBeTruthy();
  });

  it("replays as often as asked, and does not count it", async () => {
    await withBuild();
    await begin();
    const before = global.__spoke.length;
    for (let k = 0; k < 4; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-play")); });
    }
    expect(global.__spoke.length).toBe(before + 4);
    // Still on the first fragment: hearing it again is not progress.
    expect(screen.getByTestId("build-fragment")).toHaveTextContent("по");
  });

  /* "Introduce controls (like skipping a word, going back to the previous
      word)". `allowBack` is opt-in on the runner — in a quiz this would be a
      way to re-answer a question already marked. */
  it("offers the word before and the word after, and nothing before the first", async () => {
    const two = buildupDrill([WORD, OTHER], 2);
    await withBuild(jest.fn(), two, { allowBack: true });
    await begin();
    // Nothing to go back to yet.
    expect(screen.getByTestId("build-prev").props.accessibilityState).toEqual({ disabled: true });

    await act(async () => { fireEvent.press(screen.getByTestId("build-skip")); });
    await act(async () => { fireEvent.press(await screen.findByText("Continue")); });
    const second = screen.getByTestId("build-word").props.children;
    expect(screen.getByTestId("build-prev").props.accessibilityState).toEqual({ disabled: false });

    await act(async () => { fireEvent.press(screen.getByTestId("build-prev")); });
    expect(screen.getByTestId("build-word").props.children).not.toBe(second);
  });

  /* What the listening half may claim (§30o): it reports, it does not judge,
     and it only listens for the finished word — scoring «пони» would be
     inventing a verdict out of noise. */
  it("listens only when asked, and only for the whole word", async () => {
    const quiet = buildupDrill([WORD], 1, { listen: false });
    const view = await withBuild(jest.fn(), quiet);
    await begin();
    expect(screen.queryByTestId("say-hold")).toBeNull();
    view.unmount();

    await withBuild(jest.fn(), buildupDrill([WORD], 1, { listen: true }));
    await begin();
    const want = buildup(WORD.ru);
    // Not on a fragment.
    expect(screen.queryByTestId("say-hold")).toBeNull();
    for (let k = 1; k < want.length; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    }
    const hold = await screen.findByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [{ transcript: "понимаю", confidence: 0.9 }] });
    });
    // A regex: `toHaveTextContent` with a string matches the whole content, and
    // the line carries the word with its stress mark (§23).
    expect(await screen.findByTestId("build-heard")).toHaveTextContent(/^Heard /);
  });

  /* The screen the drill opens on, rendered for real.
   *
   * It has to be, because the first cut of it used `T.title` in a file that had
   * never imported `type as T`, and a release build died on the tap that opens
   * the drill. Nothing failed: every suite here drove the *activity* through a
   * hand-made `steps` array and none of them had ever mounted the flow around
   * it. A screen no test mounts is a screen with no coverage at all, whatever
   * the count says. Found on the emulator walkthrough, 2026-09-16. */
  it("opens on the question, and the flow itself renders", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
      v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, dev: true,
      speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
    }));
    const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn() };
    const view = await render(
      <SessionProvider><BuildDrillFlow navigation={nav} /></SessionProvider>,
    );
    expect(await view.findByText("Should the phone listen?")).toBeTruthy();
    // Both ways out, and neither is the default.
    expect(view.getByTestId("build-listen-yes")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId("build-listen-no")); });
    expect(await view.findByTestId("build-word")).toBeTruthy();
  });

  /* A mouth drill is not vocabulary. The Pair drill made this rule (§30o) and
     it holds here: nothing the learner says should tell the scheduler they
     know «понимаю». */
  it("finishes without putting a single word into the schedule", async () => {
    const onFinish = jest.fn();
    await withBuild(onFinish);
    await begin();
    const want = buildup(WORD.ru);
    for (let k = 1; k < want.length; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    }
    await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    await act(async () => { fireEvent.press(await screen.findByText("Continue")); });
    expect(onFinish).toHaveBeenCalled();
    await flushState();
    const saved = await global.__db.saved("p1");
    expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
  });
});
