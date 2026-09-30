/* Related words, together (the owner, 2026-09-30): *"The seasons are split
 * up from each other. Related words always need to be together throughout the
 * entire app… there needs to be coherent grouping of words throughout the
 * entire corpus and clear delineation to make it easily navigable."*
 *
 * A unit's words were one list, commonest first, and a list sorted by
 * frequency puts «лето» beside «гора» and «осень» three screens down. What a
 * reader wants is what a textbook's vocabulary page does: the verbs, then the
 * things in named groups (seasons, weather, landscape), then the describing
 * words and the little ones. The grouping is a judgement about meaning, which
 * nothing in the lexicon knows, so a model proposes it and this tool holds it
 * to the rules; the answer is written to `data/curated/word_groups.json`, a
 * decision file a person can read and correct by hand (rule 20.3), and
 * `build_topics.py` orders every unit by it, so lessons teach a group
 * together and every list in the app can draw it.
 *
 *   node tools/build_word_groups.mjs              units with no groups yet
 *   node tools/build_word_groups.mjs --stale      …and units whose words changed
 *   node tools/build_word_groups.mjs --only a,b   just these, regrouped
 *   node tools/build_word_groups.mjs --check      validate the file, buy nothing
 *
 * Reads the built payload for the unit words, so run it after build_site and
 * rebuild (build_topics → build_site) after it. The Anthropic key is read from
 * backend/.dev.vars and never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "curated", "word_groups.json");
const MODEL = "claude-sonnet-5-5";

/* The four sections every list is drawn in, and which parts of speech each
   takes. The app reads the same split (native/src/prep.js), so a group's kind
   here is the heading it appears under there. */
export const KINDS = {
  verb: ["verb"],
  noun: ["noun"],
  describing: ["adjective", "adverb"],
  little: null,                      // pronouns, prepositions, numbers, the rest
};
export const kindOf = (pos) =>
  Object.keys(KINDS).find((k) => KINDS[k] && KINDS[k].includes(pos)) || "little";

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const has = (n) => process.argv.includes(n);

/* What a returned grouping must be, or why it is not. Every word exactly
   once, each group one kind and its words that kind, names short and never a
   shrug ("Other", "Misc"), no group larger than a screen's worth. */
export function checkGroups(groups, words) {
  const errs = [];
  const want = new Map(words.map((w) => [w.b, w]));
  const seen = new Set();
  for (const g of groups || []) {
    if (!g || typeof g.name !== "string" || !g.name.trim()) { errs.push("a group with no name"); continue; }
    if (g.name.split(/\s+/).length > 4) errs.push(`"${g.name}": name over four words`);
    if (/^(other|misc|miscellaneous|various|general)\b/i.test(g.name)) errs.push(`"${g.name}": name a group by what is in it`);
    if (!KINDS.hasOwnProperty(g.kind)) errs.push(`"${g.name}": kind "${g.kind}" is not one of ${Object.keys(KINDS).join(", ")}`);
    if (!Array.isArray(g.words) || !g.words.length) { errs.push(`"${g.name}": no words`); continue; }
    if (g.words.length > 12) errs.push(`"${g.name}": ${g.words.length} words, split it`);
    for (const b of g.words) {
      const w = want.get(b);
      if (!w) { errs.push(`"${g.name}": «${b}» is not a word of this unit`); continue; }
      if (seen.has(b)) errs.push(`«${b}» is in two groups`);
      seen.add(b);
      if (kindOf(w.p) !== g.kind) errs.push(`«${b}» is a ${w.p}, so it belongs under ${kindOf(w.p)}, not ${g.kind}`);
    }
  }
  const missing = words.filter((w) => !seen.has(w.b)).map((w) => `«${w.b}»`);
  if (missing.length) errs.push(`not placed: ${missing.join(", ")}`);
  return errs;
}

const SYSTEM = `You organise the vocabulary page of a Russian course unit, the way a good printed textbook does, so a learner can scroll it and see at once which words belong together.

Put every word of the unit into a named group of related words, and give each group a kind:
- "verb": verbs only
- "noun": nouns only
- "describing": adjectives and adverbs only
- "little": everything else (pronouns, prepositions, conjunctions, particles, numbers, question words, interjections)
The part of speech of every word is given; a word's kind is fixed by it.

Groups:
- are named for what is in them, in 1 to 3 plain English words a learner would use: "Seasons", "Weather", "In the sky", "Getting around", "Feelings", "Family", "Numbers". Never "Other", "Misc", "General" or "Words".
- hold words that genuinely belong together by meaning: all the seasons in one group, the days of the week in one, the family members in one, opposites side by side.
- are 2 to 8 words where the words allow; a word with nothing related in the unit may stand alone in a group named for it, but look hard for its companions first. At most 12 in one group.
- list their words in natural order where one exists (the seasons from winter to autumn, numbers ascending, the family from grandparents down, days in week order, sizes small to large, opposites adjacent); otherwise put the most everyday word first.
- are listed most useful first within each kind.

Answer with JSON only, no prose: {"groups":[{"kind":"noun","name":"Seasons","words":["зима","весна","лето","осень"]}, ...]}. Copy each Russian word exactly as given.`;

