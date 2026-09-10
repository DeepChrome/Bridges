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
  { l: "Р р", name: "эр", ipa: "[r]", kind: "consonant", like: "the rolled r of Spanish pero",
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
  { l: "Э э", name: "э", ipa: "[e]", kind: "vowel", like: "e in met" },
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
