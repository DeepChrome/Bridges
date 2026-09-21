/* The curriculum words the collection has no recording for (ROADMAP 13.32).
 *
 * 61 of the 1,045 words the units teach have no file in his Anki media at all
 * — стать, прийти, дать, выйти, получить and 56 more, **mostly perfective
 * verbs**, which is precisely what the aspect drill asks about. The app says
 * so and falls back to the device voice (§27), which is honest and thin.
 *
 * The free route was tried first, as the roadmap said to: a re-run of
 * `build_audio.py --dry-run` on 2026-09-17 still reports 13,183 utterances, so
 * no AnkiDroid sync has brought them across. This buys them instead, from the
 * same Chirp3-HD voices and with the same content-hash keying as the scenario
 * clips (§30l), for about two cents.
 *
 * **They are bundled in the app, not uploaded.** The collection's recordings
 * stream from the web host, and adding files there means a Netlify deploy,
 * which costs credits (§31). Sixty-one short clips are a couple of hundred
 * kilobytes — small enough to ship inside the APK like the scenario tracks,
 * which also makes them work with no network at all.
 *
 * **What the app claims about them.** §27's rule is that TTS is never
 * presented as *authentic corpus audio*, and what the badge actually
 * distinguishes is a fixed recording from the phone reading aloud — the
 * collection itself is mostly TTS already (10,314 Core 5000 and 2,334 Yandex
 * utterances). These sit in exactly that category and are better than most of
 * it. Nothing claims a human said them, here or anywhere.
 *
 *   node tools/build_word_audio.mjs --dry-run     # what it would buy, and the cost
 *   node tools/build_word_audio.mjs               # buy what is missing or Core 5000
 *
 * Idempotent: a word whose clip is already on disk is skipped, so a re-run
 * costs nothing.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "./payload.mjs";
import { durationMs } from "./mp3.mjs";
import { fold, bare } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "word_audio");
const MANIFEST = join(OUT, "manifest.json");

const API = "https://texttospeech.googleapis.com/v1";
const LANG = "ru-RU";
/* One voice for the lot. A word list read by four different people is a word
   list that sounds like four different apps; the scenarios vary voices because
   a conversation needs to, and a vocabulary card does not. */
const VOICE = "ru-RU-Chirp3-HD-Aoede";
/* The same rate the scenarios are bought at, so a word does not change pace
   when it turns up inside one. */
const RATE = 0.94;
const RATE_PER_M_CHARS = 30;

/* A word clip shorter than this is not the word (2026-09-21). The owner heard
   «ты» on the chapter 1 test and called it a glitch, and it was: 216 ms — nine
   frames — where a spoken one-syllable word with the engine's own silence
   around it runs 700–1,400 ms. Measured over the 83 curriculum words of three
   letters or fewer, ten had come back as blips (к, ли, ты, у at 216 ms; а, да,
   и, кто, при, я at 288). And it is not the text: the same «ты» resynthesised
   gave 216, 816 and 816 ms on three calls, «Ты» gave 288, 1272 and 744. The
   engine simply fails one-syllable inputs about a third of the time, so the
   only honest fix is to **measure what came back and buy again** — plain
   retries first, then the capitalised word, then with a full stop — and keep
   the first that is a word. Sentences never did this; they are measured too,
   because the lengths ride in the manifest for audio_qa to read. */
export const MIN_WORD_MS = 500;
const RETRIES = ["", "", "cap", "cap", "stop"];

const flag = (n) => process.argv.includes(n);
const DRY = flag("--dry-run");

const apiKey = () => {
  const k = process.env.GOOGLE_TTS_API_KEY;
  if (!k) {
    console.error("GOOGLE_TTS_API_KEY is not set. It belongs in the environment,"
                  + " never in the repo (rule 20.11).");
    process.exit(2);
  }
  return k;
};

/* Keyed on everything that changes the sound, exactly as the scenario clips
   are: re-recording at a different rate or in a different voice writes a new
   file and leaves the old one alone. */
const clipId = (text) =>
  createHash("sha1").update(`google|${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 16);

async function synth(text, key) {
  const res = await fetch(`${API}/text:synthesize?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: LANG, name: VOICE },
      audioConfig: { audioEncoding: "MP3", speakingRate: RATE },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!body.audioContent) throw new Error("no audioContent in the reply");
  return Buffer.from(body.audioContent, "base64");
}

/* ------------------------------------------------------------------ which */

/* The collection sources a bought clip replaces (2026-09-19). The owner heard
   «книга» from the collection and called it robotic; it is Core 5000, the
   64 kbps "uniform, unverified" TTS that voices 967 of the 1,045 curriculum
   words, and Google TTS is the 32 kbps one below it. Both give way to the
   Chirp3-HD voice the 61 missing words were bought in — one voice for the
   whole word list. What stays: Languages on Fire (a human in a studio, 17
   curriculum words), Yandex and Tatoeba. `say()` prefers a bundled clip, so
   buying is all it takes; nothing in the app changes. */
