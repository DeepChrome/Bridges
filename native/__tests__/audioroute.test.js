/* Sound belongs to the screen that started it (the owner, 2026-09-29: audio
 * "will play even if I change screens"), and nothing streams: a sentence with
 * no bought clip is the phone's voice, never a recording fetched from the web
 * in somebody else's (2026-10-02, "a ton of voices swapping"). */

import { say, stop, setRouteSource, leftFor, probeVoices } from "../src/audio";
import { AUDIO } from "../src/data";
import { wordClip } from "../src/wordaudio";

let route = "A";
beforeAll(async () => { setRouteSource(() => route); await probeVoices(); });
beforeEach(() => { stop(); route = "A"; global.__players = []; global.__spoke = []; global.__downloads = []; });
afterAll(() => setRouteSource(null));

// A bought clip, and a collection recording with no bought clip.
const bought = "книга";
const unbought = Object.keys(AUDIO).find((k) => /\s/.test(k) && !wordClip(k));

describe("sound and the screen", () => {
  it("stops a sound when the learner moves to another screen", async () => {
    await say(bought, { repeat: false });
    const p = global.__players[global.__players.length - 1];
    expect(p.sounding).toBe(true);
    route = "B";
    leftFor("B");
    expect(global.__sounding()).toHaveLength(0);
  });

  it("leaves a sound playing on the screen that started it", async () => {
    await say(bought, { repeat: false });
    leftFor("A");
    expect(global.__sounding()).toHaveLength(1);
  });

  it("never starts a sound whose screen was left while it was being opened", async () => {
    const pending = say(bought, { repeat: false });
    route = "B";
    expect(await pending).toBe(false);
    expect(global.__sounding()).toHaveLength(0);
  });
});

describe("one voice", () => {
  it("reads a sentence with no bought clip in the phone's voice, fetching nothing", async () => {
    expect(wordClip("книга")).toBeTruthy();
    expect(unbought).toBeTruthy();
    await say(unbought, { repeat: false });
    expect(global.__players).toHaveLength(0);
    expect(global.__downloads).toHaveLength(0);
    expect(global.__spoke.length).toBe(1);
  });
});
