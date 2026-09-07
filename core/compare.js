/* What was said against what was meant, word by word.
 *
 * Both sides go through fold() — the same normalisation every other comparison of
 * Russian in the app uses — so stress marks, case and ё/е never count as errors, and
 * punctuation never counts as a word. Alignment is word-level Levenshtein with a
 * backtrace, which is what turns "two words wrong" into *which* two words, and in
 * what way: a substitution, a word the learner dropped, or a word they added.
 *
 * Pure: no platform globals, no I/O. A speech recogniser's output goes in one side
 * and the target sentence in the other; how the result is graded is the caller's.
 */

import { fold, TOKEN } from "./util.js";

/* Only Cyrillic runs count as words, hyphenated ones as one word (кто-то). Anything
   else — digits, Latin, punctuation — is dropped on both sides rather than compared,
   so a recogniser that emits "OK" or a stray "1" does not manufacture an error. */
export function words(s) {
  const out = [];
  const re = new RegExp(TOKEN.source, "g");
  const f = fold(s || "");
  let m;
  while ((m = re.exec(f)) !== null) out.push(m[0]);
  return out;
}

/* Character edits between two folded strings — for "close" on a typed answer: a
   letter off is worth something, a different word is not. */
export function charDistance(a, b) {
  const s = fold(a || ""), t = fold(b || "");
  const n = s.length, m = t.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const row = [i];
    for (let j = 1; j <= m; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[m];
}

/* -> { wer, alignment: [{ said, expected, status }], said: [...], expected: [...] }
   status is one of ok, sub, del (expected word not said), ins (said word not expected).
   wer is edits over expected length; an empty target with something said is 1. */
export function compare(transcript, target) {
  const said = words(transcript);
  const expected = words(target);
  const n = said.length, m = expected.length;

  // d[i][j]: edits to turn said[0..i) into expected[0..j).
  const d = [];
  for (let i = 0; i <= n; i++) {
    d.push(new Array(m + 1));
    d[i][0] = i;
  }
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = said[i - 1] === expected[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j - 1] + same, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }

  // Backtrace, preferring a match/substitution over an insertion or deletion when
  // costs tie, so a single wrong word reads as "sub" rather than "del + ins".
  const alignment = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = said[i - 1] === expected[j - 1] ? 0 : 1;
      if (d[i][j] === d[i - 1][j - 1] + same) {
        alignment.push({ said: said[i - 1], expected: expected[j - 1],
                         status: same ? "sub" : "ok" });
        i--; j--;
        continue;
      }
    }
    if (j > 0 && (i === 0 || d[i][j] === d[i][j - 1] + 1)) {
      alignment.push({ said: null, expected: expected[j - 1], status: "del" });
      j--;
    } else {
      alignment.push({ said: said[i - 1], expected: null, status: "ins" });
      i--;
    }
  }
  alignment.reverse();

  const edits = d[n][m];
  const wer = m === 0 ? (n === 0 ? 0 : 1) : Math.min(1, edits / m);
  return { wer, alignment, said, expected };
}
