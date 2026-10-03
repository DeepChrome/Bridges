#!/usr/bin/env node
/* Every sentence a learner can meet, read for whether it is worth meeting
 * (the owner, 2026-10-03: *"a lot of weird sentences that dont really pass the
 * smell check… «he watches television, football»… doesnt seem like a normal
 * sentence. We have to make sure all sentences are actually useful/make
 * sense."*).
 *
 * The sentences come from three places, none written for a course: his decks,
 * Tatoeba, and the goal videos' own speech, cut into sentences by a model
 * (build_video_lines.py keeps only exact runs of what was said, and spoken
 * Russian is full of fragments and lists). No rule can tell «Он смотрит
 * телевизор, футбол» from a sentence; a reader can. So a model reads them, in
 * batches, against a short list of what makes a sentence not worth learning
 * from, and its verdicts are written to `data/curated/sentence_review.json` —
 * a decision file a person may correct by hand (rule 20.3), keyed by the
 * folded sentence so it survives a rebuild. `build_site.py` drops every
 * sentence marked there, from the pools, the video lines and the examples.
 *
 * The set read is the set the app voices (build_word_audio.mjs
 * sentencesToBuy + examplesToBuy): every pool sentence and video line, every
 * example on a curriculum word's card. A sentence already reviewed is not
 * sent again.
 *
 *   node tools/review_sentences.mjs --dry-run    count what would be sent
 *   node tools/review_sentences.mjs              review what is new
 *   node tools/review_sentences.mjs --limit 120  a pilot
 *   node tools/review_sentences.mjs --recheck    the dropped ones again, after the rules change
 *
 * Reads the built payload, so run it after build_site and rebuild after it.
 * The Anthropic key is read from backend/.dev.vars and never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { fold, bare } from "../core/util.js";
import { sentencesToBuy, examplesToBuy } from "./build_word_audio.mjs";
import { TOPICS } from "../core/grammar.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "curated", "sentence_review.json");
const MODEL = "claude-sonnet-5-5";
const BATCH = 60;
const PRICE = { in: 3, out: 15 };   // $ per million tokens

const SYSTEM = `You review example sentences for a Russian course for English speakers. Each sentence is shown to learners as a model of Russian: on flashcards, in listening and speaking drills, and under words in the dictionary.

Mark an item DROP only when a learner would be worse off meeting it:
- broken speech: a piece of a spoken sentence cut off mid-thought ("если вы хотите показать что вы понимаете", "Ну, то, что там, вот."), a list stitched with commas ("Он смотрит телевизор, футбол."), or run-on speech with no structure;
- does not make sense on its own: it leans on missing context so heavily that it means nothing;
- ungrammatical, garbled, misspelled, or clearly unnatural to a native speaker;
- the English is plainly wrong — it says something the Russian does not. Not a slightly loose or alternative translation; only one that would teach the learner a wrong meaning;
- sexual, crude or gratuitously violent;
- archaic or so specialised that it teaches nothing useful.

KEEP everything else. In particular KEEP:
- short phrases that show how a word is used — collocations like «новый дом», «в январе», «с работы», «мягкий свет», «два раза». These are dictionary examples, not sentences, and they are good;
- short natural utterances ("Да, конечно.", "Где ты?"), questions, exclamations;
- colloquial but correct speech, mild everyday interjections («блин»);
- plain simple sentences. Simple is good.
When in doubt, KEEP.

Answer with JSON only: {"drop":[{"id":12,"why":"fragment: a list, not a sentence"}]} listing only the sentences to drop, each with a reason of at most ten words. An empty list is a fine answer.`;

const has = (n) => process.argv.includes(n);

function apiKey() {
  const vars = fs.readFileSync(path.join(ROOT, "backend", ".dev.vars"), "utf8");
  const m = vars.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) { console.error("no ANTHROPIC_API_KEY in backend/.dev.vars"); process.exit(2); }
  return m[1].trim();
}

async function ask(content) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM,
                             messages: [{ role: "user", content }] }),
    });
    const j = await res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    // A spent balance or a bad key does not get better by asking again.
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
    const text = j.content.map((c) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    let drop = null;
    try { drop = m ? JSON.parse(m[0]).drop : null; } catch { drop = null; }
    if (Array.isArray(drop)) return { drop, usage: j.usage || {} };
  }
  throw new Error("no usable answer after three attempts");
}

/* The sentences, with their English, keyed as the build and the app key them. */
export function sentencesToReview(payload) {
  const out = new Map();
  const en = new Map(((payload.speech && payload.speech.rows) || []).map((r) => [fold(r[0]), r[1]]));
  for (const r of payload.sent || []) if (r && r[0] && !en.has(fold(r[0]))) en.set(fold(r[0]), r[1]);
  for (const s of sentencesToBuy(payload, null).concat(examplesToBuy(payload))) {
    if (out.has(s.key) || !/\s/.test(s.text.trim())) continue;   // a pair of forms, not a sentence
    out.set(s.key, { key: s.key, ru: s.text, en: en.get(s.key) || "" });
  }
  // Wiktionary's sense examples carry their own English.
  for (const list of Object.values(payload.senses || {})) for (const s of list) for (const x of s.x || []) {
    const k = fold(x.ru);
    if (out.has(k) && !out.get(k).en) out.get(k).en = x.en || "";
  }
  return [...out.values()];
}

