/* Every Russian word the app shows is a link (§30br) — counted, not assumed.
 *
 * Reads the shipped payload and decides link or not exactly as the app does:
 * `Linked` underlines a token when the studied index (IX) or the dictionary's
 * form map (deepforms) knows its folded form (words.js `splitTokens`), and the
 * tap opens what `entryOf` resolves; the video transcript links through
 * `linkable` the same way (transcript.js). Tokens are cut with core's TOKEN,
 * stress marks and all, because that is what the screen does — the build once
 * cut them without the marks, and «накра́шенная» became two pieces nobody
 * looks up (2026-10-20).
 *
 *   unlinked   drawn as plain text
 *   dead       underlined, but the tap resolves to nothing
 *
 * An unlinked token is filed under the build's own reason
 * (data/_work/unlinked_forms.txt, written by build_deep_forms), or under
 * "build never saw it" when the build did not consider that form at all —
 * the drift between the build's view of the text and the app's, which is the
 * invariant this tool exists to hold.
 *
 *   node tools/audit_links.mjs                 every source, by reason
 *   node tools/audit_links.mjs --examples 12   more examples a reason
 *   node tools/audit_links.mjs --json FILE     the counts, for a before/after diff
 *   node tools/audit_links.mjs --strict        exit 1 if any curriculum token
 *                                              (not the video captions) is unlinked
 *
 * The video captions are reported apart: YouTube's automatic captions split
 * words across lines and keep false starts («рабо», «челове»), which no
 * dictionary can link and nothing in the app wrote. */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { fold, TOKEN } from "../core/util.js";
import { makeResolve, parseDeep } from "../core/search.js";
import { TOPICS } from "../core/grammar.js";
import { CASES } from "../core/cases.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : null; };
const EXAMPLES = Number(arg("--examples") || 6);

const data = loadPayload(ROOT);
const L = data.lemmas;
const IX = data.index;
const DF = data.deepforms || {};
if (!data.deepforms) console.warn("no deepforms.json in native/assets: every non-course word will count as unlinked");
const deepList = parseDeep(data.deep || "");
const resolve = makeResolve({ L, IX, deep: () => deepList });

/* words.js, line for line. */
const lookup = (s) => { const hit = IX[fold(s)]; return hit && hit.length ? hit[0] : null; };
const deepFormOf = (s) => {
  const hit = DF[fold(s)];
  if (!hit) return null;
  const bar = hit.lastIndexOf("|");
  return { word: hit.slice(0, bar), pos: hit.slice(bar + 1) };
};
function entryOf(s) {
  const deep = deepFormOf(s);
  const i = lookup(s);
  if (i !== null && !(deep && fold(deep.word) === fold(s))) return L[i];
  if (!deep) return null;
  return resolve(deep.word, deep.pos);
}
const linkable = (s) => lookup(s) !== null || deepFormOf(s) !== null;

/* The build's own verdict on each form it could not link. */
const reasons = new Map();
const rpath = join(ROOT, "data", "_work", "unlinked_forms.txt");
if (existsSync(rpath)) {
  for (const line of readFileSync(rpath, "utf8").split("\n")) {
    const m = line.match(/^\s*\d+\s+(\S+)\s+\((.+)\)\s*$/);
    if (m) reasons.set(m[1], m[2]);
  }
}

/* What a form looks like, for the "not in the lexicon" pile: descriptive only. */
const ADJ_END = "(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ой|ей|ую|юю|ых|их|ым|им|ыми|ими|ому|ему|ом|ем)";
const PARTICIPLE = new RegExp(`(?:нн|енн|ённ|ющ|ящ|ащ|ущ|вш|ем|им|т)${ADJ_END}$`);
const SHORT_PARTICIPLE = /(?:ен|ён|ан|ян|ена|ено|ены|ана|ано|аны|ята|ято|яты|ита|ито|иты|ыта|ыто|ыты|ута|уто|уты|ета|ето|еты)$/;
const GERUND = /(?:вшись|вши|ясь|учи|ючи)$/;
function shape(surface, source, first) {
  const k = fold(surface);
  if (/[̀́]/.test(surface.normalize("NFD")) && !reasons.has(k)) return "stress-marked, cut apart by the build";
  if (source === "video captions" && k.length <= 3) return "caption fragment";
  if (!first && /^[А-ЯЁ]/.test(surface)) return "capitalised mid-sentence (a name?)";
  if (k.includes("-")) return "hyphenated compound";
  if (GERUND.test(k)) return "gerund-shaped";
  if (PARTICIPLE.test(k)) return "participle-shaped";
  if (SHORT_PARTICIPLE.test(k)) return "short-form-shaped";
  return "other";
}

