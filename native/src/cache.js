/* Offline audio (ROADMAP P5.12).
 *
 * Recordings stream from the deployed site (data.js AUDIO_BASE). With the
 * setting on, opening a unit downloads that unit's audio — its words and the
 * sentences its speaking and listening pools hold — and the next unit's, to the
 * app's cache directory, and playback prefers the local copy. Bounded: only the
 * current and next unit are kept; files for any other unit are removed when a
 * new pair is fetched, and one pair is under CAP_BYTES. Nothing is downloaded
 * without the setting, and a failed download is skipped, never retried in a loop.
 *
 * `deps` lets tests substitute the file system.
 */

import { Directory, File, Paths } from "expo-file-system";
import { AUDIO, AUDIO_BASE, SPEECH, UN, L, STAGES } from "./data";
import { wordClip } from "./wordaudio";
import { fold } from "@core/util";

export const CAP_BYTES = 15 * 1024 * 1024;
const CONCURRENCY = 3;

const defaultDeps = {
  dir: () => new Directory(Paths.cache, "audio"),
  download: (url, dir) => File.downloadFileAsync(url, dir, { idempotent: true }),
};

let have = null;            // Set of cached file names, read once from disk
let deps = defaultDeps;

export function configureCache(d) { deps = { ...defaultDeps, ...d }; have = null; }

function ensure() {
  const dir = deps.dir();
  try { if (!dir.exists) dir.create(); } catch (e) { /* read-only: playback streams */ }
  return dir;
}

function names() {
  if (have) return have;
  have = new Set();
  try {
    for (const f of ensure().list()) {
      const n = (f.name || String(f.uri || "").split("/").pop() || "");
      if (n) have.add(n);
    }
  } catch (e) { /* no cache dir: nothing cached */ }
  return have;
}

/* The local file for an utterance, or null. Synchronous: say() must not wait. */
export function cachedUri(text) {
  const file = AUDIO[fold(text)];
  if (!file || !names().has(file)) return null;
  try { return new File(ensure(), file).uri; } catch (e) { return null; }
}

/* A cached copy that would not play — cut off by a lost connection mid-download,
   say — is removed so the next play streams and the next prefetch fetches it
   again. cachedUri() trusts any file present; this is the correction. */
export function dropCached(text) {
  const file = AUDIO[fold(text)];
  if (!file) return false;
  try { new File(ensure(), file).delete(); } catch (e) { /* already gone */ }
  names().delete(file);
  return true;
}

/* Every audio file a unit needs: its words, then its pools' sentences. A word
   the app carries as a bundled clip (wordaudio.js — nearly every curriculum
   word since 2026-09-19) is left out: `say()` plays the bundle first, so a
   download for it would never be heard. */
export function filesForUnit(unit) {
  const keys = [];
  for (const i of unit.w) if (L[i] && !wordClip(fold(L[i].b))) keys.push(L[i].b);
  for (const pool of ["speak", "listen"]) {
    for (const ri of (SPEECH[pool] && SPEECH[pool][unit.id]) || []) keys.push(SPEECH.rows[ri][0]);
  }
  const out = [], seen = new Set();
  for (const k of keys) {
    const f = AUDIO[fold(k)];
    if (f && !seen.has(f)) { seen.add(f); out.push(f); }
  }
  return out;
}

/* The unit after this one on the route, spine and branches in path order. */
export function nextUnit(unit) {
  const flat = STAGES.flatMap((s) => [s.core].concat(s.branches));
  const k = flat.indexOf(unit);
  return k >= 0 && k + 1 < flat.length ? flat[k + 1] : null;
}

/* Fetch this unit's and the next's audio; drop everything else. Resolves with
   { fetched, kept, failed, bytes } — a report, so a screen can say what happened. */
export async function prefetchUnit(unit, onProgress) {
  const units = [unit].concat(nextUnit(unit) ? [nextUnit(unit)] : []);
  const wanted = [];
  const wantSet = new Set();
  for (const u of units) for (const f of filesForUnit(u)) if (!wantSet.has(f)) { wantSet.add(f); wanted.push(f); }
  const dir = ensure();
  const had = names();
  let removed = 0;
  for (const n of [...had]) {
    if (!wantSet.has(n)) {
      try { new File(dir, n).delete(); } catch (e) { /* stays; counted next time */ }
      had.delete(n);
      removed++;
    }
  }
  const todo = wanted.filter((f) => !had.has(f));
  let fetched = 0, failed = 0, bytes = 0;
  let at = 0;
  const worker = async () => {
    while (at < todo.length) {
      const f = todo[at++];
      try {
        const file = await deps.download(AUDIO_BASE + f, dir);
        bytes += (file && file.size) || 0;
        had.add(f);
        fetched++;
      } catch (e) {
        failed++;
      }
      if (onProgress) onProgress({ done: fetched + failed, total: todo.length });
      if (bytes > CAP_BYTES) break;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return { fetched, kept: had.size, failed, removed, bytes };
}

export function cacheStats() {
  const dir = ensure();
  let bytes = 0, files = 0;
  try {
    for (const f of dir.list()) { files++; bytes += f.size || 0; }
  } catch (e) { /* nothing cached */ }
  return { files, bytes };
}

export function clearCache() {
  const dir = ensure();
  try { for (const f of dir.list()) f.delete(); } catch (e) { /* nothing to clear */ }
  have = new Set();
}
