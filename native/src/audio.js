/* Playback: the collection's own recordings first, the device voice only for gaps.
 *
 * Same rule as the web app. expo-audio replaces the Audio element, expo-speech
 * replaces SpeechSynthesis; the decision of what to play is unchanged.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { audioUrl } from "./data";
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

export function speakTTS(text) {
  try {
    Speech.stop();
    Speech.speak(bare(text), { language: "ru-RU", rate: 0.9 });
    return true;
  } catch (e) {
    return false;
  }
}

/* Plays the real recording when the collection has one, otherwise the device voice.
   A failed load falls back rather than leaving the learner in silence. */
export async function say(text) {
  const url = audioUrl(text);
  if (!url) return speakTTS(text);
  await prepare();
  try {
    Speech.stop();
    if (player) { player.remove(); player = null; }
    player = createAudioPlayer({ uri: url });
    player.play();
    return true;
  } catch (e) {
    return speakTTS(text);
  }
}

export function stop() {
  try { Speech.stop(); } catch (e) {}
  try { if (player) player.pause(); } catch (e) {}
}

export const hasRealAudio = (text) => !!audioUrl(text);
