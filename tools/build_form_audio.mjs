/* A recording for every form the unit words' tables show (ROADMAP 13.42).
 *
 * The owner, 2026-09-28: *"an audio button next to every pronunciation of a
 * word so I can hear how the word is said in all forms"* — and, told it was
 * about $3 and ~50 MB of app, *"go ahead and buy it"*.
 *
 * **Bought from the bare spelling, and the reason is a measurement.** A form's
 * stress is the one thing a learner presses its button to hear, so the first
 * idea was to hand the voice the stressed spelling. A pilot on 2026-09-28
 * bought five pairs both ways — «ру́ки»/«руки́», «до́ма»/«дома́»,
 * «за́мок»/«замо́к», «во́ды»/«воды́», «го́рода»/«города́» — and measured
 * where each clip's energy sat. The two stressings came back different from
 * each other and from the bare word, and 40–90 ms longer than it, but the
 * energy moved toward the marked syllable in only three pairs of five: chance.
 * The mark changes *something* and does not reliably change the stress. So
 * this does what `build_word_audio.mjs` already did for the 1,028 headwords:
 * the bare spelling, and the voice's own knowledge of the word.
 *
 * **Which is only safe where the spelling has one stress.** 456 spellings in
 * the studied lexicon's tables are shared by two stressings («руки́» the
 * genitive, «ру́ки» the plural). Handed the bare «руки», the voice picks one,
 * and a pronunciation button playing a guessed stress is worse than the
 * phone's voice reading the stress mark. So any form whose spelling any
 * table — or any dictionary headword — spells with another stress is **not
 * bought**, and keeps the device voice (`FormSpeaker`). The manifest is keyed
 * by the *accented* form for the same reason: a folded key cannot tell the
 * two apart (rule 20.2's key, doing exactly what it was built to do, in the
 * one place it must not be used).
 *
 * Clips go into `data/word_audio/` beside the words, under the same content
 * hash — one voice, one rate — so a form that *is* a bought headword
 * («кни́га») costs nothing, and the silence trim and blip check in
 * `build_word_assets.mjs` apply to both.
 *
 *   node tools/build_form_audio.mjs --dry-run    # what it would buy, and the cost
 *   node tools/build_form_audio.mjs              # buy it
 *
 * Idempotent, and safe to stop: the manifest is rewritten every 200 clips, so
 * a run interrupted by the network resumes where it stopped.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "./payload.mjs";
import { durationMs } from "./mp3.mjs";
import { fold, bare } from "../core/util.js";
import { parseDeep } from "../core/search.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { ENDINGS } from "../core/endings.js";
import { buyOne, clipId, apiKey, VOICE, RATE, RATE_PER_M_CHARS } from "./build_word_audio.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "word_audio");
export const FORMS_MANIFEST = join(DIR, "forms.json");
const DRY = process.argv.includes("--dry-run");

/* The accented form as a key: NFC, so a stress mark that arrived decomposed
   and one that arrived composed are the same key. Russian has no precomposed
   stressed vowels, so NFC keeps the acute as its own character — which is the
   point: «руки́» and «ру́ки» stay two keys. */
export const formKey = (f) => String(f || "").normalize("NFC").trim();

const CYR = /[Ѐ-ӿ]/;

/* Every Cyrillic form a table in these lemmas shows. */
export function tableForms(lemmas, idxs) {
  const out = new Set();
  for (const i of idxs) {
    for (const t of (lemmas[i] && lemmas[i].t) || []) {
      for (const r of t.rows) {
        for (let c = 1; c < r.length; c++) {
          for (const f of (Array.isArray(r[c]) ? r[c] : [r[c]])) {
            if (f && CYR.test(f)) out.add(formKey(f));
          }
        }
      }
    }
  }
  return out;
}

/* What the voice is actually handed for a form: the letters with the stress
   mark taken off, and **ё kept**. Not `fold()` — fold turns ё into е, and
   «чём» and «чем» are two words the voice says differently *because* it is
   handed the ё. */
export const spokenKey = (f) => bare(formKey(f)).normalize("NFC");

const VOWELS = "аеёиоуыэюя";
/* Which syllable a marked form stresses; null when it carries no mark, or has
   one syllable and so nothing to get wrong. */
function stressedSyllable(form) {
  const s = formKey(form).normalize("NFD").toLowerCase();
  let n = 0, at = null;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "́") at = n - 1;
    else if (VOWELS.includes(s[i].normalize("NFC"))) n++;
  }
  // ё is always stressed, and decomposes to е + U+0308 under NFD.
  if (at === null && s.includes("̈")) return null;
  return n > 1 ? at : null;
}

/* The spoken texts that carry two different stresses somewhere the learner can
 * meet them — every studied table, every dictionary headword. Handed one of
 * these, the voice has to guess, and a guessed stress on a pronunciation
 * button is worse than the phone reading the mark.
 *
 * Defined once and used twice: this tool leaves those forms out, and
 * `audio_qa.mjs` refuses a manifest containing one. The gate's first version
 * grouped by `fold()` and flagged twelve false alarms — the ё pairs above,
 * and one-syllable words marked in one table and not another («то́т», «тот»).
 * A check that cannot tell the danger from the harmless is worse than none
 * (§30r). */
export function ambiguousSpellings(spellings) {
  const by = new Map();
  for (const s of spellings) {
    const at = stressedSyllable(s);
    if (at === null) continue;
    const k = spokenKey(s);
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(at);
  }
  return new Set([...by].filter(([, v]) => v.size > 1).map(([k]) => k));
}

