/* Playing a scenario: one conversation, several voices, a position you can move.
 *
 * The owner, 2026-09-10: *"a single audio clip … 30-45 seconds … a scenario
 * where the learner listens to a conversation and then is asked questions about
 * what they heard … the audio can be replayed as many times as they need …
 * they'll have the controls to back up a few seconds."*
 *
 * There is no audio file. The conversation is written (§30l) and read by the
 * device's Russian voices, one per speaker, which means there is no timeline to
 * seek in either — `expo-speech` speaks a string and tells you when it stopped.
 * So the timeline is built rather than read:
 *
 *   - every line has an estimate from its length, which is what the progress bar
 *     and "back five seconds" work against before anything has played;
 *   - every line that plays is **measured**, and the measurement replaces the
 *     estimate, so by the end of the first listen the timeline is the real one;
 *   - seeking lands on a line boundary, because that is the only place speech
 *     can actually be resumed. Five seconds back from the middle of a sentence
 *     therefore replays from the start of the sentence five seconds ago, which
 *     is what a listener wanted anyway.
 *
 * Everything above the hook is pure and tested directly (scenario.test.js);
 * the hook is the part that owns the speaking.
 */

import { useEffect, useRef, useState } from "react";
import { speakLine, stop, castVoices } from "./audio";

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

/* Drives the conversation. `lines` is `[{ s, ru }]` and `cast` the speakers in
   the order their voices are handed out. */
export function useScenario(lines, cast) {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(-1);          // the line sounding, -1 for none
  const [pos, setPos] = useState(0);         // milliseconds into the scenario
  const [plays, setPlays] = useState(0);     // how many times it was started

  const measured = useRef({});
  const alive = useRef(true);
  const run = useRef(0);                     // the current playback; bumped to abandon one
  const mark = useRef({ base: 0, at: 0 });   // where the line sounding began

  useEffect(() => () => { alive.current = false; run.current++; stop(); }, []);

  /* The bar moves while a line is being spoken, which is most of the time —
     without this it would step once a sentence and read as broken. */
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setPos(mark.current.base + (Date.now() - mark.current.at));
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const voices = castVoices(Math.max(1, (cast || []).length));
  const voiceFor = (line) => {
    const k = (cast || []).findIndex((c) => c.id === line.s);
    return voices[k < 0 ? 0 : k % voices.length];
  };

  const spans = () => timeline(lines, measured.current);

  const play = async (fromMs = 0) => {
    const id = ++run.current;
    stop();
    setPlaying(true);
    setPlays((n) => n + 1);
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
