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

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync, statSync }
  from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { fold } from "../core/util.js";
import { TOPICS } from "../core/grammar.js";
import { CASES } from "../core/cases.js";
import { ENDINGS } from "../core/endings.js";
import { parseDeep } from "../core/search.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { durationMs, innerGap, capInnerGaps, GAP_KEEP_MS } from "./mp3.mjs";
import { TRIM_FILTER } from "./audio_trim.mjs";
import { gapsOf, GAP_MS } from "./audio_gaps.mjs";
import { MIN_WORD_MS } from "./build_word_audio.mjs";
import { tableForms, formKey } from "./build_form_audio.mjs";
import { loadPayload } from "./payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/* The zip writer is the app's own (native/src/anki.js reads .apkg with it),
   so the packs are made by the same library that opens them. */
const { zipSync } = createRequire(join(ROOT, "native", "package.json"))("fflate");

/* **The audio ships in packs by chapter** (the owner, 2026-11-19: *"Splitting
 * audio by chapter is approved. Just make sure it's done in an intelligent
 * way like maybe background downloading future chapters before the learner
 * arrives"*). 112 MB of clips were half the APK, and a learner in chapter 1
 * carried chapter 10's forms. Each clip is filed under the chapter whose
 * words it belongs to — a word by its unit, a form by its word's, a sentence
 * by the earliest unit whose pool holds it or the word whose example it is;
 * the grammar reference's and the endings' clips in `core`, which always
 * ships; what belongs to no chapter (the studied words no unit teaches, and
 * their examples) in `more`. Chapters up to BUNDLED_CHAPTERS ride in the APK
 * with `core`; every other pack is a zip the app fetches ahead of the learner
 * (native/src/audiopacks.js) from the download host (tools/dl, uploaded by
 * tools/dl/upload_audio.mjs).
 *
 * A pack is named by its contents — `ch3-<hash>` over the names and content
 * ids in it — so a build and its packs cannot disagree: a pack that changed is
 * a new name, the old one stays on the host for the builds that need it. The
 * generated modules list every clip either as a `require` (bundled) or as
 * `[pack, name]` (packed), and `native/src/packs.js` resolves the second kind
 * against what is installed. `native/assets/words/` still holds every file:
 * the desktop app and the review site read it whole, and Metro bundles only
 * what is required. */
export const BUNDLED_CHAPTERS = 2;
const MORE_PACK_BYTES = 18 * 1024 * 1024;
const PACK_OUT = join(ROOT, "native", "build-out", "audio");
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
   to ship; the purchase itself when ffmpeg refused, rather than nothing.
   `gap`: the inner pauses capped as well (mp3.mjs capInnerGaps) — the clip is
   decoded through the trim, capped in samples and encoded once, so it is
   still one generation from the purchase. */
const RATE = 24000;
function trimmedClip(src, id, gap = false) {
  const out = join(TRIMMED, id + (gap ? "-g" : "") + ".mp3");
  if (existsSync(out)) return out;
  if (!gap) {
    ff(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af", TRIM_FILTER,
        "-ar", String(RATE), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "32k", out]);
    return existsSync(out) ? out : src;
  }
  const dec = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-af", TRIM_FILTER, "-ar", String(RATE), "-ac", "1",
                                   "-f", "s16le", "-"], { maxBuffer: 64 << 20, timeout: 60000 });
  if (dec.status !== 0) return trimmedClip(src, id, false);
  const pcm = new Int16Array(dec.stdout.buffer, dec.stdout.byteOffset, dec.stdout.length >> 1);
  const capped = capInnerGaps(pcm, RATE);
  const enc = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0",
                                   "-c:a", "libmp3lame", "-b:a", "32k", out],
                        { input: Buffer.from(capped.buffer, capped.byteOffset, capped.byteLength), timeout: 60000 });
  return enc.status === 0 && existsSync(out) ? out : trimmedClip(src, id, false);
}

