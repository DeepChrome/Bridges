/* Typing Russian on a Latin keyboard (the desktop, 2026-11-07).
 *
 * The owner: *"I don't know how to turn my current keyboard into a russian
 * keyboard but that would be nice to have some sort of quality of life
 * there."* Two answers, and this file is the first: a phonetic layout, where
 * the Latin letters a learner already knows stand for the Russian sounds
 * they make, so «привет» is typed p-r-i-v-e-t. The second is Windows' own
 * ЙЦУКЕН layout, which the desktop offers to install (desktop/src/main).
 *
 * The table follows translit.ru's conventions, the ones most learners meet
 * first: j → й, c → ц, w → щ, x → х, ' → ь, '' → ъ, e' → э, yo or jo → ё,
 * and the digraphs sh zh ch kh ts shch. It is deliberately not core/util.js
 * `translit`, which is a search convenience (and maps c → к, w → в for the
 * person who typed an English word); a keyboard has to be exact and
 * reversible in the typist's head, and these two jobs would pull one table
 * two ways.
 *
 * `typeRu(latin)` converts a whole buffer, longest match first and case
 * preserved, so an input can keep what was typed and show what it means;
 * `LEGEND` is the key-by-key list a learner reads once.
 */

const PAIRS = [
  ["shch", "щ"], ["sch", "щ"],
  ["yo", "ё"], ["jo", "ё"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"],
  ["yu", "ю"], ["ju", "ю"], ["ya", "я"], ["ja", "я"], ["ye", "е"], ["je", "е"], ["e'", "э"],
  ["''", "ъ"], ["'", "ь"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"],
  ["i", "и"], ["j", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"],
  ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"],
  ["c", "ц"], ["w", "щ"], ["x", "х"], ["y", "ы"],
];

/* The legend, in the order a learner wants it: the letters that are not what
   an English speaker would guess first, then the rest. */
export const LEGEND = [
  ["y", "ы"], ["j", "й"], ["c", "ц"], ["w", "щ"], ["x / h / kh", "х"], ["'", "ь"], ["''", "ъ"], ["e'", "э"],
  ["yo / jo", "ё"], ["yu / ju", "ю"], ["ya / ja", "я"], ["zh", "ж"], ["ch", "ч"], ["sh", "ш"], ["shch", "щ"], ["ts", "ц"],
];

const upper = (s) => s.toUpperCase();

/* Latin → Cyrillic for one buffer. Anything not in the table passes through
   (a Cyrillic letter already typed, a digit, punctuation). A capital leads
   to a capital: "Privet" → «Привет», "SHkola" → «Школа». */
export function typeRu(s) {
  const src = String(s || "");
  let out = "", i = 0;
  const low = src.toLowerCase();
  outer: while (i < low.length) {
    for (const [a, b] of PAIRS) {
      if (low.startsWith(a, i)) {
        const cap = src[i] !== low[i];
        out += cap ? upper(b) : b;
        i += a.length;
        continue outer;
      }
    }
    out += src[i++];
  }
  return out;
}

/* Whether a buffer holds anything the layout would change: a learner typing
   Cyrillic straight in (Windows' own layout) is left alone. */
export const hasLatin = (s) => /[A-Za-z']/.test(String(s || ""));
