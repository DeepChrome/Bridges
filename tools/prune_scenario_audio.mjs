/* Drop the bought clips that no scenario uses any more.
 *
 * When the scenarios were cut from 168 to 32 (§30af) their clips were kept:
 * they cost money and rule 20.3 treats them as sources. That reasoning was
 * wrong about one thing — git holds every one of them, so the working tree
 * keeping 1,900 files nobody reads is not insurance, it is 20 MB in every
 * clone and a manifest that claims 168 lessons the app does not have.
 * Restoring a scenario is `git checkout` of its clips, not a purchase.
 *
 * Reads the scripts as the app does and keeps exactly what they reference.
 * Dry by default; nothing is deleted without --apply.
 *
 *   node tools/prune_scenario_audio.mjs
 *   node tools/prune_scenario_audio.mjs --apply
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScripts } from "./check_scripts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "scenario_audio");
const MANIFEST = join(DIR, "manifest.json");
const APPLY = process.argv.includes("--apply");

const scripts = loadScripts();
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const lessons = manifest.lessons || {};

const keep = new Set();
const kept = {};
for (const key of Object.keys(scripts)) {
  const entry = lessons[key];
  if (!entry) continue;                         // no audio bought yet: build_scenario_audio's job
  kept[key] = entry;
  for (const line of entry.lines || []) keep.add(`${line.id}.mp3`);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".mp3"));
const orphans = files.filter((f) => !keep.has(f));
const bytes = orphans.reduce((a, f) => a + statSync(join(DIR, f)).size, 0);
const droppedLessons = Object.keys(lessons).filter((k) => !kept[k]);

console.log(`${Object.keys(scripts).length} scenarios reference ${keep.size} clips`);
console.log(`${files.length} clips on disk; ${orphans.length} orphaned (${(bytes / 1e6).toFixed(1)} MB)`);
console.log(`manifest: ${Object.keys(lessons).length} lessons, ${droppedLessons.length} without a script`);

if (!APPLY) { console.log("\n(dry run — --apply to delete)"); process.exit(0); }

for (const f of orphans) unlinkSync(join(DIR, f));
manifest.lessons = kept;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`\ndeleted ${orphans.length} clips; manifest now ${Object.keys(kept).length} lessons`);
