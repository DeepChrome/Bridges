/* The audio packs on the phone (2026-11-19).
 *
 * The clips for chapters past the first two come in packs — one zip a chapter,
 * ten to twenty megabytes — made by tools/build_word_assets.mjs and served by
 * the download host (tools/dl). The owner: *"background downloading future
 * chapters before the learner arrives so the learner doesn't have to wait when
 * it arrives at them. Just do whatever the standard practice in the mobile app
 * industry for this."* The standard practice is what this does: the app keeps
 * the current chapter and the next one on the phone, fetches quietly in the
 * background as the learner moves, never asks, and falls back to the device
 * voice for a word whose pack has not landed yet — and that miss is itself the
 * nudge that puts the pack next in the queue.
 *
 *   - `wantedPacks(stage)`: the chapters to hold — the learner's, the next,
 *     every earlier one (the review deals old words), then `more`.
 *   - `ensure(stage)`: fetch what is wanted and missing, one at a time, oldest
 *     wanted first; called on launch, on coming to the foreground, and when
 *     the learner's chapter changes (App.js). A failed fetch waits RETRY_MS
 *     before it is tried again, so a phone offline does not hammer.
 *   - a pack lands in the document directory (never the cache, which Android
 *     may clear) under its own id, with an `.ok` mark written last; a pack
 *     whose mark is missing is half-installed and fetched again. Packs this
 *     build does not know are deleted at boot (an old build's).
 *   - the resolver (packs.js): `{ uri }` for an installed pack's clip, null
 *     otherwise. Reads are synchronous off an in-memory set, so a speaker
 *     never waits on the file system.
 *
 * Nothing here is learner state; what is installed is a fact about the phone.
 * `deps` lets a test hand in the download and the unzip. */

import { useEffect, useState } from "react";
import { File, Directory, Paths } from "expo-file-system";
import { unzipSync } from "fflate";
import { setPackResolver } from "./packs";
import { PACKS } from "./wordaudio";

export const PACKS_URL = "https://bridges-dl.bridges-feedback.workers.dev/audio/";
export const RETRY_MS = 10 * 60 * 1000;
const OK = ".ok";

const installed = new Set();
const failedAt = new Map();          // pack id -> when the last fetch failed
const watchers = new Set();
let fetching = null;                 // the pack id on its way, or null
let booted = null;
let queue = [];

const dir = () => new Directory(Paths.document, "audio");
const packDir = (id) => new Directory(dir(), id);

export const packState = () => ({
  installed: [...installed], fetching, queued: queue.slice(),
  packs: PACKS.map((p) => ({ ...p, installed: installed.has(p.id), fetching: fetching === p.id })),
});
const tell = () => { const s = packState(); for (const fn of watchers) fn(s); };
export function onPacks(fn) { watchers.add(fn); return () => watchers.delete(fn); }
export function usePacks() {
  const [s, setS] = useState(packState);
  useEffect(() => onPacks(setS), []);
  return s;
}

/* The chapters a learner at `stage` (0-based) should hold, most wanted first. */
export function wantedPacks(stage, packs = PACKS) {
  const chapter = (stage || 0) + 1;
  const byChapter = (c) => packs.filter((p) => p.chapter === c);
  const out = [];
  out.push(...byChapter(chapter), ...byChapter(chapter + 1));
  for (let c = chapter - 1; c >= 1; c--) out.push(...byChapter(c));
  out.push(...packs.filter((p) => p.chapter === null));
  return out.map((p) => p.id);
}

/* What is on the phone, read once; packs this build does not know go. */
export function bootPacks() {
  if (!booted) {
    booted = (async () => {
      try {
        const d = dir();
        if (!d.exists) d.create({ intermediates: true, idempotent: true });
        const known = new Set(PACKS.map((p) => p.id));
        for (const entry of d.list()) {
          const id = entry.name;
          if (!(entry instanceof Directory)) { try { entry.delete(); } catch (e) { /* a stray file */ } continue; }
          if (!known.has(id)) { try { entry.delete(); } catch (e) { /* kept, harmless */ } continue; }
          if (new File(entry, OK).exists) installed.add(id);
          else { try { entry.delete(); } catch (e) { /* refetched */ } }
        }
      } catch (e) { /* no file system to speak of: everything is the device voice */ }
      tell();
    })();
  }
  return booted;
}

