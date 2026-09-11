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
 * about 57 minutes of speech** for the whole course. That is one purchase of a
 * pound or two, not a running cost, and a line only costs again if its Russian
 * is edited.
 *
 *   node tools/build_scenario_audio.mjs --dry-run          # what it would cost
 *   node tools/build_scenario_audio.mjs --chapter 1        # one chapter, to listen to
 *   node tools/build_scenario_audio.mjs                    # the lot
 *
 * The key comes from `OPENAI_API_KEY` in the environment and is never written
 * anywhere (rule 20.11). Re-runnable and idempotent (§24): a clip already on
 * disk is never bought twice, so an interrupted run resumes for free.
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

/* The voices, by sex. More than one each so that 168 conversations are not all
   the same two people: a lesson takes its pair by a hash of its own name and
   keeps it, exactly as the device-voice path does (native/src/audio.js). */
const VOICES = {
  f: ["nova", "shimmer", "coral", "sage"],
  m: ["onyx", "echo", "ash", "ballad"],
};

const MODEL = "gpt-4o-mini-tts";
const FORMAT = "mp3";

/* What the model is told about delivery. Short and about *manner* only —
   nothing here may change the words, and nothing here is Russian: the line is
   the line. */
const INSTRUCTIONS =
  "Speak Russian naturally, as one side of a relaxed everyday conversation. "
  + "Keep a steady, unhurried pace, with a clear rise on questions and a real "
  + "pause between sentences. Do not sound like an announcer.";

/* Published per-million-character rates move, and quoting one as fact is how a
   cost model goes stale (ROADMAP §9). This is only for the estimate the run
   prints, and it says so. */
const RATE_PER_M_CHARS = 12;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

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
   editing the Russian, changing the voice or changing the model all produce a
   new file and leave the old one alone. */
const clipId = (voice, text) =>
  createHash("sha1").update(`${MODEL}|${voice}|${text}`).digest("hex").slice(0, 16);

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
   nothing new, and a woman is never read by a man's voice. */
export function castVoices(lesson) {
  const turn = hash32(lesson.key);
  const taken = new Set();
  const out = {};
  lesson.cast.forEach((c, k) => {
    const sex = sexOf(c.ru) || (k % 2 ? "m" : "f");
    const pool = VOICES[sex];
    for (let i = 0; i < pool.length; i++) {
      const v = pool[(turn + i) % pool.length];
      if (!taken.has(v)) { taken.add(v); out[c.id] = v; break; }
    }
    if (!out[c.id]) out[c.id] = pool[turn % pool.length];
  });
  return out;
}

async function speak(text, voice, key) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL, voice, input: text, response_format: FORMAT,
      instructions: INSTRUCTIONS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const chapter = arg("--chapter");
  const dry = flag("--dry-run");
  const limit = Number(arg("--limit", "0"));
  const key = process.env.OPENAI_API_KEY;
  if (!dry && !key) {
    console.error("OPENAI_API_KEY is not set. It belongs in the environment, never in the repo.");
    process.exit(2);
  }

  const lessons = loadScenarios(chapter);
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { model: MODEL, lessons: {} };
  manifest.model = MODEL;
  manifest.lessons = manifest.lessons || {};
  if (!dry) mkdirSync(OUT, { recursive: true });

  /* Every clip the run needs, before any of it is bought: the same line said
     by the same voice is one file however many lessons use it. */
  const wanted = [];
  const seen = new Set();
  for (const lesson of lessons) {
    const voices = castVoices(lesson);
    const lines = lesson.lines.map((l) => {
      const voice = voices[l.s];
      const id = clipId(voice, l.ru);
      if (!seen.has(id)) {
        seen.add(id);
        wanted.push({ id, voice, text: l.ru });
      }
      return { s: l.s, id };
    });
    manifest.lessons[lesson.key] = { voices, lines };
  }

  const todo = wanted.filter((c) => !existsSync(join(OUT, `${c.id}.${FORMAT}`)));
  const chars = todo.reduce((n, c) => n + c.text.length, 0);
  console.log(`${lessons.length} lessons, ${wanted.length} distinct clips`
              + `, ${wanted.length - todo.length} already on disk`);
  console.log(`${todo.length} to generate, ${chars.toLocaleString()} characters`
              + ` — about $${(chars / 1e6 * RATE_PER_M_CHARS).toFixed(2)}`
              + ` at $${RATE_PER_M_CHARS}/M (check the current rate before trusting this)`);
  if (dry) return;

  const list = limit ? todo.slice(0, limit) : todo;
  let made = 0, bytes = 0;
  const failed = [];
  for (const c of list) {
    try {
      const buf = await speak(c.text, c.voice, key);
      writeFileSync(join(OUT, `${c.id}.${FORMAT}`), buf);
      made++; bytes += buf.length;
      if (made % 25 === 0) console.log(`  ${made}/${list.length}`);
    } catch (e) {
      /* Recorded and reported, never swallowed (§6): a run that quietly drops
         forty lines leaves forty silent gaps in a conversation. */
      failed.push(`${c.id} (${c.voice}): ${e.message}`);
    }
  }

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
  const total = readdirSync(OUT).filter((f) => f.endsWith(`.${FORMAT}`));
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
