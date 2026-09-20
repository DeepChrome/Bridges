/* What one lesson's scenario may say, without guessing.
 *
 * `lesson_brief.mjs` writes a chapter at a time for a human author; this
 * answers the narrower question you need while actually writing a line — which
 * **content** words this particular lesson allows, cumulative, in the order
 * they were taught. The closed class is free everywhere and is left out, since
 * listing it every time buries the ten words that matter.
 *
 *   node tools/lesson_words.mjs core1:0 family:1
 *
 * `--intro` answers the other half of the same question: whether a word you are
 * thinking of *introducing* (§30l, the intro allowance) is a word at all. The
 * checker reports an unknown one as an error, but a scene is written a word at
 * a time and a full run of the 168 to reject one guess is the wrong loop.
 *
 *   node tools/lesson_words.mjs --intro вокзал билет рубль
 */
import { briefs } from "./lesson_brief.mjs";
import { maxWords } from "./check_scripts.mjs";
import { loadPayload } from "./payload.mjs";
import { fold } from "../core/util.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);

if (argv[0] === "--intro") {
  const { lemmas, index } = loadPayload(join(dirname(fileURLToPath(import.meta.url)), ".."));
  for (const w of argv.slice(1)) {
    const hit = (index[fold(w)] || [])[0];
    const l = hit === undefined ? null : lemmas[hit];
    console.log(l
      ? `  ${w.padEnd(14)} ${l.b} (${l.p})  ${(l.e || "").split(/[;,]/)[0].trim()}`
      : `  ${w.padEnd(14)} NOT A WORD THE LEXICON KNOWS`);
  }
  process.exit(0);
}

const wanted = argv;
/* `briefs()` is a flat list of lessons, one per key — not chapters holding
   lessons, which is what this assumed first and what made it throw. */
const byKey = new Map(briefs().map((l) => [l.key, l]));

if (!wanted.length) {
  console.log([...byKey.keys()].join(" "));
  process.exit(0);
}

for (const key of wanted) {
  const b = byKey.get(key);
  if (!b) { console.log(`${key}: no such lesson`); continue; }
  const content = b.palette.filter((w) => w.p && w.p !== "other");
  console.log(`\n=== ${key}  (chapter ${b.chapter}, up to ${maxWords(b.chapter)} words a sentence)`);
  console.log(`new this lesson: ${b.newWords.map((w) => w.b).join(", ")}`);
  console.log(`content words available (${content.length}):`);
  console.log("  " + content.map((w) => `${w.b}=${(w.e || "").split(/[;,]/)[0].trim()}`).join("; "));
}
