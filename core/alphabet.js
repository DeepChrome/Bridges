/* The writing system and the sounds under it (ROADMAP P10.2).
 *
 * Hand-authored, and shared like core/scenarios.js: it is teaching content, not
 * anything the pipeline can generate. The lexicon knows how a word inflects; it
 * does not know that «В» catches every English speaker for a fortnight.
 *
 * Three things a beginner needs, in the order they bite:
 *
 *   1. The letters that look Latin and are not — В Н Р С У Х. Reading is slow
 *      but correct within a week; these four or five are everyone's holdouts.
 *   2. The vowels come in five pairs, and the pair says whether the consonant
 *      before it is hard or soft. You never have to guess: the spelling tells
 *      you. This is the single highest-value fact about Russian spelling.
 *   3. The sounds English does not have — ы, х, щ, and the rolled р.
 *
 * Comparisons are to General American, and they are approximations offered as a
 * way in, not as a claim of identity: Russian к is unaspirated, so "the k in
 * skate" is closer than "the k in kit", and that is the kind of care the notes
 * try to take. Where English genuinely has nothing (ы), the note says so and
 * describes the mouth instead.
 */

// Explicit extension: Node's ESM resolver requires it, Metro tolerates either.
import { shuffle } from "./util.js";

/* Every letter in alphabetical order.
 *   l     the capital and small letter
 *   name  what the letter is called in Russian
 *   ipa   the sound, or sounds, in IPA
 *   like  an English word to hear it in
 *   trap  true when the shape is a Latin letter with another sound
 *   note  anything a learner needs beyond the comparison
 *   kind  vowel | consonant | sign
 */