function apiKey() {
  const vars = fs.readFileSync(path.join(ROOT, "backend", ".dev.vars"), "utf8");
  const m = vars.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) { console.error("no ANTHROPIC_API_KEY in backend/.dev.vars"); process.exit(2); }
  return m[1].trim();
}

async function ask(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return { text: j.content.map((c) => c.text || "").join(""), usage: j.usage || {} };
}

const parse = (text) => {
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]).groups : null; } catch { return null; }
};

async function groupUnit(unit, words, chapter) {
  const list = words.map((w) => `${w.b} (${w.p || "other"}): ${w.e}`).join("\n");
  const messages = [{ role: "user", content: `Unit: ${unit.name} (${chapter})\n\nWords:\n${list}` }];
  let tokens = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { text, usage } = await ask(messages);
    tokens += (usage.input_tokens || 0) + (usage.output_tokens || 0) * 5;   // output weighed at its price
    const groups = parse(text);
    const errs = groups ? checkGroups(groups, words) : ["the answer was not the JSON asked for"];
    if (!errs.length) return { groups, tokens };
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Fix these and answer with the whole JSON again:\n- ${errs.join("\n- ")}` });
    console.log(`  ${unit.id}: attempt ${attempt} refused (${errs.length} problem${errs.length > 1 ? "s" : ""})`);
  }
  throw new Error(`${unit.id}: no valid grouping after three attempts`);
}

async function main() {
  const p = loadPayload(ROOT);
  const L = p.lemmas;
  const file = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const chapterOf = new Map();
  for (const u of p.units) {
    const row = (p.path || []).find((r) => r.id === u.id || r.topic === u.id);
    chapterOf.set(u.id, row && row.ch ? row.ch : "");
  }
  const wordsOf = (u) => u.w.map((i) => ({ b: L[i].b, p: L[i].p, e: (L[i].e || "").split(";")[0].trim() }));
  const same = (u) => {
    const g = file[u.id];
    if (!g) return false;
    const a = new Set(g.flatMap((x) => x.words)), b = u.w.map((i) => L[i].b);
    return a.size === b.length && b.every((x) => a.has(x));
  };

  if (has("--check")) {
    let bad = 0;
    for (const u of p.units) {
      if (!file[u.id]) { console.log(`  ${u.id}: no groups`); bad++; continue; }
      const errs = checkGroups(file[u.id], wordsOf(u));
      if (errs.length) { bad++; console.log(`  ${u.id}: ${errs.join("; ")}`); }
    }
    console.log(bad ? `${bad} unit(s) need grouping` : `all ${p.units.length} units grouped`);
    process.exit(bad ? 1 : 0);
  }

  const only = arg("--only");
  const todo = p.units.filter((u) => only ? only.split(",").includes(u.id)
                                          : !file[u.id] || (has("--stale") && !same(u)));
  console.log(`${todo.length} unit(s) to group with ${MODEL}`);
  let spent = 0;
  // Four at a time: a unit is one request and the rest wait on the network.
  for (let k = 0; k < todo.length; k += 4) {
    const batch = todo.slice(k, k + 4);
    const done = await Promise.all(batch.map((u) => groupUnit(u, wordsOf(u), chapterOf.get(u.id))));
    batch.forEach((u, j) => {
      file[u.id] = done[j].groups;
      spent += done[j].tokens;
      console.log(`  ${u.id}: ${done[j].groups.map((g) => `${g.name} ${g.words.length}`).join(" · ")}`);
    });
    // Written after every batch, so an interrupted run keeps what it bought.
    const ordered = Object.fromEntries(p.units.filter((u) => file[u.id]).map((u) => [u.id, file[u.id]]));
    fs.writeFileSync(OUT, JSON.stringify(ordered, null, 1) + "\n");
  }
  // Sonnet at $3 in / $15 out per million; output was weighed ×5 above.
  console.log(`wrote ${path.relative(ROOT, OUT)} · about $${(spent * 3 / 1e6).toFixed(2)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
