/* Word building: a long word said a syllable at a time (the owner, 2026-09-16).
 *
 * It runs **backwards** — «ю», «ма́ю», «нима́ю», «понима́ю» — which is Pimsleur's
 * own direction and the one the owner settled on once the rest of the drill
 * was right (2026-09-16: *"You can go back to backwards if that's the
 * approach… I mainly just want to make sure definitions are clear, controls
 * are in place, the full word is available, and assessment is available"*).
 *
 * The reason the direction matters: a fragment anchored at the *end* of the
 * word gets the stress and the final vowel right from the first repetition,
 * and every step adds to something already correct. Forwards, the learner
 * reaches the ending last, having said the front four times — and a swallowed
 * ending is the commonest way a Russian word comes out wrong.
 *
 * The direction lives in this one function. It has now been changed twice, so
 * it is the *drill around it* that carries the value, not the direction.
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
    /* …but never take one that cannot start a syllable — **checked before the
       cluster rules below and again after them**.
     *
     * Only checking it first was a real defect, found 2026-09-22 by sweeping
     * the whole curriculum rather than by reading: the bump the cluster rules
     * apply moves the cut one letter on, and that letter is very often a soft
     * sign. «боль-ша-я» came out «бол-ьша-я», and «ься» — an unsayable
     * fragment — was the *first* thing the drill said for every reflexive verb
     * in -ться. 291 of the 4,017 lemmas produced at least one such fragment.
     * The owner heard what a TTS engine does when handed a bare soft sign:
     * it reads the letter's name. "It sometimes literally says the soft sign
     * name (mierke snake)" — мягкий знак. */
    const legal = () => {
      while (cut < to && NEVER_FIRST.includes(head(ls[cut]).toLowerCase())) cut++;
    };
    legal();
    const cluster = to - cut;
    if (cluster >= 2) {
      const a = head(ls[cut]).toLowerCase(), b = head(ls[cut + 1]).toLowerCase();
      if (a === b || SONORANT.includes(a) || cluster >= 3) { cut++; legal(); }
    }
    cuts.push(cut);
  }
  const out = [];
  let at = 0;
  for (const cut of cuts) { out.push(ls.slice(at, cut).join("")); at = cut; }
  out.push(ls.slice(at).join(""));
  return out.filter((s) => s.length);
}

/* The fragments: the last syllable, then the last two, up to the whole word.
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
   drill front-load its hardest; it is shuffled and left alone.

   `prompt` stays empty on purpose. The whole word and its meaning are drawn by
   the activity itself, at the top, where they stay for the length of the word
   — the runner's prompt block would centre them in the slack and push the
   drill under the fold. */
export function buildupDrill(words, n = 6, opts = {}) {
  const usable = (words || []).filter((w) => w && w.ru && worthBuilding(w.ru));
  return shuffle(usable.slice()).slice(0, n).map((w) => ({
    kind: "buildup",
    ru: w.ru,
    en: w.en || "",
    steps: buildup(w.ru),
    cyr: true,
    /* Whether the learner asked to be listened to. Decided once, on the way in
       (Flows.js), because a question per word would be the drill. */
    listen: !!opts.listen,
    ask: opts.listen ? "Listen, then say it back" : "Listen, then say it out loud",
    prompt: "",
  }));
}
