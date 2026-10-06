#!/usr/bin/env node
/* What the Worker's model calls cost, day by day and route by route, read off
 * the `tokens:<day>:<route>` totals it keeps in KV (src/index.js logUsage;
 * kept fifteen days). The Anthropic console is the bill; this is the app's
 * share of it, so the two can be told apart from the build tools' spending.
 *
 *   node backend/tools/spend.mjs
 *
 * Needs CLOUDFLARE_API_TOKEN in the environment (never printed). */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Haiku 4.5, $ per million tokens (wrangler.toml MODEL).
const PRICE = { in: 1, out: 5 };
const wrangler = (...args) => {
  const r = spawnSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "USAGE", "--remote"],
                      { cwd: DIR, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  return r.stdout;
};

const keys = JSON.parse(wrangler("list", "--prefix", "tokens:")).map((k) => k.name).sort();
const byDay = {};
let total = 0;
for (const k of keys) {
  const [, day, route] = k.split(":");
  const t = JSON.parse(wrangler("get", JSON.stringify(k)));
  const cost = (t.in * PRICE.in + t.out * PRICE.out) / 1e6;
  total += cost;
  (byDay[day] = byDay[day] || []).push(`${route} ${t.n} calls $${cost.toFixed(2)}`);
}
for (const [day, rows] of Object.entries(byDay)) console.log(`${day}: ${rows.join(", ")}`);
console.log(`total over ${Object.keys(byDay).length} days kept: $${total.toFixed(2)}`);