export const LETTERS = [
  { l: "А а", name: "а", ipa: "[a]", kind: "vowel", like: "a in father" },
  { l: "Б б", name: "бэ", ipa: "[b]", kind: "consonant", like: "b in bed" },
  { l: "В в", name: "вэ", ipa: "[v]", kind: "consonant", like: "v in van", trap: true,
    note: "Looks like B. It is a v." },
  { l: "Г г", name: "гэ", ipa: "[ɡ]", kind: "consonant", like: "g in go" },
  { l: "Д д", name: "дэ", ipa: "[d]", kind: "consonant", like: "d in door" },
  { l: "Е е", name: "е", ipa: "[je] / [e]", kind: "vowel", like: "ye in yes",
    note: "Softens the consonant before it." },
  { l: "Ё ё", name: "ё", ipa: "[jo] / [o]", kind: "vowel", like: "yo in yonder",
    note: "Always stressed, and often printed as е." },
  { l: "Ж ж", name: "жэ", ipa: "[ʐ]", kind: "consonant", like: "s in measure",
    note: "Always hard, whatever vowel follows." },
  { l: "З з", name: "зэ", ipa: "[z]", kind: "consonant", like: "z in zoo" },
  { l: "И и", name: "и", ipa: "[i]", kind: "vowel", like: "ee in see",
    note: "Softens the consonant before it." },
  { l: "Й й", name: "и краткое", ipa: "[j]", kind: "consonant", like: "y in boy",
    note: "The short и: a glide, never a syllable of its own." },
  { l: "К к", name: "ка", ipa: "[k]", kind: "consonant", like: "k in skate",
    note: "No puff of air after it, unlike the k in kit." },
  { l: "Л л", name: "эл", ipa: "[ɫ] / [lʲ]", kind: "consonant", like: "ll in pull",
    note: "Hard л is dark, with the tongue low and back." },
  { l: "М м", name: "эм", ipa: "[m]", kind: "consonant", like: "m in map" },
  { l: "Н н", name: "эн", ipa: "[n]", kind: "consonant", like: "n in note", trap: true,
    note: "Looks like H. It is an n." },
  { l: "О о", name: "о", ipa: "[o] / [ɐ]", kind: "vowel", like: "o in more",
    note: "Only when stressed. Unstressed it slides toward a." },
  { l: "П п", name: "пэ", ipa: "[p]", kind: "consonant", like: "p in spot",
    note: "No puff of air, unlike the p in pot." },
  // Spanish perro, not pero: pero is a single tap and perro is the trill, and
  // that pair is the one every Spanish learner knows. Hard Russian р is the trill.
  { l: "Р р", name: "эр", ipa: "[r]", kind: "consonant", like: "the rolled r of Spanish perro",
    trap: true, note: "Looks like P. It is a tapped or rolled r." },
  { l: "С с", name: "эс", ipa: "[s]", kind: "consonant", like: "s in sun", trap: true,
    note: "Looks like C. It is always an s, never a k." },
  { l: "Т т", name: "тэ", ipa: "[t]", kind: "consonant", like: "t in stop",
    note: "No puff of air, unlike the t in top." },
  { l: "У у", name: "у", ipa: "[u]", kind: "vowel", like: "oo in boot", trap: true,
    note: "Looks like Y. It is an oo." },
  { l: "Ф ф", name: "эф", ipa: "[f]", kind: "consonant", like: "f in fun" },
  { l: "Х х", name: "ха", ipa: "[x]", kind: "consonant", like: "ch in Scottish loch",
    trap: true, note: "Looks like X. It is a breathy kh from the back of the mouth." },
  { l: "Ц ц", name: "цэ", ipa: "[ts]", kind: "consonant", like: "ts in cats",
    note: "One sound, and always hard." },
  { l: "Ч ч", name: "че", ipa: "[tɕ]", kind: "consonant", like: "ch in cheese",
    note: "Always soft, whatever vowel follows." },
  { l: "Ш ш", name: "ша", ipa: "[ʂ]", kind: "consonant", like: "sh in should",
    note: "Hard: the tongue pulls back. Compare щ." },
  { l: "Щ щ", name: "ща", ipa: "[ɕː]", kind: "consonant", like: "sh in ship, longer",
    note: "Soft and held: the tongue rides up to the palate. Compare ш." },
  { l: "Ъ ъ", name: "твёрдый знак", ipa: "—", kind: "sign", like: "no sound of its own",
    note: "The hard sign: keeps the consonant hard and inserts a y-glide before the vowel." },
  { l: "Ы ы", name: "ы", ipa: "[ɨ]", kind: "vowel", like: "no English equivalent",
    note: "Say ee, then pull the tongue straight back without rounding the lips." },
  { l: "Ь ь", name: "мягкий знак", ipa: "—", kind: "sign", like: "no sound of its own",
    note: "The soft sign: softens the consonant before it." },
  // [ɛ] rather than [e]: the comparison is "e in met", and the vowel chart puts
  // it open-mid, so the narrow symbol is the honest one.
  { l: "Э э", name: "э", ipa: "[ɛ]", kind: "vowel", like: "e in met" },
  { l: "Ю ю", name: "ю", ipa: "[ju] / [u]", kind: "vowel", like: "u in use" },
  { l: "Я я", name: "я", ipa: "[ja] / [a]", kind: "vowel", like: "ya in yard" },
];

/* The five pairs. Same vowel sound in each pair; what differs is the consonant
   in front of it — hard on the left, soft on the right. Russian spelling never
   makes you guess which: the vowel letter is the instruction. */
export const VOWEL_PAIRS = [
  { hard: "а", soft: "я", sound: "[a]", example: ["мать", "мять"], gloss: ["mother", "to crumple"] },
  { hard: "о", soft: "ё", sound: "[o]", example: ["нос", "нёс"], gloss: ["nose", "he carried"] },
  { hard: "э", soft: "е", sound: "[e]", example: ["сэр", "сер"], gloss: ["sir", "grey"] },
  { hard: "у", soft: "ю", sound: "[u]", example: ["лук", "люк"], gloss: ["onion", "hatch"] },
  { hard: "ы", soft: "и", sound: "[i] / [ɨ]", example: ["мы", "ми"], gloss: ["we", "mi (the note)"] },
];