if (!existsSync(MANIFEST)) {
  console.error(`no ${MANIFEST}. Run tools/build_word_audio.mjs first.`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const files = manifest.files || {};

/* Which sentence clips carry a pause inside the speech worth capping
   (tools/audio_gaps.mjs, cached by clip id — the first measurement of 6,000
   clips takes minutes, the next none). Words are not measured: a one-word
   clip has no inner pause to cap, and there are 15,000 of them. */
const sentenceFiles = Object.fromEntries(Object.entries(files).filter(([k]) => /\s/.test(k)));
const GAPS = gapsOf(sentenceFiles, { log: (s) => console.log(`  gaps: ${s}`) });
const wideGap = (label) => !!(GAPS[label] && GAPS[label].gap !== null && GAPS[label].gap >= GAP_MS);

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
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/* Not emptied first (2026-11-19): a file already shipped at the trimmed
   clip's size is left where it is and not measured again, so a rerun that
   changes only the modules takes seconds rather than the forty minutes the
   21,000 copies and their measurements took. Files no clip names any more
   are removed at the end. */
mkdirSync(OUT, { recursive: true });
mkdirSync(TRIMMED, { recursive: true });

/* ----------------------------------------------------- which pack a clip is in */
const D = loadPayload(ROOT);
const chapterOfUnit = {};
{
  let cur = 0;
  for (const r of D.path || []) { if (r.cn) cur = r.cn; chapterOfUnit[D.units[r.u].id] = cur; }
}
const lemmaChapter = (i) => (D.lemmas[i] && D.lemmas[i].u ? chapterOfUnit[D.lemmas[i].u] || null : null);
/* A folded word → its chapter, through the studied index (rule 20.2). */
const wordChapter = (key) => {
  const hits = (D.index && D.index[key]) || [];
  for (const i of hits) { const c = lemmaChapter(i); if (c) return c; }
  return null;
};
/* A folded sentence → the earliest chapter it belongs to. */
const sentenceChapter = new Map();
const noteSentence = (ru, chapter) => {
  if (!ru) return;
  const k = fold(ru);
  const c = chapter || Infinity;
  if (!sentenceChapter.has(k) || sentenceChapter.get(k) > c) sentenceChapter.set(k, c);
};
for (const pool of ["speak", "listen"]) {
  for (const [unit, idxs] of Object.entries((D.speech && D.speech[pool]) || {})) {
    for (const k of idxs) { const row = D.speech.rows[k]; if (row) noteSentence(row[0], chapterOfUnit[unit]); }
  }
}
// The dictionary's and the senses' examples: the word's chapter.
D.lemmas.forEach((l, i) => {
  const c = lemmaChapter(i);
  for (const r of String(l.refs || "").split(",")) { const row = D.sent && D.sent[Number(r)]; if (row) noteSentence(row[0], c); }
  for (const s of (D.senses && D.senses[i]) || []) for (const x of s.x || []) noteSentence(x.ru, c);
});
// The grammar reference, the cases and the endings: always in the app ("core").
const CORE = new Set();
for (const t of TOPICS) for (const s of t.sections) {
  for (const e of s.examples || []) CORE.add(fold(e[0]));
  for (const c of s.contrast || []) for (const l of c.lines) CORE.add(fold(l[0]));
}
for (const c of CASES) for (const u of c.uses) for (const e of u.examples) CORE.add(fold(e[0]));
for (const u of D.units) for (const e of (u.g && u.g.examples) || []) CORE.add(fold(e[0]));
const CORE_FORMS = new Set(ENDINGS.flatMap((e) => e.examples.map(formKey)));
/* A form → its word's chapter, over the studied words' tables. */
const formChapter = new Map();
{
  const deep = parseDeep(D.deep || "");
  const BY = makeDeepIndex(deep);
  const hydrate = makeHydrator({ deepIndex: () => BY, shapes: D.shapes, slots: D.slots, sent: D.sent });
  D.lemmas.forEach((l, i) => {
    hydrate(l);
    const c = lemmaChapter(i) || Infinity;
    for (const f of tableForms(D.lemmas, [i])) {
      if (!formChapter.has(f) || formChapter.get(f) > c) formChapter.set(f, c);
    }
  });
}
const packOfWord = (key) => {
  if (CORE.has(key)) return "core";
  const c = /\s/.test(key) ? sentenceChapter.get(key) : wordChapter(key);
  return c && c !== Infinity ? `ch${c}` : "more";
};
const packOfForm = (form) => {
  if (CORE_FORMS.has(form)) return "core";
  const c = formChapter.get(form);
  return c && c !== Infinity ? `ch${c}` : "more";
};
const bundled = (pack) => pack === "core" || (/^ch(\d+)$/.test(pack) && Number(pack.slice(2)) <= BUNDLED_CHAPTERS);

const rows = [];
const used = new Set();
/* One file per clip, whoever names it. A form that is also a bought headword
   («кни́га» and «книга») is the same clip, and shipping it twice would be
   bytes for nothing in an APK this purchase already grows by half. */
const nameOf = new Map();
/* Which pack each shipped file goes to: the earliest chapter of anything that
   plays it (a clip shared by a word and a form is in the lower chapter). */
const packOfName = new Map();
const PACK_RANK = (p) => (p === "core" ? 0 : p === "more" ? 99 : Number(p.slice(2)));
const filePack = (name, pack) => {
  const have = packOfName.get(name);
  if (!have || PACK_RANK(pack) < PACK_RANK(have)) packOfName.set(name, pack);
};
let missing = 0, cut = 0, cutMs = 0, reused = 0, blips = [], capped = [];
function ship(id, label, sentence) {
  if (nameOf.has(id)) return nameOf.get(id);
  const bought = join(SRC, id + ".mp3");
  if (!existsSync(bought)) { missing++; return null; }
  const gap = sentence && wideGap(label);
  const from = trimmedClip(bought, id, gap);
  if (gap) capped.push(from);
  // A sentence is named by its hash: a transliterated sentence is not readable
  // either, and Gradle has a limit on resource names.
  let name = sentence ? `s-${id.slice(0, 12)}` : slug(label);
  // A transliteration can collide («есть»/«естъ» kinds of thing); the hash is
  // what makes it unique, so it breaks the tie rather than the word being lost.
  // …and Windows will not hold a file named after a device, whatever its
  // extension: «нуль» → nul.mp3 went to the null device and was never written
  // (2026-10-15, when every studied word was bought).
  if (used.has(name) || WINDOWS_DEVICE.test(name)) name = `${name}-${id.slice(0, 6)}`;
  used.add(name);
  nameOf.set(id, name);
  const dest = join(OUT, name + ".mp3");
  if (existsSync(dest) && statSync(dest).size === statSync(from).size) { reused++; return name; }
  copyFileSync(from, dest);

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
  if (name) { rows.push({ key: fold(word), name }); filePack(name, packOfWord(fold(word))); }
}

const forms = existsSync(FORMS) ? (JSON.parse(readFileSync(FORMS, "utf8")).files || {}) : {};
const formRows = [];
for (const form of Object.keys(forms).sort()) {
  // An analytic future («бу́ду чита́ть») has a space and is still one form.
  const name = ship(forms[form], form, false);
  if (name) { formRows.push({ key: form.normalize("NFC"), name }); filePack(name, packOfForm(form.normalize("NFC"))); }
}

// What nothing names any more leaves the directory (a clip deleted by hand
// disappears from the app, as the head of the file promises).
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".mp3") && !used.has(f.slice(0, -4))) rmSync(join(OUT, f));
}

