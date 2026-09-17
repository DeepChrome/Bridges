/* Playback: the collection's own recordings first, the device voice only for gaps.
 *
 * Same rule as the web app. expo-audio replaces the Audio element, expo-speech
 * replaces SpeechSynthesis; the decision of what to play is unchanged.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { audioUrl } from "./data";
import { cachedUri, dropCached } from "./cache";
import { bare, fold } from "@core/util";
import { wordClip } from "./wordaudio";
import { sexOf } from "@core/names";
import { knownVoiceSex, rankVoice } from "@core/voices";

/* When nothing could play — the stream failed and there is no Russian voice —
   whoever drew the speaker is told, so the learner sees "No audio right now"
   rather than a button that does nothing. */
const failListeners = new Set();
export function onAudioFailure(fn) { failListeners.add(fn); return () => failListeners.delete(fn); }
const failed = (text) => failListeners.forEach((fn) => fn(text));

let player = null;
let ready = false;
/* Bumped by every attempt to take the audio session — `say()` and `playTrack()`
   both — so an attempt can tell that a later one took over while it was waiting
   on a promise. One counter, because there is one `player`: whoever asked last
   is what should be heard. */
let trackSeq = 0;

/* Giving a player back: **pause first, then remove**, and never one without the
 * other.
 *
 * `remove()` alone does not reliably stop what is already coming out of the
 * speaker — it releases the app's handle, and the sound carries on with nothing
 * left to stop it. Every disposal site but `stop()` used to call it bare, which
 * is why pausing a scenario went on playing and why starting anything else
 * played on top of it rather than instead of it (the owner, 2026-09-11, after
 * the first fix: *"When I pause the app, it just continues, and if I press other
 * buttons, it will spawn multiple overlapping audios"*).
 *
 * `pause()` alone is the mirror mistake and is already recorded in §23: a paused
 * player keeps the Android audio session and silences whatever plays next. Both,
 * in this order, is the only correct way to let one go. */
function release(p) {
  if (!p) return;
  try { p.pause(); } catch (e) {}
  try { p.remove(); } catch (e) {}
}

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
let ruVoices = [];
let probe = null;
const voiceListeners = new Set();

export function hasRussianVoice() {
  return !!ruVoice;
}

/* Every Russian voice the device has, in the order the platform lists them.
   A conversation needs more than one (§30k′): the scenario activity gives each
   speaker a voice of their own from here, and falls back to pitch when the
   phone only has one installed. */
export function russianVoices() {
  return ruVoices;
}