/* Where each vowel is made, for the chart: `x` runs front (0) to back (1) with
   the tongue, `y` runs close (0) to open (1) with the jaw. The owner learned
   Russian vowels off a chart like this and asked for it by name — how far open
   the mouth is, and whether the sound sits at the front or the back. */
export const VOWEL_CHART = [
  { v: "и", ipa: "[i]", x: 0.05, y: 0.05, like: "ee in see" },
  { v: "ы", ipa: "[ɨ]", x: 0.5, y: 0.1, like: "ee pulled back" },
  { v: "у", ipa: "[u]", x: 0.95, y: 0.05, like: "oo in boot", round: true },
  { v: "э", ipa: "[e]", x: 0.1, y: 0.55, like: "e in met" },
  { v: "о", ipa: "[o]", x: 0.9, y: 0.5, like: "o in more", round: true },
  { v: "а", ipa: "[a]", x: 0.5, y: 0.95, like: "a in father" },
];

/* Sounds worth a word of warning the first time a learner meets one, keyed by
   the letter. Shown on the vocabulary card, one line, never a lecture. */
const TIP = {};
for (const row of LETTERS) {
  const bare = row.l.split(" ")[1];
  if (row.trap) TIP[bare] = `${bare} is ${row.like.replace(/^the /, "")}, not the Latin letter it looks like`;
}
TIP["ы"] = "ы: say ee, then pull the tongue back without rounding your lips";
TIP["щ"] = "щ is a long soft sh, further forward than ш";
TIP["ж"] = "ж is the s in measure";
TIP["ц"] = "ц is one sound, the ts in cats";
TIP["ё"] = "ё is always the stressed syllable";

/* The first tip a word earns, or null. Order matters: the false friends come
   first because they are what stops a beginner reading at all. */
export const TIP_ORDER = ["в", "н", "р", "с", "у", "х", "ы", "щ", "ж", "ц", "ё"];

export function soundTip(word) {
  const w = (word || "").toLowerCase();
  for (const letter of TIP_ORDER) {
    if (w.includes(letter)) return TIP[letter];
  }
  return null;
}

export const TRAPS = LETTERS.filter((x) => x.trap);

/* ------------------------------------------------- minimal pairs (P10.8) */

/* Two real words that differ by one sound. Hearing a contrast and producing it
   are different skills, and the reference screen only ever offered the first —
   the owner asked for practice as well as a chart.
 *
 * Consonant contrasts, chosen for what actually goes wrong for an English
 * speaker: the two sounds English does not distinguish (ш/щ), the two it does
 * not have as a pair (hard and soft л, т), the voiced/voiceless pairs a
 * final-devoicing language keeps confusing, and р against л because р is a trap
 * letter that also has to be tapped.
 *
 * Every word here is checked by `core.test.mjs` against the shipped dictionary:
 * a minimal pair invented by an author who is not a native speaker is the exact
 * failure §30a exists to prevent, and a pair whose members are not both real
 * words teaches a wrong word alongside a right one. */
export const CONTRASTS = [
  { a: "чаша", b: "чаща", gloss: ["bowl", "thicket"],
    about: "ш and щ. щ is longer and further forward, tongue flat against the ridge behind the teeth." },
  { a: "жар", b: "шар", gloss: ["heat", "ball"],
    about: "ж and ш are the same mouth, voiced and voiceless: ж is the s in measure." },
  { a: "бар", b: "пар", gloss: ["bar", "steam"],
    about: "б and п. Russian п has no puff of air after it, unlike the English p." },
  { a: "дом", b: "том", gloss: ["house", "volume"],
    about: "д and т, tongue against the teeth rather than the ridge behind them." },
  { a: "роза", b: "роса", gloss: ["rose", "dew"],
    about: "з and с between vowels, where English often blurs the two." },
  { a: "рак", b: "лак", gloss: ["crayfish", "varnish"],
    about: "р is tapped against the ridge; л is heavy, with the back of the tongue raised." },
  { a: "мел", b: "мель", gloss: ["chalk", "shoal"],
    about: "Hard and soft л. The soft one is said with the tongue arched towards the roof." },
  { a: "брат", b: "брать", gloss: ["brother", "to take"],
    about: "Hard and soft т. The soft sign is not a sound of its own; it bends the letter before it." },
];

