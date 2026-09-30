/* Playback: the collection's own recordings first, the device voice only for gaps.
 *
 * Same rule as the web app. expo-audio replaces the Audio element, expo-speech
 * replaces SpeechSynthesis; the decision of what to play is unchanged.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Directory, Paths } from "expo-file-system";
import * as Speech from "expo-speech";
import { audioUrl } from "./data";
import { bare, fold } from "@core/util";
import { wordClip } from "./wordaudio";
import { sexOf } from "@core/names";
import { castById } from "@core/cast";
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

/* **Sound belongs to the screen that started it** (2026-09-29).
 *
 * The owner: *"audio will play even if I change screens… make sure the audio
 * gets cut if you switch away from the screen"*. Stopping on leave was wired
 * into the flow screens only, and only on unmount — so a word entry pushed
 * over a lesson, another tab, or Settings left the lesson mounted and its
 * recording playing. Every start now records the route it began on
 * (`routeOf`, supplied by App.js from the navigation ref) and App.js calls
 * `leftFor(key)` on every navigation: sound owned by any other route stops.
 * A screen's own autoplay on arrival is started *before* the navigation event
 * reaches the container, already owned by the new route, so it survives. */
let routeOf = () => null;
let owner = null;
export function setRouteSource(fn) { routeOf = typeof fn === "function" ? fn : () => null; }
const here = () => { try { return routeOf(); } catch (e) { return null; } };
const claim = (route) => { owner = route === undefined ? here() : route; };
export function leftFor(key) {
  if (owner !== null && owner !== key) { owner = null; stop(); }
}

/* **Streamed recordings, kept on the phone once fetched** (2026-09-29).
 *
 * The owner: «Следуйте за мной» *"has a huge delay before it starts"*. It is a
 * dictionary example — one of the collection's recordings that still stream
 * from the web host (§27) — and measured, the file itself begins speaking at
 * once: none of 200 sampled has more than a tenth of a second of lead
 * silence. The wait was the download, paid on every press. So a streamed
 * recording is fetched into the cache the first time it is wanted and played
 * from there after; and a speaker that has sat on screen for a moment fetches
 * its recording before anybody presses it (`warm`, called by `Speaker`), so
 * the first press is usually the local copy too. Bundled clips need none of
 * this. The cache directory is the OS's to purge, which costs a re-fetch and
 * nothing else. */
let cacheDir = null;
const dirOf = () => {
  if (!cacheDir) {
    cacheDir = new Directory(Paths.cache, "audio");
    try { if (!cacheDir.exists) cacheDir.create(); } catch (e) { /* played from the web instead */ }
  }
  return cacheDir;
};
const fileOf = (url) => new File(dirOf(), url.split("/").pop());
/* **A copy is the phone's only once it is whole** (2026-09-29, the owner:
   *"it sort of cuts out mid sentence and then sometimes comes back… then the
   same card had a different voice"*). The download used to write straight into
   the file the player reads, and a copy counted as there the moment it was
   non-empty — so a press during the download played half a recording, stalled
   where the bytes ran out, and sometimes caught up; and a stall that errored
   fell back to the phone's own voice, which is the other voice he heard. It is
   fetched into a directory of its own and moved into place when complete,
   and nothing still being fetched is ever a local copy. */
let tmpDir = null;
const tmpOf = () => {
  if (!tmpDir) {
    tmpDir = new Directory(Paths.cache, "audio-partial");
    try { if (!tmpDir.exists) tmpDir.create(); } catch (e) { /* downloads then fail, and the web plays */ }
  }
  return tmpDir;
};
function localCopy(url) {
  if (fetching.has(url)) return null;
  try { const f = fileOf(url); return f.exists && f.size > 0 ? f.uri : null; } catch (e) { return null; }
}
const fetching = new Map();
function fetchCopy(url) {
  if (fetching.has(url) || localCopy(url)) return;
  const part = () => new File(tmpOf(), url.split("/").pop());
  const job = File.downloadFileAsync(url, tmpOf())
    .then(async (got) => {
      const done = got && typeof got.move === "function" ? got : part();
      await Promise.resolve(done.move(fileOf(url)));
    })
    .catch(() => { try { const f = part(); if (f.exists) f.delete(); } catch (e) { /* nothing there */ } })
    .finally(() => fetching.delete(url));
  fetching.set(url, job);
}
/* Fetch ahead the recording `text` would stream, if it has one. */
export function warm(text) {
  if (!text || wordClip(fold(text))) return;
  const url = audioUrl(text);
  if (url) fetchCopy(url);
}

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
/* The one English voice, for the interpreter's other half (2026-09-23). Not
   required the way the Russian one is: a phone with no English voice still
   reads the Russian side, and `speakLine` falls back to the language tag. */