async function main() {
  const payload = loadPayload(ROOT);
  const file = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const reviewed = file.reviewed || {};
  const all = sentencesToReview(payload);
  const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
  /* The examples on the grammar cards and in the reference are written for
     the course (data/curated/grammar_notes.json, core/grammar.js) and read by
     a person; they are not the model's to drop. */
  const authored = new Set((payload.units || []).flatMap((u) => ((u.g && u.g.examples) || []).map((e) => fold(e[0])))
    .concat(TOPICS.flatMap((t) => t.sections.flatMap((s) => (s.examples || []).map((e) => fold(e[0]))))));
  for (const k of authored) if (reviewed[k]) reviewed[k] = "";
  // The videos' own lines first: spoken Russian cut into sentences is where
  // the fragments are («Он смотрит телевизор, футбол»).
  const video = new Set(((payload.speech && payload.speech.rows) || []).filter((r) => r[4] === "v").map((r) => fold(r[0])));
  /* `--recheck`: the dropped ones again, under the rules as they now stand
     (the first run dropped dictionary collocations — «в январе», «новый
     дом» — for not being sentences). */
  const recheck = has("--recheck");
  const todo = all.filter((s) => !authored.has(s.key) && (recheck ? !!reviewed[s.key] : !(s.key in reviewed)))
    .sort((a, b) => (video.has(b.key) ? 1 : 0) - (video.has(a.key) ? 1 : 0)).slice(0, limit);
  const chars = todo.reduce((n, s) => n + s.ru.length + s.en.length + 8, 0);
  const estimate = (chars / 3 + (todo.length / BATCH) * 600) / 1e6 * PRICE.in + (todo.length * 4) / 1e6 * PRICE.out;
  console.log(`${all.length} sentences a learner can meet; ${todo.length} not yet reviewed, about $${estimate.toFixed(2)}`);
  if (has("--dry-run") || !todo.length) return;

  let spent = 0, dropped = 0;
  const save = () => fs.writeFileSync(OUT, JSON.stringify({
    _: "tools/review_sentences.mjs: every sentence a learner can meet, read by a model for whether it is worth learning from. Keyed by the folded sentence; \"\" is kept, anything else is the reason it is dropped. build_site.py leaves out every dropped sentence. Correct a verdict by hand: set it to \"\" to keep, or write a reason to drop.",
    model: MODEL, reviewed,
  }, null, 1) + "\n");
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const content = batch.map((s, k) => `${k} | ${bare(s.ru)} | ${s.en}`).join("\n");
    const { drop, usage } = await ask(content);
    spent += ((usage.input_tokens || 0) * PRICE.in + (usage.output_tokens || 0) * PRICE.out) / 1e6;
    const why = new Map(drop.filter((d) => Number.isInteger(d.id) && batch[d.id]).map((d) => [d.id, String(d.why || "dropped").slice(0, 120)]));
    batch.forEach((s, k) => { reviewed[s.key] = why.get(k) || ""; });
    dropped += why.size;
    save();
    process.stdout.write(`\r${Math.min(i + BATCH, todo.length)} of ${todo.length} · ${dropped} dropped · $${spent.toFixed(2)}`);
  }
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
