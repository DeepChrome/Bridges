/* What an EAS build would upload, and whether it can still build.
 *
 * EAS uploads the working tree filtered by `.easignore` (the repo root's —
 * see the long note in that file about EAS_NO_VCS and why `.gitignore` is not
 * consulted once it exists). Two things can go wrong and both are slow to find
 * out about, because the answer arrives minutes later from a build server and
 * the free plan's Android builds are rationed:
 *
 *   - **too much goes up.** The archive was 295 MB when `.easignore` still
 *     mirrored `.gitignore`, and 167 MB after that was fixed — of which 102 MB
 *     was `native/build-out/`, the APKs built here and handed to his phone.
 *   - **too little goes up.** Excluding something the bundler needs fails in
 *     the Bundle JavaScript phase with "Unable to resolve module", which is
 *     builds 46c3d5df and 395d5a93.
 *
 * So this measures the first and asserts the second, in a second, for free.
 * Run it before any `eas build`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const rules = readFileSync(join(ROOT, ".easignore"), "utf8")
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

/* The rules are written with forward slashes and Windows paths are not, which
   is worth stating because getting it wrong does not error — it silently
   reports the whole `native/android` build tree as uploaded and the number
   comes out at 3.6 GB. */
function ignored(relRaw) {
  const rel = relRaw.split(sep).join("/");
  const parts = rel.split("/");
  for (const r of rules) {
    const rule = r.replace(/\/$/, "");
    if (rule.includes("*")) {
      const re = new RegExp("^" + rule.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
      if (parts.some((p) => re.test(p))) return true;
      continue;
    }
    if (rel === rule || rel.startsWith(rule + "/")) return true;
    if (parts.includes(rule)) return true;
  }
  return false;
}

/* What the bundle cannot be built without. `core/` is here because
   `native/metro.config.js` resolves `@core/...` out of it, which is the reason
   the upload has to start above `native/` at all (§20a). */
const MUST = [
  "package.json", "native/package.json", "native/app.json", "native/eas.json",
  "native/metro.config.js", "native/index.js", "native/App.js",
  "native/src/data.js", "native/src/scenetracks.js",
  "native/assets/data.json", "native/assets/deep.json", "native/assets/sent.json",
  "native/assets/videos.json", "native/assets/listening.json", "native/assets/senses.json",
  "core/questions.js", "core/scheduler.js", "core/util.js",
];

let bytes = 0, files = 0;
const byTop = {};
(function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch (e) { return; }
  for (const name of entries) {
    const full = join(dir, name);
    if (ignored(relative(ROOT, full))) continue;
    let st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    bytes += st.size;
    files++;
    const top = relative(ROOT, full).split(sep).slice(0, 2).join("/");
    byTop[top] = (byTop[top] || 0) + st.size;
  }
})(ROOT);

console.log(`${files.toLocaleString()} files, ${(bytes / 1048576).toFixed(1)} MB would upload\n`);
Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${(v / 1048576).toFixed(1).padStart(8)} MB  ${k}`));

let bad = 0;
const missing = [], excluded = [];
for (const m of MUST) {
  if (!existsSync(join(ROOT, m))) { missing.push(m); bad++; continue; }
  if (ignored(m)) { excluded.push(m); bad++; }
}
if (missing.length) {
  console.log(`\nnot on disk — run the pipeline (${missing.length}):`);
  missing.forEach((m) => console.log("   " + m));
}
if (excluded.length) {
  console.log(`\n.easignore would exclude these and the build would fail (${excluded.length}):`);
  excluded.forEach((m) => console.log("   " + m));
}
if (!bad) console.log("\nevery file the bundler needs survives .easignore");
process.exitCode = bad ? 1 : 0;
