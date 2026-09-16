/* The copy cap: labels, not prose (rule 20.7).
 *
 * That rule has been in the contract from the start and the app filled up with
 * explanation anyway - "Comes round again", "Right, with a hint", "Paste
 * Russian from anywhere. Every word becomes tappable..." - because each
 * sentence looks reasonable on its own screen and nothing ever compared them.
 * The owner, 2026-09-10: "I don't love the random explanatory text all over the
 * app. Stuff like 'comes back around'... don't have to explain features that
 * don't have to be explained."
 *
 * So the rule is mechanical now. A string the learner reads may run to
 * MAX_WORDS words. A longer one has to be listed in ALLOW with a reason, which
 * makes adding one a deliberate act rather than a drift.
 *
 *     node tools/copy.mjs            # exits 1 on an unlisted long string
 *     node tools/copy.mjs --list     # every string it considers, longest first
 *
 * What it deliberately does not police:
 *   - `screens/Intro.js`, the tour: explanation is the whole point of it, and
 *     it is opt-in and skippable.
 *   - `screens/SttLab.js`, a developer instrument rather than a learner screen.
 *   - `accessibilityLabel`, which is read *instead of* the picture rather than
 *     beside it, so it has different work to do.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "native", "src");

export const MAX_WORDS = 10;
const SKIP_FILES = [/screens[\\/]Intro\.js$/, /screens[\\/]SttLab\.js$/, /[\\/]images\.js$/];

/* Longer strings that earn it. Each is here for one of three reasons: it teaches
   something about Russian, it says where something came from (a licence
   obligation, rule 20.10), or it reports a failure that would otherwise leave a
   dead control with no reason given. */
export const ALLOW = new Map([
  ["Across is where the tongue sits. Down is how far the jaw drops.",
   "teaching: how to read the vowel chart"],
  ["Each pair is the same vowel. The letter tells you whether the consonant before it is hard or soft, so you never have to guess.",
   "teaching: the single highest-value fact about Russian spelling"],
  ["No recording, and this device has no Russian voice",
   "section 27: why a speaker is dead"],
  ["The YouTube player could not be downloaded — check the connection.",
   "failure with a cause the learner can act on"],
  ["Your saved progress could not be read. It has been kept aside;",
   "P9: the state banner, and it has to be plain about what happened"],
  ["The mark is lost; what you have answered is kept.",
   "the consequence of leaving a quiz, in the confirm dialog"],
  ["No connection. Try again when you are online.", "failure with a cause"],
  ["This file is not a deck Bridges can read.", "failure with a cause"],
  ["No cards with Russian on them in this deck.", "failure with a cause"],
  ["Russian is not installed for offline recognition.", "failure with a cause"],
  ["The owner does not allow this video to be embedded.", "failure with a cause"],
]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".js")) files.push(p);
  }
})(SRC);

/* Not copy: markup, style values, SQL, ids, paths, code inside a template. */
const NOT_COPY = [
  /^[A-Za-z0-9_./@-]+$/,
  /^(https?:|file:|data:|#[0-9A-Fa-f]{3,8}$)/i,
  /^[Mm][\s\d.,-]/,                            // an SVG path
  /\b(select|insert|update|delete|create table)\b/i,
  // The later lines of a statement that runs on: a column definition inside a
  // CREATE TABLE, the VALUES of an INSERT. The statement's own keyword is on
  // an earlier line, and these words are only ever upper case in SQL, never
  // in copy.
  /\b(TEXT|INTEGER|REAL|PRIMARY KEY|NOT NULL|VALUES|ON CONFLICT)\b/,
  /[{}<>]|=>|\bimport\b|\brequire\(|: *["'#]|^[a-zA-Z]+: /,
  // A comma-separated list of identifiers — a destructured import spilled over
  // several lines reads as prose to a line-based scanner, and it is not.
  /^(?:[A-Za-z_$][\w$]*,\s*)+[A-Za-z_$][\w$]*,?$/,
  /^[\d\s.,:%/x-]+$/,
  /^(row|column|center|flex-|space-|nowrap|absolute|relative|contain|cover|stretch)/,
];

const wordsIn = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/* Comments are stripped by tracking the block state across lines rather than by
   looking at how a line starts: a block comment's middle lines carry no marker
   at all, and the first version of this check reported two of its own comments
   as screen copy. */
function code(src) {
  const out = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end < 0) { out.push(""); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const start = line.indexOf("/*");
    if (start >= 0) {
      const end = line.indexOf("*/", start + 2);
      if (end < 0) { inBlock = true; line = line.slice(0, start); }
      else line = line.slice(0, start) + line.slice(end + 2);
    }
    const slash = line.indexOf("//");
    out.push(slash >= 0 ? line.slice(0, slash) : line);
  }
  return out;
}

export function scan() {
  const out = [];
  const keep = (file, line, s) => {
    const t = s.trim().replace(/\s+/g, " ");
    if (!/[a-z]/.test(t) || !/\s/.test(t)) return;
    if (NOT_COPY.some((re) => re.test(t))) return;
    out.push({ file, line, s: t, n: wordsIn(t) });
  };

  for (const f of files) {
    if (SKIP_FILES.some((re) => re.test(f))) continue;
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const lines = code(readFileSync(f, "utf8"));

    // Quoted strings: labels, details, placeholders, alerts.
    lines.forEach((line, i) => {
      if (/accessibilityLabel/.test(line)) return;
      for (const m of line.matchAll(/["'`]([^"'`\n]+)["'`]/g)) keep(rel, i + 1, m[1]);
    });

    /* JSX text children, where most of the prose actually lives: the lines the
       owner objected to were nearly all bare text between tags rather than
       quoted strings, so a scanner reading only literals misses the thing it
       was written for.
     *
     * Two precise shapes rather than one loose one. The loose version - strip
     * the tags and the braces and keep whatever is left - read every import
     * block and every style object in the app as screen copy, which is a check
     * nobody would run twice. */
    const PROSE = /^[A-Za-z0-9 ,.'’“”«»·—–…!?%-]+$/;
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/>([^<>{}]+)</g)) keep(rel, i + 1, m[1]);
    });
    let run = [], at = 0;
    const flush = () => { if (run.length) keep(rel, at, run.join(" ")); run = []; };
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || !PROSE.test(t) || !/[a-z]{2}/.test(t) || !/\s/.test(t)) { flush(); return; }
      if (!run.length) at = i + 1;
      run.push(t);
    });
    flush();
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.s) ? false : seen.add(r.s)))
            .sort((a, b) => b.n - a.n);
}

/* ------------------------------------------------------------------ CLI */

if (process.argv[1] && process.argv[1].endsWith("copy.mjs")) {
  const rows = scan();
  if (process.argv.includes("--list")) {
    for (const r of rows) console.log(`${String(r.n).padStart(3)}  ${r.file}:${r.line}  ${r.s}`);
    process.exit(0);
  }
  const over = rows.filter((r) => r.n > MAX_WORDS && !ALLOW.has(r.s));
  for (const r of over) console.log(`FAIL  ${r.file}:${r.line}  (${r.n} words)  ${r.s}`);
  const stale = [...ALLOW.keys()].filter((k) => !rows.some((r) => r.s === k));
  for (const k of stale) console.log(`STALE  allowed but on no screen: ${k}`);
  console.log(`\n${rows.length} strings, ${ALLOW.size} allowed, `
              + `${over.length} over ${MAX_WORDS} words, ${stale.length} stale`);
  process.exit(over.length || stale.length ? 1 : 0);
}
