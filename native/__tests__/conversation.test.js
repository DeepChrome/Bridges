/* Conversation mode in the Tutor (2026-09-26): the microphone opens itself
 * after each reply and closes when the learner stops speaking. The owner:
 * *"can you add conversation mode where it just goes back and forth and you
 * dont have to hold the mic?"* — and, when asked where: *"conversation mode
 * is specifically for the AI tutor."*
 *
 * The three things worth pinning, because none of them shows in a render tree
 * and all three are how a hands-free loop goes wrong:
 *   - it never listens while the tutor is speaking (one audio session, §30h′);
 *   - a silent turn does not stall the loop, and a run of them stops it, so
 *     the microphone cannot stay open in an empty room;
 *   - stopping puts the microphone down at once and sends nothing.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import Tutor, { QUIET_LIMIT } from "../src/screens/Tutor";
import { tutor } from "../src/lib/feedback";
import { LISTEN_MAX_MS } from "../src/speech";

jest.mock("../src/lib/feedback", () => ({
  tutor: jest.fn(), talk: jest.fn(), review: jest.fn(), hint: jest.fn(), getFeedback: jest.fn(),
  explain: jest.fn(), translate: jest.fn(),
  config: jest.fn(() => ({ url: "https://worker.test/v1/tutor", token: "t" })),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"],
  tutorHands: true,
};
const GREET = { ok: true, ru: "Привет!", en: "Hi!", note: "What shall we do?", remember: "" };
const REPLY = { ok: true, ru: "Хорошо.", en: "Good.", note: "", remember: "" };

async function open(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(
    <SessionProvider><WordsProvider><Tutor navigation={nav} /></WordsProvider></SessionProvider>,
  );
}
/* Deliver a final result the way the engine does: the result, then "end". */
const hears = async (text) => {
  await act(async () => {
    global.__stt.emit("result", { isFinal: true, results: [{ transcript: text, confidence: 0.9 }] });
  });
};
/* An attempt that heard nothing: the engine simply ends. */
const hearsNothing = async () => { await act(async () => { global.__stt.emit("end", {}); }); };
const starts = () => global.__stt.calls.length;

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  tutor.mockReset();
  if (global.__stt) global.__stt.reset();
  global.__spoke = []; global.__spokeOpts = [];
});
afterEach(async () => { await flushState(); jest.useRealTimers(); });

describe("conversation mode", () => {
  it("is off unless turned on, and then replaces the hold with one button", async () => {
    tutor.mockResolvedValue(GREET);
    await open({ tutorHands: false });
    await screen.findByTestId("tutor-turn");
    expect(screen.getByTestId("tutor-hold")).toBeTruthy();
    expect(screen.queryByTestId("tutor-loop")).toBeNull();
  });

  it("does not open the microphone until the conversation is started", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    expect(screen.getByTestId("tutor-loop")).toBeTruthy();
    // The tutor greeted and spoke, and nothing is listening yet.
    await waitFor(() => expect(global.__spoke).toEqual(["Привет!"]));
    expect(starts()).toBe(0);
  });

  it("goes back and forth: the learner speaks, the tutor answers, it listens again", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    await waitFor(() => expect(starts()).toBe(1));
    expect(global.__stt.calls[0].lang).toBe("ru-RU");

    await hears("я хочу чай");
    await waitFor(() => expect(tutor).toHaveBeenCalledTimes(2));
    expect(tutor.mock.calls[1][0].text).toBe("я хочу чай");
    // …and the microphone opened again once the reply had been spoken.
    await waitFor(() => expect(starts()).toBe(2));
    expect(global.__spoke).toEqual(["Привет!", "Хорошо."]);
  });

  /* The rule a hands-free loop exists to keep: one audio session, so the
     microphone may not be open while the tutor is talking (§30h′). */
  it("never listens while the tutor is speaking", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    global.__speechHold = true;               // the reply is left mid-sentence
    await open();
    await screen.findByTestId("tutor-turn");
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    await waitFor(() => expect(starts()).toBe(1));
    await hears("я хочу чай");
    await waitFor(() => expect(tutor).toHaveBeenCalledTimes(2));

    // The tutor is still speaking: no new attempt.
    expect(starts()).toBe(1);
    global.__speechHold = false;
    const Speech = require("expo-speech");
    await act(async () => { Speech.stop(); });
    await waitFor(() => expect(starts()).toBe(2));
  });

  it("a silent turn is listened through, and a run of them stops the loop", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    await waitFor(() => expect(starts()).toBe(1));

    await hearsNothing();                     // one quiet turn: it tries again
    await waitFor(() => expect(starts()).toBe(2));
    expect(screen.getByTestId("tutor-loop").props.accessibilityState.selected).toBe(true);

    await hearsNothing();                     // QUIET_LIMIT reached: it gives up
    await waitFor(() =>
      expect(screen.getByTestId("tutor-loop").props.accessibilityState.selected).toBe(false));
    const after = starts();
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(starts()).toBe(after);             // and stays down
    expect(QUIET_LIMIT).toBe(2);
    expect(tutor).toHaveBeenCalledTimes(1);   // nothing was sent
  });

  it("stopping puts the microphone down at once and sends nothing", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    await waitFor(() => expect(starts()).toBe(1));
    // A partial is in hand when the learner presses stop.
    await act(async () => {
      global.__stt.emit("result", { isFinal: false, results: [{ transcript: "я хо", confidence: 0.5 }] });
    });
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    expect(screen.getByTestId("tutor-loop").props.accessibilityState.selected).toBe(false);
    // The half-said turn is not sent, and nothing listens again.
    expect(tutor).toHaveBeenCalledTimes(1);
    const after = starts();
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(starts()).toBe(after);
  });

  it("an engine that never ends is abandoned rather than left listening", async () => {
    expect(LISTEN_MAX_MS).toBeLessThanOrEqual(30000);
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-loop")); });
    await waitFor(() => expect(starts()).toBe(1));
    // Nothing comes back at all; the watchdog gives the turn up as silent,
    // which the loop treats as a quiet turn and tries once more.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByTestId("tutor-live")).toBeTruthy();
  });
});
