/* Real voices for the listening scenarios (§30l).
 *
 * The scenarios are read by whatever text-to-speech the phone happens to have.
 * That works, costs nothing and needs no connection, but it is the device's
 * voice: flat question intonation, no breath between sentences, and on a phone
 * with no Russian voice installed, silence. The owner, 2026-09-11, having
 * heard it: *"Are there any platforms we can use to make the voices sound less
 * robotic and more professional?"* — and then, on the numbers: *"I can give
 * the dollar."*
 *
 * The numbers are why this is worth doing: **2,136 lines, 48,000 characters,
 * about 57 minutes of speech** for the whole course. One purchase, not a
 * running cost, and a line only costs again if its Russian is edited.
 *
 *   node tools/build_scenario_audio.mjs --list-voices      # what the account has
 *   node tools/build_scenario_audio.mjs --dry-run          # what it would cost
 *   node tools/build_scenario_audio.mjs --chapter 1        # one chapter, to listen to
 *   node tools/build_scenario_audio.mjs                    # the lot
 *
 * **Google, because the voices are natively Russian.** The owner ruled out
 * OpenAI for this on 2026-09-11 for the reason that matters to a language app:
 * its voices are English-native models speaking Russian, and a learner would
 * be training their ear on a faint American accent for 57 minutes. Azure's
 * Russian voices are as good but there are only about three, so every man in
 * the course would be the same man. Yandex has the best Russian of the three
 * and a billing arrangement not worth the trouble from here.
 *
 * The provider lives behind `synth()` and `listVoices()`; another one is those
 * two functions and a voice table.
 *
 * The key comes from `GOOGLE_TTS_API_KEY` in the environment and is never
 * written anywhere (rule 20.11). Re-runnable and idempotent (§24): a clip
 * already on disk is never bought twice, so an interrupted run resumes free.
 *
 * **The files live in `data/`, not `site/`.** Rule 20.3 says generated
 * artifacts are disposable — but that is because they can be rebuilt, and
 * these cannot be rebuilt without paying again. They are sources. `site/` is
 * gitignored and wiped; these are committed and copied out at build time.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sexOf } from "../core/names.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "data", "curated", "scripts");
const OUT = join(ROOT, "data", "scenario_audio");
const MANIFEST = join(OUT, "manifest.json");

const API = "https://texttospeech.googleapis.com/v1";
const LANG = "ru-RU";

/* Which family of voices to buy. Chirp3-HD is the top tier that exists in
   Russian at all — all 2,066 voices were listed and Studio, Neural2, News,
   Polyglot and Casual have no ru-RU voice — so it is the default rather than
   something a caller has to remember. `--tier` overrides it, because the
   account is the authority on what exists (`--list-voices`) and the good
   families are renamed every couple of years. */
const DEFAULT_TIER = "Chirp3-HD";

/* Speaking rate and pitch are the two things that make a synthesised
   conversation sound like a station announcement. Slightly under a natural
   pace, because this is being listened to by somebody learning the language. */
const RATE = 0.94;

const FORMAT = "MP3";
const EXT = "mp3";

/* Published per-million-character rates move, and quoting one as fact is how a
   cost model goes stale (ROADMAP §9). This is only for the estimate the run
   prints, and it says so. Both Google and Azure also have a monthly free
   allowance that 48,000 characters may well fall inside. */
const RATE_PER_M_CHARS = 30;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

const apiKey = () => {
  const k = process.env.GOOGLE_TTS_API_KEY;
  if (!k) {
    console.error("GOOGLE_TTS_API_KEY is not set. It belongs in the environment,"
                  + " never in the repo (rule 20.11).");
    process.exit(2);
  }
  return k;
};

/* Stable, spread, and the same function the app uses to pick its device voices
   — a lesson must not change its cast's voices between runs. */
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* The file a line lives in. Keyed on everything that changes the sound, so
   editing the Russian, changing the voice or changing the rate all produce a
   new file and leave the old one alone. */
const clipId = (voice, text) =>
  createHash("sha1").update(`google|${voice}|${RATE}|${text}`).digest("hex").slice(0, 16);

/* ------------------------------------------------------------- the provider */

async function listVoices(key) {
  const res = await fetch(`${API}/voices?languageCode=${LANG}&key=${key}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return (body.voices || []).map((v) => ({
    name: v.name,
    sex: v.ssmlGender === "FEMALE" ? "f" : v.ssmlGender === "MALE" ? "m" : null,
  }));
}

async function synth(text, voice, key) {
  const res = await fetch(`${API}/text:synthesize?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: LANG, name: voice },
      audioConfig: { audioEncoding: FORMAT, speakingRate: RATE },
    }),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.audioContent) throw new Error("no audioContent in the reply");
  return Buffer.from(body.audioContent, "base64");
}

/* ------------------------------------------------------------ the scenarios */

export function loadScenarios(chapter = null) {
  const out = [];
  for (const f of readdirSync(SCRIPTS).filter((x) => x.endsWith(".json")).sort()) {
    const o = JSON.parse(readFileSync(join(SCRIPTS, f), "utf8"));
    if (chapter && Number(o.chapter) !== Number(chapter)) continue;
    for (const [key, e] of Object.entries(o.lessons)) out.push({ key, chapter: o.chapter, ...e });
  }
  return out;
}

/* Who reads whom. Deterministic in the lesson's own key, so a re-run buys
   nothing new; a woman is never read by a man's voice; and 168 conversations
   are not all the same two people. */
