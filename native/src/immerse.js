/* Where the learner was in Immerse, kept per profile (2026-10-01, the owner:
 * "if you navigate away from the immerse page, it remembers the exact state
 * you were in… leave briefly to go do some translation and want to continue
 * exactly where you're at"; and "recently viewed videos… so people don't have
 * to re-find their video", which became History, behind a button).
 *
 * Two things, in one AsyncStorage row per profile (`rb.immerse.<id>`):
 *   ui     — the library's search, filter, sort, channel and scroll offset
 *   videos — per video: where it was stopped (ms) and when it was last opened
 *
 * Not the learner database, and not `st`: a playback position changes every
 * few seconds, and writing it through the session would re-render the whole
 * app each time and add a row to the profile's history for nothing a review
 * could use. It is the screen's memory, not the learner's progress — losing
 * it costs a place in a video, never a card.
 *
 * Reads are synchronous from memory once `loadImmerse(profileId)` has run
 * (App.js calls it with the session); writes go to memory at once and to
 * storage a moment later, so a burst of position reports is one write. */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = (id) => `rb.immerse.${id}`;
const SAVE_MS = 1500;
/* History holds this many, newest first (the owner, 2026-10-01: "a history
   similar to YouTube"). The library is 321 videos, so this is most of it. */
export const HISTORY_MAX = 100;
/* A position this close to either end is not a place to come back to: the
   first seconds are the intro, the last are the outro. */
const EDGE_MS = 15000;

const empty = () => ({ ui: {}, videos: {} });
let profile = null;
let data = empty();
let timer = null;

export async function loadImmerse(profileId) {
  if (profileId === profile) return;
  flushImmerse();                     // the last profile's place goes under its own key
  profile = profileId;
  data = empty();
  if (!profileId) return;
  try {
    const raw = await AsyncStorage.getItem(KEY(profileId));
    const got = raw ? JSON.parse(raw) : null;
    if (got && typeof got === "object" && profile === profileId) {
      data = { ui: got.ui || {}, videos: got.videos || {} };
    }
  } catch (e) { /* an unreadable row is a fresh library, never a crash */ }
}

function save() {
  if (!profile) return;
  const id = profile;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (profile !== id) return;       // switched away; flushImmerse already wrote it
    AsyncStorage.setItem(KEY(id), JSON.stringify(data)).catch(() => {});
  }, SAVE_MS);
}

/* Write now: on the way to the background, so a killed app keeps its place. */
export function flushImmerse() {
  if (!profile || !timer) return;
  clearTimeout(timer);
  timer = null;
  AsyncStorage.setItem(KEY(profile), JSON.stringify(data)).catch(() => {});
}

export const libraryState = () => data.ui;
export function setLibraryState(patch) {
  data = { ...data, ui: { ...data.ui, ...patch } };
  save();
}

/* Opening a video puts it at the top of History. */
export function openedVideo(id, now = Date.now()) {
  const was = data.videos[id] || {};
  data = { ...data, videos: { ...data.videos, [id]: { ...was, opened: now } } };
  save();
}

/* Where it was stopped. Positions near the start or the end are kept as
   nothing, so a finished video reopens at its start, not on the credits. */
export function setVideoPosition(id, ms, durMs) {
  const at = ms < EDGE_MS || (durMs && ms > durMs - EDGE_MS) ? 0 : Math.round(ms);
  const was = data.videos[id] || {};
  if (was.at === at) return;
  data = { ...data, videos: { ...data.videos, [id]: { ...was, at } } };
  save();
}

export const videoPosition = (id) => ((data.videos[id] || {}).at || 0);

/* Most recent first, as many as HISTORY_MAX. */
export function watchHistory(max = HISTORY_MAX) {
  return Object.entries(data.videos)
    .filter(([, v]) => v.opened)
    .sort((a, b) => b[1].opened - a[1].opened)
    .slice(0, max)
    .map(([id, v]) => ({ id, at: v.at || 0, opened: v.opened }));
}

/* Tests start each case clean. */
export function resetImmerse() {
  clearTimeout(timer);
  timer = null;
  profile = null;
  data = empty();
}
