/* Giving the audio session back.
 *
 * The owner, 2026-09-10: *"going from a lesson into a youtube video, the audio
 * on the youtube video doesn't play unless I restart the app"*.
 *
 * `stop()` paused the player and left it allocated. A paused `expo-audio`
 * player still holds the Android audio session, so the YouTube WebView that
 * loads next is handed silence, and it has no way to tell the learner why.
 * Restarting fixed it, which is the tell: the state that needed clearing was
 * ours, not the player's.
 *
 * It leaked only on the path where nothing plays next. `say()` always removed
 * the previous player before making a new one, so inside a lesson the leak was
 * invisible — which is exactly why it read as intermittent. Go to a video
 * without having played anything and there was nothing held.
 *
 * None of this shows in the render tree, so the only way to hold it is to watch
 * the player lifecycle. `global.__players` in jest.setup.js records every player
 * made so a test can ask whether it was released.
 */

import { say, stop, releaseAudio, cue, probeVoices } from "../src/audio";

beforeEach(async () => {
  jest.clearAllMocks();
  global.__players = [];
  global.__played = [];
  global.__spoke = [];
  await probeVoices();
});

const madeFor = (uri) => global.__players.filter((p) => p.uri === uri);

describe("leaving a lesson", () => {
  it("releases the player rather than parking it", async () => {
    // A sentence the collection has a recording for, so a real player is made.
    await say("Кто это?");
    const made = global.__players.filter((p) => p.uri);
    expect(made.length).toBeGreaterThan(0);

    stop();
    const last = made[made.length - 1];
    expect(last.remove).toHaveBeenCalled();
  });

  it("does not leave a player behind for the next screen to fight", async () => {
    await say("Кто это?");
    stop();
    // Everything that was ever handed a stream has been given back.
    global.__players.filter((p) => p.uri).forEach((p) => {
      expect(p.remove).toHaveBeenCalled();
    });
  });

  it("survives being called with nothing playing", () => {
    expect(() => { stop(); stop(); }).not.toThrow();
  });
});

describe("a screen whose audio is not ours", () => {
  it("hands back the cue players too, which stop() cannot reach", async () => {
    /* The cues are cached for the life of the process on purpose, so that one
       never interrupts the word being spoken. That makes them the one thing
       `stop()` leaves holding a session, and the video screen is where that
       matters. */
    cue("right");
    const cues = global.__players.filter((p) => !p.uri);
    expect(cues.length).toBeGreaterThan(0);

    stop();
    expect(cues.some((p) => p.remove.mock.calls.length > 0)).toBe(false);

    releaseAudio();
    cues.forEach((p) => expect(p.remove).toHaveBeenCalled());
  });

  it("is safe to call when nothing has played at all", () => {
    expect(() => releaseAudio()).not.toThrow();
  });

  it("lets audio work again afterwards", async () => {
    await say("Кто это?");
    releaseAudio();
    // The session re-arms on the next use rather than staying dead.
    await say("Это я.");
    expect(global.__played.length + global.__spoke.length).toBeGreaterThan(0);
  });
});
