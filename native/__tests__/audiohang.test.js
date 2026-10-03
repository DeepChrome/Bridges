/* A platform call that never answers must not silence the app (the owner,
   2026-10-03: "it kills all audio in the app until I restart… it just won't
   move the slider"). Every sound waits on the audio mode being applied; that
   wait is bounded now (audio.js PREPARE_MS). */

import * as ExpoAudio from "expo-audio";
import { say, playTrack, rearmAudio, stop, probeVoices, PREPARE_MS } from "../src/audio";

beforeAll(async () => { await probeVoices(); });
afterEach(() => { jest.useRealTimers(); stop(); });

it("plays after the audio mode call hangs, and does not wait again on the next press", async () => {
  const spy = jest.spyOn(ExpoAudio, "setAudioModeAsync").mockImplementation(() => new Promise(() => {}));
  try {
    jest.useFakeTimers();
    rearmAudio();                         // as on coming back to the foreground
    global.__players = [];
    const first = say("книга", { repeat: false });
    await jest.advanceTimersByTimeAsync(PREPARE_MS + 50);
    await first;
    expect(global.__players.length).toBe(1);
    // The session is taken as ready: the next sound does not wait again.
    const second = say("книга", { repeat: false });
    await jest.advanceTimersByTimeAsync(10);
    await second;
    expect(global.__players.length).toBe(2);
    // A scene's track as well, the other thing the owner found dead.
    const track = playTrack(1, 0);
    await jest.advanceTimersByTimeAsync(10);
    expect(await track).toBeTruthy();
    // Only one call was made for the lot, not one per press.
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});
