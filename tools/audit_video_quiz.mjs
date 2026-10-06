#!/usr/bin/env node
/* Are the video questions any good? (the owner, 2026-10-05: "make sure the
 * questions aren't shit… one time we used money to generate questions, they
 * were very poorly designed. Repetitive and no depth.")
 *
 *   node tools/audit_video_quiz.mjs            the measures, and the worst sets
 *   node tools/audit_video_quiz.mjs --sample 8 print eight sets whole, to read
 *
 * What it measures, per set of five and over all of them:
 *   - repeated openers: questions in one set starting with the same three words
 *   - templates: the commonest openers across every set
 *   - spread: how much of the video the five answers cover (all in one minute
 *     is a quiz on one moment, not on the video)
 *   - shallow: "what colour", "what is the name", "how many" — lookups rather
 *     than understanding — and how many sets are mostly that
 *   - word or grammar: how many sets carry one (Cyrillic in the question)
 * A measure is a pointer to what to read, not a verdict; --sample is the read. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "video_quiz.json"), "utf8")).videos;
const transcripts = JSON.parse(fs.readFileSync(path.join(ROOT, "native", "assets", "transcripts.json"), "utf8"));
const arg = (n) => { const k = process.argv.indexOf(n); return k > 0 ? process.argv[k + 1] : null; };

const opener = (q) => q.toLowerCase().replace(/[^a-z\s']/g, "").split(/\s+/).slice(0, 3).join(" ");
const SHALLOW = /\b(what colou?r|how many|what number|what is the name|what's the name|what time)\b/i;
const templates = {};
const rows = [];
for (const [id, v] of Object.entries(store)) {
  const qs = v.questions;
  const ops = qs.map((x) => opener(x.q));
  ops.forEach((o) => { templates[o] = (templates[o] || 0) + 1; });
  const repeated = ops.length - new Set(ops).size;
  const lines = transcripts[id] || [];
  const end = lines.length ? lines[Math.min(lines.length, 600) - 1][0] : 1;
  const ats = qs.map((x) => x.at).sort((a, b) => a - b);
  const spread = end ? (ats[ats.length - 1] - ats[0]) / end : 0;
  const shallow = qs.filter((x) => SHALLOW.test(x.q)).length;
  const lang = qs.filter((x) => /[а-яё]/i.test(x.q + x.options.join(" "))).length;
  rows.push({ id, repeated, spread, shallow, lang, qs });
}

const n = rows.length;
const pct = (k) => `${Math.round(100 * k / Math.max(1, n))}%`;
console.log(`${n} sets of five`);
console.log(`  a repeated opener inside a set : ${pct(rows.filter((r) => r.repeated >= 1).length)} (two or more: ${pct(rows.filter((r) => r.repeated >= 2).length)})`);
console.log(`  answers over under a third of the video: ${pct(rows.filter((r) => r.spread < 0.33).length)}`);
console.log(`  two or more lookups (colour, how many, name): ${pct(rows.filter((r) => r.shallow >= 2).length)}`);
console.log(`  at least one word or grammar question: ${pct(rows.filter((r) => r.lang >= 1).length)}`);
console.log("  commonest openers across all sets:");
for (const [o, k] of Object.entries(templates).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(k).padStart(4)}  ${o}…`);
}
const bad = rows.filter((r) => r.repeated >= 2 || r.spread < 0.2 || r.shallow >= 2);
console.log(`  flagged for a read: ${bad.length}`);
fs.writeFileSync(path.join(ROOT, "data", "_work", "video_quiz_flagged.txt"),
  bad.map((r) => r.id).join("\n") + "\n");

const sample = +(arg("--sample") || 0);
if (sample) {
  const pick = rows.slice().sort(() => Math.random() - 0.5).slice(0, sample);
  for (const r of pick) {
    console.log(`\n== ${r.id}  spread ${Math.round(r.spread * 100)}%`);
    for (const x of r.qs) console.log(`  ${Math.round(x.at / 1000)}s  ${x.q}\n        ${x.options.join("  |  ")}`);
  }
}
