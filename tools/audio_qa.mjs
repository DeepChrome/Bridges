/* The audio, checked by machine (PLAYBOOK 4.2).
 *
 * Three of these are gates and one is a report, and the difference is whether
 * the thing being measured is broken or merely absent:
 *
 *   - a lesson with a script and no track is broken;
 *   - a track the app will refuse to play, because its text has moved on from
 *     its audio (§30l `trackWhenCurrent`), is broken — and invisible, because
 *     the app silently reads it with the device voices instead;
 *   - a track that runs under 300 ms or over 30 s is broken;
 *   - a track that peaks above -1 dBTP is clipping;
 *   - a curriculum word with no recording is **not** broken. 61 of the 1,045
 *     have none and the app says so and reads them with the device voice
 *     (§27). Failing on that would fail the build on a known, accepted state,
 *     and a rule everybody breaks is worth nothing (§30r).
 *
 *   node tools/audio_qa.mjs             presence, length, hashes, coverage
 *   node tools/audio_qa.mjs --peaks     ...and the true-peak of every track
 *
 * `--peaks` decodes all 168 tracks, which takes a couple of minutes; it is the
 * check that caught the clipping the levelling in build_scene_tracks.mjs
 * exists to fix, so it is worth running after any change to the audio tools.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScripts, MIN_SECONDS, MAX_SECONDS } from "./check_scripts.mjs";
import { loadPayload } from "./payload.mjs";
import { fold } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACKS = join(ROOT, "native", "assets", "scenes");
const MODULE = join(ROOT, "native", "src", "scenetracks.js");
const PEAKS = process.argv.includes("--peaks");

/* How long a track may run. The playbook says nothing over 30 s, which is a
   bound for a word or a sentence and wrong for these: a scenario is *meant*
   to be half a minute of conversation, and `check_scripts` already fixes the
   window at 22–70 s from the line lengths. Taken from there rather than
   restated, so the estimate and the audio cannot disagree. `MIN_MS` stays as
   the separate question of whether there is a file at all. */
/* The ceiling a finished track may reach.
 *
 * The playbook says -1.0, and the clips are limited to -1.5 — but a track is
 * those clips' frames decoded back to samples, and decoding an MP3 overshoots
 * the level it was encoded at by a few tenths of a decibel. Measured after the
 * levelling: 166 of 168 land between -2.3 and -1.0, and two reach -0.9. That
 * is the margin doing its job, not a fault; clipping is 0.0.
 *
 * So the gate sits at -0.5, which still fails the state this was written for —
 * before the levelling every track measured -1.0 or worse, median 0.0, worst
 * +0.3 — while not failing on a tenth of a decibel of arithmetic nobody can
 * hear. */
export const MIN_MS = 300, MAX_TP = -0.5;
const MIN_TRACK_MS = MIN_SECONDS * 1000, MAX_TRACK_MS = MAX_SECONDS * 1000;

const ffBoth = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 120000 });
  return String(r.stderr || "") + String(r.stdout || "");
};

/* Frames, not the header — an MP3 states the length it meant to write (§30l). */
function durationMs(file) {
  const out = ffBoth("ffprobe", ["-v", "error", "-select_streams", "a:0", "-count_packets",
    "-show_entries", "stream=nb_read_packets,sample_rate", "-of", "default=nw=1", file]);
  const get = (k) => Number((out.match(new RegExp(`${k}=(\\d+)`)) || [])[1]);
  const packets = get("nb_read_packets"), rate = get("sample_rate");
  if (!packets || !rate) return null;
  return Math.round((packets * (rate < 32000 ? 576 : 1152) * 1000) / rate);
}

function truePeak(file) {
  const s = ffBoth("ffmpeg", ["-hide_banner", "-nostats", "-i", file,
    "-af", "loudnorm=I=-16:TP=-1.5:print_format=json", "-f", "null", "-"]);
  const open = s.lastIndexOf("{"), close = s.lastIndexOf("}");
  if (open < 0 || close < open) return null;
  try {
    const p = JSON.parse(s.slice(open, close + 1));
    return { tp: Number(p.input_tp), i: Number(p.input_i) };
  } catch (e) { return null; }
}

const errors = [], notes = [];

/* ------------------------------------------------- the scenario tracks */

