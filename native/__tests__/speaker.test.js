/* The speaker button never produces the wrong language.
 *
 * The rule, matching the web app: a recording plays regardless; without one the
 * button is live only if the device really can speak Russian. Without that guard a
 * sentence with no recording fell through to Speech.speak(text, {language: "ru-RU"}),
 * and a device with no Russian voice substitutes its default — Cyrillic read aloud
 * in English.
 *
 * Honesty note: this guard was written as the fix for "English audio on the phone"
 * and was not that bug. The English the owner heard was real recordings fetched
 * from Tatoeba under the wrong id (see fetch_tatoeba_audio.py). The guard is still
 * right — it just was not the cause — and the pipeline now verifies what a recording
 * says rather than trusting its filename.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";

import { Speaker } from "../src/ui";
import { AUDIO } from "../src/data";
import { refreshVoices } from "../src/audio";
import { wordClip } from "../src/wordaudio";

// A sentence the collection has a recording for and the app does not bundle
// (the pools' sentences are bundled since 2026-09-19), and one it does not have.
const streamed = Object.keys(AUDIO).filter((k) => k.includes(" ") && !wordClip(k));
const withAudio = streamed[0];
// Recordings of their own for the offline tests: a copy saved in one test
// stays saved (the mock file system), and would answer for the stream in another.
const hangs = streamed[1], offline = streamed[2];
const noAudio = "этого предложения точно нет в коллекции сегодня";

async function draw(ui) {
  let r;
  await act(async () => { r = render(ui); });
  return r;
}

/* The probe is cached for the life of the module, so each test re-runs it against
   whatever __voices it has just set. Without this the tests only pass in the order
   they happen to be written in. */
beforeEach(async () => {
  delete global.__voices;
  global.__played = [];
  global.__spoke = [];
  global.__spokeOpts = [];
  jest.clearAllMocks();
});

async function withVoices(voices) {
  if (voices === null) delete global.__voices; else global.__voices = voices;
  await act(async () => { await refreshVoices(); });
}

describe("speaker", () => {
  it("plays the collection's recording when there is one", async () => {
    await withVoices(null);
    await draw(<Speaker text={withAudio} />);
    const btn = screen.getByTestId("speaker-real");
    expect(btn.props.accessibilityState.disabled).toBe(false);
    await act(async () => { fireEvent.press(btn); });
    expect(global.__played.length).toBe(1);
    expect(global.__played[0]).toContain("/audio/");
    expect(global.__spoke).toHaveLength(0);      // never the device voice
  });

  it("uses the device voice for a sentence with no recording, when Russian exists", async () => {
    await withVoices(null);
    await draw(<Speaker text={noAudio} />);
    const btn = screen.getByTestId("speaker-tts");
    expect(btn.props.accessibilityLabel).toMatch(/device voice/);
    await act(async () => { fireEvent.press(btn); });
    expect(global.__spoke).toHaveLength(1);
    // Pinned to the actual Russian voice, not just the language tag — the tag alone
    // still lets the platform fall back. Not the first listed: «ruf» is a man
    // and the bought clips are a woman, so the unknown «rum» is preferred
    // (audio.js defaultVoice).
    expect(global.__spokeOpts[0].voice).toBe("ru-RU-x-rum-local");
    expect(global.__spokeOpts[0].language).toMatch(/^ru/i);
  });

  it("goes dead rather than speaking English when the device has no Russian voice", async () => {
    await withVoices([
      { identifier: "en-US-x-sfg-local", name: "English", quality: "Default", language: "en-US" },
    ]);
    await draw(<Speaker text={noAudio} />);
    const btn = screen.getByTestId("speaker-silent");
    expect(btn.props.accessibilityState.disabled).toBe(true);
    expect(btn.props.accessibilityLabel).toMatch(/no Russian voice/i);
    await act(async () => { fireEvent.press(btn); });
    expect(global.__spoke).toHaveLength(0);      // the actual bug: this used to speak
    expect(global.__played).toHaveLength(0);
  });

  /* A stream that fails after it started — a 404, a lost connection — used to
     end in silence: the fallback only caught a synchronous throw. */
  it("falls back to the device voice when the stream reports an error", async () => {
    await withVoices(null);
    await draw(<Speaker text={withAudio} />);
    await act(async () => { fireEvent.press(screen.getByTestId("speaker-real")); });
    expect(global.__played).toHaveLength(1);
    await act(async () => { global.__audioError(); });
    expect(global.__spoke).toHaveLength(1);
    expect(screen.queryByTestId("speaker-down")).toBeNull();
  });

  /* The owner, 2026-10-01, on a flight: "a lot of delay when I clicked the
     speaker icon". A stream with no network never starts; the phone's voice
     takes over after STREAM_START_MS, and for a while after that it answers at
     once instead of trying the network again. */
  it("gives up on a stream that never starts, and answers at once after that", async () => {
    const { STREAM_START_MS } = require("../src/audio");
    jest.useFakeTimers();
    try {
      await withVoices(null);
      global.__streamNeverStarts = true;
      await draw(<Speaker text={hangs} />);
      await act(async () => { fireEvent.press(screen.getByTestId("speaker-real")); });
      expect(global.__played).toHaveLength(1);
      expect(global.__spoke).toHaveLength(0);
      await act(async () => { jest.advanceTimersByTime(STREAM_START_MS + 10); });
      expect(global.__spoke).toHaveLength(1);
      // The next press does not wait on the network: a saved copy if there is
      // one (the mock's download succeeds), otherwise the phone's voice — never
      // the stream again.
      await act(async () => { jest.advanceTimersByTime(7000); fireEvent.press(screen.getByTestId("speaker-real")); });
      expect(global.__played.filter((u) => u.startsWith("http"))).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("answers at once, in the phone's voice, while the network is known to be down", async () => {
    const { markOfflineForTest } = require("../src/audio");
    await withVoices(null);
    await draw(<Speaker text={offline} />);
    markOfflineForTest();
    await act(async () => { fireEvent.press(screen.getByTestId("speaker-real")); });
    expect(global.__played).toHaveLength(0);
    expect(global.__spoke).toHaveLength(1);
  });

  it("says so when the stream fails and there is no voice to fall back on", async () => {
    await withVoices([
      { identifier: "en-US-x-sfg-local", name: "English", quality: "Default", language: "en-US" },
    ]);
    await draw(<Speaker text={withAudio} />);
    await act(async () => { fireEvent.press(screen.getByTestId("speaker-real")); });
    await act(async () => { global.__audioError(); });
    expect(global.__spoke).toHaveLength(0);
    expect(screen.getByTestId("speaker-down")).toHaveTextContent("No audio right now");
  });

  it("still plays a real recording on a device with no Russian voice", async () => {
    await withVoices([
      { identifier: "en-US-x-sfg-local", name: "English", quality: "Default", language: "en-US" },
    ]);
    await draw(<Speaker text={withAudio} />);
    const btn = screen.getByTestId("speaker-real");
    expect(btn.props.accessibilityState.disabled).toBe(false);
    await act(async () => { fireEvent.press(btn); });
    expect(global.__played).toHaveLength(1);
  });
});
