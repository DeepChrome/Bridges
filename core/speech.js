/* The rules the speaking and listening activities share, apart from any screen.
 *
 * Three things, all pure: which lemmas a sentence exercises, which sentence from a
 * unit's pool to ask next, and what grade each word earns from an alignment. The
 * alignment itself comes from compare.js; the activities only add a transcript —
 * typed for Hear, recognised for Say — and hand the result here.
 */

import { fold, TOKEN } from "./util.js";

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
 *   ok        -> Good, or Easy when the whole sentence was right first time
 *   sub, del  -> Again
 *   ins       -> nothing: an extra word has no expected lemma to grade
 *
 * A lemma met twice in one sentence takes its worst grade — getting «не» right
 * once and wrong once is not a Good. Only expected words are graded, and only those
 * the index knows; a word outside the curriculum has no card to grade. */
export function gradeAlignment(alignment, IX, opts) {
  const perfect = !!(opts && opts.perfect);
  const firstTry = !opts || opts.firstTry !== false;
  const grade = {};
  for (const a of alignment || []) {
    if (!a.expected) continue;
    const hit = IX[fold(a.expected)];
    if (!hit || !hit.length) continue;
    const g = a.status === "ok" ? (perfect && firstTry ? 4 : 3) : 1;
    const i = hit[0];
    grade[i] = i in grade ? Math.min(grade[i], g) : g;
  }
  return Object.keys(grade).map((k) => ({ i: Number(k), grade: grade[k] }));
}