export const REPLACE = new Set(["core5000", "googletts"]);

/* The words the units teach that `data/audio.json` has no file for, or has
 * only from a source in REPLACE.
 *
 * **Looked up folded**, which is rule 20.2 and cost real money to nearly get
 * wrong: the manifest is keyed by the folded utterance (ё→е), while a lemma's
 * bare form keeps its ё. Asking `files["ещё"]` therefore answers "no file" for
 * a word that has one, and the first run of this tool reported 75 words to buy
 * where the truth is 61 — the difference being fourteen words with ё in them,
 * every one of which already had a recording. `say()` folds; so does this. */
/* The speaking and listening pools' sentences (payload.speech.rows — what
   Hear, Say, Shadow and the sentence cards play), bought the same way
   (2026-09-19, the owner: "I want everything on the app to sound
   professional"). Measured: 1,564 of the 1,987 are Yandex, 288 Core 5000, 6
   Google TTS — three synthetic voices beside the words' one — and 129 are
   people (Tatoeba, Languages on Fire), which stay. The stress marks come off
   before synthesis, as the scenario tool strips them; the punctuation stays,
   since that is what the engine reads intonation from. */
export const SENTENCE_REPLACE = new Set(["core5000", "googletts", "yandex"]);

export function sentencesToBuy(payload, audio, replace = SENTENCE_REPLACE) {
  const files = (audio && audio.files) || {};
  const src = (audio && audio.src) || {};
  const out = [], seen = new Set();
  for (const row of (payload.speech && payload.speech.rows) || []) {
    const key = fold(row[0]);
    if (seen.has(key)) continue;
    seen.add(key);
    const file = files[key];
    if (file && !replace.has(src[file])) continue;
    out.push({ key, text: bare(row[0]), was: file ? src[file] : null });
  }
  return out;
}

export function wordsToBuy(payload, audio, replace = REPLACE) {
  const files = (audio && audio.files) || {};
  const src = (audio && audio.src) || {};
  const taught = new Set();
  for (const u of payload.units) for (const i of u.w || []) taught.add(i);
  const out = [];
  for (const i of taught) {
    const w = payload.lemmas[i];
    if (!w || !w.b) continue;
    const file = files[fold(w.b)];
    if (file && !replace.has(src[file])) continue;
    out.push({ i, bare: w.b, accented: w.w || w.b, gloss: (w.e || "").split(/[;,]/)[0].trim(),
               was: file ? src[file] : null });
  }
  return out.sort((a, b) => a.bare.localeCompare(b.bare, "ru"));
}

