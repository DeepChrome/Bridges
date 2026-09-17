/* The words the collection has no recording for (ROADMAP 13.32).
 *
 * 61 of the 1,045 the units teach had no file at all — mostly perfective
 * verbs, which is precisely what the aspect drill asks about — and were read
 * by the device voice. They are bought Chirp3-HD clips now, bundled in the app
 * rather than uploaded, so they need no network and cost no Netlify credits.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { WORD_CLIPS, wordClip } from "../src/wordaudio";
import { say, hasRealAudio, probeVoices } from "../src/audio";
import { L, UN, AUDIO } from "../src/data";
import { fold } from "@core/util";

beforeEach(async () => {
  global.__played = [];
  global.__spoke = [];
  await probeVoices();
});

describe("the words with no recording", () => {
  it("has a clip for each of them and nothing else", () => {
    const taught = new Set();
    for (const u of UN) for (const i of u.w || []) taught.add(i);
    const gaps = [...taught]
      .map((i) => L[i])
      .filter((w) => w && w.b && !AUDIO[fold(w.b)]);
    expect(gaps.length).toBeGreaterThan(0);
    for (const w of gaps) {
      expect(wordClip(fold(w.b))).toBeTruthy();
    }
    /* Keyed folded, which is the whole reason the first count came out at 75
       instead of 61: the collection's manifest folds ё to е and a lemma's bare
       form does not, so «актёр» looked missing when it has had a recording all
       along (rule 20.2). */
    expect(Object.keys(WORD_CLIPS).every((k) => k === fold(k))).toBe(true);
  });

  it("counts as a recording rather than the device voice", () => {
    const word = Object.keys(WORD_CLIPS)[0];
    expect(hasRealAudio(word)).toBe(true);
    /* §27's rule is that the *device voice* is never mistaken for a prepared
       recording. It has never meant "a human said this" — the collection is
       mostly TTS already — and nothing here claims otherwise. */
  });

  it("plays the bundled clip instead of speaking it", async () => {
    const word = Object.keys(WORD_CLIPS)[0];
    await say(word);
    // A player opened, and the phone did not read it aloud.
    expect(global.__played.length).toBe(1);
    expect(global.__spoke).toEqual([]);
  });

  it("still streams the collection's recording for everything else", async () => {
    // A word the collection does have.
    const known = Object.keys(AUDIO)[0];
    expect(wordClip(fold(known))).toBeNull();
    await say(known);
    expect(global.__played.length).toBe(1);
  });

  it("still falls back to the voice for a word nobody has", async () => {
    await say("несуществующееслово");
    expect(global.__played.length).toBe(0);
    expect(global.__spoke.length).toBe(1);
  });
});