/* A pair member that is a real word but not a dictionary headword, with the
   lemma it belongs to. The dictionary ships headwords only (§30), so the check
   that keeps these honest cannot see an inflected form — and ё barely occurs in
   a nominal stem, so almost every о/ё minimal pair in the language is a past
   tense against a noun. Naming the lemma keeps the guard real: an invented word
   still has nowhere to hide, because its lemma would not resolve either. */
export const NOT_HEADWORD = {
  "нёс": "нести",              // he carried — past of нести
};

/* The vowel pairs and the consonant contrasts as one list, in the shape the
   drill uses. A vowel pair already carries its own example words. */
export function soundPairs() {
  const vowels = VOWEL_PAIRS.map((p) => ({
    a: p.example[0], b: p.example[1], gloss: p.gloss,
    about: `${p.hard} and ${p.soft} are one sound, ${p.sound}. The pair says whether the consonant`
           + ` before it is hard or soft.`,
    kind: "vowel",
  }));
  return vowels.concat(CONTRASTS.map((c) => ({ ...c, kind: "consonant" })));
}

/* The lemma a pair member should be looked up under. */
export const pairLemma = (w) => NOT_HEADWORD[w] || w;

/* A run of the pronunciation drill: hear a contrast, then produce it.
 *
 * The two alternate, and hearing comes first for a given pair, because being
 * told your own attempt was wrong before you have heard what right sounds like
 * is not practice. No pair repeats until every one has been used.
 *
 * These questions carry no lemma indices. That is deliberate: pronunciation is
 * not vocabulary, and a drill on «чаша» should not put «чаша» into the
 * scheduler as a word the learner is studying. */
export function pairDrill(n = 10) {
  const bag = shuffle(soundPairs().slice());
  const out = [];
  for (let k = 0; out.length < n; k++) {
    const p = bag[Math.floor(k / 2) % bag.length];
    const flip = Math.random() < 0.5;
    const target = flip ? p.b : p.a;
    const other = flip ? p.a : p.b;
    const gloss = flip ? p.gloss[1] : p.gloss[0];
    const otherGloss = flip ? p.gloss[0] : p.gloss[1];
    out.push(k % 2 === 0
      ? {
          kind: "pair-hear", ask: "Which word did you hear?", prompt: "", cyr: true,
          autoplay: target, target, other, about: p.about, contrast: p.kind,
          options: shuffle([
            { label: target, right: true, cyr: true, sub: gloss },
            { label: other, right: false, cyr: true, sub: otherGloss },
          ]),
        }
      : {
          kind: "pair-say", ask: "Say this word", prompt: target, sub: gloss, cyr: true,
          target, other, otherGloss, about: p.about, contrast: p.kind,
        });
  }
  return out;
}

/* Where two words of a pair differ, as a character index, or -1 when they do
   not differ by exactly one position. A soft sign added at the end counts: it
   is one sound's worth of difference even though it lengthens the word. */
export function pairDiff(a, b) {
  if (a === b) return -1;
  if (b.length === a.length + 1 && b.slice(0, a.length) === a && b.endsWith("ь")) return a.length;
  if (a.length === b.length + 1 && a.slice(0, b.length) === b && a.endsWith("ь")) return b.length;
  if (a.length !== b.length) return -1;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (at >= 0) return -1;
    at = i;
  }
  return at;
}