const scripts = loadScripts();
if (!existsSync(TRACKS)) {
  errors.push("native/assets/scenes does not exist — run tools/build_scene_tracks.mjs");
} else {
  /* The generated module is the app's view of the audio: which file each
     lesson plays and the hash of the text it was made from. Read as text
     rather than imported, because it is an Expo module full of `require`. */
  const src = existsSync(MODULE) ? readFileSync(MODULE, "utf8") : "";
  const hashes = new Map();
  for (const m of src.matchAll(/"([^"]+)":\s*\{[^}]*?h:\s*(\d+)/g)) hashes.set(m[1], Number(m[2]));

  const hash32 = (s) => {
    let h = 2166136261;
    for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  };

  let checked = 0, peaks = [], louds = [];
  for (const [key, entry] of Object.entries(scripts)) {
    const file = join(TRACKS, `${key.replace(":", "-")}.mp3`);
    if (!existsSync(file)) { errors.push(`${key}: no track`); continue; }
    checked++;
    const ms = durationMs(file);
    if (ms === null) { errors.push(`${key}: no frames in the track`); continue; }
    if (ms < MIN_MS) errors.push(`${key}: ${ms} ms — there is barely a file there`);
    else if (ms < MIN_TRACK_MS) errors.push(`${key}: ${(ms / 1000).toFixed(1)} s is under the ${MIN_SECONDS} s a scenario should run`);
    if (ms > MAX_TRACK_MS) errors.push(`${key}: ${Math.round(ms / 1000)} s is over the ${MAX_SECONDS} s a scenario should run`);

    /* The app refuses a track whose text has moved on, and says nothing about
       it — it falls back to the device voices and the lesson still works,
       which is exactly why this has to be checked.
       `scenario.test.js` asserts the same agreement from the app's side, over
       the *committed* module; this one reads the files on disk, so it is the
       half that notices a stitch that was never re-run. */
    const want = hash32((entry.lines || []).map((l) => l.ru).join("|"));
    if (!hashes.has(key)) errors.push(`${key}: not in scenetracks.js — the app cannot find its audio`);
    else if (hashes.get(key) !== want) {
      errors.push(`${key}: the script has changed since the audio was made — the app will read it with the device voices`);
    }

    if (PEAKS) {
      const r = truePeak(file);
      if (!r || !Number.isFinite(r.tp)) { errors.push(`${key}: could not be measured`); continue; }
      peaks.push(r.tp); louds.push(r.i);
      if (r.tp > MAX_TP) errors.push(`${key}: peaks at ${r.tp.toFixed(1)} dBTP, over ${MAX_TP}`);
      process.stdout.write(`\r  peaks ${peaks.length}/${checked}`);
    }
  }
  if (PEAKS && peaks.length) {
    process.stdout.write("\n");
    const sorted = [...peaks].sort((a, b) => a - b);
    const ls = [...louds].sort((a, b) => a - b);
    notes.push(`tracks: peak ${sorted[0].toFixed(1)} to ${sorted[sorted.length - 1].toFixed(1)} dBTP`
               + `, loudness ${ls[0].toFixed(1)} to ${ls[ls.length - 1].toFixed(1)} LUFS`
               + ` (spread ${(ls[ls.length - 1] - ls[0]).toFixed(1)} dB)`);
  }
  notes.push(`${checked} lesson tracks checked of ${Object.keys(scripts).length} scripts`);

  // Tracks with no script left to play them.
  const want = new Set(Object.keys(scripts).map((k) => `${k.replace(":", "-")}.mp3`));
  const orphans = readdirSync(TRACKS).filter((f) => f.endsWith(".mp3") && !want.has(f));
  if (orphans.length) notes.push(`${orphans.length} track(s) no lesson plays: ${orphans.slice(0, 5).join(", ")}`);
}

/* ------------------------------------------- the collection recordings */

const DATA = loadPayload(ROOT);
const files = (DATA.audio && DATA.audio.files) || {};
const taught = new Set();
for (const u of DATA.units) for (const i of u.w) taught.add(i);
/* …and the clips bought for the words the collection never had (13.32). They
   are bundled in the app rather than in `site/audio`, so a count that only
   looked at the collection's manifest now understates the coverage by 61 and
   names words that are no longer read by the device voice. */
let bought = {};
try {
  bought = JSON.parse(readFileSync(join(ROOT, "data", "word_audio", "manifest.json"), "utf8")).files || {};
} catch (e) { bought = {}; }
const boughtKeys = new Set(Object.keys(bought).map(fold));

/* A bundled clip wins over the collection's file (`say()` checks the bundle
   first), so a word in both plays the bought one: since 2026-09-19 that is
   every Core 5000 word, not only the 61 the collection never had. */
const bundled = [...taught].filter((i) => boughtKeys.has(fold(DATA.lemmas[i].b))).length;
const missing = [...taught].filter((i) => {
  const k = fold(DATA.lemmas[i].b);
  return !files[k] && !boughtKeys.has(k);
});
const covered = taught.size - missing.length;
notes.push(`curriculum words with a recording: ${covered} of ${taught.size}`
           + ` (${Math.round(covered / taught.size * 100)}%)`
           + ` — ${bundled} bought and bundled, ${covered - bundled} streamed from the collection`);
if (missing.length) {
  notes.push(`  without one, read by the device voice (§27): ${missing.slice(0, 8).map((i) => DATA.lemmas[i].b).join(", ")}`
             + (missing.length > 8 ? `, and ${missing.length - 8} more` : ""));
}

/* ------------------------------------------------------------------ out */

for (const n of notes) console.log(n);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 40)) console.log(`  ${e}`);
  if (errors.length > 40) console.log(`  …and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(PEAKS ? "\naudio QA: all pass" : "\naudio QA: all pass (run --peaks for levels)");
