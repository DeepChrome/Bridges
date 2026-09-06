/* The speaker button never produces the wrong language.
 *
 * The bug this pins, found on a real phone: a sentence with no recording fell
 * through to Speech.speak(text, {language: "ru-RU"}), and a device with no Russian
 * voice installed substitutes its default — reading Cyrillic aloud in English. Since
 * the Tatoeba examples added in Phase 2 carry no audio at all, that was most example
 * sentences in the dictionary.
 *
 * The rule, matching the web app: a recording plays regardless; without one the
 * button is live only if the device really can speak Russian.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";

import { Speaker } from "../src/ui";
import { AUDIO } from "../src/data";
import { refreshVoices } from "../src/audio";

// A sentence the collection has a recording for, and one it does not.
const withAudio = Object.keys(AUDIO).find((k) => k.includes(" "));
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
    // still lets the platform fall back.
    expect(global.__spokeOpts[0].voice).toBe("ru-RU-x-ruf-local");
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
