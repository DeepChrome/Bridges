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
import { TRIM_FILTER } from "./audio_trim.mjs";
import { MIN_WORD_MS } from "./build_word_audio.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "word_audio");
const MANIFEST = join(SRC, "manifest.json");
/* Every form in the unit words' tables (build_form_audio.mjs, 2026-09-28),
   keyed by the accented form. Optional: without it the app reads forms with
   the device voice, as it did before they were bought. */
const FORMS = join(SRC, "forms.json");
const OUT = join(ROOT, "native", "assets", "words");
const MODULE = join(ROOT, "native", "src", "wordaudio.js");
const FORM_MODULE = join(ROOT, "native", "src", "formaudio.js");
/* Trimmed copies, cached by the clip's own content id — the same arrangement
   the scenario levelling uses, and for the same reason: `data/word_audio` is
   what the money bought and rule 20.3 keeps it exactly as it arrived. */
const TRIMMED = join(ROOT, "data", "_work", "words", "trim2");

/* **Chirp3-HD pads the front of every clip, and it is not a small pad.**
 *
 * Measured over 250 bought sentences on 2026-09-23: median **400 ms** before
 * anybody speaks, 53 of 250 over 700 ms, the worst 1,087 ms. The owner heard
 * it where it hurts most — shadowing, which plays the model the moment the
 * question arrives: *"there's a HUGE pause before the guy starts speaking."*
 *
 * What is trimmed and kept, and why a click in the pad no longer stops the
 * trim, is `TRIM_FILTER` in tools/audio_trim.mjs, shared with the
 * conversations.
 *
 * **Decoded, trimmed and re-encoded — never cut with `-c copy`.** The first
 * version copied frames from the cut on, to spare a generation of quality, and
 * that is what put a burst of noise before the pause the owner heard
 * (2026-10-01: *"weird noises then long pauses before starting"*). An MP3
 * frame borrows bits from the frames before it (the bit reservoir: up to 511
 * bytes back, five or six frames at 32 kbps), so after a frame-copy cut the
 * first frames decode from data that is no longer there. ffmpeg mutes such
 * frames and reports nothing, which is why no check caught it; Android's
 * decoder plays them. A 10 ms fade-in also means the first sample cannot
 * click. One generation of re-encode at the purchase's own rate is the
 * price, and on speech at 32 kbps it is not one an ear finds. */
/* A shipped word shorter than this is a blip (§30ao). The purchase's own
   floor, MIN_WORD_MS, was measured with both pads on; a cleaned clip is the
   speech plus the 80 + 150 ms the trim keeps, so a real one-syllable word
   ships at 450 ms or more and a nine-frame blip at well under this. */
const BLIP_MS = 300;

const ff = (args) => spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 60000 });

/* The clip cleaned (TRIM_FILTER), cached by its content id. Returns the path
   to ship; the purchase itself when ffmpeg refused, rather than nothing. */
function trimmedClip(src, id) {
  const out = join(TRIMMED, id + ".mp3");
  if (existsSync(out)) return out;
  ff(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af", TRIM_FILTER,
      "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "32k", out]);
  return existsSync(out) ? out : src;
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
/* One file per clip, whoever names it. A form that is also a bought headword
   («кни́га» and «книга») is the same clip, and shipping it twice would be
   bytes for nothing in an APK this purchase already grows by half. */
const nameOf = new Map();
let missing = 0, cut = 0, cutMs = 0, blips = [];
function ship(id, label, sentence) {
  if (nameOf.has(id)) return nameOf.get(id);
  const bought = join(SRC, id + ".mp3");
  if (!existsSync(bought)) { missing++; return null; }
  const from = trimmedClip(bought, id);
  // A sentence is named by its hash: a transliterated sentence is not readable
  // either, and Gradle has a limit on resource names.
  let name = sentence ? `s-${id.slice(0, 12)}` : slug(label);
  // A transliteration can collide («есть»/«естъ» kinds of thing); the hash is
  // what makes it unique, so it breaks the tie rather than the word being lost.
  if (used.has(name)) name = `${name}-${id.slice(0, 6)}`;
  used.add(name);
  copyFileSync(from, join(OUT, name + ".mp3"));
  nameOf.set(id, name);

  /* What the trim did, and what it left. The blip check lives here rather than
     only in audio_qa because this is the tool that makes the file that ships:
     a word whose clip was mostly silence would pass a length check against the
     purchase and arrive as a blip anyway (§30ao). */
  const shipped = durationMs(from);
  if (from !== bought) { cut++; cutMs += durationMs(bought) - shipped; }
  if (!sentence && shipped < BLIP_MS) blips.push(`${label} ${shipped}ms`);
  return name;
}

for (const word of Object.keys(files).sort()) {
  const name = ship(files[word], word, /\s/.test(word));
  if (name) rows.push({ key: fold(word), name });
}

const forms = existsSync(FORMS) ? (JSON.parse(readFileSync(FORMS, "utf8")).files || {}) : {};
const formRows = [];
for (const form of Object.keys(forms).sort()) {
  // An analytic future («бу́ду чита́ть») has a space and is still one form.
  const name = ship(forms[form], form, false);
  if (name) formRows.push({ key: form.normalize("NFC"), name });
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

const formBody = formRows.map((r) => `  ${JSON.stringify(r.key)}: require("../assets/words/${r.name}.mp3"),`)
  .join("\n");
writeFileSync(FORM_MODULE, `/* GENERATED by tools/build_word_assets.mjs — do not edit.
 *
 * A recording for each form the unit words' tables show (ROADMAP 13.42,
 * 2026-09-28). ${formRows.length} forms, keyed by the **accented** form — not the
 * folded one \`wordaudio.js\` uses — because «руки́» and «ру́ки» are one folded
 * key and two different words. A spelling that carries two stresses anywhere
 * in the lexicon was never bought (tools/build_form_audio.mjs) and is not
 * here, so the app reads it with the device voice and its stress mark.
 */

export const FORM_CLIPS = {
${formBody}
};

export const formClip = (accented) => FORM_CLIPS[String(accented || "").normalize("NFC").trim()] || null;
`);

const bytes = readdirSync(OUT).reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`${rows.length} word clips and ${formRows.length} forms → native/assets/words/`
            + ` (${nameOf.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  pads and their clicks trimmed off ${cut}, ${(cutMs / 1000).toFixed(1)} s in all`
            + ` (${cut ? Math.round(cutMs / cut) : 0} ms each)`);
if (missing) console.log(`  !! ${missing} named in the manifest but not on disk`);
if (blips.length) {
  console.log(`  !! ${blips.length} shipped word clip(s) too short to be the word: `
              + blips.slice(0, 10).join(", "));
  process.exitCode = 1;
}
console.log(`wrote ${MODULE}`);
console.log(`wrote ${FORM_MODULE}`);
