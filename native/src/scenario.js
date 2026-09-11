/* Playing a scenario: one conversation, several voices, a position you can move.
 *
 * The owner, 2026-09-10: *"a single audio clip … 30-45 seconds … a scenario
 * where the learner listens to a conversation and then is asked questions about
 * what they heard … the audio can be replayed as many times as they need …
 * they'll have the controls to back up a few seconds."*
 *
 * A written conversation is now **bought** as audio (tools/build_scenario_audio
 * and build_scene_tracks): one file per lesson, with the start of every line
 * measured from the clips it was stitched from. That is one player over a real
 * timeline, and a seek lands anywhere.
 *
 * The device voices remain the other half of this file, and not as a leftover:
 * they read a corpus scene, which has no script and therefore no track, and any
 * lesson whose text no longer matches its audio. They speak a line at a time
 * and `expo-speech` only says when it stopped, so there the timeline is built
 * rather than read:
 *
 *   - every line has an estimate from its length, which is what the progress bar
 *     and "back five seconds" work against before anything has played;
 *   - every line that plays is **measured**, and the measurement replaces the
 *     estimate, so by the end of the first listen the timeline is the real one;
 *   - seeking lands on a line boundary, because that is the only place speech
 *     can actually be resumed. Five seconds back from the middle of a sentence
 *     therefore replays from the start of the sentence five seconds ago, which
 *     is what a listener wanted anyway. A track has no such limit.
 *
 * Everything above the hook is pure and tested directly (scenario.test.js);
 * the hook is the part that owns the speaking.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { speakLine, stop, castVoices, playTrack, hash } from "./audio";
import { trackFor } from "./scenetracks";

/* The breath between two turns. Long enough to hear one speaker stop and
   another start; short enough that a dozen lines still run under a minute. */
export const GAP_MS = 420;

/* How far a press of the back button moves. */
export const SKIP_MS = 5000;

/* How long a line will take to say, before it has ever been said.
 *
 * Calibrated against the device voice at rate 1.0, which reads Russian at
 * roughly fourteen characters a second, plus the beat a speaker takes before
 * starting. It only has to be close: the moment a line plays, the estimate is
 * replaced by what it actually took. */
export const estimateMs = (text) => 400 + String(text || "").length * 70;

/* Where each line sits on the timeline, and how long the whole thing runs.
   `measured` maps a line index to its real duration in milliseconds. */
export function timeline(lines, measured = {}) {
  const spans = [];
  let at = 0;
  (lines || []).forEach((l, k) => {
    const ms = measured[k] || estimateMs(l.ru);
    spans.push({ start: at, ms });
    at += ms + GAP_MS;
  });
  return { spans, total: Math.max(0, at - (spans.length ? GAP_MS : 0)) };
}

/* The line sounding at a moment — the last one that has started by then. */
export function lineAt(spans, ms) {
  let k = 0;
  for (let i = 0; i < spans.length; i++) if (spans[i].start <= ms) k = i;
  return k;
}

export const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ hook */

/* The bought track for this lesson, when there is one and it still matches the
 * text (§30l). The hash is the guard: the track was stitched from clips of
 * particular sentences, so a script edited without re-running the audio tools
 * would play the wrong words under the questions — and nothing on screen would
 * say so. A mismatch is not an error, it is the device voices again. */
export function trackWhenCurrent(key, lines) {
  const t = trackFor(key);
  if (!t || !lines || t.lines.length !== lines.length) return null;
  if (t.h !== hash(lines.map((l) => l.ru).join("|"))) return null;
  // The generated module stores each line as [start, ms] to keep the bundle
  // small; the rest of this file talks in spans.
  return { src: t.src, total: t.total, spans: t.lines.map(([start, ms]) => ({ start, ms })) };
}

/* Drives the conversation. `lines` is `[{ s, ru }]` and `cast` the speakers in
 * the order their voices are handed out. `seed` is the lesson's key — which
 * voices it draws and which track it owns are both properties of the lesson.
 *
 * Two ways to play, and the difference is visible to the learner in one place
 * only, the accuracy of the position: a bought track is one file with a
 * measured timeline, so it seeks anywhere; the device voices speak a line at a
 * time, so the timeline is estimated until it has been heard and a seek lands
 * on a line boundary. */
