/* The bought word clips into the app (ROADMAP 13.32).
 *
 * `build_word_audio.mjs` buys them into `data/word_audio/` keyed by a content
 * hash, and those files are **committed**, because they cost money — the same
 * rule the scenario clips follow (§30l). This copies them under a readable
 * name into `native/assets/words/` and writes `native/src/wordaudio.js`, which
 * is a `require` per clip: Metro resolves assets at build time, so the list has
 * to exist in source rather than be read from a directory.
 *
 * Bundled rather than uploaded. The collection's 13,183 recordings stream from
 * the web host, and putting these there would mean a Netlify deploy, which
 * costs credits (§31). 5.3 MB (1,028 words, since the Core 5000 ones were
 * re-voiced on 2026-09-19) rides along in the APK and works with no network —
 * which, for the words a drill asks about, is the better answer anyway.
 *
 *   node tools/build_word_assets.mjs
 *
 * Re-runnable; it writes the whole directory and the whole module each time
 * from what is in `data/word_audio/`, so a clip deleted by hand disappears
 * from the app too.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync }
  from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fold } from "../core/util.js";
import { durationMs } from "./mp3.mjs";
import { MIN_WORD_MS } from "./build_word_audio.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "word_audio");
const MANIFEST = join(SRC, "manifest.json");
const OUT = join(ROOT, "native", "assets", "words");
const MODULE = join(ROOT, "native", "src", "wordaudio.js");
/* Trimmed copies, cached by the clip's own content id — the same arrangement
   the scenario levelling uses, and for the same reason: `data/word_audio` is
   what the money bought and rule 20.3 keeps it exactly as it arrived. */
const TRIMMED = join(ROOT, "data", "_work", "words", "trim1");

/* **Chirp3-HD pads the front of every clip, and it is not a small pad.**
 *
 * Measured over 250 bought sentences on 2026-09-23: median **400 ms** before
 * anybody speaks, 53 of 250 over 700 ms, the worst 1,087 ms. The owner heard
 * it where it hurts most — shadowing, which plays the model the moment the
 * question arrives: *"there's a HUGE pause before the guy starts speaking."*
 *
 * `KEEP_MS` is what stays. Not zero: a word cut flush against its first
 * consonant sounds clipped, and the frame copy below lands on a boundary
 * anyway, so the real lead-in is this plus up to one 24 ms frame.
 *
 * **Trimmed with `-c copy`, so nothing is re-encoded** — the frames after the
 * cut are the frames that were bought. A re-encode would cost a generation of
 * quality on 2,886 clips to remove silence, which is a poor trade. */
const KEEP_MS = 80;
const SILENCE_DB = -45;          // well under a 32 kbps encode's own floor

const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 60000 });

/* How long a clip waits before anybody speaks, in milliseconds. */
function leadMs(file) {
  const s = String(ff(["-hide_banner", "-nostats", "-i", file,
    "-af", `silencedetect=noise=${SILENCE_DB}dB:d=0.05`, "-f", "null", "-"]).stderr || "");
  const start = s.match(/silence_start:\s*(-?[\d.]+)/);
  const end = s.match(/silence_end:\s*([\d.]+)/);
  // Silence that does not begin at the top of the file is a pause inside it.
  if (!start || Number(start[1]) > 0.02) return 0;
  return end ? Math.round(Number(end[1]) * 1000) : 0;
}

/* The clip with its leading silence taken off, cached. Returns the path to
   ship, which is the original when there was nothing to take. */
function trimmedClip(src, id) {
  const out = join(TRIMMED, id + ".mp3");
  if (existsSync(out)) return out;
  const lead = leadMs(src);
  if (lead <= KEEP_MS) { copyFileSync(src, out); return out; }
  ff(["-y", "-hide_banner", "-loglevel", "error", "-ss", String((lead - KEEP_MS) / 1000),
      "-i", src, "-c", "copy", out]);
  // An ffmpeg that refused the cut ships what was bought rather than nothing.
  if (!existsSync(out)) return src;
  return out;
}

if (!existsSync(MANIFEST)) {
  console.error(`no ${MANIFEST}. Run tools/build_word_audio.mjs first.`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const files = manifest.files || {};

/* A file name a person can read in a diff, from the word itself. Latin-safe
   because Metro and Gradle both handle asset names better that way, and two
   words never collide because the folded form is unique in the manifest. */
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "j",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e",
  ю: "yu", я: "ya",
};
const slug = (w) => [...fold(w)].map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : "")).join("")
  || "w";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(TRIMMED, { recursive: true });

const rows = [];
const used = new Set();
let missing = 0, cut = 0, cutMs = 0, blips = [];
for (const word of Object.keys(files).sort()) {
  const bought = join(SRC, files[word] + ".mp3");
  if (!existsSync(bought)) { missing++; continue; }
  const from = trimmedClip(bought, files[word]);
  // A sentence is named by its hash: a transliterated sentence is not readable
  // either, and Gradle has a limit on resource names.
  let name = /\s/.test(word) ? `s-${files[word].slice(0, 12)}` : slug(word);
  // A transliteration can collide («есть»/«естъ» kinds of thing); the hash is
  // what makes it unique, so it breaks the tie rather than the word being lost.
  if (used.has(name)) name = `${name}-${files[word].slice(0, 6)}`;
  used.add(name);
  copyFileSync(from, join(OUT, name + ".mp3"));
  rows.push({ key: fold(word), name });

  /* What the trim did, and what it left. The blip check lives here rather than
     only in audio_qa because this is the tool that makes the file that ships:
     a word whose clip was mostly silence would pass a length check against the
     purchase and arrive as a blip anyway (§30ao). */
  const shipped = durationMs(from);
  if (from !== bought) { cut++; cutMs += durationMs(bought) - shipped; }
  if (!/\s/.test(word) && shipped < MIN_WORD_MS - KEEP_MS) blips.push(`${word} ${shipped}ms`);
}

const body = rows.map((r) => `  ${JSON.stringify(r.key)}: require("../assets/words/${r.name}.mp3"),`)
  .join("\n");

writeFileSync(MODULE, `/* GENERATED by tools/build_word_assets.mjs — do not edit.
 *
 * The bought Chirp3-HD clips, bundled: the curriculum words (ROADMAP 13.32,
 * then every Core 5000 one) and the speaking and listening pools' sentences
 * (2026-09-19). ${rows.length} clips, keyed by the **folded** utterance, which
 * is the key \`say()\` already derives (rule 20.2 — the manifest folds ё to е
 * and a lemma's bare form does not, which is how the first count of these
 * came out at 75 instead of 61).
 *
 * Required statically because Metro resolves assets at build time; that is
 * also why this file is generated rather than a directory read.
 */

export const WORD_CLIPS = {
${body}
};

export const wordClip = (folded) => WORD_CLIPS[folded] || null;
`);

const bytes = readdirSync(OUT).reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`${rows.length} word clips → native/assets/words/ (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  leading silence trimmed off ${cut}, ${(cutMs / 1000).toFixed(1)} s in all`
            + ` (${cut ? Math.round(cutMs / cut) : 0} ms each, ${KEEP_MS} ms kept)`);
if (missing) console.log(`  !! ${missing} named in the manifest but not on disk`);
if (blips.length) {
  console.log(`  !! ${blips.length} shipped word clip(s) too short to be the word: `
              + blips.slice(0, 10).join(", "));
  process.exitCode = 1;
}
console.log(`wrote ${MODULE}`);
