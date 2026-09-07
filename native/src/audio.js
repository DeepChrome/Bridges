/* Playback: the collection's own recordings first, the device voice only for gaps.
 *
 * Same rule as the web app. expo-audio replaces the Audio element, expo-speech
 * replaces SpeechSynthesis; the decision of what to play is unchanged.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { audioUrl } from "./data";
import { cachedUri } from "./cache";
import { bare } from "@core/util";

let player = null;
let ready = false;

async function prepare() {
  if (ready) return;
  try {
    // Study out loud with the ringer silenced — the usual case on a phone.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch (e) { /* not fatal; playback still works with default routing */ }
  ready = true;
}

/* Whether this device can actually say Russian.
 *
 * Asking the platform to speak ru-RU when no Russian voice is installed does not
 * fail — Android quietly substitutes the default voice, which reads Cyrillic as
 * nonsense in English. That is worse than silence: it is wrong audio presented as
 * the language being learned, which rule 27 forbids. The web app has always found a
 * voice first and disabled the button without one (app.js pickVoice); this is that
 * rule, ported.
 *
 * Probed once, asynchronously. Until it resolves there is no voice, so a recording
 * still plays and TTS stays quiet — the safe way round. */
let ruVoice = null;
let probe = null;
const voiceListeners = new Set();

export function hasRussianVoice() {
  return !!ruVoice;
}

export function probeVoices() {
  if (!probe) {
    probe = (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        ruVoice = (voices || []).find((v) => v.language && /^ru/i.test(v.language)) || null;
      } catch (e) {
        ruVoice = null;                 // no enumeration: treat as no voice
      }
      voiceListeners.forEach((fn) => fn());
      return ruVoice;
    })();
  }
  return probe;
}

