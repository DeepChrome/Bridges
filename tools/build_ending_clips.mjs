#!/usr/bin/env node
/* The sound of each word ending, cut off a word said well (2026-09-29).
 *
 * The owner, on Practice → Word endings: *"the word selections and demos are
 * perfect… but on the top right where it demos just the noise that the
 * combination makes, a lot of times it's inaccurate… maybe we can explore
 * somehow chopping it off the full word that you pronounce well."* That button
 * asked the phone's voice to read a respelling («ово», «ца», «а», «оф»), and a
 * voice handed a lone fragment reads it however it likes — sometimes as a
 * letter's name.
 *
 * So the ending is cut from a recording of a whole word that has it: an
 * example with more syllables than the ending, the longest available. Its
 * loudness is measured every 10 ms, the syllable peaks are found, and the cut
 * falls in the quietest point before the ending's syllables (as many as the
 * respelling has vowels). **The check that makes it trustworthy**: the peaks
 * found must equal the word's vowel count. Where they do not, the syllables
 * were not told apart cleanly, nothing is cut, and the button keeps the device
 * voice — said in the report, never guessed.
 *
 * Nobody here can listen. What this can promise is that a cut lands between
 * syllables; whether it sounds right is a listen on the phone.
 *
 *   node tools/build_ending_clips.mjs   # writes native/assets/endings/ and native/src/endingaudio.js
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ENDINGS } from "../core/endings.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE = join(ROOT, "native");
const OUT_DIR = join(NATIVE, "assets", "endings");
const RATE = 16000;
const WIN = 160;               // 10 ms at 16 kHz
const MIN_GAP = 9;             // two syllable peaks are at least 90 ms apart
const PEAK_SHARE = 0.25;       // a peak is at least this share of the loudest
const LEAD = 1;                // start the cut 10 ms before the dip
const VOWELS = /[аеёиоуыэюя]/giu;

const vowels = (s) => (s.normalize("NFC").match(VOWELS) || []).length;

// Every recording the app ships for a word or a form, by the text it says.
const clips = {};
for (const [file, fold] of [["formaudio.js", false], ["wordaudio.js", true]]) {
  const src = readFileSync(join(NATIVE, "src", file), "utf8");
  for (const m of src.matchAll(/"([^"]+)":\s*require\("\.\.\/assets\/words\/([^"]+)"\)/g)) {
    const key = m[1].normalize("NFC");
    if (!clips[key]) clips[key] = join(NATIVE, "assets", "words", m[2]);
    if (fold) continue;
  }
}
const foldKey = (w) => w.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
const clipOf = (w) => clips[w.normalize("NFC")] || clips[foldKey(w)] || null;

function envelope(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"],
                      { maxBuffer: 64 << 20 });
  if (r.status !== 0) return null;
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const env = [];
  for (let i = 0; i + WIN <= pcm.length; i += WIN) {
    let s = 0;
    for (let j = i; j < i + WIN; j++) s += pcm[j] * pcm[j];
    env.push(Math.sqrt(s / WIN));
  }
  // A five-frame moving average, so a consonant's burst is not a syllable.
  return env.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(env.length - 1, i + 2); j++) { s += env[j]; n++; }
    return s / n;
  });
}

function peaks(env) {
  const top = Math.max(...env);
  const out = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < PEAK_SHARE * top || env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
    if (out.length && i - out[out.length - 1] < MIN_GAP) {
      if (env[i] > env[out[out.length - 1]]) out[out.length - 1] = i;
      continue;
    }
    out.push(i);
  }
  return out;
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const made = [], skipped = [];
for (const e of ENDINGS) {
  const k = vowels(e.say);
  /* An example whose last k syllables hold the whole pattern — so the cut
     carries the ending and nothing before it. «чу́вствовать» has -вств- two
     syllables from its end and would have given «-вать»; «чу́вство» gives
     «-ство». Longest first among those, for the most room to find a dip. */
  const plain = (w) => w.normalize("NFD").replace(/[\u0300\u0301]/g, "").normalize("NFC").toLowerCase();   // ё kept: -ё is an ending
  const tail = (w) => { const m = plain(w).match(e.re); return m ? vowels(m[0]) : 99; };
  const cands = e.examples.filter((w) => clipOf(w) && vowels(w) > k && tail(w) <= k)
    .sort((a, b) => vowels(b) - vowels(a));
  let done = null, why = cands.length ? "" : "no example longer than the ending has a recording";
  for (const w of cands) {
    const env = envelope(clipOf(w));
    if (!env) { why = `${w}: could not decode`; continue; }
    const p = peaks(env);
    if (p.length !== vowels(w)) { why = `${w}: ${p.length} peaks for ${vowels(w)} vowels`; continue; }
    const a = p[p.length - k - 1], b = p[p.length - k];
    let dip = a;
    for (let i = a; i <= b; i++) if (env[i] < env[dip]) dip = i;
    const start = Math.max(0, dip - LEAD) * WIN / RATE;
    const out = join(OUT_DIR, `${e.id}.mp3`);
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", start.toFixed(3), "-i", clipOf(w),
                                   "-af", "afade=t=in:d=0.015", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", out]);
    if (r.status !== 0) { why = `${w}: ffmpeg failed`; continue; }
    done = { id: e.id, from: w, at: Math.round(start * 1000), ms: Math.round((env.length - dip + LEAD) * WIN / RATE * 1000) };
    break;
  }
  /* Nothing could be cut cleanly: the whole example word, said well, still
     demonstrates the ending — «друг» is how a final г sounds — where the
     device reading a lone fragment does not. */
  if (!done) {
    const w = e.examples.find((x) => clipOf(x));
    if (w) {
      const out = join(OUT_DIR, `${e.id}.mp3`);
      writeFileSync(out, readFileSync(clipOf(w)));
      done = { id: e.id, from: w, whole: true, ms: 0 };
      skipped.push(`${e.id} (${e.end}): whole «${w}» (${why})`);
    }
  }
  if (done) made.push(done); else skipped.push(`${e.id} (${e.end}): ${why}; device voice`);
}

const body = made.map((m) => `  ${JSON.stringify(m.id)}: { src: require("../assets/endings/${m.id}.mp3"), from: ${JSON.stringify(m.from)}${m.whole ? ", whole: true" : ""} },`).join("\n");
writeFileSync(join(NATIVE, "src", "endingaudio.js"),
  `/* GENERATED by tools/build_ending_clips.mjs — do not edit. Each ending's sound,\n` +
  `   cut from a recording of a whole word that has it (\`from\`). */\n\n` +
  `export const ENDING_CLIPS = {\n${body}\n};\n`);
console.log(`${made.filter((m) => !m.whole).length} of ${ENDINGS.length} endings cut from a word, ${made.filter((m) => m.whole).length} played as the whole word`);
for (const m of made.filter((x) => !x.whole)) console.log(`  ${m.id.padEnd(5)} from ${m.from.padEnd(14)} ${String(m.ms).padStart(4)} ms`);
if (skipped.length) {
  console.log(`${skipped.length} not cut:`);
  for (const s of skipped) console.log(`  ${s}`);
}