/* ---------------------------------------------------------- the packs, zipped */
/* Files by pack; `more` cut into parts no larger than MORE_PACK_BYTES. */
const byPack = new Map();
for (const [name, pack] of packOfName) {
  if (!byPack.has(pack)) byPack.set(pack, []);
  byPack.get(pack).push(name);
}
const sizeOf = (name) => readFileSync(join(OUT, name + ".mp3")).length;
if (byPack.has("more")) {
  const names = byPack.get("more").sort();
  byPack.delete("more");
  let part = 1, acc = [], total = 0;
  const close = () => { byPack.set(`more${part}`, acc); for (const n of acc) packOfName.set(n, `more${part}`); part++; acc = []; total = 0; };
  for (const name of names) {
    const n = sizeOf(name);
    if (acc.length && total + n > MORE_PACK_BYTES) close();
    acc.push(name); total += n;
  }
  if (acc.length) close();
}
// A pack's id: its label and a hash of its contents (names and content ids).
const idOfFile = new Map([...nameOf].map(([id, name]) => [name, id]));
const packId = (label, names) => {
  const h = createHash("sha1");
  for (const n of names.slice().sort()) h.update(`${n}:${idOfFile.get(n)}\n`);
  return `${label}-${h.digest("hex").slice(0, 10)}`;
};
const packOrder = (a, b) => PACK_RANK(a.replace(/^more(\d+)$/, "more")) - PACK_RANK(b.replace(/^more(\d+)$/, "more"))
  || a.localeCompare(b);