/* Re-render a speaker once the probe lands. */
export function onVoicesChanged(fn) {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

/* Ask again. The set of installed voices is not fixed for the life of the process —
   someone can install a Russian language pack and come back — so the answer has to
   be refreshable rather than decided once at launch. */
export function refreshVoices() {
  probe = null;
  ruVoice = null;
  return probeVoices();
}

probeVoices();

/* What is playing right now, as a promise that settles when it ends — by
   finishing, by being replaced, by being stopped, or (a stalled stream) by the
   guard below. Anything that must not talk over the language audio awaits
   whenIdle() first; the runner's autoplay does. */
let current = Promise.resolve();
let settle = null;
// A stream that never reports finishing would hold the next question forever.
// Fifteen seconds is longer than any recording in the collection (the longest
// pooled sentence is under ten), so this only ever fires on a stall.
const STALL_MS = 15000;

function begin() {
  if (settle) settle();
  let done;
  current = new Promise((res) => { done = res; });
  const timer = setTimeout(() => done(), STALL_MS);
  settle = () => { clearTimeout(timer); done(); settle = null; };
  return settle;
}

export const whenIdle = () => current;

/* ------------------------------------------------------------ preferences */

/* How fast Russian is read, and which cue a right answer earns. Both are learner
   settings (You → Settings); the shell hands them here whenever they change, so
   playback never has to reach into state. */
export const SPEEDS = [
  { id: "normal", name: "Normal", rate: 1.0 },
  { id: "slower", name: "Slower", rate: 0.8 },
  { id: "slowest", name: "Slowest", rate: 0.65 },
];
/* The second of two presses in a row plays at three quarters of the chosen speed,
   the third at full again: hear it, then hear it slowly, without a control. */
const REPEAT_RATE = 0.75;
const REPEAT_WINDOW_MS = 6000;
const prefs = { rate: 1.0, cue: "bell" };
export function configureAudio({ speed, cue: cueId } = {}) {
  const s = SPEEDS.find((x) => x.id === speed);
  prefs.rate = s ? s.rate : 1.0;
  if (cueId && CUES.right[cueId]) prefs.cue = cueId;
}
export const audioPrefs = () => ({ ...prefs });

let last = { text: null, at: 0, slow: false };

/* The rate this utterance plays at: the setting, and slowed for a repeat. A
   caller that is not a learner's press (the runner reading an answer out) asks
   for `repeat: false` so it neither slows nor counts as a press. */
function rateFor(text, opts) {
  const now = Date.now();
  const repeat = opts.repeat !== false && last.text === text && now - last.at < REPEAT_WINDOW_MS;
  const slow = opts.slow !== undefined ? !!opts.slow : (repeat && !last.slow);
  if (opts.repeat !== false) last = { text, at: now, slow };
  // A caller may name a speed of its own (the Talk tutor has one) instead of the setting.
  const chosen = opts.speed ? SPEEDS.find((x) => x.id === opts.speed) : null;
  return (chosen ? chosen.rate : prefs.rate) * (slow ? REPEAT_RATE : 1);
}

export function speakTTS(text, opts = {}) {
  if (!ruVoice) return false;
  try {
    Speech.stop();
    const end = begin();
    // Pin the voice, not just the language tag: the tag alone still lets the
    // platform fall back to whatever it has.
    Speech.speak(bare(text), {
      language: ruVoice.language, voice: ruVoice.identifier,
      rate: 0.9 * (opts.rate || rateFor(text, opts)),
      onDone: end, onStopped: end, onError: end,
    });
    return true;
  } catch (e) {
    if (settle) settle();
    return false;
  }
}

/* Plays the real recording when the collection has one, otherwise the device voice.
   A failed load falls back rather than leaving the learner in silence. Resolves
   with true/false for whether anything started; the playback itself is tracked
   by whenIdle(). */
export async function say(text, opts = {}) {
  const rate = rateFor(text, opts);
  // The offline copy when there is one (cache.js), else the stream.
  const url = cachedUri(text) || audioUrl(text);
  if (!url) return speakTTS(text, { ...opts, rate });
  await prepare();
  try {
    Speech.stop();
    if (player) { player.remove(); player = null; }
    const end = begin();
    player = createAudioPlayer({ uri: url });
    if (player.addListener) {
      player.addListener("playbackStatusUpdate", (s) => {
        if (s && (s.didJustFinish || s.error)) end();
      });
    }
    if (rate !== 1 && typeof player.setPlaybackRate === "function") {
      // Slower, not lower: pitch correction keeps the voice the same voice.
      try { player.shouldCorrectPitch = true; player.setPlaybackRate(rate, "high"); } catch (e) {}
    }
    player.play();
    return true;
  } catch (e) {
    if (settle) settle();
    return speakTTS(text, { ...opts, rate });
  }
}

export function stop() {
  try { Speech.stop(); } catch (e) {}
  try { if (player) player.pause(); } catch (e) {}
  if (settle) settle();
}

export const hasRealAudio = (text) => !!audioUrl(text);

/* ------------------------------------------------------------------- cues */

/* Generated by tools/make_sounds.py. Kept on their own players so a cue never
   interrupts, or gets interrupted by, the word being spoken. Ten cues for a right
   answer, chosen in settings (CUE_NAMES is the menu); one for a wrong one. */
export const CUE_NAMES = [
  { id: "bell", name: "Bell" }, { id: "chime", name: "Chime" },
  { id: "glass", name: "Glass" }, { id: "wood", name: "Wood" },
  { id: "harp", name: "Harp" }, { id: "triad", name: "Three notes" },
  { id: "warm", name: "Warm" }, { id: "pop", name: "Pop" },
  { id: "kalimba", name: "Kalimba" }, { id: "fifth", name: "Fifth" },
];
const CUES = {
  right: {
    bell: require("../assets/sfx/correct-bell.wav"),
    chime: require("../assets/sfx/correct-chime.wav"),
    glass: require("../assets/sfx/correct-glass.wav"),
    wood: require("../assets/sfx/correct-wood.wav"),
    harp: require("../assets/sfx/correct-harp.wav"),
    triad: require("../assets/sfx/correct-triad.wav"),
    warm: require("../assets/sfx/correct-warm.wav"),
    pop: require("../assets/sfx/correct-pop.wav"),
    kalimba: require("../assets/sfx/correct-kalimba.wav"),
    fifth: require("../assets/sfx/correct-fifth.wav"),
  },
  wrong: require("../assets/sfx/wrong.wav"),
};
const cuePlayers = {};

function playCue(key, src, volume) {
  try {
    if (!cuePlayers[key]) {
      cuePlayers[key] = createAudioPlayer(src);
      // Under the language audio, not over it. The cues are quiet by design.
      cuePlayers[key].volume = volume;
    }
    const p = cuePlayers[key];
    if (typeof p.seekTo === "function") p.seekTo(0);
    p.play();
    return true;
  } catch (e) {
    return false;
  }
}

export function cue(kind) {
  if (kind === "wrong") return playCue("wrong", CUES.wrong, 0.5);
  if (kind === "right") return playCue("right:" + prefs.cue, CUES.right[prefs.cue], 0.45);
  return false;
}

/* Hear one of the choices before choosing it. */
export function previewCue(id) {
  const src = CUES.right[id];
  return src ? playCue("right:" + id, src, 0.45) : false;
}

const CYRILLIC = /[Ѐ-ӿ]/;

/* What is worth hearing is the Russian, whichever part of the question holds it.
   Reading an English gloss aloud teaches nothing, so a question whose correct
   option is English falls back to the Russian on the prompt. */
export function answerAudioText(q, correctOption) {
  const label = correctOption && correctOption.label;
  if (label && CYRILLIC.test(label)) return label;
  if (q.say && CYRILLIC.test(q.say)) return q.say;
  if (q.target && CYRILLIC.test(q.target)) return q.target;
  if (q.prompt && CYRILLIC.test(q.prompt)) return q.prompt;
  return null;
}
