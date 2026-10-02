#!/usr/bin/env node
/* The sound of each word ending, said on its own in the app's one voice.
 *
 * Third way round, and the history is the reason for it:
 *
 *   1. The phone's voice reading a respelling («ово», «ца»): "a lot of times
 *      it's inaccurate" (the owner, 2026-09-29), and it is a second voice.
 *   2. Cut off the end of a bought word at the dip before its last syllables:
 *      "for some of them it's close, but others it's pronouncing part of the
 *      word" (2026-10-02). A syllable boundary found from a loudness envelope
 *      is a guess, and a coarticulated consonant always belongs to both sides
 *      of it — so the cut carried the tail of the syllable before.
 *   3. Now: the ending's **phonetic respelling** (`say` in core/endings.js —
 *      «ово» for -ого, «ца» for -ться, «оф» for -ов, a vowel before a devoiced
 *      final consonant so the consonant can be said at all) bought from the
 *      same Chirp3-HD voice every word in the app is read in, as the owner
 *      suggested. Nothing is cut, so nothing extra can be heard, and it is
 *      the same voice as the examples beside it.
 *
 * A one-syllable input is exactly where Chirp3 returns a blip (§30ao), so the
 * purchase goes through `buyOne`'s measure-and-retry. The bought clips are
 * kept in data/word_audio beside the words (they cost money; rule 20.3) and
 * listed in `endings.json` there; what ships is trimmed (audio_trim.mjs), levelled,
 * and opened on PAD_MS of silence so a phone opening its audio route does not
 * swallow a short sound (2026-10-01). `audio_qa.mjs` checks the shipped files.
 *
 *   GOOGLE_TTS_API_KEY=… node tools/build_ending_clips.mjs   # writes native/assets/endings/ and native/src/endingaudio.js
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { ENDINGS } from "../core/endings.js";
import { speechLevels } from "./mp3.mjs";
import { TRIM_FILTER } from "./audio_trim.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE = join(ROOT, "native");
const OUT_DIR = join(NATIVE, "assets", "endings");
const BOUGHT = join(ROOT, "data", "word_audio");
const MANIFEST = join(BOUGHT, "endings.json");
export const PAD_MS = 250;           // silence before the sound, for the audio route to open
export const MIN_SPEECH_MS = 120;    // less than this is a click, not a syllable
export const PEAK_DB = -1.5;         // the levelling gain stops here
export const QUIET_DB = -26;         // speech quieter than this has not been levelled
const TARGET_DB = -16;               // speech level a clip is brought to

const ffmpeg = (args) => spawnSync("ffmpeg", ["-v", "error", "-y", ...args]).status === 0;

/* Speech left in a clip once trimmed: what the learner will actually hear. */
function speechOf(src) {
  const tmp = join(tmpdir(), `ending-probe-${process.pid}.wav`);
  const ok = ffmpeg(["-i", src, "-af", TRIM_FILTER, "-ac", "1", tmp]);
  const lv = ok ? speechLevels(tmp) : null;
  rmSync(tmp, { force: true });
  return lv ? lv.speechMs : 0;
}

