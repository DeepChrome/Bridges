/* Hold-to-speak, as one hook, so Say and Talk cannot drift.
 *
 * The recogniser runs on the device — audio never leaves the phone — and reports
 * partials while the button is held and one final result after it is released.
 * Everything that was learned building Say lives here: the phase in a ref as well
 * as state (the recogniser's events need the current value, not their closure's);
 * a release that lands before the permission prompt resolves; "end" arriving with
 * no final result, in which case the last partial is the result; the two ways it
 * can be blocked before it starts — no microphone permission, no offline Russian
 * model — each named plainly.
 *
 *   const rec = useRecognizer({ onFinal(transcript, latencyMs, alternatives), bias });
 *   rec.phase        idle | asking | listening
 *   rec.live         the partial transcript while listening
 *   rec.note         "Nothing heard" and the like; clears on the next hold
 *   rec.block        null | { why: mic | model | engine, text }
 *   rec.hold() / rec.release() / rec.getModel() / rec.clearBlock()
 */

import { useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule as M, useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export const LANG = "ru-RU";
export const WATCHDOG_MS = 8000;
/* The engine listens for at least this long from the moment it starts, whatever
   the finger does. A one-syllable word in the pronunciation drill is said and
   the button let go inside half a second, and stopping the recogniser that
   early handed it too little audio to call speech — "Did not catch that" on a
   word plainly said (the owner, 2026-09-19). A release before this is honoured
   this much later; a release after it stops at once. */
export const MIN_LISTEN_MS = 900;

/* How many hearings the engine is asked for. The top one is what is shown
   while listening; an activity that knows what it expects (Say, Shadow) picks
   the closest of the lot (core/speech.js closestTranscript). */
export const ALTERNATIVES = 5;

/* **The errors that mean "that attempt did not work", not "this phone cannot
 * do this"** — and what to say about each.
 *
 * Every code but `no-speech` used to fall through to a `block`, which
 * *replaces the whole activity* with one line and a way out (`Blocked`). So a
 * momentary loss of the audio session — the TTS engine that had just spoken,
 * a notification, a Bluetooth route change, all of which Android reports as
 * `audio-capture` — took the word, its meaning, the syllable dots, the play
 * button and both navigation buttons off the screen, and `clearBlock` was
 * never called anywhere, so nothing put them back. The owner, 2026-09-22:
 * *"a lot of the time it will glitch out and say something like audio
 * recognition failed"*. It is a glitch; it is just not a fatal one.
 *
 * A block is now only for the three things a learner can actually act on: the
 * microphone is off, the Russian model is missing, or the engine reported
 * something nobody has a name for. Everything here stays on the screen, says
 * one short line, and leaves the button ready to hold again. */
export const TRANSIENT = {
  "no-speech": "Nothing heard",
  "speech-timeout": "Nothing heard",
  "audio-capture": "Try again",
  "client": "Try again",
  "busy": "Try again",
  "network": "Try again",
  "too-many-requests": "Try again",
  "aborted": "Try again",
  "interrupted": "Try again",
  "unknown": "Try again",
};

/* `bias` — the words the activity expects. On Android 13+ they go to the
   recogniser as EXTRA_BIASING_STRINGS, which is the engine being told what
   it is listening for; the owner's complaint (2026-09-19) that Say "almost
   always marks me wrong" was mostly the engine hearing a plausible other
   sentence. Read at hold time, so a changing question changes the hint. */
export function useRecognizer({ onFinal, onError, enabled = true, bias } = {}) {
  const [phase, setPhase] = useState("idle");
  const phaseRef = useRef("idle");
  const go = (p) => { phaseRef.current = p; setPhase(p); };
  const [live, setLiveState] = useState("");
  const liveRef = useRef("");
  const setLive = (s) => { liveRef.current = s; setLiveState(s); };
  const [note, setNote] = useState(null);
  const [block, setBlock] = useState(null);
  const releasedAt = useRef(0);
  const startedAt = useRef(0);
  const watchdog = useRef(null);
  const stopTimer = useRef(null);
  const releasedEarly = useRef(false);
  const cb = useRef({ onFinal, onError, bias });
  cb.current = { onFinal, onError, bias };

  const finish = (text, alternatives) => {
    if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; }
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    go("idle");
    if (cb.current.onFinal) {
      cb.current.onFinal(text, Date.now() - releasedAt.current, alternatives || [text]);
    }
  };

  useSpeechRecognitionEvent("result", (ev) => {
    if (phaseRef.current !== "listening") return;
    const all = (ev.results || []).map((r) => r && r.transcript).filter((t) => typeof t === "string");
    const text = all[0] || "";
    if (ev.isFinal) finish(text, all.length ? all : [text]);
    else setLive(text);
  });
  useSpeechRecognitionEvent("error", (ev) => {
    if (phaseRef.current !== "listening") return;
    go("idle");
    const what = `${ev.error} ${ev.message || ""}`;
    if (/not-supported|not downloaded/i.test(what)) {
      setBlock({ why: "model", text: "Russian is not installed for offline recognition." });
    } else if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
    } else if (TRANSIENT[ev.error]) {
      setNote(TRANSIENT[ev.error]);
    } else {
      setBlock({ why: "engine", text: `Recognition failed: ${ev.error}` });
    }
    if (cb.current.onError) cb.current.onError(ev.error, Date.now() - releasedAt.current);
  });
  useSpeechRecognitionEvent("end", () => {
    if (phaseRef.current !== "listening") return;
    // Ended without a final result. The last partial is what the recogniser had,
    // so use that rather than throw the attempt away; with nothing at all heard,
    // back to idle and let the learner try again.
    if (liveRef.current) finish(liveRef.current);
    else go("idle");
  });

  const hold = async () => {
    if (!enabled || phaseRef.current !== "idle") return;
    setLive(""); setNote(null);
    releasedEarly.current = false;
    go("asking");
    let perm;
    try { perm = await M.requestPermissionsAsync(); } catch (e) { perm = { granted: false }; }
    if (!perm.granted) {
      go("idle");
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
      return;
    }
    if (releasedEarly.current) { go("idle"); return; }
    go("listening");
    startedAt.current = Date.now();
    try {
      const hint = (cb.current.bias || []).filter((s) => typeof s === "string" && s.trim());
      M.start({ lang: LANG, requiresOnDeviceRecognition: true, interimResults: true,
                maxAlternatives: ALTERNATIVES, continuous: false,
                ...(hint.length ? { contextualStrings: hint } : {}) });
    } catch (e) {
      go("idle");
      setBlock({ why: "engine", text: `Recognition failed: ${e.message || e}` });
    }
  };

  /* A recogniser that never reports "end" after stop() would leave the button
     stuck on "Listening…" and the whole activity behind it. The measured p95
     from release to result is 4.4 s (CLAUDE.md §30c); at WATCHDOG_MS the
     attempt is abandoned and said so. */
  const release = () => {
    releasedAt.current = Date.now();
    if (phaseRef.current === "listening") {
      const stop = () => {
        stopTimer.current = null;
        if (phaseRef.current !== "listening") return;
        try { M.stop(); } catch (e) { /* the end event still arrives */ }
      };
      const heldFor = Date.now() - startedAt.current;
      if (heldFor >= MIN_LISTEN_MS) stop();
      else stopTimer.current = setTimeout(stop, MIN_LISTEN_MS - heldFor);
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        watchdog.current = null;
        if (phaseRef.current !== "listening") return;
        // The last partial is what the recogniser had; with nothing, say so.
        if (liveRef.current) finish(liveRef.current);
        else { go("idle"); setNote("Nothing heard"); }
        try { M.abort(); } catch (e) { /* nothing to abort */ }
      }, WATCHDOG_MS);
    } else {
      releasedEarly.current = true;
    }
  };

  /* Android 13+ only: opens the system's model-download dialog. */
  const getModel = async () => {
    try { await M.androidTriggerOfflineModelDownload({ locale: LANG }); } catch (e) { /* stays blocked */ }
  };

  return { phase, live, note, block, hold, release, getModel,
           clearBlock: () => setBlock(null), setLive };
}
