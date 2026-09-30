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
 *   const rec = useRecognizer({ onFinal(transcript, latencyMs, alternatives, lang), bias });
 *   rec.phase        idle | asking | listening
 *   rec.live         the partial transcript while listening
 *   rec.note         "Nothing heard" and the like; clears on the next hold
 *   rec.block        null | { why: mic | model | engine, text, name? }
 *   rec.hold({ lang }?) / rec.release() / rec.getModel() / rec.clearBlock()
 *   rec.listen({ lang }?) / rec.cancel()      — the hands-free attempt
 *
 * **Two ways in, one engine.** `hold`/`release` is a finger on a button: the
 * release decides when the engine has heard enough. `listen` is the tutor's
 * conversation mode (the owner, 2026-09-26: *"conversation mode where it just
 * goes back and forth and you dont have to hold the mic"*) — nothing holds it,
 * so **Android's own endpointing decides**, which is what it does anyway when
 * `continuous` is false. The screen is told the attempt produced nothing
 * (`onQuiet`) rather than being left to infer it from a phase going idle,
 * because a loop that cannot tell silence from a result is a loop that talks
 * over the learner.
 *
 * The one rule a caller must keep: **never listen while something is
 * speaking.** The recogniser and the TTS engine contend for the same audio
 * session (§30h′), and a microphone open under a speaker hears the speaker.
 * `speakLine` resolves when it has finished, which is the handshake.
 */

import { useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule as M, useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export const LANG = "ru-RU";
/* The one other language the recogniser is ever asked for: the English side of
   the interpreter (screens/Translate.js, 2026-09-23). Every exercise listens
   for Russian; `hold({ lang })` is how that one screen asks otherwise. */
export const LANG_EN = "en-US";
const NAME = { [LANG]: "Russian", [LANG_EN]: "English" };
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

/* **Conversation mode does its own endpointing, and that is the whole trick.**
 *
 * The first cut let Android decide when the learner had stopped
 * (`continuous: false`, which returns one result and closes). On the device it
 * was useless: the engine cut in on a pause mid-sentence, dropped the tail of
 * a slow word, and often returned nothing at all, so the microphone appeared
 * to stay open and do nothing. The owner, 2026-09-26: *"the mic just stays on
 * longer but I still have to press it on and off it seems and even then it is
 * not capturing my words well."*
 *
 * So the engine is now held open (`continuous: true`) and **the pause is
 * measured here**: every result, final or partial, restarts a timer, and when
 * it runs out the turn is what has accumulated. That is how a voice assistant
 * behaves, and it is tunable — Android's endpointing is not. A learner
 * hunting for a word gets `SILENCE_MS` to find it rather than whatever the
 * engine feels like.
 *
 * The three windows, and why each exists:
 *   SILENCE_MS  quiet *after speech* — the turn is over. Long enough to think
 *               mid-sentence in a language you do not speak well.
 *   NOTHING_MS  no speech at all — nobody is there, so it is a silent turn.
 *   LISTEN_MAX_MS  an absolute cap, whatever is happening; a microphone with
 *               no ceiling is the failure a conversation must not have.
 */
export const SILENCE_MS = 1500;
export const NOTHING_MS = 9000;
export const LISTEN_MAX_MS = 45000;

/* Android's own thresholds, pushed out so the platform does not close the
   session before the timer above gets to decide. Ignored on a device that
   does not honour them, which is why the pause is measured here as well. */
const ANDROID_PATIENCE = {
  EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
  EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
  EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
};

/* **Both languages at once** (the owner, 2026-09-26: *"ideally it could
 * interpret both Russian and English simultaneously… new speakers won't be
 * able to give it commands in Russian on what they want to learn"*).
 *
 * He is right and it is the thing that makes a tutor usable: a beginner has
 * to be able to say "how do I say I want tea" in English and «я хочу чай» in
 * Russian **in the same breath**, and a recogniser pinned to one language
 * turns the other into nonsense — an en-US engine writes Russian as
 * approximate English words, and a ru-RU engine writes English in Cyrillic.
 *
 * One microphone cannot run two recognisers, so this is not two sessions: it
 * is Android's own automatic language switching (API 34+,
 * `EXTRA_ENABLE_LANGUAGE_SWITCH`), restricted to the two languages this app
 * ever wants. `balanced` rather than `quick_response` because a wrong switch
 * mid-sentence costs more than a slow one, and no `MAX_SWITCHES` because a
 * learner reaching for a Russian word inside an English question is the
 * normal case here rather than an edge one.
 *
 * It needs both language models on the device and it is silently ignored
 * where it is not supported, which is why nothing depends on it: the reply
 * is read by script downstream (Cyrillic is Russian), so the worst case is
 * one language recognised instead of two rather than a broken turn. */
const BOTH_LANGUAGES = (langs) => ({
  EXTRA_ENABLE_LANGUAGE_SWITCH: "balanced",
  EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES: langs,
});

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
/* The microphone permission, once granted, for the life of the process.
   Asking the platform on every press was a native round trip between the
   finger and the engine starting — part of the second the owner had to wait
   (2026-09-29: *"if you start talking too soon, it won't detect"*). */
let micGranted = false;
/* Forgotten when the engine reports it refused (the permission can be taken
   back in the system settings while the app is open), and between tests. */
export function forgetMicPermission() { micGranted = false; }

/* How long to wait for the engine to say audio has started before drawing
   the microphone as open anyway. Android reports it within a few hundred
   milliseconds; an engine that never reports must not leave the button
   looking busy for good. */
export const READY_FALLBACK_MS = 1500;

export function useRecognizer({ onFinal, onError, onQuiet, enabled = true, bias } = {}) {
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
  /* Whether the engine is running — from the moment it was started, which is
     before it can hear anything. The *phase* the screen reads only becomes
     "listening" when the engine reports audio (`audiostart`), so the button
     turns on when speaking will be heard rather than when the start was
     asked for; everything that ends or times an attempt reads this instead. */
  const engine = useRef(false);
  const readyTimer = useRef(null);
  /* Whether the attempt in flight ends by itself (`listen`) rather than on a
     release (`hold`). It decides what "the engine stopped with nothing" means:
     a finger let go too early, or a turn where nobody spoke. */
  const selfEnding = useRef(false);
  const cb = useRef({ onFinal, onError, onQuiet, bias });
  cb.current = { onFinal, onError, onQuiet, bias };
  /* The language of the hold in progress. Russian unless a hold said otherwise,
     and it rides out on `onFinal` so a screen with two microphones knows which
     one the words came through. */
  const lang = useRef(LANG);
  /* The languages a hands-free attempt will accept, or null for the one in
     `lang`. Set per attempt, because only the tutor's conversation wants
     both — an exercise listening for a Russian sentence should not be
     offered an English reading of it. */
  const both = useRef(null);

  /* What conversation mode has heard so far: the finals it has been handed,
     plus whatever partial is in flight. Android delivers a long turn in
     segments, so a turn is the segments joined rather than the last one. */
  const heard = useRef([]);
  const partial = useRef("");
  const silence = useRef(null);
  const cap = useRef(null);
  const spoken = () => heard.current.concat(partial.current || []).join(" ").replace(/\s+/g, " ").trim();

  const clearTimers = () => {
    if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; }
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    if (silence.current) { clearTimeout(silence.current); silence.current = null; }
    if (cap.current) { clearTimeout(cap.current); cap.current = null; }
    if (readyTimer.current) { clearTimeout(readyTimer.current); readyTimer.current = null; }
  };
  // The engine is up and hearing: now the button may say so.
  const ready = () => {
    if (readyTimer.current) { clearTimeout(readyTimer.current); readyTimer.current = null; }
    if (engine.current && phaseRef.current === "asking") go("listening");
  };

  const finish = (text, alternatives) => {
    clearTimers();
    engine.current = false;
    selfEnding.current = false;
    heard.current = [];
    partial.current = "";
    go("idle");
    if (cb.current.onFinal) {
      cb.current.onFinal(text, Date.now() - releasedAt.current, alternatives || [text], lang.current);
    }
  };

  /* A hands-free attempt that heard nothing. Said once, to the screen, so the
     conversation can decide whether to listen again or stop — the loop must be
     able to tell silence from an answer. */
  const quiet = () => {
    clearTimers();
    engine.current = false;
    selfEnding.current = false;
    heard.current = [];
    partial.current = "";
    go("idle");
    if (cb.current.onQuiet) cb.current.onQuiet();
  };

  /* The turn is over when the learner has been quiet for a moment. Every
     result pushes this out; when it fires, what has accumulated is the turn.
     Settle before stopping the engine, so the `end` that follows finds the
     phase already idle and does not report the same turn twice. */
  const armSilence = () => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = setTimeout(() => {
      silence.current = null;
      if (!engine.current || !selfEnding.current) return;
      const whole = spoken();
      if (!whole) { quiet(); try { M.abort(); } catch (e) { /* nothing to abort */ } return; }
      finish(whole, [whole]);
      try { M.stop(); } catch (e) { /* the end event may still arrive */ }
    }, SILENCE_MS);
  };

  useSpeechRecognitionEvent("audiostart", ready);
  useSpeechRecognitionEvent("speechstart", ready);
  useSpeechRecognitionEvent("result", (ev) => {
    if (!engine.current) return;
    ready();
    const all = (ev.results || []).map((r) => r && r.transcript).filter((t) => typeof t === "string");
    const text = all[0] || "";
    /* Held speech: the release decides, so a final result is the answer. */
    if (!selfEnding.current) {
      if (ev.isFinal) finish(text, all.length ? all : [text]);
      else setLive(text);
      return;
    }
    /* Conversation mode: accumulate and keep listening. A final here is one
       segment of a turn, not the end of it. */
    if (ev.isFinal) { if (text.trim()) heard.current.push(text.trim()); partial.current = ""; }
    else partial.current = text;
    const whole = spoken();
    setLive(whole);
    if (whole) {
      // Speech has started, so the "nobody is there" window no longer applies.
      if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; }
      armSilence();
    }
  });
  useSpeechRecognitionEvent("error", (ev) => {
    if (!engine.current) return;
    clearTimers();
    engine.current = false;
    const wasSelf = selfEnding.current;
    selfEnding.current = false;
    go("idle");
    const what = `${ev.error} ${ev.message || ""}`;
    if (/not-supported|not downloaded/i.test(what)) {
      setBlock({ why: "model", name: NAME[lang.current] || lang.current,
                 text: `${NAME[lang.current] || lang.current} is not installed for offline recognition.` });
    } else if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      forgetMicPermission();
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
    } else if (TRANSIENT[ev.error]) {
      setNote(TRANSIENT[ev.error]);
    } else {
      setBlock({ why: "engine", text: `Recognition failed: ${ev.error}` });
    }
    if (cb.current.onError) cb.current.onError(ev.error, Date.now() - releasedAt.current);
    /* In conversation mode a transient error is not a lost turn if words were
       already heard — deliver them rather than make the learner repeat
       themselves. With nothing heard it is a silent turn, and the loop is owed
       that news or it waits for a reply that is never coming. A real block is
       not silence, and the screen reads `block` for those. */
    if (wasSelf && TRANSIENT[ev.error]) {
      const whole = spoken();
      if (whole && cb.current.onFinal) {
        cb.current.onFinal(whole, Date.now() - releasedAt.current, [whole], lang.current);
      } else if (cb.current.onQuiet) cb.current.onQuiet();
    }
  });
  useSpeechRecognitionEvent("end", () => {
    if (!engine.current) return;
    /* Conversation mode holds the engine open, so an ending here is the
       platform closing the session under us. Whatever was heard is the turn. */
    if (selfEnding.current) {
      const whole = spoken();
      if (whole) finish(whole, [whole]); else quiet();
      return;
    }
    // Held speech ended without a final result. The last partial is what the
    // recogniser had, so use that rather than throw the attempt away.
    if (liveRef.current) finish(liveRef.current);
    else { engine.current = false; go("idle"); }
  });

  /* One way in for both: permission, then the engine. `self` says whether the
     attempt ends on its own (conversation mode) or waits for a release. */
  const begin = async (over, self) => {
    if (!enabled || phaseRef.current !== "idle") return;
    lang.current = (over && over.lang) || LANG;
    both.current = self && over && Array.isArray(over.langs) && over.langs.length > 1
      ? over.langs.slice() : null;
    setLive(""); setNote(null);
    releasedEarly.current = false;
    selfEnding.current = !!self;
    heard.current = [];
    partial.current = "";
    go("asking");
    let perm = { granted: micGranted };
    if (!micGranted) {
      try { perm = await M.requestPermissionsAsync(); } catch (e) { perm = { granted: false }; }
      micGranted = !!perm.granted;
    }
    if (!perm.granted) {
      go("idle");
      selfEnding.current = false;
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
      return;
    }
    if (releasedEarly.current) { go("idle"); selfEnding.current = false; return; }
    engine.current = true;
    startedAt.current = Date.now();
    readyTimer.current = setTimeout(() => { readyTimer.current = null; ready(); }, READY_FALLBACK_MS);
    /* Nothing releases a hands-free attempt, so the latency `onFinal` reports
       is measured from the moment it started listening. */
    if (self) releasedAt.current = Date.now();
    try {
      const hint = (cb.current.bias || []).filter((s) => typeof s === "string" && s.trim());
      const opts = { lang: lang.current, requiresOnDeviceRecognition: true, interimResults: true,
                     maxAlternatives: ALTERNATIVES, continuous: !!self,
                     ...(hint.length ? { contextualStrings: hint } : {}) };
      /* Both are Android extras, so a device or a library version that does
         not know them must not take the feature down with it: one retry
         without them, and the timer here still endpoints. */
      const extras = self
        ? { ...ANDROID_PATIENCE, ...(both.current ? BOTH_LANGUAGES(both.current) : {}) }
        : null;
      try { M.start(extras ? { ...opts, androidIntentOptions: extras } : opts); }
      catch (e) { M.start(opts); }
      if (self) {
        /* Nobody is there. Cleared the moment any word arrives. */
        watchdog.current = setTimeout(() => {
          watchdog.current = null;
          if (!engine.current || !selfEnding.current) return;
          quiet();
          try { M.abort(); } catch (e) { /* nothing to abort */ }
        }, NOTHING_MS);
        /* And a ceiling whatever happens, so the microphone cannot be left
           open for the rest of the session by an engine that never closes. */
        cap.current = setTimeout(() => {
          cap.current = null;
          if (!engine.current || !selfEnding.current) return;
          const whole = spoken();
          if (whole) finish(whole, [whole]); else quiet();
          try { M.abort(); } catch (e) { /* nothing to abort */ }
        }, LISTEN_MAX_MS);
      }
    } catch (e) {
      clearTimers();
      engine.current = false;
      go("idle");
      selfEnding.current = false;
      setBlock({ why: "engine", text: `Recognition failed: ${e.message || e}` });
    }
  };

  const hold = (over = {}) => begin(over, false);

  /* Conversation mode. `lang` is the language the engine starts in; `langs`
     asks it to follow the learner between those two (BOTH_LANGUAGES). The
     caller must not be speaking (§30h′). */
  const listen = (over = {}) => begin(over, true);

  /* Put the microphone down, wherever it is, and report nothing: the caller
     asked for this. The phase goes idle **before** the abort, because aborting
     raises "end" and a partial still in hand would otherwise be delivered as a
     turn the learner never finished saying. */
  const cancel = () => {
    clearTimers();
    selfEnding.current = false;
    heard.current = [];
    partial.current = "";
    const was = engine.current || phaseRef.current !== "idle";
    engine.current = false;
    go("idle");
    setLive("");
    if (was) { try { M.abort(); } catch (e) { /* nothing to abort */ } }
  };

  /* A recogniser that never reports "end" after stop() would leave the button
     stuck on "Listening…" and the whole activity behind it. The measured p95
     from release to result is 4.4 s (CLAUDE.md §30c); at WATCHDOG_MS the
     attempt is abandoned and said so. */
  const release = () => {
    releasedAt.current = Date.now();
    if (engine.current) {
      const stop = () => {
        stopTimer.current = null;
        if (!engine.current) return;
        try { M.stop(); } catch (e) { /* the end event still arrives */ }
      };
      const heldFor = Date.now() - startedAt.current;
      if (heldFor >= MIN_LISTEN_MS) stop();
      else stopTimer.current = setTimeout(stop, MIN_LISTEN_MS - heldFor);
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        watchdog.current = null;
        if (!engine.current) return;
        // The last partial is what the recogniser had; with nothing, say so.
        if (liveRef.current) finish(liveRef.current);
        else { engine.current = false; go("idle"); setNote("Nothing heard"); }
        try { M.abort(); } catch (e) { /* nothing to abort */ }
      }, WATCHDOG_MS);
    } else {
      releasedEarly.current = true;
    }
  };

  /* Android 13+ only: opens the system's model-download dialog. */
  const getModel = async () => {
    try { await M.androidTriggerOfflineModelDownload({ locale: lang.current }); } catch (e) { /* stays blocked */ }
  };

  return { phase, live, note, block, hold, release, listen, cancel, getModel,
           clearBlock: () => setBlock(null), setLive };
}