const PACKS = [];            // packed, in the order the generated modules index them
const packIndex = new Map(); // label -> index in PACKS
let bundledBytes = 0, bundledFiles = 0;
mkdirSync(PACK_OUT, { recursive: true });
for (const label of [...byPack.keys()].sort(packOrder)) {
  const names = byPack.get(label).sort();
  if (bundled(label)) { bundledFiles += names.length; bundledBytes += names.reduce((n, f) => n + sizeOf(f), 0); continue; }
  const id = packId(label, names);
  const zipPath = join(PACK_OUT, id + ".zip");
  if (!existsSync(zipPath)) {
    const entries = {};
    for (const n of names) entries[n + ".mp3"] = new Uint8Array(readFileSync(join(OUT, n + ".mp3")));
    // Stored, not deflated: an MP3 does not compress, and the phone unpacks it faster.
    writeFileSync(zipPath, Buffer.from(zipSync(entries, { level: 0 })));
  }
  const chapter = /^ch(\d+)$/.test(label) ? Number(label.slice(2)) : null;
  packIndex.set(label, PACKS.length);
  PACKS.push({ id, label, chapter, bytes: readFileSync(zipPath).length, count: names.length });
}
// Zips of packs this build no longer makes are not kept beside the live ones.
for (const f of readdirSync(PACK_OUT)) {
  if (f.endsWith(".zip") && !PACKS.some((p) => p.id + ".zip" === f)) rmSync(join(PACK_OUT, f));
}
writeFileSync(join(PACK_OUT, "packs.json"), JSON.stringify({ bundledChapters: BUNDLED_CHAPTERS, packs: PACKS }, null, 2));

const entryOf = (name) => {
  const pack = packOfName.get(name);
  return bundled(pack) ? `require("../assets/words/${name}.mp3")` : `[${packIndex.get(pack)}, ${JSON.stringify(name)}]`;
};
const packsBody = PACKS.map((p) => `  ${JSON.stringify(p)},`).join("\n");
const body = rows.map((r) => `  ${JSON.stringify(r.key)}: ${entryOf(r.name)},`).join("\n");

writeFileSync(MODULE, `/* GENERATED by tools/build_word_assets.mjs — do not edit.
 *
 * The bought Chirp3-HD clips: the curriculum words (ROADMAP 13.32, then every
 * Core 5000 one) and the speaking and listening pools' sentences
 * (2026-09-19). ${rows.length} clips, keyed by the **folded** utterance, which
 * is the key \`say()\` already derives (rule 20.2 — the manifest folds ё to е
 * and a lemma's bare form does not, which is how the first count of these
 * came out at 75 instead of 61).
 *
 * A clip is a \`require\` when it ships in the app (chapters 1–${BUNDLED_CHAPTERS} and the
 * grammar's own) or \`[pack, name]\` when it comes in a chapter's pack the app
 * fetches ahead of the learner (native/src/audiopacks.js; the index is into
 * PACKS). Required statically because Metro resolves assets at build time;
 * that is also why this file is generated rather than a directory read.
 */
import { packedClip } from "./packs";

export const PACKS = [
${packsBody}
];

export const WORD_CLIPS = {
${body}
};

export const wordClip = (folded) => { const e = WORD_CLIPS[folded]; return e ? (Array.isArray(e) ? packedClip(e, PACKS) : e) : null; };
`);