let enVoice = null;
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
        const ens = (voices || []).filter((v) => v.language && /^en/i.test(v.language));
        enVoice = ens.find((v) => /^en[-_]US/i.test(v.language)) || ens[0] || null;
      } catch (e) {
        ruVoices = [];
        ruVoice = null;                 // no enumeration: treat as no voice
        enVoice = null;
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
  enVoice = null;
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

/* A character of the cast (core/cast.js) read by the device: a voice of their
   sex, seeded by their id so it is the same phone voice every time, then their
   `tone` on top — Teddy small and bright, Monka slow and goofy — the same
   shift the bought conversations carry (build_scene_tracks.mjs). The tutor is
   Teddy; a Talk scenario is whoever it names. Spread into speakLine's opts. */
export function voiceFor(id) {
  const c = castById[id];
  if (!c) return {};
  const v = castVoices([{ ru: c.ru, sex: c.sex }], c.id)[0] || {};
  const tone = c.tone || { pitch: 1, tempo: 1 };
  return {
    voice: v.voice || undefined, language: v.language,
    pitch: (v.pitch || 1) * tone.pitch,
    rate: prefs.rate * tone.tempo,
    tempo: tone.tempo,
  };
}

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
export const DEFAULT_CUE = "confirm1";
export const DEFAULT_WRONG = "wrong1";
const prefs = { rate: 1.0, cue: DEFAULT_CUE, wrongCue: DEFAULT_WRONG };
/* An unknown id — including every cue of the old synthesised set a profile
   may still hold — leaves the default in place rather than a silent cue. */
export const rightCueOf = (id) => (id && CUES.right[id] ? id : DEFAULT_CUE);
export const wrongCueOf = (id) => (id && CUES.wrong[id] ? id : DEFAULT_WRONG);
export function configureAudio({ speed, cue: cueId, wrongCue } = {}) {
  const s = SPEEDS.find((x) => x.id === speed);
  prefs.rate = s ? s.rate : 1.0;
  prefs.cue = rightCueOf(cueId);
  prefs.wrongCue = wrongCueOf(wrongCue);
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
    claim();
    const end = begin();
    // Pin the voice, not just the language tag: the tag alone still lets the
    // platform fall back to whatever it has. `stress` keeps the acute, as
    // speakLine's does (§30ap): a single inflected form has no sentence
    // around it to tell the engine where the beat falls, and «руки́» and
    // «ру́ки» are the same letters.
    Speech.speak(opts.stress ? text : bare(text), {
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
  /* `lang: "en"` reads English — the interpreter's other half. No voice is
     required for it: English is the one language every Android engine ships,
     so the tag alone is enough where enumeration named nothing. */
  const en = opts.lang === "en";
  if (!en && !ruVoice) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    claim();
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
      /* `stress: true` keeps the combining acute instead of stripping it
         (2026-09-22, the word-building drill). A Russian TTS engine reads the
         mark as "the stress is here" — it is how за́мок and замо́к are told
         apart — and a **fragment** is exactly where it is needed: «рошо́» on
         its own has nothing else to say where the beat falls, and an engine
         guessing "РО-шо" makes the last two syllables of «хорошо» sound unlike
         the word they came out of, which is what the owner heard. A whole word
         or a sentence carries its own cues, so everything else still strips —
         an engine that ignored the mark would otherwise read it aloud. */
      Speech.speak(en || opts.stress ? text : bare(text), {
        language: en ? (enVoice ? enVoice.language : "en-US") : (opts.language || ruVoice.language),
        voice: en ? (enVoice ? enVoice.identifier : undefined) : (opts.voice || ruVoice.identifier),
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
  const asked = here();
  const abandoned = () => seq !== trackSeq || here() !== asked;
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
    claim(asked);
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
  /* `device: true` asks for the phone's voice even where a recording exists.
     The flashcards offer it as "one voice": the collection's recordings come
     from four sources with different readers (§27), so a deck of them jumps
     between a man on one card and the phone's woman on the next — the owner,
     2026-09-17, on «смотреть». A recording is still the better sound; this is
     the learner choosing consistency over it, and it goes through `speakTTS`
     like any word with no recording, so nothing about it is a second path. */
  if (opts.device) {
    const spoke = speakTTS(text, { ...opts, rate });
    if (!spoke) failed(text);
    return spoke;
  }
  /* Bundled first (ROADMAP 13.32, then 2026-09-19): every curriculum word and
     every sentence the speaking and listening pools hold is a bought clip
     shipped inside the app — no network, no 404, one voice. `wordaudio.js`
     keys them by the folded utterance, as the collection's manifest is keyed
     (rule 20.2). What still streams is the rest of the collection: the
     dictionary's example sentences and the human recordings. */
  /* `clip` is a recording the caller has already chosen — a table form looks
     its own up by the *accented* spelling (formaudio.js), because the folded
     key below cannot tell «руки́» from «ру́ки». */
  const bundled = opts.clip || wordClip(fold(text));
  const streamed = bundled ? null : audioUrl(text);
  // The phone's own copy when there is one; otherwise the web, and fetch a
  // copy while it plays so the next press does not wait.
  const local = streamed ? localCopy(streamed) : null;
  if (streamed && !local) fetchCopy(streamed);
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
  // The screen that asked. Left before the sound could start, it never starts.
  const asked = here();
  await prepare();
  if (seq !== trackSeq || here() !== asked) return false;
  const fallback = () => {
    if (seq !== trackSeq) return;       // superseded: the fallback would overlap
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
          // A local copy that will not play is a bad copy: gone, so the next
          // press fetches it again rather than failing the same way.
          if (local) { try { fileOf(streamed).delete(); } catch (e) { /* already gone */ } }
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
    claim(asked);
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

/* Kenney's Interface Sounds (CC0, kenney.nl), 2026-09-30. The ten cues
   synthesised by the old make_sounds.py read as "computer generated" to the
   owner, and he chose Kenney's free packs over paying for one. Six for a right
   answer, four for a wrong one, both chosen in Settings by ear — nobody at the
   desk could listen, so the names say where each came from rather than
   claiming what it sounds like. Kept on their own players so a cue never
   interrupts, or gets interrupted by, the word being spoken. */
export const CUE_NAMES = [
  { id: "confirm1", name: "Confirm 1" }, { id: "confirm2", name: "Confirm 2" },
  { id: "confirm3", name: "Confirm 3" }, { id: "confirm4", name: "Confirm 4" },
  { id: "rise1", name: "Rise 1" }, { id: "rise2", name: "Rise 2" },
];
export const WRONG_NAMES = [
  { id: "wrong1", name: "Low 1" }, { id: "wrong2", name: "Low 2" },
  { id: "wrong3", name: "Low 3" }, { id: "wrong4", name: "Low 4" },
];
const CUES = {
  right: {
    confirm1: require("../assets/sfx/right-confirm1.wav"),
    confirm2: require("../assets/sfx/right-confirm2.wav"),
    confirm3: require("../assets/sfx/right-confirm3.wav"),
    confirm4: require("../assets/sfx/right-confirm4.wav"),
    rise1: require("../assets/sfx/right-rise1.wav"),
    rise2: require("../assets/sfx/right-rise2.wav"),
  },
  wrong: {
    wrong1: require("../assets/sfx/wrong-1.wav"),
    wrong2: require("../assets/sfx/wrong-2.wav"),
    wrong3: require("../assets/sfx/wrong-3.wav"),
    wrong4: require("../assets/sfx/wrong-4.wav"),
  },
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
  if (kind === "wrong") return playCue("wrong:" + prefs.wrongCue, CUES.wrong[prefs.wrongCue], 0.5);
  if (kind === "right") return playCue("right:" + prefs.cue, CUES.right[prefs.cue], 0.45);
  return false;
}

/* Hear one of the choices before choosing it. */
export function previewCue(id) {
  if (CUES.right[id]) return playCue("right:" + id, CUES.right[id], 0.45);
  if (CUES.wrong[id]) return playCue("wrong:" + id, CUES.wrong[id], 0.5);
  return false;
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