async function main() {
  const had = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const bought = {};
  let calls = 0, shop = null;
  for (const e of ENDINGS) {
    const prev = had[e.id];
    // A clip on disk, or a spelling already known to come back a blip.
    if (prev && prev.say === e.say && (prev.id === null || existsSync(join(BOUGHT, prev.id + ".mp3")))) {
      bought[e.id] = prev;
      continue;
    }
    /* Two endings can share a respelling (-о and -а both sound «а»), and a
       clip is named by its text, so they share a file: the second takes the
       first's answer rather than buying — and deleting — the same file again. */
    const same = Object.values(bought).find((x) => x.say === e.say);
    if (same) { bought[e.id] = same; continue; }
    if (!shop) {
      // Loaded only when something has to be bought: it asks for the key.
      const m = await import("./build_word_audio.mjs");
      shop = { buyOne: m.buyOne, key: m.apiKey() };
    }
    const short = (g) => {
      if (!g.id) return g;
      const file = join(BOUGHT, g.id + ".mp3");
      if (speechOf(file) >= MIN_SPEECH_MS + 10) return g;
      rmSync(file, { force: true });
      return { id: null };
    };
    let got = short(await shop.buyOne(e.say, { word: true, dir: BOUGHT, key: shop.key, had: null }));
    calls += 1;
    /* A lone vowel («а», «и») is honestly shorter than the 500 ms a word's
       blip check wants, so it fails that check every time. What matters here
       is the speech that survives the trim, so a vowel is bought plainly and
       judged on that — a few tries, the first with enough sound kept. */
    for (let k = 0; !got.id && k < 4; k++) {
      got = short(await shop.buyOne(e.say, { word: false, dir: BOUGHT, key: shop.key, had: null }));
      calls++;
    }
    if (got.id) bought[e.id] = { say: e.say, id: got.id, ms: got.ms };
    else {
      bought[e.id] = { say: e.say, id: null };   // not bought again unless `say` changes
      console.log(`  ${e.id}: «${e.say}» came back a blip every time; its first example plays`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(bought, null, 1) + "\n");

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = join(tmpdir(), `ending-${process.pid}.wav`);
  const made = [], bad = [];
  /* A lone vowel the engine will not say long enough (Chirp3 answers «а» with
     a blip, §30ao) is heard in its first example instead — «кни́га» is how a
     final unstressed а sounds — from the same voice, whole. */
  const clips = {};
  for (const file of ["wordaudio.js", "formaudio.js"]) {
    const src = readFileSync(join(NATIVE, "src", file), "utf8");
    for (const m of src.matchAll(/"([^"]+)":\s*require\("\.\.\/assets\/words\/([^"]+)"\)/g)) {
      const k = m[1].normalize("NFC");
      if (!clips[k]) clips[k] = join(NATIVE, "assets", "words", m[2]);
    }
  }
  const fold = (w) => w.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
  const exampleClip = (e) => {
    for (const w of e.examples) { const c = clips[w.normalize("NFC")] || clips[fold(w)]; if (c) return { w, c }; }
    return null;
  };
  for (const e of ENDINGS) {
    const b = bought[e.id] && bought[e.id].id ? bought[e.id] : null;
    const ex = b ? null : exampleClip(e);
    if (!b && !ex) { bad.push(`${e.id}: no clip and no example recording`); continue; }
    const src = b ? join(BOUGHT, b.id + ".mp3") : ex.c;
    if (!ffmpeg(["-i", src, "-af", TRIM_FILTER, "-ac", "1", tmp])) { bad.push(`${e.id}: trim failed`); continue; }
    const lv = speechLevels(tmp);
    if (!lv || lv.speechMs < MIN_SPEECH_MS) { bad.push(`${e.id}: ${lv ? lv.speechMs : 0} ms of speech`); continue; }
    const gain = Math.min(TARGET_DB - lv.rms, PEAK_DB - lv.peak);
    const out = join(OUT_DIR, `${e.id}.mp3`);
    if (!ffmpeg(["-i", tmp, "-af", `volume=${gain.toFixed(2)}dB,adelay=${PAD_MS}:all=1`,
                 "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", out])) { bad.push(`${e.id}: encode failed`); continue; }
    made.push({ id: e.id, say: b ? e.say : ex.w, whole: !b, speech: lv.speechMs });
  }
  rmSync(tmp, { force: true });

  const body = made.map((m) => `  ${JSON.stringify(m.id)}: { src: require("../assets/endings/${m.id}.mp3"), says: ${JSON.stringify(m.say)}${m.whole ? ", whole: true" : ""} },`).join("\n");
  writeFileSync(join(NATIVE, "src", "endingaudio.js"),
    `/* GENERATED by tools/build_ending_clips.mjs — do not edit. Each ending's sound:\n` +
    `   its phonetic respelling (\`says\`) in the app's one bought voice, or, where the\n` +
    `   engine would not say it (\`whole\`), the first example word. */\n\n` +
    `export const ENDING_CLIPS = {\n${body}\n};\n`);
  console.log(`${made.length} of ${ENDINGS.length} endings shipped; ${calls} purchase call(s)`);
  for (const m of made) console.log(`  ${m.id.padEnd(6)} «${m.say}» ${String(m.speech).padStart(4)} ms of speech`);
  if (bad.length) { console.log(`${bad.length} not shipped:`); for (const s of bad) console.log(`  ${s}`); }
}

if (process.argv[1] && process.argv[1].endsWith("build_ending_clips.mjs")) main();
