/* Scores the feedback prompt against eval/cases.json (ROADMAP P4.6).
 *
 * Talks to the Anthropic API directly with the same prompt and validator the
 * Worker uses, so it can run before the Worker is deployed and does not spend the
 * Worker's daily cap. Needs ANTHROPIC_API_KEY in the environment.
 *
 *   node eval/run.js                     # Haiku 4.5, the Worker's model
 *   node eval/run.js --model claude-sonnet-5
 *
 * Pass bar (roadmap): primary-tag accuracy ≥ 80% on the 25 error cases, and at
 * most 1 of the 5 correct sentences flagged. Writes eval/report-<model>.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM, userMessage, RETRY_NUDGE } from "../src/prompt.js";
import { validate, extractJson } from "../src/schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : "claude-haiku-4-5-20251001";
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));

async function ask(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`upstream ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { text: body.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
           usage: body.usage || {} };
}

async function feedback(c) {
  const messages = [{ role: "user", content: userMessage(c) }];
  let tokens = { in: 0, out: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage } = await ask(messages);
    tokens.in += usage.input_tokens || 0; tokens.out += usage.output_tokens || 0;
    const parsed = extractJson(text);
    const v = parsed ? validate(parsed) : { ok: false, errors: ["no JSON"] };
    if (v.ok) return { value: v.value, tokens, attempts: attempt + 1 };
    messages.push({ role: "assistant", content: text }, { role: "user", content: RETRY_NUDGE });
  }
  return { value: null, tokens, attempts: 2 };
}

const rows = [];
let tagHits = 0, tagTotal = 0, falsePos = 0, okTotal = 0, tokIn = 0, tokOut = 0, parseFail = 0;
for (const c of cases) {
  const { value, tokens, attempts } = await feedback(c);
  tokIn += tokens.in; tokOut += tokens.out;
  const primary = value && value.grammar.length ? value.grammar[0].tag : null;
  const anyTag = value ? new Set(value.grammar.map((g) => g.tag)
    .concat(value.words.flatMap((w) => w.tags))) : new Set();
  let verdict;
  if (!value) { verdict = "PARSE-FAIL"; parseFail++; }
  else if (c.tag === null) {
    okTotal++;
    const flagged = value.overall !== "ok" || value.grammar.length > 0;
    if (flagged) falsePos++;
    verdict = flagged ? "FALSE-POSITIVE" : "ok";
  } else {
    tagTotal++;
    const hit = primary === c.tag;
    if (hit) tagHits++;
    verdict = hit ? "hit" : anyTag.has(c.tag) ? `secondary (primary ${primary})` : `miss (${primary || "none"})`;
  }
  console.log(`${c.id.padEnd(9)} ${verdict.padEnd(28)} overall=${value ? value.overall : "-"} ` +
              `${value && value.grammar[0] ? value.grammar[0].note : ""}`);
  rows.push({ id: c.id, expected: c.tag, primary, overall: value && value.overall, verdict,
              attempts, reply: value });
}

const acc = tagTotal ? tagHits / tagTotal : 0;
const summary = {
  model, cases: cases.length, primaryTagAccuracy: +acc.toFixed(3), tagHits, tagTotal,
  falsePositives: falsePos, correctSentences: okTotal, parseFailures: parseFail,
  tokens: { in: tokIn, out: tokOut },
  // Haiku 4.5 list price at time of writing: $1 / M input, $5 / M output.
  estCostUsd: +((tokIn * 1 + tokOut * 5) / 1e6).toFixed(4),
  pass: acc >= 0.8 && falsePos <= 1,
};
console.log("\n" + JSON.stringify(summary, null, 1));
writeFileSync(join(HERE, `report-${model}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(summary.pass ? "\nPASS" : "\nFAIL");
process.exit(summary.pass ? 0 : 1);
