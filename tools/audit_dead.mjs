/* Exports nothing imports, and files nothing reaches (§11, §12).
 *
 * The codebase should get cleaner as the product matures, not merely larger,
 * and the way it fails to is one export at a time: a helper written for a
 * screen that was later rebuilt, a constant whose only reader was deleted, a
 * whole module kept "just in case". None of it fails a test, because nothing
 * calls it. This reads every `export` in core/ and native/src and asks who
 * imports it.
 *
 * Conservative on purpose. An export is reported only when *no* file outside
 * its own mentions the name at all — as an import, a member, or a bare
 * identifier — so a false positive needs a name that appears nowhere else. A
 * name used only by tests is reported separately: it is not dead, but it is
 * not product either, and the two want different decisions.
 *
 *   node tools/audit_dead.mjs            # report
 *   node tools/audit_dead.mjs --tests    # also list what only tests use
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIRS = ["core", "native/src", "native/App.js", "native/plugins"];
const TEST_DIRS = ["native/__tests__", "tools", "backend"];
const SHOW_TESTS = process.argv.includes("--tests");

function walk(p, out = []) {
  const s = statSync(p);
  if (s.isFile()) { if (/\.(m?js)$/.test(p)) out.push(p); return out; }
  for (const n of readdirSync(p)) {
    if (n === "node_modules" || n === "build" || n.startsWith(".")) continue;
    walk(join(p, n), out);
  }
  return out;
}

const src = SRC_DIRS.flatMap((d) => walk(join(ROOT, d)));
const tests = TEST_DIRS.flatMap((d) => walk(join(ROOT, d)));
const text = new Map([...src, ...tests].map((f) => [f, readFileSync(f, "utf8")]));

/* Names a file exports. `export default` is skipped: it is imported under any
   name, and the app's screens are its default exports, all of them registered
   in App.js. */
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)|^export\s+\{([^}]+)\}/gm;
function exportsOf(f) {
  const out = [];
  let m;
  while ((m = EXPORT_RE.exec(text.get(f)))) {
    if (m[1]) out.push(m[1]);
    else for (const part of m[2].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/* Generated modules are read by name from data they mirror; their exports are
   consumed through `require` at build time or are data tables. */
const GENERATED = /\/(notices|scenetracks|wordaudio)\.js$/;

/* Three different findings, because they want three different actions:
     dead      — no reference anywhere, not even in its own file: delete it
     localOnly — used in its own file and exported for nobody: drop `export`
     testOnly  — only a test reads it: not product, but not litter either */
const dead = [], localOnly = [], testOnly = [];
for (const f of src) {
  if (GENERATED.test(f)) continue;
  const own = text.get(f);
  for (const name of exportsOf(f)) {
    const re = new RegExp(`\\b${name}\\b`, "g");
    const usedIn = (files) => files.some((g) => g !== f && re.test(text.get(g)));
    if (usedIn(src)) continue;
    if (usedIn(tests)) { testOnly.push(`${relative(ROOT, f)}: ${name}`); continue; }
    // The declaration itself is one mention; a second means it is used locally.
    const mentions = (own.match(re) || []).length;
    (mentions > 1 ? localOnly : dead).push(`${relative(ROOT, f)}: ${name}`);
  }
}

/* A source file nothing imports at all. */
const orphans = [];
for (const f of src) {
  if (GENERATED.test(f) || basename(f) === "App.js") continue;
  const stem = basename(f).replace(/\.m?js$/, "");
  const re = new RegExp(`["'\`][^"'\`]*\\/${stem}(?:\\.m?js)?["'\`]`);
  if (![...src, ...tests].some((g) => g !== f && re.test(text.get(g)))) orphans.push(relative(ROOT, f));
}

console.log(`${src.length} source files, ${tests.length} test/tool files\n`);
console.log(`dead — referenced nowhere, not even in its own file (${dead.length}):`);
dead.forEach((d) => console.log("  " + d));
console.log(`\nexported for nobody — used only in its own file (${localOnly.length}):`);
localOnly.forEach((d) => console.log("  " + d));
console.log(`\nfiles nothing imports (${orphans.length}):`);
orphans.forEach((o) => console.log("  " + o));
if (SHOW_TESTS) {
  console.log(`\nexports only tests use (${testOnly.length}):`);
  testOnly.forEach((d) => console.log("  " + d));
} else {
  console.log(`\n(${testOnly.length} exports are used only by tests — --tests to list them)`);
}
