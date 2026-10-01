/* A model reads the Russian before a person does (PLAYBOOK 3.2, ROADMAP 13.30).
 *
 *   node tools/review_prepass.mjs                      review/content_v1.csv in place
 *   node tools/review_prepass.mjs --in A.csv --out B.csv
 *   node tools/review_prepass.mjs --limit 50           a trial on the first rows
 *
 * The native-speaker read is the gate (§30x) and this does not replace it.
 * What it buys is the reader's time: every Russian row, with its English and
 * where it is shown, goes to the model in batches, and anything it would
 * change comes back as a suggestion in the `flags` column — "AI: <fix> —
 * <why>". **It never writes `fix`.** That column is the reviewer's verdict and
 * the only thing import_review applies; a model's guess sitting there would be
 * applied the moment nobody looked.
 *
 * What the model is told matters as much as what it is asked: these lines are
 * deliberately simple, written inside a beginner's vocabulary (§30l), so
 * "this could be more natural" about every short line is noise. It is asked
 * for errors and for phrasing a Russian would not say, not for richer prose.
 *
 * Reads the Anthropic key from backend/.dev.vars, never printed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./import_review.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const IN = arg("--in", join(ROOT, "review", "content_v1.csv"));
const OUT = arg("--out", IN);
const LIMIT = Number(arg("--limit", 0)) || Infinity;
const MODEL = "claude-sonnet-5-5";
const BATCH = 20;
const WHY_WORDS = 15;

const SYSTEM = `You are a native Russian editor checking lines written for a Russian course for English speakers. Each line is shown to a learner, and most are read aloud by a voice.

The lines are deliberately simple: they are written inside the small vocabulary a beginner has learned so far. Do NOT flag a line for being simple, short, plain or repetitive, and do not offer richer alternatives. Flag only:
- a grammatical error (case, agreement, aspect, verb form, word order that is wrong rather than merely plain)
- phrasing a native speaker would not say, or would find odd or unnatural
- a wrong stress mark (an acute accent on the wrong vowel), or е written where ё is required
- an English translation that says something different from the Russian
- a Russian word used in the wrong sense

For each row answer either {"id": ..., "ok": true} or {"id": ..., "ok": false, "ru": "<corrected Russian, or empty if the Russian is right>", "en": "<corrected English, or empty if the English is right>", "why": "<in English, at most ${WHY_WORDS} words>"}. Keep stress marks in corrected Russian where the original had them. When unsure, say ok: a false alarm costs the reviewer more than a miss you are unsure of.

Answer with JSON only: {"rows": [ ... ]}, one entry per row given, same ids.`;

function apiKey() {
  const vars = readFileSync(join(ROOT, "backend", ".dev.vars"), "utf8");
  const m = vars.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) { console.error("no ANTHROPIC_API_KEY in backend/.dev.vars"); process.exit(2); }
  return m[1].trim();
}

async function ask(messages) {
  for (let tries = 1; ; tries++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages }),
    });
    const text = await res.text();
    if ((res.status >= 500 || res.status === 429) && tries < 4) {
      await new Promise((r) => setTimeout(r, 5000 * tries));
      continue;
    }
    let j;
    try { j = JSON.parse(text); } catch { throw new Error(`${res.status} ${text.slice(0, 200)}`); }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
    return { text: j.content.map((c) => c.text || "").join(""), usage: j.usage || {} };
  }
}

/* What came back, or why it is not usable: every id answered once, nothing
   invented, a correction that changes something, a reason within the cap. */
export function checkAnswer(rows, batch) {
  const want = new Set(batch.map((r) => r.id));
  const seen = new Set(), errs = [];
  for (const a of rows || []) {
    if (!a || !want.has(a.id)) { errs.push(`unknown id ${a && a.id}`); continue; }
    if (seen.has(a.id)) errs.push(`${a.id} answered twice`);
    seen.add(a.id);
    if (a.ok === false) {
      if (!a.ru && !a.en) errs.push(`${a.id}: flagged with no correction`);
      if (a.why && String(a.why).split(/\s+/).length > WHY_WORDS + 3) errs.push(`${a.id}: reason too long`);
    }
  }
  for (const id of want) if (!seen.has(id)) errs.push(`${id} not answered`);
  return errs;
}

export const flagFor = (a, row) => {
  const parts = [];
  if (a.ru && a.ru !== row.ru) parts.push(a.ru);
  if (a.en && a.en !== row.en) parts.push(`EN: ${a.en}`);
  if (!parts.length) return "";
  return `AI: ${parts.join(" / ")}${a.why ? ` — ${a.why}` : ""}`;
};

const cell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

async function main() {
  const text = readFileSync(IN, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) { console.error(`nothing in ${IN}`); process.exit(2); }
  const cols = Object.keys(rows[0]);
  const todo = rows.filter((r) => r.needs === "ru" && /[а-яё]/i.test(r.ru)).slice(0, LIMIT);
  console.log(`${todo.length} Russian rows to read with ${MODEL}`);

  let flagged = 0, failed = 0, tokensIn = 0, tokensOut = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const list = batch.map((r) => JSON.stringify({ id: r.id, ru: r.ru, en: r.en, shown: r.context })).join("\n");
    const messages = [{ role: "user", content: `Rows:\n${list}` }];
    let answer = null;
    for (let attempt = 1; attempt <= 2 && !answer; attempt++) {
      try {
        const { text: reply, usage } = await ask(messages);
        tokensIn += usage.input_tokens || 0; tokensOut += usage.output_tokens || 0;
        const m = reply.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]).rows : null;
        const errs = parsed ? checkAnswer(parsed, batch) : ["no JSON"];
        if (!errs.length) { answer = parsed; break; }
        messages.push({ role: "assistant", content: reply },
                      { role: "user", content: `Fix these and answer with the whole JSON again:\n- ${errs.join("\n- ")}` });
      } catch (e) {
        console.log(`  rows ${i}–${i + batch.length}: ${e.message}`);
        break;
      }
    }
    if (!answer) { failed += batch.length; continue; }
    const byId = new Map(answer.map((a) => [a.id, a]));
    for (const r of batch) {
      const a = byId.get(r.id);
      const f = a && a.ok === false ? flagFor(a, r) : "";
      // The speller's flags stay; the model's are added beside them.
      r.flags = [String(r.flags || "").replace(/(^|; )AI: .*$/, ""), f].filter(Boolean).join("; ");
      if (f) flagged++;
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, todo.length)}/${todo.length}, ${flagged} flagged`);
  }
  process.stdout.write("\n");

  const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(",")));
  // The BOM stays: this is opened in Excel (export_review.mjs says why).
  writeFileSync(OUT, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
  // Sonnet 5.5: $3 in, $15 out per million.
  const cost = (tokensIn * 3 + tokensOut * 15) / 1e6;
  console.log(`wrote ${OUT.replace(ROOT + "\\", "").replace(/\\/g, "/")}`);
  console.log(`  ${flagged} of ${todo.length} rows flagged` + (failed ? `, ${failed} not read (re-run to retry)` : "")
              + ` · about $${cost.toFixed(2)}`);
}

if (process.argv[1] && process.argv[1].endsWith("review_prepass.mjs")) await main();