async function main() {
  const D = loadPayload(ROOT);
  const deep = parseDeep(D.deep || "");
  const BY = makeDeepIndex(deep);
  D.lemmas.forEach(makeHydrator({ deepIndex: () => BY, shapes: D.shapes, slots: D.slots, sent: D.sent }));

  const units = new Set();
  for (const u of D.units) for (const i of u.w || []) units.add(i);
  const wanted = tableForms(D.lemmas, [...units]);
  // The endings screen's example words ride along: they are words, and the
  // same voice should read them (core/endings.js).
  for (const e of ENDINGS) for (const x of e.examples) wanted.add(formKey(x));

  /* The whole studied lexicon's tables and every headword, for the check. */
  const everywhere = [...tableForms(D.lemmas, D.lemmas.map((_, i) => i))];
  for (const w of D.lemmas) if (w.w) everywhere.push(w.w);
  for (const d of deep) if (d.w) everywhere.push(d.w);
  const clash = ambiguousSpellings(everywhere.concat([...wanted]));

  mkdirSync(DIR, { recursive: true });
  const have = new Set(readdirSync(DIR).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
  let prior = { files: {}, ms: {}, skipped: [] };
  if (existsSync(FORMS_MANIFEST)) prior = { ...prior, ...JSON.parse(readFileSync(FORMS_MANIFEST, "utf8")) };
  const skipped = new Set(process.argv.includes("--retry-skipped") ? [] : prior.skipped || []);
  /* The words already bought. A short word whose plain clip was a blip was
     kept under a retried spelling («Ты.»), so its clip is not at
     `clipId("ты")`; looking it up by the word manifest's own key is what
     stops it being bought — and blipping — all over again. The words the
     voice would not say at all (`skipped` there) are not tried here either. */
  const wordManifest = join(DIR, "manifest.json");
  const words = existsSync(wordManifest) ? JSON.parse(readFileSync(wordManifest, "utf8")) : {};
  const wordFiles = words.files || {};
  const wordSkipped = new Set(words.skipped || []);

  const plan = [], ambiguous = [];
  for (const form of wanted) {
    if (clash.has(spokenKey(form))) { ambiguous.push(form); continue; }
    /* What the voice is handed: no stress mark (see the head of the file),
       the letters otherwise exactly as shown. */
    const text = bare(form).normalize("NFC");
    if (wordSkipped.has(text)) { skipped.add(form); continue; }
    plan.push({ form, text, id: prior.files[form] || wordFiles[text] || clipId(text) });
  }

  const reuse = plan.filter((p) => have.has(p.id));
  const todo = plan.filter((p) => !have.has(p.id) && !skipped.has(p.form));
  // Many forms share a spelling across tables («его́» in several); buy each once.
  const texts = [...new Map(todo.map((p) => [p.text, p])).values()];
  const chars = texts.reduce((n, p) => n + p.text.length, 0);

  console.log(`${wanted.size} forms shown (unit words, and the endings' examples)`);
  console.log(`  ${ambiguous.length} left to the device voice: their spelling carries two stresses`);
  console.log(`  ${reuse.length} already have a clip — a headword, a sentence, or an earlier run`);
  console.log(`  ${texts.length} to buy, ${chars.toLocaleString()} characters, about `
              + `$${(chars / 1e6 * RATE_PER_M_CHARS).toFixed(2)} before retries for blips`);
  if (DRY) {
    console.log(`  e.g. ${ambiguous.slice(0, 8).join(", ")} stay with the device`);
    console.log("\n(dry run — nothing bought)");
    return;
  }

  const key = texts.length ? apiKey() : null;
  const ms = { ...prior.ms };
  const files = { ...prior.files };
  const byText = new Map();
  let bought = 0, failed = 0, retries = 0, still = 0;

  const save = () => {
    const onDisk = new Set(readdirSync(DIR).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
    const out = {}, lengths = {};
    for (const p of plan) {
      const id = byText.has(p.text) ? byText.get(p.text) : (files[p.form] || p.id);
      if (!id || !onDisk.has(id)) continue;
      out[p.form] = id;
      if (ms[id] === undefined) ms[id] = durationMs(join(DIR, id + ".mp3"));
      lengths[id] = ms[id];
    }
    writeFileSync(FORMS_MANIFEST, JSON.stringify({
      source: "Google Cloud Text-to-Speech", voice: VOICE, rate: RATE,
      note: "Every form the unit words' tables show (ROADMAP 13.42, 2026-09-28), keyed by the "
          + "ACCENTED form. Bought from the bare spelling; any spelling that carries two stresses "
          + "anywhere in the lexicon is left out and read by the device voice.",
      files: out, ms: lengths, skipped: [...skipped].sort(),
    }, null, 1));
    return Object.keys(out).length;
  };

  for (const p of texts) {
    try {
      const got = await buyOne(p.text, { word: true, dir: DIR, key, had: null });
      retries += got.retries;
      for (const id of got.dropped) delete ms[id];
      if (got.id) { byText.set(p.text, got.id); ms[got.id] = got.ms; bought++; }
      else { skipped.add(p.form); still++; }
    } catch (e) {
      failed++;
      console.log(`   !! ${p.text}: ${e.message}`);
      if (/\b(401|403)\b/.test(e.message)) break;       // a bad key will not get better
    }
    if ((bought + still) % 200 === 0 && bought) {
      const n = save();
      console.log(`   ${bought + still} of ${texts.length} (${n} forms in the manifest)`);
    }
  }
  const n = save();
  console.log(`\nbought ${bought} (${retries} retries), ${still} the voice would not say, failed ${failed};`
              + ` manifest holds ${n} forms`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("build_form_audio.mjs")) await main();
