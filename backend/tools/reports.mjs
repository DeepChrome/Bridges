#!/usr/bin/env node
/* What testers sent (POST /v1/report): the header's flag on any screen, and
 * Settings → Send feedback.
 *
 *   node backend/tools/reports.mjs              the newest twenty, newest first
 *   node backend/tools/reports.mjs --all        every one
 *   node backend/tools/reports.mjs --critical   only critical (also --major, --minor)
 *   node backend/tools/reports.mjs --clips DIR  also save each report's recordings
 *                                               to DIR as <time>-<user>-<n>.m4a
 *   node backend/tools/reports.mjs --json FILE  write what is shown as JSON, for triage
 *
 * Reads the Worker's KV through wrangler, which needs CLOUDFLARE_API_TOKEN in
 * the environment (never printed, never written down). */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = (...args) => {
  const r = spawnSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "USAGE", "--remote"],
                      { cwd: DIR, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  return r.stdout;
};
const arg = (name) => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : null; };
const level = ["critical", "major", "minor"].find((s) => process.argv.includes(`--${s}`));
const clipDir = arg("--clips");
const jsonOut = arg("--json");

const keys = JSON.parse(wrangler("list", "--prefix", "report:")).map((k) => k.name).sort().reverse();
const out = [];
for (const k of keys) {
  if (!process.argv.includes("--all") && !level && out.length >= 20) break;
  const r = JSON.parse(wrangler("get", JSON.stringify(k)));
  if (level && r.severity !== level) continue;
  out.push({ key: k, ...r });
}
console.log(`${keys.length} report(s), ${out.length} shown\n`);
for (const r of out) {
  const f = r.facts || {};
  const a = r.about || {};
  console.log(`— ${r.at.replace("T", " ").slice(0, 16)} UTC · ${(r.severity || "-").toUpperCase()} · ${r.kind || "-"}` +
              ` · ${r.user} · ${f.version || "?"} · ch ${f.chapter || "?"} l ${f.lesson || "?"}`);
  if (a.screen || a.question) {
    console.log(`  on: ${[a.screen, a.title].filter(Boolean).join(" · ")}`);
    if (a.question) console.log(`  question: ${JSON.stringify(a.question)}`);
  }
  if (r.text) console.log(r.text.split("\n").map((l) => `  ${l}`).join("\n"));
  if (r.fix) console.log(`  should be: ${r.fix}`);
  if (r.clips) {
    console.log(`  recordings: ${r.clips}`);
    if (clipDir) {
      mkdirSync(clipDir, { recursive: true });
      for (let n = 0; n < r.clips; n++) {
        const b64 = wrangler("get", JSON.stringify(`report-clip:${r.key}:${n}`)).trim();
        const name = `${r.at.replace(/[:.]/g, "-")}-${r.user}-${n}.m4a`;
        writeFileSync(path.join(clipDir, name), Buffer.from(b64, "base64"));
      }
    }
  }
  console.log("");
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
