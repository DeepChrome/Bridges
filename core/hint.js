/* The partial hint: the answer given away a piece at a time (the owner,
 * 2026-11-06: *"anywhere where there are hints, there should also be some sort
 * of partial hint. The partial hint gives an element away (like the root of
 * the verb to be conjugated). Each time the partial hint is pressed, maybe the
 * user gets another letter… an alternative to the full on hint/reference"* —
 * and on a flashcard's front, *"one letter at a time"*).
 *
 * Pure: what the answer is, how much each press shows, and the answer drawn
 * with the rest masked. The screens own the presses.
 *
 * - **A form starts at its root.** Where the answer is a form of a word the
 *   question names (a conjugation, a case, an agreeing adjective, a gap), the
 *   first press shows the letters it shares with the dictionary form —
 *   «зна» of «зна́ешь» — and each press after shows one letter more.
 * - **Anything else starts at one letter**: a meaning, a word to produce, a
 *   flashcard's answer.
 * - **A sentence goes a word at a time.** One letter at a time down a
 *   twelve-word sentence is forty presses for nothing; the owner's "letter"
 *   is about a word, and a sentence's unit is the word.
 * - The root never gives away all but the last letter on its own: it stops two
 *   short of the whole, so the first press is a start and not the answer.
 */

import { fold } from "./util.js";

const MARK = /[̀-ͯ]/;
const LETTER = /\p{L}/u;

/* Letters with their combining marks attached: «зна́ешь» is six, not seven,
   and the stress mark is shown with the vowel it sits on. */
function graphemes(s) {
  const out = [];
  for (const ch of String(s || "")) {
    if (MARK.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
const isLetter = (g) => LETTER.test(g);

/* From this many words up, a hint goes a word at a time. */
const HINT_WORDS_FROM = 4;
const wordsOf = (s) => String(s || "").trim().split(/\s+/).filter((w) => [...w].some((c) => LETTER.test(c)));
export const hintMode = (answer) => (wordsOf(answer).length >= HINT_WORDS_FROM ? "words" : "letters");

/* How many letters the answer shares with its dictionary form from the start,
   compared through fold() so a stress mark or ё decides nothing. */
function rootLength(answer, base) {
  const a = graphemes(answer).filter(isLetter).map((g) => fold(g));
  const b = graphemes(base).filter(isLetter).map((g) => fold(g));
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/* What each press shows, as a count of units — letters, or words for a
   sentence — the last step being the whole answer. Empty when there is
   nothing to show. */
export function hintSteps(answer, { base } = {}) {
  if (hintMode(answer) === "words") {
    const n = wordsOf(answer).length;
    return Array.from({ length: n }, (_, k) => k + 1);
  }
  const n = graphemes(answer).filter(isLetter).length;
  if (!n) return [];
  let r = base ? rootLength(answer, base) : 0;
  r = Math.min(r, n - 2);
  if (r < 1) r = 1;
  const out = [];
  for (let k = r; k <= n; k++) out.push(k);
  return out;
}

/* The answer with the first `shown` units in place and every other letter a
   blank — spaces, hyphens and punctuation stay, so the shape of the answer is
   part of the hint. */
export function hintMask(answer, shown) {
  if (hintMode(answer) === "words") {
    let seen = 0;
    return String(answer).trim().split(/(\s+)/).map((part) => {
      if (/^\s+$/.test(part) || !part) return part;
      const letters = [...part].some((c) => LETTER.test(c));
      if (!letters) return part;
      seen += 1;
      return seen <= shown ? part : graphemes(part).map((g) => (isLetter(g) ? "_" : g)).join("");
    }).join("");
  }
  let k = 0;
  return graphemes(answer).map((g) => {
    if (!isLetter(g)) return g;
    k += 1;
    return k <= shown ? g : "_";
  }).join("");
}

/* The question kinds a runner offers a partial hint on: one right answer to
   give away a piece of. Not a match (no single answer), not stress (the
   letters are the same in every option — the mark is the answer), not the
   spoken and listening activities, which carry their own help. */
const PARTIAL_KINDS = new Set(["choose-en", "choose-ru", "listen", "cloze", "cases", "aspect",
                                      "agreement", "conjugation", "type", "form", "hear"]);
/* The kinds whose answer is a form of the question's own word, so the hint
   starts at its root. A typed word from its English has no root to start
   from: the dictionary form *is* the answer. */
const FORM_KINDS = new Set(["cloze", "cases", "aspect", "agreement", "conjugation", "form"]);
const CYR = /[Ѐ-ӿ]/;

/* What a runner question's partial hint gives away: `{ answer, base }`, or
   null where there is none. The right option where the question is chosen,
   the target where it is written. `lemmas` is the course's word list (L). */
export function partialFor(q, lemmas) {
  if (!q || !PARTIAL_KINDS.has(q.kind)) return null;
  const opt = !q.typed && Array.isArray(q.options) ? q.options.find((o) => o.right) : null;
  const answer = String((opt ? opt.label : q.target) || "").trim();
  if (!answer || !hintSteps(answer).length) return null;
  const word = typeof q.i === "number" && lemmas ? lemmas[q.i] : null;
  const base = FORM_KINDS.has(q.kind) && word && CYR.test(answer) ? word.b : undefined;
  return { answer, base };
}
