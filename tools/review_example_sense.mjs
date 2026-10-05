#!/usr/bin/env node
/* Does each example sentence use its word in the meaning the word is taught
 * in? (the owner, 2026-10-05: «вилка» is taught as "fork", and its gap-fill
 * was «Если вилка запачкается…» — the plug of an appliance.)
 *
 * A word's examples are found by its forms, and a form says nothing about
 * meaning: «вилка» the fork and «вилка» the plug are one spelling. Matching
 * the English against the gloss was measured first and cannot do it — "mum"
 * for «мама», "TV" for «телевизор», "audience" for «зритель» all read as off
 * sense — so a model reads each taught word beside its examples and names the
 * ones that use it in another meaning. The verdicts go to
 * `data/curated/example_sense.json`, keyed "fold(word)|fold(sentence)", a
 * decision file a person may correct (rule 20.3); `build_site.py` leaves a
 * sentence marked there out of that word's examples and nowhere else.
 *
 * A pair already checked is not sent again. Dropping an example lets the next
 * candidate in, so run it again after the rebuild until it has nothing new.
 *
 *   node tools/review_example_sense.mjs --dry-run
 *   node tools/review_example_sense.mjs
 *
 * Reads the built payload, so run it after build_site and rebuild after it.
 * The Anthropic key is read from backend/.dev.vars and never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { fold, bare } from "../core/util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "curated", "example_sense.json");
const MODEL = "claude-sonnet-5-5";
const WORDS_PER_CALL = 20;
const PRICE = { in: 3, out: 15 };   // $ per million tokens

const SYSTEM = `You check example sentences in a Russian course for English speakers. Each item is a Russian word, every meaning the word's card lists, and a few example sentences that contain the word (in some form) with their English.

Mark a sentence OFF only when the word in it is used in a meaning that NONE of the listed meanings covers, so a learner reading the card could not understand the sentence from it. Examples: «вилка» listed as "fork, bracket", in «Если вилка запачкается, протрите её» where it is an electric plug — OFF. «надежда» listed as "hope", in a sentence where Надежда is a woman's name — OFF.

Do NOT mark:
- a sentence using any of the listed meanings, even one that is not the first (listed "count; consider" and the sentence means consider — keep);
- a figurative or idiomatic use built on a listed meaning;
- a sentence whose English translates the word loosely or with a synonym ("mum" for «мама»);
- the word in another grammatical form.
When in doubt, do not mark.

Answer with JSON only: {"off":[{"w":3,"s":1,"why":"plug, not a fork"}]} — w is the word's number, s the sentence's number, why at most eight words. An empty list is a fine answer.`;

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
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM,
                             messages: [{ role: "user", content }] }),
    });
    const j = await res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    // A spent balance or a bad key does not get better by asking again.
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
    const text = j.content.map((c) => c.text || "").join("");
    // The last JSON object: a reply that corrects itself answers twice.
    const all = text.match(/\{[^{}]*"off"[\s\S]*?\]\s*\}/g);
    let off = null;
    try { off = all ? JSON.parse(all[all.length - 1]).off : null; } catch { off = null; }
    if (Array.isArray(off)) return { off, usage: j.usage || {} };
  }
  throw new Error("no usable answer after three attempts");
}

/* Every taught word with the examples a learner sees under it (its pool refs). */
export function wordsToCheck(payload) {
  const pool = payload.sent || [];
  const taught = new Set((payload.units || []).flatMap((u) => u.w || []));
  const out = [];
  for (const i of taught) {
    const w = payload.lemmas[i];
    if (!w || !w.refs) continue;
    const xs = String(w.refs).split(",").filter(Boolean).map((r) => pool[Number(r)]).filter(Boolean)
      .map((row) => ({ ru: row[0], en: row[1] || "", key: `${fold(w.b)}|${fold(row[0])}` }));
    // Every meaning the card lists: the gloss and the Wiktionary senses.
    const senses = ((payload.senses || {})[String(i)] || []).map((s) => s.g).filter(Boolean);
    const meanings = [...new Set([w.e || "", ...senses].join("; ").split(/\s*;\s*/).filter(Boolean))].join("; ");
    if (xs.length) out.push({ b: w.b, p: w.p, e: meanings, xs });
  }
  return out;
}

async function main() {
  const payload = loadPayload(ROOT);
  const file = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const checked = file.checked || {};
  const words = wordsToCheck(payload)
    .map((w) => ({ ...w, xs: w.xs.filter((x) => !(x.key in checked)) }))
    .filter((w) => w.xs.length);
  const pairs = words.reduce((n, w) => n + w.xs.length, 0);
  const chars = words.reduce((n, w) => n + w.e.length + w.xs.reduce((m, x) => m + x.ru.length + x.en.length + 8, 0), 0);
  const estimate = (chars / 3 + (words.length / WORDS_PER_CALL) * 500) / 1e6 * PRICE.in + (pairs * 3) / 1e6 * PRICE.out;
  console.log(`${words.length} taught words with unchecked examples, ${pairs} sentences, about $${estimate.toFixed(2)}`);
  if (has("--dry-run") || !words.length) return;

  let spent = 0, marked = 0;
  const save = () => fs.writeFileSync(OUT, JSON.stringify({
    _: "tools/review_example_sense.mjs: whether each example sentence uses its word in the meaning the word is taught in. Keyed \"fold(word)|fold(sentence)\"; \"\" is in sense, anything else is why it is not. build_site.py leaves a marked sentence out of that word's examples only. Correct a verdict by hand: \"\" to keep, or a reason to drop.",
    model: MODEL, checked,
  }, null, 1) + "\n");
  for (let i = 0; i < words.length; i += WORDS_PER_CALL) {
    const batch = words.slice(i, i + WORDS_PER_CALL);
    const content = batch.map((w, n) =>
      `${n}. «${w.b}» (${w.p || "word"}) — listed meanings: ${w.e}\n`
      + w.xs.map((x, s) => `   ${s} | ${bare(x.ru)} | ${x.en}`).join("\n")).join("\n");
    const { off, usage } = await ask(content);
    spent += ((usage.input_tokens || 0) * PRICE.in + (usage.output_tokens || 0) * PRICE.out) / 1e6;
    const why = new Map();
    for (const o of off) {
      const w = batch[o.w];
      const x = w && Number.isInteger(o.s) ? w.xs[o.s] : null;
      if (x) why.set(x.key, String(o.why || "another meaning").slice(0, 100));
    }
    for (const w of batch) for (const x of w.xs) checked[x.key] = why.get(x.key) || "";
    marked += why.size;
    save();
    process.stdout.write(`\r${Math.min(i + WORDS_PER_CALL, words.length)} of ${words.length} words · ${marked} off sense · $${spent.toFixed(2)}`);
  }
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
