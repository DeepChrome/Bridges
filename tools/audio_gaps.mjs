#!/usr/bin/env node
/* Silences inside a bought clip's speech.
 *
 * A tester, of the shadowing drill's «Спасибо, хорошо. А вы?» (2026-10-25):
 * "Long pause between the two fragments." Chirp3-HD puts a pause at a full
 * stop inside a sentence and sometimes a far longer one where nothing is
 * written (§30cf: «я знаю, ты знаешь» carried 1.36 s after «ты»). The trim
 * (tools/audio_trim.mjs) only touches the two ends, so an inner pause ships as
 * bought. This measures them: for every shipped sentence clip, the longest
 * run of 10 ms frames under SPEECH_DB between the first and the last frame of
 * speech.
 *
 *   node tools/audio_gaps.mjs                 sentences over GAP_MS, longest first
 *   node tools/audio_gaps.mjs --all           every clip, words too
 *   node tools/audio_gaps.mjs --min 500       another threshold
 *   node tools/audio_gaps.mjs --json FILE     the measurements, for the asset build
 *
 * Reads the trimmed clips the app ships (data/_work/words/trim2 — what a
 * learner hears, not the purchase), falling back to the purchase where a clip
 * has not been trimmed yet. The measurement is cached by clip id in
 * data/_work/words/gaps.json, since decoding 3,000 clips takes minutes. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { innerGap, SPEECH_DB } from "./mp3.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "word_audio");
const TRIMMED = join(ROOT, "data", "_work", "words", "trim2");
const CACHE = join(ROOT, "data", "_work", "words", "gaps.json");

/* An inner pause longer than this is a fault in a sentence: a full stop's own
   pause from the voice measures 250–450 ms. */
export const GAP_MS = 600;

const arg = (n) => { const k = process.argv.indexOf(n); return k > 0 ? process.argv[k + 1] : null; };
const ALL = process.argv.includes("--all");
const MIN = Number(arg("--min")) || GAP_MS;

/* The longest inner silence of every clip in `files` ({ key: id }), cached. */
export function gapsOf(files, { log = () => {} } = {}) {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const out = {};
  let n = 0, measured = 0;
  for (const [key, id] of Object.entries(files)) {
    n++;
    if (!(id in cache)) {
      const file = [join(TRIMMED, id + ".mp3"), join(SRC, id + ".mp3")].find(existsSync);
      cache[id] = file ? innerGap(file) : null;
      measured++;
      if (measured % 200 === 0) { log(`${measured} measured`); save(cache); }
    }
    out[key] = { id, gap: cache[id] };
  }
  save(cache);
  log(`${n} clips, ${measured} newly measured`);
  return out;
}

function save(cache) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
  const files = Object.fromEntries(Object.entries(manifest.files || {})
    .filter(([k]) => ALL || / /.test(k)));
  const gaps = gapsOf(files, { log: (s) => console.error(s) });
  const rows = Object.entries(gaps).filter(([, g]) => g.gap !== null && g.gap >= MIN)
    .sort((a, b) => b[1].gap - a[1].gap);
  const measured = Object.values(gaps).filter((g) => g.gap !== null);
  console.log(`${measured.length} clips measured (speech is a 10 ms frame over ${SPEECH_DB} dBFS); ` +
              `${rows.length} with an inner silence of ${MIN} ms or more\n`);
  for (const [key, g] of rows) console.log(`${String(g.gap).padStart(5)} ms  ${g.id}  ${key}`);
  const out = arg("--json");
  if (out) writeFileSync(out, JSON.stringify(gaps, null, 1));
}
