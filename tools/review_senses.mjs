#!/usr/bin/env node
/* Every taught word's definitions, read against a dictionary's sense of what
 * the word mostly means — and against the sentences the entry shows (the
 * owner, 2026-10-04, on «выпуск»: *"all the sentences indicate it's related to
 * the news in some capacity yet none of the 4 definitions mention the news…
 * make sure we use dictionary definitions and prioritize the most common
 * uses"*).
 *
 * The senses are Wiktionary's (§30q), and Wiktionary is uneven: its «выпуск»
 * has "issue, output", "emission", "graduates" and no "edition, episode,
 * bulletin" at all — the use every one of the word's sentences, and the goal
 * video («в этом выпуске»), is about. Nothing in the build can see that; a
 * reader can. So a model reads each taught word in batches — the headword,
 * the senses as shipped, the entry's sentences — and proposes only the
 * corrections `sense_overrides.json` already knows how to make: `lead` (the
 * commonest meaning, missing, put on top), `first` (an existing sense moved
 * up), `drop` (a sense that is wrong for this word), `rename`.
 *
 * Proposals go to data/_work/sense_proposals.json, never straight into the
 * curated file: a person reads them and merges what is right (rule 20.3).
 * Every string a proposal names is checked against the shipped senses here,
 * so a merge cannot stop the build.
 *
 *   node tools/review_senses.mjs --dry-run
 *   node tools/review_senses.mjs [--limit N]
 *
 * Reads the built payload. The Anthropic key is read from backend/.dev.vars
 * and never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { bare } from "../core/util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "_work", "sense_proposals.json");
const MODEL = "claude-sonnet-5-5";
const BATCH = 20;
const PRICE = { in: 3, out: 15 };

const SYSTEM = `You are a lexicographer checking the definitions in a Russian course for English speakers. For each Russian word you get its part of speech, the numbered senses shown on its dictionary entry (taken from Wiktionary), and the example sentences shown under it.

Judge the senses against what a standard bilingual dictionary (Oxford Russian Dictionary, Multitran, a good learner's dictionary) gives, and against modern everyday usage:
1. The FIRST sense must be the word's most common modern meaning — the one a learner meets most.
2. A common meaning must not be missing. If the example sentences use a meaning no sense covers, that meaning is almost certainly common and missing.
3. A sense that does not belong to this word (another word's meaning, a homograph's), or is wrong, should be dropped. Rare, dated or technical senses are fine where they are — do not drop them for being rare.

Most entries are fine. Propose a change only when a learner would be misled. Use only these operations:
- "lead": a new sense to put on top, when the commonest meaning is missing. Write it as a dictionary gloss: concise English, two to five comma-separated equivalents, a parenthetical note only if needed ("edition, episode, bulletin (of a publication or programme)"). For a verb begin with "to". Never Russian.
- "first": an exact substring of an existing sense, to move that sense to the top, when the commonest meaning is present but not first.
- "drop": exact substrings of senses that do not belong to this word.
- "rename": {"exact substring of an existing sense": "corrected gloss"}, when a sense is right in idea but garbled.

Answer with JSON only: {"fix":[{"id":3,"lead":"...","why":"at most fifteen words"}]}. Omit words that are fine. An empty list is a fine answer.`;

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
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM,
                             messages: [{ role: "user", content }] }),
    });
    const j = await res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
    const text = j.content.map((c) => c.text || "").join("");
    /* The model sometimes answers, corrects itself, and answers again; the
       last answer is the one it stands by. */
    let fix = null;
    const starts = [...text.matchAll(/\{\s*"fix"/g)].map((x) => x.index).reverse();
    for (const s of starts) {
      const tail = text.slice(s);
      for (let e = tail.lastIndexOf("}"); e > 0 && fix === null; e = tail.lastIndexOf("}", e - 1)) {
        try { fix = JSON.parse(tail.slice(0, e + 1)).fix; } catch { /* a shorter span */ }
      }
      if (Array.isArray(fix)) break;
      fix = null;
    }
    if (!Array.isArray(fix) && attempt === 3) console.error(`\nunparsed: ${text.slice(0, 300)}`);
    if (Array.isArray(fix)) return { fix, usage: j.usage || {} };
  }
  throw new Error("no usable answer after three attempts");
}