export function probeVoices() {
  if (!probe) {
    probe = (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        ruVoices = (voices || []).filter((v) => v.language && /^ru/i.test(v.language));
        ruVoice = ruVoices[0] || null;
      } catch (e) {
        ruVoices = [];
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
  ruVoices = [];
  return probeVoices();
}

/* Which sex a voice sounds like, as far as the platform will say.
 *
 * Google's text-to-speech names a modern voice `ru-ru-x-ruf#female_1-local`,
 * and that marker is the only thing on either platform that states this
 * outright — the rest of the identifier is an opaque three-letter code, and
 * guessing sex from it would be inventing data. So: read the marker where
 * there is one, read a plain "female"/"male" in the identifier or the name
 * where there is one, and otherwise answer `null` and let the caller cope.
 * Never guess. */
export function voiceSex(v) {
  const id = (v && v.identifier) || "";
  const s = `${id} ${(v && v.name) || ""}`.toLowerCase();
  // Where the platform states it outright, that is the answer.
  if (/#?female/.test(s)) return "f";
  if (/#?male/.test(s)) return "m";
  // Otherwise what was heard on a real phone (core/voices.js).
  return knownVoiceSex(id);
}

/* How far pitch is moved when a voice of the right sex is not available.
   It does not turn a man into a woman — nothing can, short of the phone
   having the voice — but it separates the speakers and points in the right
   direction. Android takes 0.5–2.0; a sixth either way is plainly a different
   person and still sounds like a person. */
const PITCH_UP = 1.18, PITCH_DOWN = 0.86;

/* How a cast of speakers is shared out over the voices this phone has.
 *
 * Different voices are what make a conversation followable — the owner,
 * 2026-09-10: *"different voices are key"*. The first cut handed them out in
 * the order Android happened to list them, which is not related to anything:
 * whoever spoke first got voice zero, and he heard it immediately — *"Masha
 * clearly sounds like a guy instead of a girl."*
 *
 * So the cast is matched by **sex** first (`core/names.js` says who each
 * character is), and only what is left over is separated by pitch:
 *
 *   1. a free voice the platform says is that sex — the good case, pitch 1;
 *   2. otherwise any free voice, pitched up for a woman and down for a man,
 *      so the direction is right even when the voice is not;
 *   3. otherwise a voice already in use, pitched away from its other speaker,
 *      because two characters sharing one voice unseparated is the one
 *      outcome that makes a conversation impossible to follow.
 *
 * Deterministic in the cast, so a character keeps their voice for the whole
 * scenario and across every replay. */
/* Stable, small, and spread — enough to turn a lesson's name into a number
   that does not correlate with the next lesson's. */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function castVoices(cast, seed = "") {
  const list = Array.isArray(cast) ? cast : [];
  const want = list.map((c) => (c && (c.sex || sexOf(c.ru))) || null);

  /* Best voices first, and **rotated by the lesson**. Taking the same first
     woman every time would make 168 conversations sound like the same two
     people; the phone has half a dozen of each, so a lesson gets its own pair
     and keeps them for every replay. Rotation rather than randomness because a
     scenario must sound the same the second time it is played. */
  const pools = { f: [], m: [], u: [] };
  ruVoices.slice()
    .sort((a, b) => rankVoice(a.identifier) - rankVoice(b.identifier))
    .forEach((v) => pools[voiceSex(v) || "u"].push(v));
  const turn = hash(seed);
  Object.keys(pools).forEach((k) => {
    const p = pools[k];
    if (p.length > 1) pools[k] = p.slice(turn % p.length).concat(p.slice(0, turn % p.length));
  });
  /* Last of all, and only if nothing else is left: the voices that are listed
     and say nothing (core/voices.js). A silent speaker is worse than a wrong
     one, so they sit behind even a voice of the other sex. */
  const rest = ruVoices.slice().sort((a, b) => rankVoice(a.identifier) - rankVoice(b.identifier));

  const used = new Set();
  const mine = new Array(list.length);

  /* Sex matches are settled **before** anybody takes a voice that is not
     theirs. Doing it in cast order instead let the first speaker walk off with
     the only male voice, and the man who owned it was then the one pitched
     about — which is the same bug as the original, one step along. */
  want.forEach((sex, k) => {
    if (!sex || mine[k]) return;
    const v = pools[sex].find((x) => !used.has(x.identifier));
    if (v) { used.add(v.identifier); mine[k] = v; }
  });
  want.forEach((sex, k) => {
    if (mine[k]) return;
    const v = rest.find((x) => !used.has(x.identifier));
    if (v) { used.add(v.identifier); mine[k] = v; }
  });

  const taken = new Set();
  return list.map((c, k) => {
    const sex = want[k];
    // Still nothing means there are fewer voices than speakers: share one.
    const v = mine[k] || (rest.length ? rest[k % rest.length] : null);
    let pitch = 1;
    if (v && sex && voiceSex(v) !== sex) {
      // Not the sex this character is. Pitch cannot make a man a woman, but it
      // points the right way and keeps the two of them apart.
      pitch = sex === "f" ? PITCH_UP : PITCH_DOWN;
    }
    // Two speakers on one voice at one pitch is the one outcome that makes a
    // conversation impossible to follow; move the later one further.
    while (v && taken.has(`${v.identifier}|${pitch.toFixed(3)}`)) {
      pitch = pitch >= 1 ? pitch * 1.06 : pitch * 0.94;
    }
    if (v) taken.add(`${v.identifier}|${pitch.toFixed(3)}`);
    return {
      voice: v ? v.identifier : null,
      language: (v && v.language) || (ruVoice && ruVoice.language) || "ru-RU",
      pitch,
    };
  });
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

/* One line of a conversation, in a named voice, awaited to its end.
 *
 * Deliberately not `say()`: that prefers a recording from the collection when
 * there is one, and a scenario where one line is a studio recording and the
 * rest are the device reading two parts is not a conversation — the speaker a
 * line belongs to would change voice mid-exchange. A written scenario is the
 * device throughout, and the screen says so (§27).
 *
 * Resolves when the line has been spoken, been stopped, or failed, so the
 * caller can run the next one. The watchdog is the same idea as `STALL_MS` and
 * for the same reason: a platform that never reports `onDone` would otherwise
 * hold the scenario forever. */
export function speakLine(text, opts = {}) {
  if (!ruVoice) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const end = begin();
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      end();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 4000 + text.length * 400);
    try {
      Speech.stop();
      Speech.speak(bare(text), {
        language: opts.language || ruVoice.language,
        voice: opts.voice || ruVoice.identifier,
        pitch: opts.pitch || 1,
        rate: 0.9 * (opts.rate || prefs.rate),
        onDone: () => finish(true),
        onStopped: () => finish(false),
        onError: () => finish(false),
      });
    } catch (e) {
      finish(false);
    }
  });
}

/* One scenario, played as one file (§30l).
 *
 * A written conversation is now bought as audio rather than read by the phone
 * (tools/build_scenario_audio.mjs), and stitched into a track per lesson, so
 * this is a single player over a known timeline instead of a queue of
 * utterances — which is what makes the position real and a seek land anywhere
 * rather than on a line boundary.
 *
 * Returns a handle, or null when nothing could be played: the caller then falls
 * back to the device voices, which is also what happens on a phone that never
 * gets the assets. `pos()` is milliseconds; `stop()` **removes** the player
 * rather than pausing it, because a paused one keeps the Android audio session
 * (§23) — resuming re-creates it and seeks, which costs nothing audible.
 *
 * `rateOverride` is the scenario's slow button (PLAYBOOK 3.4). `pos()` reads
 * the player's own `currentTime`, which is a position in the media rather
 * than elapsed wall time, so a slowed track still reports where it is. */
export async function playTrack(source, from = 0, rateOverride) {
  if (!source) return null;
  /* Nothing here is audible until two awaits have passed — the audio session,
     then the seek — and a finger on "back five seconds" arrives inside that gap.
     Two calls in flight used to leave two players, and the first one was the one
     nobody held a reference to any more: it played on underneath the second.
     The owner heard it as recordings overlapping (2026-09-11).
     So the last call wins, decided here rather than by whichever promise
     happened to settle last: a superseded attempt never reaches `play()`, and
     says so by answering null. */
  const seq = ++trackSeq;
  const abandoned = () => seq !== trackSeq;
  await prepare();
  if (abandoned()) return null;
  try {
    Speech.stop();
    if (player) { release(player); player = null; }
    const end = begin();
    const mine = createAudioPlayer(source);
    player = mine;
    let over = false;
    const drop = () => {
      if (player === mine) player = null;
      release(mine);
      end();
      return null;
    };
    if (mine.addListener) {
      mine.addListener("playbackStatusUpdate", (s) => {
        if (!s) return;
        if (s.error && player === mine) { over = true; end(); }
        else if (s.didJustFinish) { over = true; end(); }
      });
    }
    if (from > 0 && typeof mine.seekTo === "function") {
      try { await mine.seekTo(from / 1000); } catch (e) {}
      if (abandoned()) return drop();
    }
    /* The learner's Reading speed setting, unless the caller asked for a
       particular rate — the scenario's slow button does, and it has to win
       over the global setting rather than multiply with it. */
    const rate = rateOverride || prefs.rate;
    if (rate !== 1 && typeof mine.setPlaybackRate === "function") {
      try { mine.shouldCorrectPitch = true; mine.setPlaybackRate(rate, "high"); } catch (e) {}
    }
    mine.play();
    return {
      /* Where the track is, in milliseconds. `currentTime` is seconds and is
         the player's own, so a slowed rate reports the right place. */
      pos: () => Math.round(((mine.currentTime || 0) * 1000) || from),
      ended: () => over,
      /* Whether this handle is still the one playing. A caller that was
         superseded must not act on its own handle — stopping it would tear down
         the player that took over. */
      live: () => player === mine && seq === trackSeq,
      stop: () => {
        /* Always released, even when somebody else now owns the session: this
           handle's player is still the thing making a noise. Only the shared
           `player` slot is left alone when it is not ours. */
        if (player === mine) player = null;
        release(mine);
        if (settle) settle();
      },
    };
  } catch (e) {
    if (settle) settle();
    return null;
  }
}

/* Plays the real recording when the collection has one, otherwise the device voice.
   A failed load falls back rather than leaving the learner in silence: a
   synchronous failure at once, and a stream that reports an error after it
   started (a 404, a dropped connection, a cached file cut off mid-download —
   which is also deleted) through the same fallback. With no device voice either
   the speaker is told (onAudioFailure). Resolves with true/false for whether
   anything started; the playback itself is tracked by whenIdle(). */
export async function say(text, opts = {}) {
  const rate = rateFor(text, opts);
  /* Bundled first (ROADMAP 13.32). 61 curriculum words have no recording in
     the collection at all — mostly perfective verbs, which is what the aspect
     drill asks about — and they were read by the device voice. They are bought
     clips shipped inside the app, so they need no network and cannot 404;
     `wordaudio.js` keys them by the folded word, as the collection's manifest
     is keyed (rule 20.2). */
  const bundled = wordClip(fold(text));
  // The offline copy when there is one (cache.js), else the stream.
  const local = bundled ? null : cachedUri(text);
  const streamed = bundled ? null : audioUrl(text);
  /* A bundled clip is a `require`, which expo-audio takes as it is — the same
     way `playTrack` and the answer cues pass theirs. Only a URL needs the
     `{ uri }` wrapper, and wrapping a module id in one plays silence. */
  const source = bundled || (local ? { uri: local } : streamed ? { uri: streamed } : null);
  if (!source) {
    const spoke = speakTTS(text, { ...opts, rate });
    if (!spoke) failed(text);
    return spoke;
  }
  /* The same race as `playTrack`, and this one is reached by a control the app
     positively invites a learner to press twice (§30h: a second press within six
     seconds plays it slower). Whoever asked last is what should be heard. */
  const seq = ++trackSeq;
  await prepare();
  if (seq !== trackSeq) return false;
  const fallback = () => {
    if (seq !== trackSeq) return;       // superseded: the fallback would overlap
    // A bundled clip cannot be a stale download, so there is nothing to drop.
    if (local && !bundled) dropCached(text);
    if (!speakTTS(text, { ...opts, rate })) failed(text);
  };
  try {
    Speech.stop();
    if (player) { release(player); player = null; }
    const end = begin();
    const mine = createAudioPlayer(source);
    player = mine;
    if (mine.addListener) {
      mine.addListener("playbackStatusUpdate", (s) => {
        if (!s) return;
        if (s.error && player === mine) {
          end();
          fallback();
        } else if (s.didJustFinish) {
          end();
        }
      });
    }
    if (rate !== 1 && typeof mine.setPlaybackRate === "function") {
      // Slower, not lower: pitch correction keeps the voice the same voice.
      try { mine.shouldCorrectPitch = true; mine.setPlaybackRate(rate, "high"); } catch (e) {}
    }
    mine.play();
    return true;
  } catch (e) {
    if (settle) settle();
    fallback();
    return hasRussianVoice();
  }
}

/* Stop, and give the audio back.
 *
 * This used to pause the player and leave it allocated. A paused `expo-audio`
 * player still holds the Android audio session, so the next thing that wants
 * sound is handed silence — and the next thing is usually the YouTube WebView
 * on the video screen, which has no way to say why it has no audio. The owner,
 * 2026-09-10: "going from a lesson into a youtube video, the audio doesn't play
 * unless I restart the app". Restarting worked because it tore the player down,
 * which is the tell: the state that had to be cleared was ours.
 *
 * `say()` always removed the previous player before making a new one, so this
 * only ever leaked on the path where nothing plays next — leaving a flow. That
 * is also why it was intermittent: go to a video without having played anything
 * and there is nothing held. */
export function stop() {
  /* Anything still opening a player is abandoned too. Stopping only what has
     already started leaves the half-opened one to begin playing a moment later,
     with nothing holding it — which is how leaving a screen could still be
     followed by a sentence. */
  trackSeq++;
  try { Speech.stop(); } catch (e) {}
  release(player);
  player = null;
  if (settle) settle();
}

/* Everything the app holds, handed back — the cue players too, which are cached
   for the life of the process by design (see playCue) and are therefore the one
   thing `stop()` cannot reach. Called by any screen whose audio is not ours to
   play, so it starts from a clean session whatever came before it.
   `ready` is cleared so the next `prepare()` re-arms the session. */
export function releaseAudio() {
  stop();
  for (const key of Object.keys(cuePlayers)) {
    release(cuePlayers[key]);
    delete cuePlayers[key];
  }
  ready = false;
}

/* Whether a fixed recording exists for this, rather than the phone reading it
 * aloud — which is the distinction §27's rule actually draws, and the one the
 * speaker's colour shows. It has never meant "a human said this": the
 * collection is mostly TTS already (10,314 Core 5000 utterances and 2,334
 * Yandex), and what the label protects against is the *device voice* being
 * mistaken for a prepared recording.
 *
 * The 61 bundled clips (ROADMAP 13.32) are prepared recordings of exactly that
 * kind, bought from the same voices as the scenarios, so they count. Nothing
 * anywhere claims a human said them. */
export const hasRealAudio = (text) => !!wordClip(fold(text)) || !!audioUrl(text);

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
