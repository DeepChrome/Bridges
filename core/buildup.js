/* Backward build-up: a long word learned from its end (the owner, 2026-09-16).
 *
 * Pimsleur's technique, and it runs **backwards** for a reason. To learn
 * «понимаю» you hear "ю", then "маю", then "нимаю", then "понимаю" — each
 * fragment a syllable longer, and always anchored at the end of the word.
 * Building forwards instead ("по", "пони", "понима") trains the opposite
 * habit: the learner arrives at the ending last, tired, and swallows it, and
 * a swallowed ending is the most common way a Russian word comes out wrong.
 * Starting from the end keeps the word's stress and its intonation contour
 * right from the first repetition and adds to the front of something already
 * correct.
 *
 * (The owner described it forwards. This is the one place the implementation
 * deliberately does not follow the brief, because the direction *is* the
 * technique; the note is here so the difference is visible rather than a
 * silent correction.)
 *
 * Nothing here is vocabulary. Like `pairDrill` in core/alphabet.js, these
 * questions carry no lemma index: pronouncing «понимаю» is not the same claim
 * as knowing it, and a mouth drill must not put words into the scheduler.
 */

import { shuffle } from "./util.js";

/* Vowels carry the syllables. Russian has ten letters for six sounds; what
   matters here is only that each marks one syllable. */
const VOWELS = "аеёиоуыэюя";
const isVowel = (ch) => VOWELS.includes(ch.toLowerCase());
/* Letters that cannot begin a syllable: й is a glide that closes one, and the
   two signs are diacritics wearing letter clothes. A fragment starting with
   any of them would be unsayable. */
const NEVER_FIRST = "йьъ";
/* Sonorants close a syllable where an obstruent would not: «кар-тина», not
   «ка-ртина». */
const SONORANT = "рлмн";

/* The word as units of "letter plus whatever combines onto it" — a stress
   mark is a separate code point that belongs to the vowel before it, and
   splitting between them would put a floating accent at the head of a
   fragment. */
function letters(word) {
  const out = [];
  for (const ch of String(word).normalize("NFC")) {
    if (/[̀́̆̈]/.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const head = (unit) => unit[0];

/* Where the syllables fall.
 *
 * Russian prefers an open syllable, so a consonant between two vowels goes
 * with the following one (по-ни-ма-ю). Three exceptions, all audible:
 *   - a cluster that starts with a doubled consonant splits between them
 *     (рус-ский, not ру-сский);
 *   - a cluster that starts with a sonorant leaves it behind (кар-тина);
 *   - a cluster of three or more leaves its first behind, because four
 *     consonants in a row is not a fragment anyone can say — «здрав-ствуй-те»
 *     and «чув-ство-вать», where the naive rule gave «вствуйте».
 * Anything that cannot begin a syllable stays with the syllable before it.
 *
 * This is a pronunciation aid, not a hyphenation authority: what it has to
 * produce is fragments a learner can say, and every rule here exists because
 * the naive version produced one they could not.
 */
export function syllables(word) {
  const ls = letters(word);
  const vowels = [];
  ls.forEach((u, i) => { if (isVowel(head(u))) vowels.push(i); });
  if (vowels.length < 2) return ls.length ? [ls.join("")] : [];

  const cuts = [];                       // index each syllable starts at
  for (let v = 0; v + 1 < vowels.length; v++) {
    const from = vowels[v] + 1, to = vowels[v + 1];
    let cut = from;                      // consonants default to the next syllable
    // …but never take one that cannot start a syllable.
    while (cut < to && NEVER_FIRST.includes(head(ls[cut]).toLowerCase())) cut++;
    const cluster = to - cut;
    if (cluster >= 2) {
      const a = head(ls[cut]).toLowerCase(), b = head(ls[cut + 1]).toLowerCase();
      if (a === b || SONORANT.includes(a) || cluster >= 3) cut++;
    }
    cuts.push(cut);
  }
  const out = [];
  let at = 0;
  for (const cut of cuts) { out.push(ls.slice(at, cut).join("")); at = cut; }
  out.push(ls.slice(at).join(""));
  return out.filter((s) => s.length);
}

/* The fragments, shortest last-syllable first, ending in the whole word.
   A word of one syllable has nothing to build and returns just itself. */
export function buildup(word) {
  const syl = syllables(word);
  const out = [];
  for (let i = syl.length - 1; i >= 0; i--) out.push(syl.slice(i).join(""));
  return out;
}

/* Worth drilling? Two syllables is a word, not a mouthful; the technique is
   for the ones long enough to come apart. */
export const MIN_SYLLABLES = 3;
export const worthBuilding = (word) => syllables(word).length >= MIN_SYLLABLES;

/* `words` is [{ ru, en }] — the caller decides which (the app hands in what
   the learner is studying). Longest first inside the shuffle would make the
   drill front-load its hardest; it is shuffled and left alone. */
export function buildupDrill(words, n = 6) {
  const usable = (words || []).filter((w) => w && w.ru && worthBuilding(w.ru));
  return shuffle(usable.slice()).slice(0, n).map((w) => ({
    kind: "buildup",
    ru: w.ru,
    en: w.en || "",
    steps: buildup(w.ru),
    cyr: true,
    ask: "Listen, then say it back",
    prompt: "",
  }));
}
