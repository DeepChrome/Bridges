/* The rules the speaking and listening activities share, apart from any screen.
 *
 * Three things, all pure: which lemmas a sentence exercises, which sentence from a
 * unit's pool to ask next, and what grade each word earns from an alignment. The
 * alignment itself comes from compare.js; the activities only add a transcript —
 * typed for Hear, recognised for Say — and hand the result here.
 */

import { fold, TOKEN } from "./util.js";
import { charDistance } from "./compare.js";

/* The curriculum lemmas a sentence contains, each once, in order of appearance.
   Reads the same index the word links use, so a word is "in" the sentence exactly
   when tapping it would open an entry. */
export function sentenceLemmas(ru, IX) {
  const out = [];
  const re = new RegExp(TOKEN.source, "g");
  let m;
  while ((m = re.exec(ru || "")) !== null) {
    const hit = IX[fold(m[0])];
    if (hit && hit.length && !out.includes(hit[0])) out.push(hit[0]);
  }
  return out;
}

/* One row from a pool, preferring sentences that contain a lemma the lesson is
   teaching so the activity reinforces what was just met rather than the unit at
   large. `want` is a Set of lemma indices; with none matching, any row will do —
   unless `onlyWanted`, in which case null, so a caller can fall through to a wider
   pool rather than take an unrelated sentence from a narrow one. */
export function pickPrompt(rows, idxs, want, IX, random, onlyWanted) {
  if (!idxs || !idxs.length) return null;
  const rnd = random || Math.random;
  const preferred = want && want.size
    ? idxs.filter((i) => sentenceLemmas(rows[i][0], IX).some((l) => want.has(l)))
    : [];
  if (!preferred.length && onlyWanted) return null;
  const from = preferred.length ? preferred : idxs;
  return rows[from[Math.floor(rnd() * from.length)]] || null;
}

/* Per-lemma grades from an alignment (ROADMAP P5.4 / P5.9).
 *
 *   ok        -> Good, or Easy when the whole sentence was right first time,
 *                or Hard when a hint was used — recognised, not recalled
 *   sub, del  -> Again
 *   ins       -> nothing: an extra word has no expected lemma to grade
 *
 * A lemma met twice in one sentence takes its worst grade — getting «не» right
 * once and wrong once is not a Good. Only expected words are graded, and only those
 * the index knows; a word outside the curriculum has no card to grade. */
/* The tags the feedback service put on one attempt, each once. A word tagged
   CASE under a grammar note that also says CASE is one slip, not two; the count
   the trouble bank keeps is of slips, so both runners take their tags from here. */
export function feedbackTags(fb) {
  const out = [];
  const seen = new Set();
  const add = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };
  for (const g of (fb && fb.grammar) || []) add(g.tag);
  for (const w of (fb && fb.words) || []) for (const t of w.tags || []) add(t);
  return out;
}

/* Below this index a lemma is a function word — «не», «и», «в» — met on every
   screen and not what a sentence activity is evidence about. */
export const SPEECH_SKIP_TOP = 100;

/* A substituted word that is the same lemma a letter or two off — «книга» for
   «книгу» — is the word known and the ending not: half credit and Hard, with
   the expected form named, rather than a whole-word lapse (the pedagogy
   review, 2026-09-08). */
export function nearMiss(a, IX) {
  if (!a || a.status !== "sub" || !a.said || !a.expected) return false;
  const s = fold(a.said), e = fold(a.expected);
  const hs = IX[s], he = IX[e];
  if (!hs || !he || !hs.length || !he.length || hs[0] !== he[0]) return false;
  return charDistance(s, e) <= 2;
}

export function gradeAlignment(alignment, IX, opts) {
  const firstTry = !opts || opts.firstTry !== false;
  const hinted = !!(opts && opts.hinted);
  const grade = {};
  for (const a of alignment || []) {
    if (!a.expected) continue;
    const hit = IX[fold(a.expected)];
    if (!hit || !hit.length) continue;
    const i = hit[0];
    // Content words only: a sentence right or wrong says nothing about «не».
    if (i < SPEECH_SKIP_TOP) continue;
    // Capped at Good: one sentence said right is not "Easy" for every word in it.
    const g = a.status === "ok" ? (hinted ? 2 : 3) : nearMiss(a, IX) ? 2 : 1;
    grade[i] = i in grade ? Math.min(grade[i], g) : g;
  }
  void firstTry;
  return Object.keys(grade).map((k) => ({ i: Number(k), grade: grade[k] }));
}

/* The share of a sentence that was right, a near miss counting half. */
export function alignmentCredit(alignment, IX) {
  const expected = (alignment || []).filter((a) => a.expected);
  if (!expected.length) return { credit: 0, ok: 0, near: 0, n: 0 };
  let ok = 0, near = 0;
  for (const a of expected) {
    if (a.status === "ok") ok++;
    else if (nearMiss(a, IX)) near++;
  }
  return { credit: (ok + near / 2) / expected.length, ok, near, n: expected.length };
}