/* The taught words, with what their entry shows. */
export function wordsToReview(payload) {
  const L = payload.lemmas || [];
  const out = [];
  L.forEach((l, i) => {
    if (!l || !l.u) return;                       // taught words only
    const senses = (payload.senses || {})[String(i)];
    if (!senses || !senses.length) return;        // nothing from Wiktionary to correct
    const refs = String(l.refs || "").split(",").filter(Boolean).map(Number);
    const examples = refs.map((r) => (payload.sent || [])[r]).filter(Boolean).slice(0, 4)
      .map((r) => ({ ru: bare(r[0]), en: r[1] }));
    for (const s of senses) for (const x of s.x || []) if (examples.length < 6) examples.push({ ru: bare(x.ru), en: x.en });
    out.push({ i, key: `${l.b}|${l.p}`, b: l.b, p: l.p, senses: senses.map((s) => s.g), examples });
  });
  return out;
}

/* A proposal the build would refuse is no proposal: every string it names
   must be found in the senses as shipped (build_site.py apply_sense_override). */
function valid(fix, senses) {
  const low = (s) => String(s || "").toLowerCase();
  const found = (d) => senses.some((g) => low(g).includes(low(d)));
  const out = { why: String(fix.why || "").slice(0, 160) };
  if (typeof fix.lead === "string" && fix.lead.trim() && !/[А-Яа-яЁё]/.test(fix.lead)) out.lead = fix.lead.trim();
  if (typeof fix.first === "string" && found(fix.first)) out.first = fix.first;
  const drop = (Array.isArray(fix.drop) ? fix.drop : []).filter((d) => typeof d === "string" && found(d));
  if (drop.length) out.drop = drop;
  const rename = Object.fromEntries(Object.entries(fix.rename || {}).filter(([k, v]) => found(k) && typeof v === "string" && !/[А-Яа-яЁё]/.test(v)));
  if (Object.keys(rename).length) out.rename = rename;
  return out.lead || out.first || out.drop || out.rename ? out : null;
}

async function main() {
  const payload = loadPayload(ROOT);
  const all = wordsToReview(payload);
  const limit = has("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
  /* `--retry`: only the words a failed batch left unread, added to the
     proposals already written. */
  const FAILED = OUT.replace(/\.json$/, ".unread.json");
  const retry = has("--retry") && fs.existsSync(FAILED) ? new Set(JSON.parse(fs.readFileSync(FAILED, "utf8"))) : null;
  const todo = (retry ? all.filter((w) => retry.has(w.key)) : all).slice(0, limit);
  const chars = todo.reduce((n, w) => n + JSON.stringify(w).length, 0);
  const estimate = (chars / 3 + (todo.length / BATCH) * 900) / 1e6 * PRICE.in + (todo.length * 20) / 1e6 * PRICE.out;
  console.log(`${all.length} taught words with senses; ${todo.length} to read, about $${estimate.toFixed(2)}`);
  if (has("--dry-run") || !todo.length) return;

  const proposals = retry && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  let spent = 0;
  const failed = [];
  for (let k = 0; k < todo.length; k += BATCH) {
    const batch = todo.slice(k, k + BATCH);
    const content = batch.map((w, id) => [
      `${id}. ${w.b} (${w.p})`,
      ...w.senses.map((g, n) => `   sense ${n + 1}: ${g}`),
      ...w.examples.map((x) => `   example: ${x.ru} = ${x.en}`),
    ].join("\n")).join("\n\n");
    let answer;
    try {
      answer = await ask(content);
    } catch (e) {
      // Said, and the batch listed as unread, rather than the whole run lost.
      console.error(`\nbatch at ${k} failed: ${String(e.message || e).slice(0, 200)}`);
      failed.push(...batch.map((w) => w.key));
      continue;
    }
    const { fix, usage } = answer;
    spent += ((usage.input_tokens || 0) * PRICE.in + (usage.output_tokens || 0) * PRICE.out) / 1e6;
    for (const f of fix) {
      const w = Number.isInteger(f.id) && batch[f.id];
      if (!w) continue;
      const v = valid(f, w.senses);
      if (v) proposals[w.key] = { ...v, senses: w.senses };
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(proposals, null, 1) + "\n");
    process.stdout.write(`\r${Math.min(k + BATCH, todo.length)} of ${todo.length} · ${Object.keys(proposals).length} proposals · $${spent.toFixed(2)}`);
  }
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
  fs.writeFileSync(FAILED, JSON.stringify(failed) + "\n");
  if (failed.length) console.log(`${failed.length} words not read (failed batches): ${failed.slice(0, 20).join(", ")}…`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
