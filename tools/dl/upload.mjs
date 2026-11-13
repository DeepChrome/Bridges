// node tools/dl/upload.mjs <apk> [name] [--notes "one line"] [--no-latest]
//
// Puts a build on the bridges-dl Worker: the file in 20 MiB pieces with a
// seven-day expiry, then its meta record, then — when a sidecar from
// native/tools/build.ps1 sits beside the APK (Ya-<commit>.json) — the
// `dl:latest` record the app compares itself against at launch
// (native/src/update.js). No sidecar, no latest: a build with no version code
// cannot be offered as newer than anything, and the upload says so.
//
// The name is random when not given; the Worker looks a file up by its full
// path name, extension included, so `.apk` is appended when missing (a bare
// name was uploaded once, 2026-10-29, and 404ed). Run from anywhere: wrangler
// is pointed at this folder's wrangler.toml. CLOUDFLARE_API_TOKEN comes from
// the environment and is never printed.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args.splice(i, 2)[1] || ""); };
const notes = flag("--notes") || "";
const noLatest = args.includes("--no-latest"); if (noLatest) args.splice(args.indexOf("--no-latest"), 1);
const [file, given] = args;
if (!file) { console.error("usage: node tools/dl/upload.mjs <apk> [name] [--notes \"...\"] [--no-latest]"); process.exit(2); }

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const randomName = () => Array.from(randomBytes(24), (b) => ALPHABET[b % ALPHABET.length]).join("");
const base = given || randomName();
const name = /\.(apk|aab|mp4)$/.test(base) ? base : `${base}.apk`;
if (!/^[A-Za-z0-9_-]{16,}\.(apk|aab|mp4)$/.test(name)) {
  console.error(`name must be 16+ of [A-Za-z0-9_-] plus .apk: ${name}`); process.exit(2);
}

const buf = readFileSync(file);
const PART = 20 * 1024 * 1024;
const parts = Math.ceil(buf.length / PART);
const work = join(here, "parts");
mkdirSync(work, { recursive: true });
const put = (key, path, ttl) => {
  const a = ["wrangler", "kv", "key", "put", key, "--path", path, "--binding", "FILES", "--remote",
             "--config", join(here, "wrangler.toml")];
  if (ttl) a.push("--ttl", String(ttl));
  const r = spawnSync("npx", a, { encoding: "utf8", shell: true });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
};
const WEEK = 7 * 86400;
for (let i = 0; i < parts; i++) {
  const p = join(work, `${i}.bin`);
  writeFileSync(p, buf.subarray(i * PART, (i + 1) * PART));
  put(`dl:${name}:${i}`, p, WEEK);
  console.log(`part ${i + 1}/${parts}`);
}
writeFileSync(join(work, "meta.json"), JSON.stringify({ parts, size: buf.length }));
put(`dl:${name}:meta`, join(work, "meta.json"), WEEK);
console.log(`uploaded ${buf.length} bytes in ${parts} parts as ${name}`);

// The latest record, from the build's sidecar. Not expiring with the file: the
// Worker checks the file is still there before it answers, so a stale record
// is a 404 and not a dead link.
const sidecarPath = file.replace(/\.apk$/i, ".json");
if (noLatest) {
  console.log("latest: left as it was (--no-latest)");
} else if (!existsSync(sidecarPath) || sidecarPath === file) {
  console.log(`latest: NOT set — no sidecar at ${sidecarPath} (build with native/tools/build.ps1)`);
} else {
  const side = JSON.parse(readFileSync(sidecarPath, "utf8"));
  if (!(Number(side.code) > 0) || !side.name) {
    console.error(`latest: NOT set — the sidecar has no code/name: ${sidecarPath}`); process.exit(1);
  }
  if (side.dirty) console.log("note: this build was made from a tree with uncommitted changes");
  const latest = { file: name, code: Number(side.code), name: String(side.name), commit: side.commit || "",
                   sha256: side.sha256 || "", size: buf.length, at: Date.now(), notes };
  writeFileSync(join(work, "latest.json"), JSON.stringify(latest));
  put("dl:latest", join(work, "latest.json"));
  console.log(`latest: ${latest.name} (code ${latest.code})${notes ? ` — ${notes}` : ""}`);
}
rmSync(work, { recursive: true, force: true });
console.log(`LINK https://bridges-dl.bridges-feedback.workers.dev/${name}`);
