/* Sound belongs to the screen that started it, and a streamed recording is
 * kept on the phone once fetched (the owner, 2026-09-29: audio "will play even
 * if I change screens", and «Следуйте за мной» "has a huge delay before it
 * starts"). */

import { say, stop, setRouteSource, leftFor, warm, probeVoices } from "../src/audio";
import { AUDIO } from "../src/data";
import { wordClip } from "../src/wordaudio";

let route = "A";
beforeAll(async () => { setRouteSource(() => route); await probeVoices(); });
beforeEach(() => { stop(); route = "A"; global.__players = []; global.__spoke = []; global.__downloads = []; });
afterAll(() => setRouteSource(null));

// A recording the collection streams rather than bundles: a dictionary example.
const examples = Object.keys(AUDIO).filter((k) => /\s/.test(k) && !wordClip(k));
const streamed = examples[0];
const fresh = examples[1];   // never played in this file, so never fetched

describe("sound and the screen", () => {
  it("stops a sound when the learner moves to another screen", async () => {
    await say(streamed, { repeat: false });
    const p = global.__players[global.__players.length - 1];
    expect(p.sounding).toBe(true);
    route = "B";
    leftFor("B");
    expect(global.__sounding()).toHaveLength(0);
  });

  it("leaves a sound playing on the screen that started it", async () => {
    await say(streamed, { repeat: false });
    leftFor("A");
    expect(global.__sounding()).toHaveLength(1);
  });

  it("never starts a sound whose screen was left while it was being opened", async () => {
    const pending = say(streamed, { repeat: false });
    route = "B";
    expect(await pending).toBe(false);
    expect(global.__sounding()).toHaveLength(0);
  });
});

describe("a streamed recording", () => {
  it("is fetched ahead, then played from the phone", async () => {
    expect(fresh).toBeTruthy();
    warm(fresh);
    await new Promise((r) => setTimeout(r, 0));
    expect(global.__downloads.length).toBe(1);
    await say(fresh, { repeat: false });
    const p = global.__players[global.__players.length - 1];
    expect(String(p.uri)).toMatch(/^file:\/\/\/cache\/audio\//);
    // Already here: nothing fetched twice.
    warm(fresh);
    expect(global.__downloads.length).toBe(1);
  });
});