async function main() {
  const payload = loadPayload(ROOT);
  const audio = JSON.parse(readFileSync(join(ROOT, "data", "audio.json"), "utf8"));
  const missing = wordsToBuy(payload, audio);

  mkdirSync(OUT, { recursive: true });
  const have = new Set(readdirSync(OUT).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));

  /* **The accented headword is not what is bought.** The stress mark is a
     combining acute and the engine reads it as a character; the scenarios
     strip it for the same reason (`bare()` in native/src/audio.js). */
  /* One list to buy: the words keyed by their bare form, the sentences by
     their folded text; `text` is what the engine is handed. */
  const sentences = sentencesToBuy(payload, audio);
  /* What was bought before, so a word whose good clip was a retry under a
     different text («Ты») keeps that clip rather than being bought again under
     its bare-text id; and the lengths already measured. */
  let prior = { files: {}, ms: {} };
  if (existsSync(MANIFEST)) prior = { files: {}, ms: {}, ...JSON.parse(readFileSync(MANIFEST, "utf8")) };
  const want = missing.map((m) => ({ key: m.bare, text: m.bare, gloss: m.gloss, was: m.was, word: true }))
    .concat(sentences.map((s) => ({ key: s.key, text: s.text, gloss: "", was: s.was, word: false })))
    .map((m) => {
      const kept = prior.files[m.key];
      return { ...m, id: kept && have.has(kept) ? kept : clipId(m.text) };
    });

  const ms = { ...prior.ms };
  let measured = 0;
  for (const m of want) {
    if (!have.has(m.id) || ms[m.id] !== undefined) continue;
    ms[m.id] = durationMs(join(OUT, m.id + ".mp3"));
    measured++;
  }
  const blip = (m) => m.word && have.has(m.id) && ms[m.id] < MIN_WORD_MS;
  /* A word the engine would not say last time is not bought again on every
     run; `--retry-skipped` asks once more. */
  const skipped = new Set(flag("--retry-skipped") ? [] : (prior.skipped || []));
  const todo = want.filter((m) => !skipped.has(m.key) && (!have.has(m.id) || blip(m)));
  const chars = todo.reduce((n, m) => n + m.text.length, 0);

  const none = missing.filter((m) => !m.was).length;
  console.log(`${missing.length} curriculum words to voice: ${none} with no recording, `
              + `${missing.length - none} replacing ${[...REPLACE].join("/")}`);
  console.log(`${sentences.length} pool sentences to voice, replacing ${[...SENTENCE_REPLACE].join("/")}`);
  if (measured) console.log(`${measured} clips measured`);
  const blips = todo.filter(blip);
  if (blips.length) console.log(`${blips.length} word clip(s) under ${MIN_WORD_MS} ms, bought again: ${blips.map((m) => m.text).join(", ")}`);
  console.log(`${todo.length} to buy, ${chars} characters, about $${(chars / 1e6 * RATE_PER_M_CHARS).toFixed(4)}`);
  if (DRY) {
    todo.slice(0, 20).forEach((m) => console.log(`   ${m.text.padEnd(16)} ${m.gloss}`));
    if (todo.length > 20) console.log(`   …and ${todo.length - 20} more`);
    console.log("\n(dry run — nothing bought)");
    return;
  }
  if (!todo.length) { console.log("nothing to buy"); }

  const key = todo.length ? apiKey() : null;
  const pause = () => new Promise((r) => setTimeout(r, 120));   // somebody else's service
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const rendering = (text, how) => (how === "cap" ? cap(text) : how === "stop" ? cap(text) + "." : text);
  let bought = 0, failed = 0, retried = 0, still = 0;
  for (const m of todo) {
    try {
      /* Every file this word has on disk by the end, by id: the blip it had,
         and each rendering tried. A plain retry has the *same* id as the blip
         and overwrites it in place, which is why this is a map and not a
         list — the first cut deleted "the previous best" and took the file it
         had just written with it. The longest stays; the rest go. */
      const tried = new Map();
      if (have.has(m.id)) tried.set(m.id, ms[m.id]);
      let first = true;
      for (const how of (m.word ? RETRIES : [""])) {
        const text = rendering(m.text, how);
        const id = clipId(text);
        const file = join(OUT, id + ".mp3");
        writeFileSync(file, await synth(text, key));
        await pause();
        const got = durationMs(file);
        tried.set(id, got);
        if (!first) retried++;
        first = false;
        if (!m.word || got >= MIN_WORD_MS) break;
      }
      let best = null;
      for (const [id, got] of tried) if (!best || got > best.ms) best = { id, ms: got };
      for (const id of tried.keys()) {
        if (id === best.id) continue;
        const file = join(OUT, id + ".mp3");
        if (existsSync(file)) rmSync(file);
        delete ms[id];
      }
      m.id = best.id;
      ms[best.id] = best.ms;
      if (m.word && best.ms < MIN_WORD_MS) {
        /* The engine will not say it («и» came back 216–288 ms five times).
           A blip in the bundle would play *instead of* the collection's
           recording, since `say()` prefers the bundle — so the word is left
           out of the manifest and the collection's clip (or, failing that,
           the device voice, labelled as such) reads it. Said out loud here,
           and counted by audio_qa as streamed rather than as a blip. */
        still++;
        rmSync(join(OUT, best.id + ".mp3"));
        delete ms[best.id];
        m.id = null;
        skipped.add(m.key);
        console.log(`   !! ${m.text}: ${best.ms} ms after ${RETRIES.length} tries — left to the collection's recording`);
      }
      bought++;
    } catch (e) {
      failed++;
      console.log(`   !! ${m.text}: ${e.message}`);
    }
  }

  /* The manifest maps the utterance to its file — words by bare form, which
     build_word_assets folds, sentences already folded — the key the app
     derives (§27). Written whole each time from what is on disk, so a file
     deleted by hand disappears from it too. `ms` is the measured length of
     each file named, which audio_qa reads instead of probing. */
  const onDisk = new Set(readdirSync(OUT).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
  const files = {}, lengths = {};
  for (const m of want) {
    if (!m.id || !onDisk.has(m.id)) continue;
    files[m.key] = m.id;
    if (ms[m.id] !== undefined) lengths[m.id] = ms[m.id];
  }
  writeFileSync(MANIFEST, JSON.stringify({
    source: "Google Cloud Text-to-Speech", voice: VOICE, rate: RATE,
    note: "Bought for the curriculum words the collection has no recording for (ROADMAP 13.32), "
        + "for those it has only from Core 5000 or Google TTS, and for the speaking and "
        + "listening pools' sentences other than the human recordings (2026-09-19). "
        + "ms: each file's length in frames; a word under MIN_WORD_MS is re-bought (2026-09-21).",
    files,
    ms: lengths,
    skipped: [...skipped].filter((k) => !files[k]).sort(),
  }, null, 1));

  console.log(`\nbought ${bought} (${retried} retries), failed ${failed}, left to the collection ${still}; `
              + `manifest holds ${Object.keys(files).length}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("build_word_audio.mjs")) await main();
