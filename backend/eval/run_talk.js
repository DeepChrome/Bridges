/* Scores the conversation prompt on eval/talk_cases.json (ROADMAP P6.2).
 *
 * Against the API directly, like run.js. For every case: does the reply pass the
 * validator first time, stay within two sentences with a question, keep to the
 * studied vocabulary (measured through the app's own index, so "studied" means
 * resolvable in the curriculum), and, where a case expects one, name the error.
 *
 *   node eval/run_talk.js [--model claude-sonnet-5]
 *
 * Needs ANTHROPIC_API_KEY. Writes eval/talk-report-<model>.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_TALK, talkMessage, validateTalk } from "../src/talk.js";
import { extractJson } from "../src/schema.js";
import { RETRY_NUDGE } from "../src/prompt.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const argv = process.argv.slice(2);
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : "claude-haiku-4-5-20251001";
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

const cases = JSON.parse(readFileSync(join(HERE, "talk_cases.json"), "utf8"));
const DATA = JSON.parse(readFileSync(join(ROOT, "native/assets/data.json"), "utf8"));
const IX = DATA.index, L = DATA.lemmas;
// "Studied": the first three chapters' spine and branch words — a learner a few
// weeks in — as the dictionary forms the prompt is given.
const stages = [];
DATA.path.forEach((p) => { if (p.c === 0 || !stages.length) stages.push([DATA.units[p.u]]); else stages[stages.length - 1].push(DATA.units[p.u]); });
const studiedIdx = new Set(stages.slice(0, 3).flat().flatMap((u) => u.w));
const studied = [...studiedIdx].map((i) => L[i].b);
const fold = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е").trim();

async function ask(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1000, system: SYSTEM_TALK, messages }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`upstream ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { text: body.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
           usage: body.usage || {}, stop: body.stop_reason };
}

const rows = [];
let firstTry = 0, valid = 0, tokIn = 0, tokOut = 0, tagHits = 0, tagTotal = 0, okHits = 0, okTotal = 0;
let vocabIn = 0, vocabAll = 0;
for (const c of cases) {
  const messages = [{ role: "user", content: talkMessage({ ...c, studied }) }];
  let value = null, attempts = 0, errors = null;
  for (let a = 0; a < 2 && !value; a++) {
    const { text, usage, stop } = await ask(messages);
    attempts++; tokIn += usage.input_tokens || 0; tokOut += usage.output_tokens || 0;
    const parsed = extractJson(text);
    const v = stop === "max_tokens" ? { ok: false, errors: ["cut off at the token limit"] }
      : parsed ? validateTalk(parsed, studied) : { ok: false, errors: ["no JSON"] };
    if (v.ok) value = v.value; else { errors = v.errors; messages.push({ role: "assistant", content: text }, { role: "user", content: RETRY_NUDGE + " Problems: " + v.errors.slice(0, 4).join("; ") }); }
  }
  let verdict = "PARSE-FAIL";
  if (value) {
    valid++; if (attempts === 1) firstTry++;
    // Vocabulary discipline: how many reply lemmas resolve to studied words.
    const lem = value.reply_tokens.map((t) => fold(t.lemma));
    const inStudied = lem.filter((l) => (IX[l] || []).some((i) => studiedIdx.has(i))).length;
    vocabIn += inStudied; vocabAll += lem.length;
    if (c.expect && c.expect.tag) {
      tagTotal++;
      const tags = new Set(((value.feedback || {}).grammar || []).map((g) => g.tag)
        .concat(((value.feedback || {}).words || []).flatMap((w) => w.tags || [])));
      if (tags.has(c.expect.tag)) { tagHits++; verdict = "hit"; } else verdict = `miss (${[...tags].join(",") || "none"})`;
    } else if (c.expect && c.expect.overall === "ok") {
      okTotal++;
      const ok = value.feedback && value.feedback.overall === "ok";
      if (ok) okHits++;
      verdict = ok ? "ok" : `FALSE-POSITIVE (${value.feedback && value.feedback.overall})`;
    } else verdict = "open";
    verdict += ` · vocab ${inStudied}/${lem.length} · new ${value.newWords.length}`;
  }
  console.log(`${c.id.padEnd(14)} ${verdict.padEnd(44)} ${value ? value.reply_ru : (errors || []).join("; ")}`);
  rows.push({ id: c.id, attempts, verdict, reply: value, errors });
}

const summary = {
  model, cases: cases.length, valid, validFirstTry: firstTry,
  tagAccuracy: tagTotal ? +(tagHits / tagTotal).toFixed(2) : null, tagHits, tagTotal,
  correctTurnsAccepted: okTotal ? +(okHits / okTotal).toFixed(2) : null,
  vocabularyInStudied: vocabAll ? +(vocabIn / vocabAll).toFixed(2) : null,
  tokens: { in: tokIn, out: tokOut }, perTurn: { in: Math.round(tokIn / cases.length), out: Math.round(tokOut / cases.length) },
  estCostUsd: +((tokIn * 1 + tokOut * 5) / 1e6).toFixed(4),
  estSessionUsd: +(((tokIn * 1 + tokOut * 5) / 1e6) / cases.length * 12).toFixed(4),
};
console.log("\n" + JSON.stringify(summary, null, 1));
writeFileSync(join(HERE, `talk-report-${model}.json`), JSON.stringify({ summary, rows }, null, 1));