const formBody = formRows.map((r) => `  ${JSON.stringify(r.key)}: ${entryOf(r.name)},`).join("\n");
writeFileSync(FORM_MODULE, `/* GENERATED by tools/build_word_assets.mjs — do not edit.
 *
 * A recording for each form the unit words' tables show (ROADMAP 13.42,
 * 2026-09-28). ${formRows.length} forms, keyed by the **accented** form — not the
 * folded one \`wordaudio.js\` uses — because «руки́» and «ру́ки» are one folded
 * key and two different words. A spelling that carries two stresses anywhere
 * in the lexicon was never bought (tools/build_form_audio.mjs) and is not
 * here, so the app reads it with the device voice and its stress mark.
 * Bundled or packed as wordaudio.js describes; the packs are its PACKS.
 */
import { packedClip } from "./packs";
import { PACKS } from "./wordaudio";

export const FORM_CLIPS = {
${formBody}
};

export const formClip = (accented) => {
  const e = FORM_CLIPS[String(accented || "").normalize("NFC").trim()];
  return e ? (Array.isArray(e) ? packedClip(e, PACKS) : e) : null;
};
`);

const bytes = readdirSync(OUT).reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`${rows.length} word clips and ${formRows.length} forms → native/assets/words/`
            + ` (${nameOf.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  in the app: core and chapters 1–${BUNDLED_CHAPTERS}, ${bundledFiles} files, ${(bundledBytes / 1048576).toFixed(1)} MB`);
console.log(`  in packs (native/build-out/audio/): ${PACKS.map((p) => `${p.label} ${(p.bytes / 1048576).toFixed(1)} MB`).join(", ")}`);
console.log(`  pads and their clicks trimmed off ${cut}, ${(cutMs / 1000).toFixed(1)} s in all`
            + ` (${cut ? Math.round(cutMs / cut) : 0} ms each); ${reused} already shipped and left alone`);
/* The cap, checked on what shipped: a capped clip that still holds a long
   inner silence means the cap missed the pause, and the learner would hear
   exactly what it exists to remove. A margin of GAP_SLACK over GAP_MS: the
   gate decodes the encoded clip at 16 kHz and the cap worked on the 24 kHz
   decode, and a pause whose tail hovers at the floor reads up to 50 ms apart
   between the two («у всех насекомых по шесть ножек.», 620 ms both ways,
   2026-11-10). What is caught is the second-long hole, not a long full stop. */
const GAP_SLACK = 100;
const still = capped.filter((f) => { const g = innerGap(f); return g !== null && g >= GAP_MS + GAP_SLACK; });
console.log(`  inner pauses capped in ${capped.length} sentence clip(s) (over ${GAP_MS} ms → about ${GAP_KEEP_MS} ms)`);
if (still.length) {
  console.log(`  !! ${still.length} capped clip(s) still hold a pause of ${GAP_MS + GAP_SLACK} ms or more: ${still.slice(0, 5).join(", ")}`);
  process.exitCode = 1;
}
if (missing) console.log(`  !! ${missing} named in the manifest but not on disk`);
if (blips.length) {
  console.log(`  !! ${blips.length} shipped word clip(s) too short to be the word: `
              + blips.slice(0, 10).join(", "));
  process.exitCode = 1;
}
console.log(`wrote ${MODULE}`);
console.log(`wrote ${FORM_MODULE}`);
