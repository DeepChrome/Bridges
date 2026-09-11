/* One scenario, one player — under a finger that presses faster than a promise.
 *
 * The owner, 2026-09-11, on "Waiting for Oleg": *"When I hit the back 5 seconds
 * button, it seems to start overlapping recordings somehow."*
 *
 * `playTrack` awaits twice before anything is audible — the audio session, then
 * the seek — and every await is a place a second press can arrive. Two calls in
 * flight leave two players, and the one that started first is the one nothing is
 * holding on to: it plays on underneath. None of this shows in the render tree
 * and it cannot be seen in a screenshot, so the lifecycle is asserted here, the
 * same way audiofocus.test.js watches for a player that was never released.
 */

import { playTrack, say, stop, releaseAudio } from "../src/audio";

const SRC = 1;                                   // a required asset, as Metro resolves it

beforeEach(() => {
  global.__players = [];
  global.__played = [];
  releaseAudio();
});

const started = () => global.__players.filter((p) => p.play.mock.calls.length);
const alive = () => global.__players.filter((p) => p.play.mock.calls.length
                                                && !p.remove.mock.calls.length);
/* The assertion a person makes by listening: what is coming out of the speaker,
   which is not the same question as what the app still holds a handle to. */
const sounding = () => global.__sounding();

describe("playing one track", () => {
  it("plays it, from where it was asked to", async () => {
    const h = await playTrack(SRC, 4000);
    expect(h).toBeTruthy();
    expect(global.__players).toHaveLength(1);
    expect(global.__players[0].seekTo).toHaveBeenCalledWith(4);
    expect(global.__players[0].play).toHaveBeenCalled();
    expect(h.pos()).toBe(4000);
  });

  it("hands the player back when it is stopped", async () => {
    const h = await playTrack(SRC, 0);
    h.stop();
    expect(global.__players[0].remove).toHaveBeenCalled();
  });

  /* The owner, 2026-09-11: *"When I pause the app, it just continues."*
   * `remove()` releases the app's handle; it does not silence what is already
   * playing. Every disposal site but `stop()` called it bare, so pausing a
   * scenario, and leaving the screen, went on making a noise. */
  it("is actually silent after it is stopped", async () => {
    const h = await playTrack(SRC, 0);
    expect(sounding()).toHaveLength(1);
    h.stop();
    expect(sounding()).toHaveLength(0);
    expect(global.__players[0].pause).toHaveBeenCalled();
  });

  it("is silent after everything stops", async () => {
    await playTrack(SRC, 0);
    stop();
    expect(sounding()).toHaveLength(0);
  });

  it("is silent after the audio is handed back entirely", async () => {
    await playTrack(SRC, 0);
    releaseAudio();
    expect(sounding()).toHaveLength(0);
  });
});

describe("pressing back faster than the audio can start", () => {
  /* The failing case, exactly as a finger produces it: press, press again
     before the first has finished opening its player. */
  it("leaves one player sounding, not two", async () => {
    const a = playTrack(SRC, 10000);
    const b = playTrack(SRC, 5000);
    const [ha, hb] = await Promise.all([a, b]);

    expect(alive()).toHaveLength(1);
    // One voice in the room, not two.
    expect(sounding()).toHaveLength(1);
    // And the one left is the last press, not the first.
    expect(hb).toBeTruthy();
    expect(hb.live()).toBe(true);
    if (ha) expect(ha.live()).toBe(false);
  });

  it("never starts a player it has already been told to abandon", async () => {
    const calls = [playTrack(SRC, 0), playTrack(SRC, 1000), playTrack(SRC, 2000),
                   playTrack(SRC, 3000)];
    const hs = await Promise.all(calls);
    expect(started().length).toBeLessThanOrEqual(1);
    expect(alive()).toHaveLength(1);
    expect(sounding()).toHaveLength(1);
    // Only the last call gets a usable handle; the rest say so by returning null.
    expect(hs[hs.length - 1]).toBeTruthy();
    expect(hs.slice(0, -1).every((h) => h === null)).toBe(true);
  });

  it("stops cleanly however many were abandoned", async () => {
    playTrack(SRC, 0);
    const h = await playTrack(SRC, 2000);
    h.stop();
    expect(alive()).toHaveLength(0);
    stop();
  });

  /* Leaving a screen has to reach what has not started yet as well. Otherwise
     the half-opened player begins a moment later with nothing holding it —
     the §23 lifecycle bug, from the other end. */
  it("abandons a player that was still opening when everything stopped", async () => {
    const pending = playTrack(SRC, 8000);
    stop();
    expect(await pending).toBe(null);
    expect(started()).toHaveLength(0);
  });
});

/* `say()` reaches the same session by the same route, and its control is one the
   app invites a second press on (§30h: a repeat plays slower). */
describe("pressing a speaker twice", () => {
  it("leaves one recording sounding", async () => {
    const a = say("книга");
    const b = say("книга");
    await Promise.all([a, b]);
    expect(alive().length).toBeLessThanOrEqual(1);
    expect(started().length).toBeLessThanOrEqual(1);
    expect(sounding().length).toBeLessThanOrEqual(1);
  });

  /* A recording started from anywhere has to silence a scenario, not join it:
     one session, one thing audible. */
  it("does not play a recording on top of a scenario", async () => {
    await playTrack(SRC, 0);
    await say("книга");
    expect(sounding().length).toBeLessThanOrEqual(1);
  });
});