export function useScenario(lines, cast, seed = "") {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(-1);          // the line sounding, -1 for none
  const [pos, setPos] = useState(0);         // milliseconds into the scenario
  const [plays, setPlays] = useState(0);     // how many times it was started

  const measured = useRef({});
  const alive = useRef(true);
  const run = useRef(0);                     // the current playback; bumped to abandon one
  const mark = useRef({ base: 0, at: 0 });   // where the line sounding began
  // Hashed once per lesson, not once per frame: the position poll re-renders
  // this five times a second.
  const track = useMemo(() => trackWhenCurrent(seed, lines), [seed, lines]);
  const handle = useRef(null);               // the track's player, while one is open

  useEffect(() => () => {
    alive.current = false;
    run.current++;
    if (handle.current) { handle.current.stop(); handle.current = null; }
    stop();
  }, []);

  /* The bar moves while a line is being spoken, which is most of the time —
     without this it would step once a sentence and read as broken. A track
     reports its own position; the device voices are timed from when the line
     began, because expo-speech has nothing to ask. */
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const h = handle.current;
      if (!h) return setPos(mark.current.base + (Date.now() - mark.current.at));
      const ms = h.pos();
      setPos(ms);
      setAt(lineAt(track.spans, ms));
      if (h.ended()) {
        h.stop();
        handle.current = null;
        setPlaying(false);
        setAt(-1);
        setPos(track.total);
      }
      return undefined;
    }, 200);
    return () => clearInterval(id);
  }, [playing, track]);

  /* By the cast, not by how many there are: a voice is chosen for *who* is
     speaking (core/names.js knows each character's sex), so the same character
     keeps the same voice across every replay. A corpus scene has no cast and
     is read by one voice, which is what `[{}]` asks for.
   *
   * `seed` is the lesson. The phone has several voices of each sex, and taking
   * the same first woman every time would make 168 conversations sound like
   * the same two people — so each lesson draws its own pair, and keeps them. */
  const voices = castVoices((cast || []).length ? cast : [{}], seed);
  const voiceFor = (line) => {
    const k = (cast || []).findIndex((c) => c.id === line.s);
    return voices[k < 0 ? 0 : k % voices.length];
  };

  const spans = () => (track ? { spans: track.spans, total: track.total }
                             : timeline(lines, measured.current));

  const play = async (fromMs = 0) => {
    const id = ++run.current;
    if (handle.current) { handle.current.stop(); handle.current = null; }
    stop();
    setPlaying(true);
    setPlays((n) => n + 1);

    if (track) {
      const h = await playTrack(track.src, fromMs);
      if (!alive.current || run.current !== id) { if (h) h.stop(); return; }
      if (!h) { setPlaying(false); return; }   // nothing played; the transport stays put
      handle.current = h;
      setPos(fromMs);
      setAt(lineAt(track.spans, fromMs));
      return;
    }

    const tl = spans();
    let k = lineAt(tl.spans, fromMs);
    let base = tl.spans.length ? tl.spans[k].start : 0;
    for (; k < lines.length; k++) {
      if (!alive.current || run.current !== id) return;
      setAt(k);
      mark.current = { base, at: Date.now() };
      setPos(base);
      const t0 = Date.now();
      await speakLine(lines[k].ru, voiceFor(lines[k]));
      if (!alive.current || run.current !== id) return;
      const took = Date.now() - t0;
      /* A line that came back at once was not spoken — no voice, or stopped
         before it began — and must not be recorded as a duration of nothing.
         The first honest measurement is kept and never overwritten: a replayed
         line comes back a little quicker, and letting that through made the
         total shrink while the learner was looking at it (0:30 to 0:28 on the
         emulator). The length of the thing they are listening to must not
         change under them. */
      if (took > 250 && !measured.current[k]) measured.current[k] = took;
      base += (measured.current[k] || estimateMs(lines[k].ru)) + GAP_MS;
      setPos(base);
      if (k + 1 < lines.length) {
        await new Promise((go) => setTimeout(go, GAP_MS));
        if (!alive.current || run.current !== id) return;
      }
    }
    setPlaying(false);
    setAt(-1);
    setPos(spans().total);
  };

  /* Stops where it is. Speech cannot resume inside a sentence, so the position
     is pulled back to the start of the one that was sounding: pressing play
     again repeats that line rather than skipping what was cut off. */
  const pause = () => {
    run.current++;
    if (handle.current) {
      /* A track resumes exactly where it stopped, so the position is kept as it
         is. The player is removed rather than paused: a paused one holds the
         Android audio session (§23), and re-creating it to resume is free. */
      setPos(handle.current.pos());
      handle.current.stop();
      handle.current = null;
      setPlaying(false);
      setAt(-1);
      return;
    }
    stop();
    setPlaying(false);
    const tl = spans();
    if (at >= 0 && tl.spans[at]) setPos(tl.spans[at].start);
    setAt(-1);
  };

  const back = () => {
    const tl = spans();
    const from = Math.max(0, (playing ? pos : Math.min(pos, tl.total)) - SKIP_MS);
    play(from);
  };

  const toggle = () => {
    if (playing) pause();
    else play(pos >= spans().total ? 0 : pos);
  };

  return { playing, at, pos, plays, total: spans().total, play, pause, back, toggle };
}
