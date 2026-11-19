// node tools/dl/upload_audio.mjs [--force]
//
// Puts the audio packs tools/build_word_assets.mjs made (native/build-out/
// audio/*.zip, listed in packs.json) on the bridges-dl Worker: each in 20 MiB
// pieces under `audio:<id>:<n>` with an `audio:<id>:meta` record, no expiry.
// A pack is named by its contents, so one already on the host is skipped
// (`--force` sends it again). Run after build_word_assets, before the build
// that lists these ids ships; the app fetches `/audio/<id>.zip`
// (native/src/audiopacks.js). CLOUDFLARE_API_TOKEN comes from the environment
// and is never printed.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dir = join(root, "native", "build-out", "audio");
const index = join(dir, "packs.json");
if (!existsSync(index)) { console.error(`no ${index}: run node tools/build_word_assets.mjs first`); process.exit(2); }
const { packs } = JSON.parse(readFileSync(index, "utf8"));
const force = process.argv.includes("--force");

const wrangler = (args, input) => spawnSync("npx", ["wrangler", ...args, "--binding", "FILES", "--remote",
  "--config", join(here, "wrangler.toml")], { encoding: "utf8", shell: true, input });
const put = (key, path) => {
  const r = wrangler(["kv", "key", "put", key, "--path", path]);
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
};
/* What is already there: one listing, not a request a pack. */
const listed = wrangler(["kv", "key", "list", "--prefix", "audio:"]);
const have = new Set(listed.status === 0 ? (JSON.parse(String(listed.stdout).replace(/^[^[]*/, "") || "[]")
  .map((k) => k.name).filter((k) => k.endsWith(":meta")).map((k) => k.slice(6, -5))) : []);

const PART = 20 * 1024 * 1024;
const work = join(here, "parts");
mkdirSync(work, { recursive: true });
let sent = 0, skipped = 0;
for (const p of packs) {
  if (have.has(p.id) && !force) { skipped++; continue; }
  const buf = readFileSync(join(dir, p.id + ".zip"));
  const parts = Math.ceil(buf.length / PART);
  for (let i = 0; i < parts; i++) {
    const f = join(work, `${i}.bin`);
    writeFileSync(f, buf.subarray(i * PART, (i + 1) * PART));
    put(`audio:${p.id}:${i}`, f);
  }
  writeFileSync(join(work, "meta.json"), JSON.stringify({ parts, size: buf.length, label: p.label, chapter: p.chapter, count: p.count }));
  put(`audio:${p.id}:meta`, join(work, "meta.json"));
  sent++;
  console.log(`${p.id}: ${(buf.length / 1048576).toFixed(1)} MB in ${parts} part(s)`);
}
rmSync(work, { recursive: true, force: true });
console.log(`audio packs: ${sent} uploaded, ${skipped} already on the host, ${packs.length} in all`);
