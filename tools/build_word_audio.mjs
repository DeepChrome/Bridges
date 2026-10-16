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
import { TOPICS } from "../core/grammar.js";
import { CASES } from "../core/cases.js";

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
/* A word is said as a statement — «Вкусный.» — first (the owner, 2026-10-04:
   "a really weird inflection at the end (pitch rises for no reason)"). Handed
   a bare lowercase word with nothing after it, the voice reads it as
   unfinished and lifts the end; the full stop is what tells it the word is the
   whole sentence. The blip ladder (§30ao) follows: the same again, then other
   renderings. */
const RETRIES = ["stop", "stop", "cap", "", ""];
export const statedId = (text) => clipId(rendering(text, "stop"));
const RESTATE = process.argv.includes("--restate");

/* The review site's flags (tools/audio_review; pulled into
   data/curated/audio_review.json by pull.mjs): a recording whose latest
   verdict is a flag *on the clip it has now* is bought again another way.
   `rebuyLadder` names the renderings not yet tried for it — the statement,
   the bare word, capitalised, and, where an accented spelling is known, that
   spelling with its stress mark (`=` passes text as given) — so each flag
   moves the recording on rather than buying the same clip back. Every clip
   bought this way is recorded under the key's `rebought`. */
const REVIEW = join(ROOT, "data", "curated", "audio_review.json");
export function flagged(key, currentId) {
  if (!existsSync(REVIEW)) return null;
  const it = (JSON.parse(readFileSync(REVIEW, "utf8")).items || {})[key];
  const last = it && it.verdicts && it.verdicts[it.verdicts.length - 1];
  return last && last.verdict === "flag" && last.id === currentId ? it : null;
}
export function rebuyLadder(text, accented, it, currentId) {
  /* Every clip ever flagged counts as tried, not only the current one: the
     second flag on «мужчина» bought back the first clip it had replaced. */
  const tried = new Set([currentId, ...((it && it.rebought) || []),
                         ...((it && it.verdicts) || []).filter((v) => v.verdict === "flag").map((v) => v.id)]);
  const options = ["stop", "", "cap"].map((h) => [h, clipId(rendering(text, h))]);
  if (accented && accented !== text) options.push(["=" + accented, clipId(accented)]);
  return options.filter(([, id]) => !tried.has(id)).map(([h]) => h);
}
export function noteRebought(key, id) {
  const file = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, "utf8")) : { items: {} };
  const it = file.items[key] || (file.items[key] = { verdicts: [] });
  it.rebought = [...new Set([...(it.rebought || []), id])];
  writeFileSync(REVIEW, JSON.stringify(file, null, 1) + "\n");
}
const REBUY = process.argv.includes("--rebuy-flagged");

const flag = (n) => process.argv.includes(n);
const DRY = flag("--dry-run");

