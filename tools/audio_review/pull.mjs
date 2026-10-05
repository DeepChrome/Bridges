#!/usr/bin/env node
/* The reviewers' verdicts, brought home (tools/audio_review): every verdict
 * from the review site, by recording, into data/curated/audio_review.json —
 * the decision file the purchase tools read to know what to buy again
 * (build_word_audio.mjs and build_form_audio.mjs `--rebuy-flagged`).
 *
 * A verdict belongs to the clip it was given on (`id`). When a recording is
 * bought again its id changes, and the verdicts on the old one stay in the
 * file as history while the new one waits for a listen.
 *
 *   node tools/audio_review/pull.mjs            write the file, print a summary
 *   node tools/audio_review/pull.mjs --flagged  also list what is flagged now
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "data", "curated", "audio_review.json");
const SITE = "https://bridges-audio-review.bridges-feedback.workers.dev";

const res = await fetch(`${SITE}/api/reviews`);
if (!res.ok) { console.error(`the review site answered ${res.status}`); process.exit(1); }
const { reviewers } = await res.json();

const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const items = {};
for (const [who, list] of Object.entries(reviewers || {})) {
  for (const v of Object.values(list)) {
    const it = items[v.key] || (items[v.key] = { verdicts: [] });
    it.verdicts.push({ who, id: v.id, verdict: v.verdict, reasons: v.reasons || [], note: v.note || "", at: v.at });
  }
}
for (const it of Object.values(items)) it.verdicts.sort((a, b) => a.at - b.at);
// What was bought again because of a flag is kept from the file, not the site.
for (const [k, v] of Object.entries(prior.items || {})) {
  if (v.rebought) (items[k] || (items[k] = { verdicts: [] })).rebought = v.rebought;
}
fs.writeFileSync(OUT, JSON.stringify({
  _: "tools/audio_review/pull.mjs: the review site's verdicts by recording key (word:/form:/sentence:/ending:). A verdict names the clip id it was given on. `rebought` lists the clips bought again after a flag (build_word_audio.mjs / build_form_audio.mjs --rebuy-flagged).",
  pulled: new Date().toISOString(),
  items,
}, null, 1) + "\n");

const all = Object.values(items).flatMap((it) => it.verdicts);
const flagged = Object.entries(items).filter(([, it]) => {
  const last = it.verdicts[it.verdicts.length - 1];
  return last && last.verdict === "flag";
});
console.log(`${Object.keys(reviewers || {}).length} reviewer(s), ${all.length} verdicts on ${Object.keys(items).length} recordings; `
            + `${flagged.length} flagged -> ${path.relative(ROOT, OUT)}`);
if (process.argv.includes("--flagged")) {
  for (const [k, it] of flagged) {
    const last = it.verdicts[it.verdicts.length - 1];
    console.log(`  ${k}  ${last.who}: ${[...last.reasons, last.note].filter(Boolean).join(" — ")}`);
  }
}
