/* Dictionary lookup, in one place for both apps.
 *
 * There are two tiers, and the difference is honest rather than arbitrary:
 *
 *   studied  — the ~4,000 lemmas the curriculum is built from. Every inflected form
 *              is indexed, so «книгу» resolves, and the sentences come from his own
 *              decks.
 *   deep     — every lemma in the lexicon that carries an English gloss (~46,000).
 *              This is what stops the dictionary answering "nothing" for виноград,
 *              which is in the lexicon on disk and was simply never shipped.
 *
 * The tiers differ in *findability*, not in what an entry contains: a deep entry
 * carries its paradigm too (89% of them — the rest have none in OpenRussian), so
 * neither tier is rendered with an apology or an empty table. What separates them is
 * how you reach one, below.
 *
 * The deep tier is a tab-separated blob rather than JSON objects because the key
 * names would cost more than the data: 2.7 MB against 4.0 MB for the same content.
 * It is parsed once, lazily, on the first search.
 *
 * Only headwords are indexed in the deep tier. Indexing all 567,526 inflected forms
 * would add several megabytes to reach words nobody is studying — so a deep word is
 * found by its dictionary form or its meaning, and a studied word is found however
 * it is spelled in a sentence.
 */

import { fold, translit } from "./util.js";

/* Part of speech is one letter in the blob; spelled out for display. */
export const POS_CODE = {
  n: "noun", v: "verb", a: "adjective", d: "adverb", p: "pronoun", r: "preposition",
  c: "conjunction", t: "particle", m: "numeral", i: "interjection", s: "possessive",
};
export const POS_LETTER = Object.fromEntries(
  Object.entries(POS_CODE).map(([k, v]) => [v, k]));

/* One line per entry:
   bare, accented, pos, gender, aspect, partner, gloss,
   stemLen, shapeId, stress, sentenceRefs, overrides */
export function parseDeep(blob) {
  if (!blob) return [];
  const out = [];
  for (const line of blob.split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const b = f[0];
    const e = {
      b,
      w: f[1] || b,                           // accented, blank when identical
      p: POS_CODE[f[2]] || f[2] || "",
      e: f[6] || "",
      stem: f[7] || "",
      shape: f[8] || "",
      stress: f[9] || "",
      refs: f[10] || "",
      over: f[11] || "",
      deep: true,
    };
    if (f[3]) e.g = f[3];
    if (f[4]) e.a = f[4];
    if (f[5]) e.pt = f[5];
    out.push(e);
  }
  return out;
}

/* Scores, high to low. A word you are studying outranks the same word from the wider
   dictionary, and an exact match outranks a meaning that merely mentions the term. */
const EXACT_FORM = 100;   // studied, any inflection, typed in Cyrillic
const EXACT_HEAD = 90;    // deep, dictionary form, typed in Cyrillic
const SENSE = 70;         // the gloss is exactly this word
/* Transliteration ranks *below* an exact gloss, which is not obvious but is right:
   "war" transliterates to «вар» — a real word meaning pitch — and someone typing
   English wants война. Latin spelling still wins when nothing means it in English,
   so "kniga" still finds книга. */
const TRANSLIT_FORM = 65;
const TRANSLIT_HEAD = 62;
const WORD = 50;          // the gloss contains it as a whole word
const PREFIX = 30;        // the headword starts with it
const SUBSTR = 10;        // buried in the gloss

export function makeSearch({ L, IX, deep }) {
  let cache = null;
  const deepList = () => {
    if (cache === null) cache = typeof deep === "function" ? deep() : (deep || []);
    return cache;
  };

  return function search(raw, limit = 12) {
    const q = fold(raw || "");
    if (!q) return [];
    const tr = translit(q);
    const qe = q.replace(/^to /, "");
    const esc = qe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const word = new RegExp("\\b" + esc + "\\b");

    const best = new Map();                   // bare -> {score, rank, entry}
    const offer = (entry, score, rank) => {
      const prev = best.get(entry.b);
      if (prev && prev.score >= score) return;
      best.set(entry.b, { score, rank, entry });
    };

    const glossScore = (gloss) => {
      if (!gloss) return 0;
      const g = gloss.toLowerCase();
      if (g.split(/[,;]\s*/).some((s) => s.trim() === qe)) return SENSE;
      if (word.test(g)) return WORD;
      if (g.includes(qe)) return SUBSTR;
      return 0;
    };

    // --- studied tier. Rank is the lemma index, which is frequency order.
    for (const i of IX[q] || []) offer(L[i], EXACT_FORM, i);
    if (tr !== q) for (const i of IX[tr] || []) offer(L[i], TRANSLIT_FORM, i);
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      const s = glossScore(l.e);
      if (s) offer(l, s, i);
      else if (fold(l.b).startsWith(q)) offer(l, PREFIX, i);
    }

    // --- deep tier. Ranked after the studied ones at equal score by adding the
    // studied count, so "grapes" still surfaces виноград but книга wins "book".
    const list = deepList();
    const base = L.length;
    for (let k = 0; k < list.length; k++) {
      const d = list[k];
      const b = fold(d.b);
      if (b === q) { offer(d, EXACT_HEAD, base + k); continue; }
      if (b === tr) { offer(d, TRANSLIT_HEAD, base + k); continue; }
      const s = glossScore(d.e);
      if (s) offer(d, s, base + k);
      else if (b.startsWith(q)) offer(d, PREFIX, base + k);
    }

    return [...best.values()]
      .sort((a, z) => z.score - a.score || a.rank - z.rank)
      .slice(0, limit)
      .map((x) => x.entry);
  };
}

/* Resolve one word to an entry, whichever tier holds it. Keyed on the word rather
   than an index, because lemma indices are assigned by frequency and move on every
   rebuild — the same reason learner state keys on the word. */
export function makeResolve({ L, IX, deep }) {
  let cache = null;
  return function resolve(wordOrKey) {
    const q = fold(wordOrKey || "");
    if (!q) return null;
    const hits = IX[q];
    if (hits && hits.length) return L[hits[0]];
    if (cache === null) {
      cache = new Map();
      const list = typeof deep === "function" ? deep() : (deep || []);
      for (const d of list) if (!cache.has(fold(d.b))) cache.set(fold(d.b), d);
    }
    return cache.get(q) || null;
  };
}