export const apiKey = () => {
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
export const clipId = (text) =>
  createHash("sha1").update(`google|${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 16);

export { VOICE, RATE, RATE_PER_M_CHARS };

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

const pause = () => new Promise((r) => setTimeout(r, 120));   // somebody else's service
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// A sentence that already ends on its stop is not given a second one: a
// flagged sentence was being bought again as «…знаешь..».
const stopped = (s) => (/[.!?…]$/.test(s.trim()) ? s : s + ".");
const rendering = (text, how) => (how === "cap" ? cap(text) : how === "stop" ? stopped(cap(text)) : text);

/* Buy one utterance, and for a word keep buying until what came back is a word.
 *
 * Shared by this tool and build_form_audio.mjs (2026-09-28): the retry is the
 * fix for Chirp3 returning a nine-frame blip for a one-syllable input about a
 * third of the time (§30ao), and a second copy of it is how that fix would
 * quietly go missing from the next purchase.
 *
 * `had` is a clip already on disk for this text (a blip being replaced).
 * Returns `{ id, ms, retries, dropped }`: the file kept, its length, how many
 * extra calls it took, and the ids deleted along the way. `id` is null when
 * every attempt was a blip — the file is removed, and the caller decides what
 * reads the word instead. */
export async function buyOne(text, { word, dir, key, had, ladder }) {
  /* Every file this utterance has on disk by the end, by id: the blip it had,
     and each rendering tried. A plain retry has the *same* id as the blip and
     overwrites it in place, which is why this is a map and not a list — the
     first cut deleted "the previous best" and took the file it had just
     written with it. The longest stays; the rest go. */
  const tried = new Map();
  const kept = new Set();
  if (had && had.id) tried.set(had.id, had.ms);
  let retries = 0, first = true;
  for (const how of (ladder || (word ? RETRIES : [""]))) {
    const said = how.startsWith("=") ? how.slice(1) : rendering(text, how);
    const id = clipId(said);
    const file = join(dir, id + ".mp3");
    /* A rendering already on disk under another name's purchase — «Слово.»
       bought as a table form — is that clip, not one to pay for again: 41
       words were re-synthesised over their own form clips on 2026-10-15. The
       blip being replaced is the exception; replacing it is the point. */
    const owned = existsSync(file) && !(had && had.id === id) && !tried.has(id);
    if (owned) kept.add(id);
    else {
      kept.delete(id);
      writeFileSync(file, await synth(said, key));
      await pause();
    }
    tried.set(id, durationMs(file));
    if (!first) retries++;
    first = false;
    if (!word || tried.get(id) >= MIN_WORD_MS) break;
  }
  let best = null;
  for (const [id, got] of tried) if (!best || got > best.ms) best = { id, ms: got };
  const dropped = [];
  // A clip that was already on disk belongs to whatever bought it; it is
  // never deleted here, only not chosen.
  for (const id of tried.keys()) {
    if (id === best.id || kept.has(id)) continue;
    const file = join(dir, id + ".mp3");
    if (existsSync(file)) rmSync(file);
    dropped.push(id);
  }
  if (word && best.ms < MIN_WORD_MS) {
    if (!kept.has(best.id)) rmSync(join(dir, best.id + ".mp3"));
    dropped.push(best.id);
    return { id: null, ms: best.ms, retries, dropped };
  }
  return { id: best.id, ms: best.ms, retries, dropped };
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
/* …and then everything (2026-10-01). The owner: *"inconsistencies in the voice
   that reads the audio out loud. It's okay to vary slightly… but ideally we
   aren't varying to extremely different sounding voices. I think the audio for
   znat sounds really deep and odd."* «знать» was Languages on Fire — a human,
   kept in September for being one — and that is exactly the voice that stood
   out. A curriculum word is now always this one voice, whoever recorded it
   first. */
const ALL_SOURCES = ["core5000", "googletts", "yandex", "lof", "tatoeba", "other"];
export const REPLACE = new Set(ALL_SOURCES);

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
/* All sources here too since 2026-10-01: the Tatoeba recordings are many
   different amateur readers, which is the variety the owner asked to be rid of. */
export const SENTENCE_REPLACE = new Set(ALL_SOURCES);

/* The example sentences on a curriculum word's cards (2026-10-01, the owner:
   "on the detailed cards, we don't have audio recordings of the answer
   sentences"): the dictionary's examples (the pool rows its `refs` name) and
   the Wiktionary sense examples (senses.json), which carried no speaker at
   all. Keyed by the folded sentence, as `say()` looks a clip up. */
/* What the voice is handed for a sentence. Chirp3's text normaliser reads a
   sentence-final «пол.» as the abbreviation of «половину»: «Стакан выскользнул
   и упал на пол.» came back as «…упал наполовину» (the owner heard it,
   2026-10-05; Whisper confirmed it on the purchase). Measured over every
   bought sentence ending on a word Russian also abbreviates — «см.», «кг.»,
   «мин.», «тыс.» and the rest were read as the words they stand for, which is
   right — and «пол.» was the one misread, so it is the one rule. Without the
   stop the engine has nothing to expand. `fixed` says the text changed, so a
   clip bought from the old text is bought again. */
/* …and it was not the one rule (2026-10-15). A tester heard «Мы решили пойти
   в бар.» as «…в барона», and Whisper, run over one bought sentence for each
   of the 413 distinct words a sentence ends on before its stop, found four
   more of the same kind: «бар.» → «барона», «слов.» → «словарей», «долг.» →
   «долгота», «гор.» → «городских». The units after a number («4 кал.», «$400
   тыс.») came back as the words they stand for, which is right, so the list
   stays a list of what was measured misread.
   And **one space between words, never two**: «я знаю,  ты знаешь» — a double
   space left in the grammar cards by a reformat — came back with 1.3 s of
   silence after «ты», and the single-spaced clip bought a month earlier has
   none. */
const MISREAD_STOP = /(^|\s)(пол|бар|слов|долг|гор)\.\s*$/i;
export function forVoice(text) {
  const said = String(text).replace(/\s{2,}/g, " ").replace(MISREAD_STOP, "$1$2");
  return { said, fixed: said !== text };
}

export function examplesToBuy(payload) {
  const taught = new Set();
  for (const u of payload.units) for (const i of u.w || []) taught.add(i);
  const pool = payload.sent || [];
  const senses = payload.senses || {};
  const out = [], seen = new Set();
  const add = (ru) => {
    if (!ru || !/[а-яё]/i.test(ru)) return;
    const key = fold(ru);
    if (seen.has(key)) return;
    seen.add(key);
    const { said, fixed } = forVoice(bare(ru));
    out.push({ key, text: said, fixed });
  };
  for (const i of taught) {
    const w = payload.lemmas[i];
    for (const r of String((w && w.refs) || "").split(",").filter(Boolean)) {
      const row = pool[Number(r)];
      if (row) add(row[0]);
    }
    for (const s of senses[String(i)] || []) for (const x of s.x || []) add(x.ru);
  }
  return out;
}

export function sentencesToBuy(payload, audio, replace = SENTENCE_REPLACE) {
  const files = (audio && audio.files) || {};
  const src = (audio && audio.src) || {};
  const out = [], seen = new Set();
  /* …and the examples on each unit's grammar card (2026-09-30): the card is
     read at the start of every unit and under wrong answers, and it was the
     last place a lesson reached for the phone's voice. */
  const cards = (payload.units || []).flatMap((u) => ((u.g && u.g.examples) || []).map((e) => [e[0]]))
    /* …and the grammar reference's examples (2026-10-02): Practice → The
       rules was the one screen still reading its sentences in the phone's
       voice, beside the bought voice everywhere else (the owner: "a ton of
       voices swapping"). */
    .concat(TOPICS.flatMap((t) => t.sections.flatMap((s) => (s.examples || []).map((e) => [e[0]]))))
    // …and the case modules' cards (core/cases.js), the same kind of example.
    .concat(CASES.flatMap((c) => c.uses.flatMap((u) => u.examples.map((e) => [e[0]]))));
  for (const row of ((payload.speech && payload.speech.rows) || []).concat(cards)) {
    const key = fold(row[0]);
    if (seen.has(key)) continue;
    seen.add(key);
    const file = files[key];
    if (file && !replace.has(src[file])) continue;
    // A card's pattern example («стол → столы́») is two words, not a sentence:
    // handed over as written, the engine read the arrow. A comma reads as the
    // pause between them; the key stays the card's own text, which is what
    // the app looks the clip up by.
    const { said, fixed } = forVoice(bare(row[0]).replace(/\s*→\s*/g, ", "));
    out.push({ key, text: said, fixed, was: file ? src[file] : null });
  }
  return out;
}

export function wordsToBuy(payload, audio, replace = REPLACE) {
  const files = (audio && audio.files) || {};
  const src = (audio && audio.src) || {};
  /* The units' words, and then **every studied word** (2026-10-15). A tester
     heard «знаменитый» and «воспользоваться» on Study cards and called them
     robotic: neither is a unit word any more, neither had ever been bought,
     so `say()` had nothing but the phone's voice. They were in his schedule
     from drills that drew on the whole studied list before §30bt, and from
     earlier cuts of the curriculum — a card outlives the cut that taught it.
     Any studied word can therefore be on somebody's card, so each has a
     recording; about 2,700 words, under a dollar. */
  const taught = new Set();
  for (const u of payload.units) for (const i of u.w || []) taught.add(i);
  payload.lemmas.forEach((_, i) => taught.add(i));
  const out = [], seen = new Set();
  for (const i of taught) {
    const w = payload.lemmas[i];
    if (!w || !w.b || seen.has(w.b)) continue;
    seen.add(w.b);
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
  const pooled = sentencesToBuy(payload, audio);
  const inPool = new Set(pooled.map((s) => s.key));
  const sentences = pooled.concat(examplesToBuy(payload).filter((s) => !inPool.has(s.key)));
  /* What was bought before, so a word whose good clip was a retry under a
     different text («Ты») keeps that clip rather than being bought again under
     its bare-text id; and the lengths already measured. */
  let prior = { files: {}, ms: {} };
  if (existsSync(MANIFEST)) prior = { files: {}, ms: {}, ...JSON.parse(readFileSync(MANIFEST, "utf8")) };
  const want = missing.map((m) => ({ key: m.bare, text: m.bare, gloss: m.gloss, was: m.was, word: true }))
    .concat(sentences.map((s) => ({ key: s.key, text: s.text, gloss: "", was: s.was, word: false, fixed: s.fixed })))
    .map((m) => {
      const kept = prior.files[m.key];
      // A sentence whose text forVoice changed is held to the new text's clip.
      if (m.fixed) return { ...m, id: clipId(m.text) };
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
  /* `--restate`: every word clip bought before words were said as statements
     is bought again, as one ("Вкусный."), and the old file goes. */
  const old = new Map();
  if (RESTATE) for (const m of want) {
    if (!m.word || m.id === statedId(m.text)) continue;
    old.set(m.key, m.id);
    m.id = statedId(m.text);
  }
  /* `--rebuy-flagged`: what a reviewer flagged on its current clip is bought
     again, the next rendering not yet tried (rebuyLadder). */
  if (REBUY) for (const m of want) {
    const rkey = `${m.word ? "word" : "sentence"}:${m.key}`;
    const it = flagged(rkey, m.id);
    if (!it) continue;
    const ladder = rebuyLadder(m.text, null, it, m.id);
    if (!ladder.length) { console.log(`   !! ${m.text}: every rendering tried — needs a person's fix`); continue; }
    m.ladder = ladder;
    m.rebuyKey = rkey;
    m.id = `rebuy-${m.key}`;                       // not on disk, so it is bought
  }
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
  let bought = 0, failed = 0, retried = 0, still = 0;
  for (const m of todo) {
    try {
      const got = await buyOne(m.text, { word: m.word, dir: OUT, key, ladder: m.ladder,
                                          had: have.has(m.id) ? { id: m.id, ms: ms[m.id] } : null });
      if (m.rebuyKey && got.id) noteRebought(m.rebuyKey, got.id);
      retried += got.retries;
      for (const id of got.dropped) delete ms[id];
      if (got.id) {
        m.id = got.id;
        ms[got.id] = got.ms;
      } else {
        /* The engine will not say it («и» came back 216–288 ms five times).
           A blip in the bundle would play *instead of* the collection's
           recording, since `say()` prefers the bundle — so the word is left
           out of the manifest and the collection's clip (or, failing that,
           the device voice, labelled as such) reads it. Said out loud here,
           and counted by audio_qa as streamed rather than as a blip. */
        still++;
        m.id = null;
        skipped.add(m.key);
        console.log(`   !! ${m.text}: ${got.ms} ms after ${RETRIES.length} tries — left to the collection's recording`);
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