/* The clip, when its pack is here. A miss on a pack not yet fetched moves
   that pack to the front of the queue: the learner is in it now. */
function resolve(pack, name) {
  if (installed.has(pack.id)) return { uri: `${packDir(pack.id).uri}/${name}.mp3` };
  nudge(pack.id);
  return null;
}
setPackResolver(resolve);

let kick = null;
function nudge(id) {
  if (installed.has(id) || fetching === id) return;
  queue = [id].concat(queue.filter((x) => x !== id));
  if (!kick) kick = setTimeout(() => { kick = null; drain(); }, 50);
}

/* The default fetch: the zip into the cache, read whole, deleted. */
async function fetchZip(url) {
  const tmp = new Directory(Paths.cache, "audio-packs");
  if (!tmp.exists) tmp.create({ intermediates: true, idempotent: true });
  const f = await File.downloadFileAsync(url, tmp);
  try { return await f.bytes(); }
  finally { try { f.delete(); } catch (e) { /* already gone */ } }
}

/* One pack: fetched, unpacked file by file into its own directory, marked. */
export async function installPack(id, deps = {}) {
  const pack = PACKS.find((p) => p.id === id);
  if (!pack || installed.has(id)) return installed.has(id);
  const download = deps.download || fetchZip;
  const unzip = deps.unzip || unzipSync;
  const target = packDir(id);
  try {
    const bytes = await download(`${PACKS_URL}${id}.zip`);
    const entries = unzip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (target.exists) target.delete();
    target.create({ intermediates: true, idempotent: true });
    let n = 0;
    for (const [name, data] of Object.entries(entries)) {
      if (!name.endsWith(".mp3") || !data || !data.length) continue;
      const f = new File(target, name.split("/").pop());
      f.create({ overwrite: true, intermediates: true });
      f.write(data);
      n++;
    }
    if (!n) throw new Error("empty pack");
    const mark = new File(target, OK);
    mark.create({ overwrite: true });
    mark.write(String(n));
    installed.add(id);
    failedAt.delete(id);
    return true;
  } catch (e) {
    failedAt.set(id, Date.now());
    try { if (target.exists) target.delete(); } catch (e2) { /* refetched next time */ }
    return false;
  }
}

/* Work the queue, one pack at a time. */
let deps = {};
export function setPackDeps(d) { deps = d || {}; }
async function drain() {
  if (fetching) return;
  await bootPacks();
  while (queue.length) {
    const id = queue.shift();
    if (installed.has(id)) continue;
    const failed = failedAt.get(id);
    if (failed && Date.now() - failed < RETRY_MS && !deps.now) continue;
    fetching = id; tell();
    await installPack(id, deps);
    fetching = null; tell();
  }
}

/* What a learner at `stage` should hold, fetched in the background. */
export async function ensurePacks(stage) {
  await bootPacks();
  for (const id of wantedPacks(stage)) {
    if (!installed.has(id) && !queue.includes(id) && fetching !== id) queue.push(id);
  }
  return drain();
}

/* Everything, for a learner going offline (Settings). */
export const downloadAllPacks = () => { for (const p of PACKS) failedAt.delete(p.id); return ensurePacks(PACKS.length); };

export async function removePack(id) {
  try { const d = packDir(id); if (d.exists) d.delete(); } catch (e) { /* nothing to remove */ }
  installed.delete(id);
  tell();
}
export async function removeAllPacks() { for (const p of PACKS) await removePack(p.id); }

/* Tests start each case with nothing on the phone. */
export function resetPacks() {
  installed.clear(); failedAt.clear(); queue = []; fetching = null; booted = null; deps = {};
  if (kick) { clearTimeout(kick); kick = null; }
}

/* How a pack reads in a list: "Chapter 3 · 12 MB". */
export const packName = (p) => (p.chapter ? `Chapter ${p.chapter}` : `More words${/\d+$/.test(p.label) && p.label !== "more1" ? ` ${p.label.replace("more", "")}` : ""}`);
export const packSize = (p) => `${Math.max(1, Math.round((p.bytes || 0) / 1048576))} MB`;
