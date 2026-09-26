/* Conversation mode in the Tutor (2026-09-26): one icon beside the
 * microphone, and while it is lit the exchange runs itself. The owner:
 * *"conversation mode where it just goes back and forth and you dont have to
 * hold the mic"*, *"specifically for the AI tutor"*, and — after the first
 * cut let Android decide when he had stopped speaking — *"the mic just stays
 * on longer but I still have to press it on and off it seems and even then it
 * is not capturing my words well… try and make it work exactly like claude's
 * public facing conversation mode."*
 *
 * So the pause is measured here rather than by the platform: results
 * accumulate, each one restarts a silence timer, and the turn is what has
 * been heard when it runs out. The rest is what stops a hands-free loop
 * misbehaving — never listening while the tutor speaks, never two
 * microphones, never an open one in an empty room, and nothing sent when the
 * learner stops it.
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
import { SILENCE_MS, NOTHING_MS, LISTEN_MAX_MS } from "../src/speech";

jest.mock("../src/lib/feedback", () => ({
  tutor: jest.fn(), talk: jest.fn(), review: jest.fn(), hint: jest.fn(), getFeedback: jest.fn(),
  explain: jest.fn(), translate: jest.fn(),
  config: jest.fn(() => ({ url: "https://worker.test/v1/tutor", token: "t" })),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"],
};
const GREET = { ok: true, ru: "Привет!", en: "Hi!", note: "What shall we do?", remember: "" };
const REPLY = { ok: true, ru: "Хорошо.", en: "Good.", note: "", remember: "" };
const WAIT = { timeout: SILENCE_MS + 2500 };

async function open(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(
    <SessionProvider><WordsProvider><Tutor navigation={nav} /></WordsProvider></SessionProvider>,
  );
}
const press = async (id) => act(async () => { fireEvent.press(screen.getByTestId(id)); });
/* A segment of speech, the way the engine delivers one. It does not end the
   turn: the pause after it does. */
const says = async (text, isFinal = true) => {
  await act(async () => {
    global.__stt.emit("result", { isFinal, results: [{ transcript: text, confidence: 0.9 }] });
  });
};
/* The engine closing the session with nothing heard. */
const saysNothing = async () => { await act(async () => { global.__stt.emit("end", {}); }); };
const pause = async (ms) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const starts = () => global.__stt.calls.length;

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  tutor.mockReset();
  if (global.__stt) global.__stt.reset();
  global.__spoke = []; global.__spokeOpts = []; global.__speechHold = false;
});
afterEach(async () => { await flushState(); global.__speechHold = false; });