/* The sources, as the app draws them through Linked. */
const sources = [];
const add = (name, texts) => sources.push({ name, texts: texts.filter(Boolean) });
add("lesson & pool sentences", (data.speech?.rows || []).map((r) => r[0]));
add("dictionary examples", (data.sent || []).map((r) => r[0]));
add("sense examples", Object.values(data.senses || {}).flatMap((lst) => lst.flatMap((s) => (s.x || []).map((x) => x.ru))));
add("conversations", Object.values(data.scripts || {}).flatMap((e) => [
  ...(e.lines || []).map((l) => l.ru), ...(e.intro || []).map((w) => (typeof w === "string" ? w : w.ru || w.w))]));
add("grammar cards", (data.units || []).flatMap((u) => ((u.g || {}).examples || []).map((e) => e[0])));
add("grammar reference", TOPICS.flatMap((t) => (t.sections || []).flatMap((s) => (s.examples || []).map((e) => e[0]))));
add("case modules", CASES.flatMap((c) => (c.uses || []).flatMap((u) => (u.examples || []).map((e) => e[0]))));
add("headwords", L.map((l) => l.w || l.b));
const tpath = join(ROOT, "native", "assets", "transcripts.json");
if (existsSync(tpath)) {
  const tr = JSON.parse(readFileSync(tpath, "utf8"));
  // A line's sound tags («[музыка]») are drawn as sounds, never as words.
  add("video captions", Object.values(tr).flatMap((lines) => lines.map((ln) => {
    const tags = new Set(ln[3] || []);
    return ln[1].split(" ").filter((_, n) => !tags.has(n)).join(" ");
  })));
}

const report = {};
let curriculumUnlinked = 0;
for (const { name, texts } of sources) {
  const seen = new Set();
  const r = { texts: 0, tokens: 0, unlinked: 0, dead: 0, distinct: 0, byReason: {} };
  for (const text of new Set(texts)) {
    r.texts++;
    const re = new RegExp(TOKEN.source, "g");
    let m, n = 0;
    while ((m = re.exec(text)) !== null) {
      const tok = m[0];
      const first = n++ === 0;
      r.tokens++;
      if (linkable(tok)) {
        if (!entryOf(tok)) { r.dead++; (r.byReason["dead link"] ||= { n: 0, ex: [] }); file(r.byReason["dead link"], tok, text); }
        continue;
      }
      r.unlinked++;
      const k = fold(tok);
      const why = reasons.has(k) ? `${reasons.get(k)}${reasons.get(k) === "not in the lexicon" ? ` · ${shape(tok, name, first)}` : ""}`
        : `build never saw it · ${shape(tok, name, first)}`;
      const b = (r.byReason[why] ||= { n: 0, ex: [], forms: new Set() });
      b.forms.add(k);
      file(b, tok, text);
      if (!seen.has(k)) { seen.add(k); r.distinct++; }
    }
  }
  if (name !== "video captions") curriculumUnlinked += r.unlinked + r.dead;
  report[name] = r;
}
function file(b, tok, text) {
  b.n++;
  if (b.ex.length < EXAMPLES && !b.ex.some((e) => e.startsWith(tok + " "))) b.ex.push(`${tok}  ← ${text.length > 70 ? text.slice(0, 67) + "…" : text}`);
}

let totT = 0, totU = 0;
for (const [name, r] of Object.entries(report)) {
  const pct = r.tokens ? (100 * (r.unlinked + r.dead) / r.tokens).toFixed(2) : "0";
  console.log(`\n${name}: ${r.texts} texts, ${r.tokens} tokens, ${r.unlinked} unlinked (${r.distinct} distinct), ${r.dead} dead — ${pct}%`);
  for (const [why, b] of Object.entries(r.byReason).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(b.n).padStart(6)}  ${why}${b.forms ? ` (${b.forms.size} forms)` : ""}`);
    for (const e of b.ex) console.log(`            ${e}`);
  }
  if (name !== "video captions") { totT += r.tokens; totU += r.unlinked + r.dead; }
}
console.log(`\ncurriculum (all but the captions): ${totU} of ${totT} tokens not a working link`);

if (arg("--json")) {
  const out = {};
  for (const [name, r] of Object.entries(report)) {
    out[name] = { tokens: r.tokens, unlinked: r.unlinked, dead: r.dead, distinct: r.distinct,
                  byReason: Object.fromEntries(Object.entries(r.byReason).map(([k, b]) => [k, b.n])) };
  }
  writeFileSync(arg("--json"), JSON.stringify(out, null, 1));
}
if (process.argv.includes("--strict") && curriculumUnlinked) process.exit(1);
