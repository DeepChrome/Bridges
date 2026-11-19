/* Sound on the desktop: the bought clips (one voice, §30bq) through an
 * <audio> element, the system's Russian voice where there is no clip.
 *
 * `say(text, opts)` resolves when the sound ends. One sound at a time: a new
 * one stops the last, as on the phone. The device voice is never dressed as
 * a recording — `hasRealAudio(text)` says which a word gets, and the speaker
 * button reads it. */

import { fold } from "@core/util";
import { wordClip } from "../../../native/src/wordaudio.js";
import { formClip } from "../../../native/src/formaudio.js";
import { setPackResolver } from "../../../native/src/packs.js";

/* The phone fetches chapters' clips in packs (native/src/audiopacks.js); the
   desktop ships every file, so a packed clip is its asset URL like any other. */
setPackResolver((pack, name) => `ya://assets/words/${name}.mp3`);

export const SPEEDS = [
  { id: "normal", name: "Normal", rate: 1 }, { id: "slower", name: "Slower", rate: 0.8 }, { id: "slowest", name: "Slowest", rate: 0.65 },
];
let speed = "normal";
export const configureAudio = ({ speed: s }) => { if (s) speed = s; };
const rateOf = () => (SPEEDS.find((x) => x.id === speed) || SPEEDS[0]).rate;

function clipFor(text) {
  const t = String(text || "").normalize("NFC").trim();
  return formClip(t) || wordClip(fold(t)) || null;
}
export const hasRealAudio = (text) => !!clipFor(text);

let player = null, seq = 0, utterance = null;

export function stop() {
  seq++;
  if (player) { try { player.pause(); } catch (e) { /* nothing playing */ } player = null; }
  if (utterance && window.speechSynthesis) { window.speechSynthesis.cancel(); utterance = null; }
}

/* The Russian voice the system offers: a woman's where there is one, like
   the clips (§30bp). */
let voice = null;
function russianVoice() {
  if (!window.speechSynthesis) return null;
  const all = window.speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
  if (!all.length) return null;
  voice = all.find((v) => /irina|svetlana|female|женск/i.test(v.name)) || all[0];
  return voice;
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { voice = null; };

function speakTTS(text, lang = "ru-RU") {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(false); return; }
    const u = new SpeechSynthesisUtterance(String(text).normalize("NFD").replace(/[̀́]/g, "").normalize("NFC"));
    u.lang = lang;
    const v = lang === "ru-RU" ? (voice || russianVoice()) : null;
    if (v) u.voice = v;
    u.rate = rateOf();
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    utterance = u;
    window.speechSynthesis.speak(u);
  });
}

function playUrl(url, rate) {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.playbackRate = rate;
    a.preservesPitch = true;
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    player = a;
    a.play().catch(() => resolve(false));
  });
}

/* `device: true` forces the system voice; `clip` names a URL to play. A call
   superseded by a later one resolves false without falling back, or the
   fallback would be the thing overlapping (§23). */
export async function say(text, { device = false, clip, rate } = {}) {
  stop();
  const my = seq;
  const url = clip || (device ? null : clipFor(text));
  const r = rate || rateOf();
  if (url) {
    const ok = await playUrl(url, r);
    if (my !== seq) return false;
    if (ok) return true;
  }
  if (my !== seq) return false;
  return speakTTS(text);
}

/* A short cue: right or wrong (Kenney's Interface Sounds, as the phone). */
export function cue(kind) {
  const name = kind === "right" ? "confirm1" : "wrong1";
  const a = new Audio(`ya://assets/sfx/${name}.mp3`);
  a.volume = 0.6;
  a.play().catch(() => {});
}