describe("conversation mode", () => {
  it("is one visible icon, not a setting, and opens nothing until it is pressed", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    // The control is on the screen beside the microphone…
    expect(screen.getByTestId("tutor-converse")).toBeTruthy();
    expect(screen.getByTestId("tutor-converse").props.accessibilityState.selected).toBe(false);
    // …the hold is still there until it is pressed, and nothing is listening.
    expect(screen.getByTestId("tutor-hold")).toBeTruthy();
    await waitFor(() => expect(global.__spoke).toEqual(["Привет!"]));
    expect(starts()).toBe(0);
    // …and it is not hidden in the cog.
    await press("tutor-cog");
    expect(await screen.findByTestId("tutor-options")).toBeTruthy();
    expect(screen.queryByTestId("tutor-hands-row")).toBeNull();
  });

  it("one press starts the exchange: no second press to speak", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await waitFor(() => expect(global.__spoke).toHaveLength(1));
    await press("tutor-converse");
    // Listening already, with the engine held open so a pause does not end it.
    await waitFor(() => expect(starts()).toBe(1));
    expect(global.__stt.calls[0].continuous).toBe(true);
    expect(global.__stt.calls[0].lang).toBe("ru-RU");
    expect(screen.getByTestId("tutor-converse").props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId("tutor-hold")).toBeNull();
  });

  /* The fix for "not capturing my words well": a pause mid-sentence is a
     pause, not the end of the turn, and the turn is the segments joined. */
  it("keeps listening through a pause and sends the whole turn", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    await waitFor(() => expect(global.__spoke).toHaveLength(1));
    await press("tutor-converse");
    await waitFor(() => expect(starts()).toBe(1));

    await says("я хочу");
    await pause(SILENCE_MS / 2);              // thinking, not finished
    expect(tutor).toHaveBeenCalledTimes(1);
    await says("чай");
    await waitFor(() => expect(tutor).toHaveBeenCalledTimes(2), WAIT);
    expect(tutor.mock.calls[1][0].text).toBe("я хочу чай");
    // …and the microphone opens again once the reply has been spoken.
    await waitFor(() => expect(starts()).toBe(2), WAIT);
    expect(global.__spoke).toEqual(["Привет!", "Хорошо."]);
  });

  /* One audio session: a microphone open under a speaker hears the speaker. */
  it("never listens while the tutor is speaking", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    await waitFor(() => expect(global.__spoke).toHaveLength(1));
    await press("tutor-converse");
    await waitFor(() => expect(starts()).toBe(1));

    global.__speechHold = true;               // the reply is left mid-sentence
    await says("я хочу чай");
    await waitFor(() => expect(tutor).toHaveBeenCalledTimes(2), WAIT);
    await pause(SILENCE_MS + 400);
    expect(starts()).toBe(1);                 // still speaking: no microphone

    global.__speechHold = false;
    const Speech = require("expo-speech");
    await act(async () => { Speech.stop(); });
    await waitFor(() => expect(starts()).toBe(2), WAIT);
  });

  it("a silent turn is listened through, and a run of them stops the loop", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await waitFor(() => expect(global.__spoke).toHaveLength(1));
    await press("tutor-converse");
    await waitFor(() => expect(starts()).toBe(1));

    await saysNothing();                      // one quiet turn: it tries again
    await waitFor(() => expect(starts()).toBe(2), WAIT);
    expect(screen.getByTestId("tutor-converse").props.accessibilityState.selected).toBe(true);

    await saysNothing();                      // QUIET_LIMIT reached: it gives up
    await waitFor(() =>
      expect(screen.getByTestId("tutor-converse").props.accessibilityState.selected).toBe(false));
    const after = starts();
    await pause(600);
    expect(starts()).toBe(after);             // and stays down
    expect(QUIET_LIMIT).toBe(2);
    expect(tutor).toHaveBeenCalledTimes(1);   // nothing was sent
  });

  it("stopping puts the microphone down at once and sends nothing", async () => {
    tutor.mockResolvedValue(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    await waitFor(() => expect(global.__spoke).toHaveLength(1));
    await press("tutor-converse");
    await waitFor(() => expect(starts()).toBe(1));
    // Half a sentence is in hand when the learner stops it.
    await says("я хо", false);
    await press("tutor-converse");
    expect(screen.getByTestId("tutor-converse").props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId("tutor-hold")).toBeTruthy();     // the hold is back
    await pause(SILENCE_MS + 400);
    expect(tutor).toHaveBeenCalledTimes(1);                    // nothing sent
    expect(starts()).toBe(1);                                  // nothing reopened
  });

  /* The windows are what make it feel like a conversation rather than a
     stopwatch, so they are pinned as a set. */
  it("gives a learner time to think, and still cannot leave the microphone open", () => {
    expect(SILENCE_MS).toBeGreaterThanOrEqual(1200);   // a pause mid-sentence
    expect(SILENCE_MS).toBeLessThanOrEqual(2500);      // but not an awkward wait
    expect(NOTHING_MS).toBeGreaterThan(SILENCE_MS);
    expect(LISTEN_MAX_MS).toBeGreaterThan(NOTHING_MS); // an absolute ceiling
    expect(LISTEN_MAX_MS).toBeLessThanOrEqual(60000);
  });
});
