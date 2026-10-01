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

/* Where a hit stops being *the* word and becomes a word that mentions it. A
   screen laying results out as a dictionary draws the line here: собака, пёс
   and кобель are "dog"; акула ("shark, dog-fish") only contains it. Exposed so
   the screen and the ranking cannot come to disagree about the line. An exact
   sense scores from SENSE down by its place in the gloss (see `glossScore`),
   never below this. */
export const MATCH = SENSE - 4;

export function makeSearch({ L, IX, deep }) {
  let cache = null;
  const deepList = () => {
    if (cache === null) cache = typeof deep === "function" ? deep() : (deep || []);
    return cache;
  };

  /* What makes two hits one entry. It was the bare headword alone, so the
     studied «есть» "eat" and «есть» "there is" collapsed into whichever
     scored first and the verb could not be found at all (the review,
     2026-10-01). A studied row is its headword and its meaning — two rows
     with one gloss («мой» the adjective and the possessive) are one word
     listed twice and stay one hit. A dictionary row whose headword a studied
     row already has is that row's twin and merges into it (the tiers label
     some classes differently, «вы» pronoun against "other", and the studied
     row is the one that carries the curriculum); one with the same class as a
     particular studied row merges into that one. A dictionary-only word is its
     headword and its class, so its homographs are reachable too. */
  let studiedKeys = null;
  const studiedKey = (l) => fold(l.b) + "|" + String(l.e || "").trim().toLowerCase();
  const keyOf = (entry) => {
    if (!entry.deep) return studiedKey(entry);
    if (studiedKeys === null) {
      studiedKeys = new Map();
      for (const l of L) {
        const k = fold(l.b);
        if (!studiedKeys.has(k)) studiedKeys.set(k, new Map());
        if (!studiedKeys.get(k).has(l.p)) studiedKeys.get(k).set(l.p, studiedKey(l));
      }
    }
    const byPos = studiedKeys.get(fold(entry.b));
    if (!byPos) return fold(entry.b) + "|" + (entry.p || "");
    return byPos.get(entry.p) || byPos.values().next().value;
  };

  /* The ranked hits with their scores; `search` below is the same list as
     entries alone, which is what every older caller wants. */
  function scored(raw, limit = 12) {
    const q = fold(raw || "");
    if (!q) return [];
    const tr = translit(q);
    const qe = q.replace(/^to /, "");
    const esc = qe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const word = new RegExp("\\b" + esc + "\\b");

    const best = new Map();                   // keyOf -> {score, rank, entry}
    const offer = (entry, score, rank) => {
      const k = keyOf(entry);
      const prev = best.get(k);
      if (prev && prev.score >= score) return;
      // A dictionary twin never replaces the studied row it merges into.
      if (prev && entry.deep && !prev.entry.deep) {
        best.set(k, { score, rank: prev.rank, entry: prev.entry });
        return;
      }
      best.set(k, { score, rank, entry });
    };

    /* An exact sense scores by *where* in the gloss it sits: a word whose first
       sense is the term outranks one that lists it fifth, and frequency only
       breaks ties after that. "industrious" used to open on «исполнительный»
       (executive, industrious, painstaking…) because it is the commoner word,
       with «трудолюбивый» — the one that *means* it — fifth (the owner,
       2026-09-24). Half a point a place, floored so an exact sense anywhere
       still beats a transliteration and a whole-word mention. */
    const glossScore = (gloss) => {
      if (!gloss) return 0;
      const g = gloss.toLowerCase();
      /* A bracketed note qualifies a sense and does not change what it is:
         «кот» "cat (tom cat)" and «кошка» "cat (female or in general)" are
         "cat", and they sat under "Also" below «кошачий» and «кат» until the
         note was set aside (2026-10-01). A verb's "to" likewise. The note goes
         before the split, or "you (singular, informal)" splits inside it. */
      const at = g.replace(/\s*\([^)]*\)/g, "").split(/[,;]\s*/)
        .findIndex((s) => s.trim().replace(/^to\s+/, "") === qe.replace(/^to\s+/, ""));
      if (at >= 0) return SENSE - Math.min(at, 8) * 0.5;
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
      .map((x) => ({ entry: x.entry, score: x.score }));
  }

  const search = (raw, limit) => scored(raw, limit).map((x) => x.entry);
  search.scored = scored;
  return search;
}

/* Resolve one word to an entry, whichever tier holds it. Keyed on the word rather
   than an index, because lemma indices are assigned by frequency and move on every
   rebuild — the same reason learner state keys on the word. */
/* **A headword is itself before it is anybody's inflection.** The form index
   was read first, so a word that is also a form of another lemma opened the
   other one: «ба́нка» opened «банк», «бело́к» «белка», «го́ре» «гора», «пра́во»
   «правый», «том» «тот» — 356 dictionary words and 7 studied ones (the
   review, 2026-10-01). An exact headword wins now — studied, then dictionary,
   of the part of speech asked for when the caller names one — and the form
   index answers only for a word that is no headword at all. */
export function makeResolve({ L, IX, deep }) {
  let heads = null, cache = null;
  const put = (map, k, v) => { if (!map.has(k)) map.set(k, v); };
  return function resolve(wordOrKey, pos) {
    const q = fold(wordOrKey || "");
    if (!q) return null;
    if (heads === null) {
      heads = new Map();
      // Of two studied homographs, the one the form index lists first — the
      // build's resolver's preference.
      L.forEach((l) => {
        if (!l || !l.b) return;
        const k = fold(l.b);
        const pref = (IX[k] || []).find((j) => L[j] && fold(L[j].b) === k);
        put(heads, k, pref !== undefined ? L[pref] : l);
        put(heads, k + "|" + l.p, l);
      });
    }
    const studied = (pos && heads.get(q + "|" + pos)) || heads.get(q);
    if (studied && (!pos || studied.p === pos)) return studied;
    if (cache === null) {
      cache = new Map();
      const list = typeof deep === "function" ? deep() : (deep || []);
      for (const d of list) { put(cache, fold(d.b), d); put(cache, fold(d.b) + "|" + d.p, d); }
    }
    const fromDeep = (pos && cache.get(q + "|" + pos)) || null;
    if (fromDeep) return fromDeep;
    if (studied) return studied;
    if (cache.has(q)) return cache.get(q);
    const hits = IX[q];
    return hits && hits.length ? L[hits[0]] : null;
  };
}