export function castVoices(lesson, pools) {
  const turn = hash32(lesson.key);
  const taken = new Set();
  const out = {};
  lesson.cast.forEach((c, k) => {
    const sex = sexOf(c.ru) || (k % 2 ? "m" : "f");
    const pool = pools[sex].length ? pools[sex] : pools[sex === "f" ? "m" : "f"];
    for (let i = 0; i < pool.length; i++) {
      const v = pool[(turn + i) % pool.length];
      if (!taken.has(v)) { taken.add(v); out[c.id] = v; break; }
    }
    if (!out[c.id]) out[c.id] = pool[turn % pool.length];
  });
  return out;
}

/* The voices to draw from: whatever the account offers in the chosen tier,
   split by the sex the API itself reports. Asking beats hard-coding a list of
   names that is renamed every couple of years — the same rule that produced
   core/voices.js for the phone. */
export function poolsFrom(voices, tier) {
  const pick = (sex) => voices
    .filter((v) => v.sex === sex && v.name.includes(`-${tier}-`))
    .map((v) => v.name)
    .sort();
  return { f: pick("f"), m: pick("m") };
}

async function main() {
  const chapter = arg("--chapter");
  const tier = arg("--tier", DEFAULT_TIER);
  const dry = flag("--dry-run");
  const limit = Number(arg("--limit", "0"));

  if (flag("--list-voices")) {
    const voices = await listVoices(apiKey());
    const by = {};
    voices.forEach((v) => { (by[v.name.split("-")[2] || "?"] ||= []).push(v); });
    Object.keys(by).sort().forEach((t) => {
      console.log(`\n${t}`);
      by[t].sort((a, b) => a.name.localeCompare(b.name))
        .forEach((v) => console.log(`  ${v.name}  ${v.sex === "f" ? "woman" : v.sex === "m" ? "man" : "?"}`));
    });
    console.log(`\n${voices.length} ${LANG} voices`);
    return;
  }

  /* The pools need the account, which a dry run has no key for. Costing does
     not depend on which voice says a line, so a dry run names them itself. */
  const pools = dry && !process.env.GOOGLE_TTS_API_KEY
    ? { f: ["A"], m: ["B"] }
    : poolsFrom(await listVoices(apiKey()), tier);
  if (!dry && (!pools.f.length || !pools.m.length)) {
    console.error(`no ${tier} voices for ${LANG} on this account — try --list-voices`);
    process.exit(2);
  }
  if (!dry) console.log(`voices: women ${pools.f.join(", ")}\n        men   ${pools.m.join(", ")}`);

  const lessons = loadScenarios(chapter);
  const manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { lessons: {} };
  manifest.provider = "google";
  manifest.tier = tier;
  manifest.rate = RATE;
  manifest.lessons = manifest.lessons || {};
  if (!dry) mkdirSync(OUT, { recursive: true });

  /* Every clip the run needs, before any of it is bought: the same line said
     by the same voice is one file however many lessons use it. */
  const wanted = [];
  const seen = new Set();
  for (const lesson of lessons) {
    const voices = castVoices(lesson, pools);
    const lines = lesson.lines.map((l) => {
      const voice = voices[l.s];
      const id = clipId(voice, l.ru);
      if (!seen.has(id)) { seen.add(id); wanted.push({ id, voice, text: l.ru }); }
      return { s: l.s, id };
    });
    manifest.lessons[lesson.key] = { voices, lines };
  }

  const todo = wanted.filter((c) => !existsSync(join(OUT, `${c.id}.${EXT}`)));
  const chars = todo.reduce((n, c) => n + c.text.length, 0);
  console.log(`${lessons.length} lessons, ${wanted.length} distinct clips`
              + `, ${wanted.length - todo.length} already on disk`);
  console.log(`${todo.length} to generate, ${chars.toLocaleString()} characters`
              + ` — about $${(chars / 1e6 * RATE_PER_M_CHARS).toFixed(2)}`
              + ` at $${RATE_PER_M_CHARS}/M, before any free allowance`
              + ` (check the current rate before trusting this)`);
  if (dry) return;

  const list = limit ? todo.slice(0, limit) : todo;
  let made = 0, bytes = 0;
  const failed = [];
  for (const c of list) {
    try {
      const buf = await synth(c.text, c.voice, apiKey());
      writeFileSync(join(OUT, `${c.id}.${EXT}`), buf);
      made++; bytes += buf.length;
      if (made % 25 === 0) console.log(`  ${made}/${list.length}`);
    } catch (e) {
      /* Recorded and reported, never swallowed (§6): a run that quietly drops
         forty lines leaves forty silent gaps in a conversation. */
      failed.push(`${c.id} (${c.voice}): ${e.message}`);
    }
  }

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
  const total = readdirSync(OUT).filter((f) => f.endsWith(`.${EXT}`));
  const totalBytes = total.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`\ngenerated ${made}, ${(bytes / 1048576).toFixed(1)} MB this run`);
  console.log(`on disk ${total.length} clips, ${(totalBytes / 1048576).toFixed(1)} MB`);
  console.log(`manifest ${MANIFEST.replace(ROOT, ".")}`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILED — rerun to retry, nothing is bought twice:`);
    failed.slice(0, 10).forEach((f) => console.log(`  ${f}`));
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("build_scenario_audio.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
