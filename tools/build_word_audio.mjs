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
 *   node tools/build_word_audio.mjs               # buy what is missing
 *
 * Idempotent: a word whose clip is already on disk is skipped, so a re-run
 * costs nothing.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "./payload.mjs";
import { fold } from "../core/util.js";

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

/* The words the units teach that `data/audio.json` has no file for.
 *
 * **Looked up folded**, which is rule 20.2 and cost real money to nearly get
 * wrong: the manifest is keyed by the folded utterance (ё→е), while a lemma's
 * bare form keeps its ё. Asking `files["ещё"]` therefore answers "no file" for
 * a word that has one, and the first run of this tool reported 75 words to buy
 * where the truth is 61 — the difference being fourteen words with ё in them,
 * every one of which already had a recording. `say()` folds; so does this. */
export function missingWords(payload, audio) {
  const files = (audio && audio.files) || {};
  const taught = new Set();
  for (const u of payload.units) for (const i of u.w || []) taught.add(i);
  const out = [];
  for (const i of taught) {
    const w = payload.lemmas[i];
    if (!w || !w.b) continue;
    if (files[fold(w.b)]) continue;
    out.push({ i, bare: w.b, accented: w.w || w.b, gloss: (w.e || "").split(/[;,]/)[0].trim() });
  }
  return out.sort((a, b) => a.bare.localeCompare(b.bare, "ru"));
}

async function main() {
  const payload = loadPayload(ROOT);
  const audio = JSON.parse(readFileSync(join(ROOT, "data", "audio.json"), "utf8"));
  const missing = missingWords(payload, audio);

  mkdirSync(OUT, { recursive: true });
  const have = new Set(readdirSync(OUT).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));

  /* **The accented headword is not what is bought.** The stress mark is a
     combining acute and the engine reads it as a character; the scenarios
     strip it for the same reason (`bare()` in native/src/audio.js). */
  const want = missing.map((m) => ({ ...m, id: clipId(m.bare) }));
  const todo = want.filter((m) => !have.has(m.id));
  const chars = todo.reduce((n, m) => n + m.bare.length, 0);

  console.log(`${missing.length} curriculum words with no recording in the collection`);
  console.log(`${todo.length} to buy, ${chars} characters, about $${(chars / 1e6 * RATE_PER_M_CHARS).toFixed(4)}`);
  if (DRY) {
    todo.slice(0, 20).forEach((m) => console.log(`   ${m.bare.padEnd(16)} ${m.gloss}`));
    if (todo.length > 20) console.log(`   …and ${todo.length - 20} more`);
    console.log("\n(dry run — nothing bought)");
    return;
  }
  if (!todo.length) { console.log("nothing to buy"); }

  const key = todo.length ? apiKey() : null;
  let bought = 0, failed = 0;
  for (const m of todo) {
    try {
      const mp3 = await synth(m.bare, key);
      writeFileSync(join(OUT, m.id + ".mp3"), mp3);
      bought++;
      // A pause, as the scenario tool does: this is somebody else's service.
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      failed++;
      console.log(`   !! ${m.bare}: ${e.message}`);
    }
  }

  /* The manifest maps the **folded** word to its file, which is the key the
     app already derives (§27). Written whole each time from what is on disk,
     so a file deleted by hand disappears from it too. */
  const onDisk = new Set(readdirSync(OUT).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
  const files = {};
  for (const m of want) if (onDisk.has(m.id)) files[m.bare] = m.id;
  writeFileSync(MANIFEST, JSON.stringify({
    source: "Google Cloud Text-to-Speech", voice: VOICE, rate: RATE,
    note: "Bought for the curriculum words the collection has no recording for (ROADMAP 13.32).",
    files,
  }, null, 1));

  console.log(`\nbought ${bought}, failed ${failed}; manifest holds ${Object.keys(files).length}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("build_word_audio.mjs")) await main();
