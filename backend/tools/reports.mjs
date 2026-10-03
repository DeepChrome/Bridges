#!/usr/bin/env node
/* What testers sent from Settings → Send feedback (POST /v1/report).
 *
 *   node backend/tools/reports.mjs           the newest twenty, newest first
 *   node backend/tools/reports.mjs --all     every one
 *
 * Reads the Worker's KV through wrangler, which needs CLOUDFLARE_API_TOKEN in
 * the environment (never printed, never written down). */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = (...args) => {
  const r = spawnSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "USAGE", "--remote"],
                      { cwd: DIR, encoding: "utf8", shell: true });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  return r.stdout;
};

const keys = JSON.parse(wrangler("list", "--prefix", "report:")).map((k) => k.name).sort().reverse();
const shown = process.argv.includes("--all") ? keys : keys.slice(0, 20);
console.log(`${keys.length} report(s)${shown.length < keys.length ? `, the newest ${shown.length}` : ""}\n`);
for (const k of shown) {
  const r = JSON.parse(wrangler("get", JSON.stringify(k)));
  const f = r.facts || {};
  console.log(`— ${r.at.replace("T", " ").slice(0, 16)} UTC · ${r.user} · ${f.version || "?"} · ` +
              `chapter ${f.chapter || "?"} lesson ${f.lesson || "?"} · ${f.device || ""}`);
  console.log(r.text.split("\n").map((l) => `  ${l}`).join("\n"));
  console.log("");
}
