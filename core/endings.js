/* How word endings are said (2026-09-28).
 *
 * The owner: *"I'd like to have demos of how word endings are pronounced…
 * there are a lot of vowel pairs or letter pairs at the ends of words that
 * have distinct sounds that are not necessarily intuitive. Sort in order of
 * frequency… Try and capture a complete list of all those types of
 * terminations. One button will pronounce the termination. The other area
 * will have maybe 3 examples of each."*
 *
 * Hand-authored, beside core/alphabet.js, and for the same reason: the
 * lexicon knows how a word is *spelled* in every form and knows nothing about
 * how it is *said*. Nothing in the pipeline could tell you that «но́вого» is
 * said «но́вово».
 *
 * **Why the examples are chosen by hand and only the order is measured.**
 * The obvious build — take the commonest words ending in -ого — teaches the
 * rule and then plays the counter-example: the single commonest word in the
 * app's sentences ending in -ого is «мно́го», and its г is a real г. The -ого
 * rule belongs to an *ending*, and «много», «до́рого», «до́лго» carry those
 * letters in the word itself. Spelling cannot tell the two apart, so a
 * generator would be confidently wrong on exactly the words a learner hears
 * most. What the data *can* say honestly is how often each ending turns up,
 * and that is what sorts the list (`rankEndings`).
 *
 * Every entry:
 *   end       the ending as the learner sees it written
 *   re        what counts as that ending, for the frequency count
 *   sounds    what it sounds like, respelled in Cyrillic
 *   say       what the ending's own button speaks — a pronounceable syllable,
 *             never a bare consonant or a sign (§30ap: a TTS engine handed «ь»
 *             reads out the name of the letter)
 *   rule      one sentence, why
 *   note      optional: the exception worth knowing
 *   examples  three real words that follow the rule, stress marked
 *
 * `checkEndings()` holds the shape; core.test.mjs checks every example
 * against the lexicon and against its own ending.
 */

export const RULE_WORDS = 18;
export const NOTE_WORDS = 14;

export const ENDINGS = [
  {
    id: "ogo", end: "-ого, -его", re: /(ого|его)$/, sounds: "-ово, -ево", say: "ово",
    rule: "In this ending the г is said as в.",
    note: "Also in сего́дня. Not in мно́го or до́рого, where it belongs to the word.",
    examples: ["его́", "ничего́", "но́вого"],
  },
  {
    id: "tsa", end: "-ться, -тся", re: /(ться|тся)$/, sounds: "-ца", say: "ца",
    rule: "Both spellings are said the same way: one short ц.",
    examples: ["учи́ться", "у́чится", "нра́вится"],
  },
  {
    id: "o", end: "-о, no stress", re: /[^аеёиоуыэюя]о$/, sounds: "-а", say: "а",
    rule: "An о without the stress is said like a short а.",
    note: "Only a stressed о sounds like о.",
    examples: ["сло́во", "ле́то", "у́тро"],
  },
  {
    id: "a", end: "-а, -я, no stress", re: /[^аеёиоуыэюя][ая]$/, sounds: "a short «uh»", say: "а",
    rule: "Unstressed at the end, а and я shrink to a quick, neutral uh.",
    examples: ["кни́га", "ко́мната", "неде́ля"],
  },
  {
    id: "e", end: "-е, no stress", re: /[^аеёиоуыэюя]е$/, sounds: "-и", say: "и",
    rule: "An unstressed е at the end of a word is said close to и.",
    examples: ["мо́ре", "по́ле", "до́ме"],
  },
  {
    id: "ae", end: "-ает, -ают, -ует", re: /(ает|ают|ует|уют|яет|яют)$/, sounds: "-айет, -айут", say: "ает",
    rule: "After a vowel, е, ю and я begin with a y sound.",
    examples: ["де́лает", "чита́ют", "зна́ет"],
  },
  {
    id: "ov", end: "-ов, -ев", re: /(ов|ев)$/, sounds: "-оф, -еф", say: "оф",
    rule: "A в at the very end of a word is said as ф.",
    examples: ["часо́в", "столо́в", "городо́в"],
  },
  {
    id: "yj", end: "-ый, -ий", re: /(ый|ий)$/, sounds: "-ый, -ий", say: "ый",
    rule: "One syllable, not two: a short vowel gliding into й.",
    examples: ["но́вый", "си́ний", "ру́сский"],
  },
  {
    id: "oe", end: "-ое, -ее", re: /(ое|ее)$/, sounds: "-айа, -ийа", say: "ая",
    rule: "Unstressed, the first vowel shrinks: но́вое ends almost like но́вая.",
    examples: ["но́вое", "пе́рвое", "хоро́шее"],
  },
  {
    id: "aya", end: "-ая, -яя", re: /(ая|яя)$/, sounds: "-айа", say: "ая",
    rule: "Two quick syllables with a y between them; the first is barely there.",
    examples: ["но́вая", "пе́рвая", "си́няя"],
  },
  {
    id: "oj", end: "-ой, -ей, no stress", re: /(ой|ей)$/, sounds: "-ай, -ий", say: "ай",
    rule: "Unstressed, the о of -ой shrinks: кни́гой ends like -ай.",
    note: "Stressed, as in большо́й, it keeps its о.",
    examples: ["кни́гой", "ко́мнатой", "неде́лей"],
  },
  {
    id: "ie", end: "-ие, -ия", re: /(ие|ия)$/, sounds: "-ийе, -ийа", say: "ия",
    rule: "The two vowels are joined by a y: зда́ние is зда-ни-йе.",
    examples: ["зда́ние", "исто́рия", "мне́ние"],
  },
  {
    id: "d", end: "-д", re: /д$/, sounds: "-т", say: "от",
    rule: "A д at the very end of a word is said as т.",
    examples: ["год", "го́род", "сад"],
  },
  {
    id: "g", end: "-г", re: /г$/, sounds: "-к", say: "ок",
    rule: "A г at the very end of a word is said as к.",
    examples: ["друг", "снег", "враг"],
  },
  {
    id: "b", end: "-б", re: /б$/, sounds: "-п", say: "оп",
    rule: "A б at the very end of a word is said as п.",
    examples: ["хлеб", "клуб", "зуб"],
  },
  {
    id: "z", end: "-з", re: /з$/, sounds: "-с", say: "ос",
    rule: "A з at the very end of a word is said as с.",
    examples: ["раз", "глаз", "моро́з"],
  },
  {
    id: "zh", end: "-ж", re: /ж$/, sounds: "-ш", say: "ош",
    rule: "A ж at the very end of a word is said as ш.",
    examples: ["муж", "нож", "эта́ж"],
  },
  {
    id: "t", end: "-ть", re: /ть$/, sounds: "a soft т", say: "ать",
    rule: "The soft sign makes the т soft: tongue flat on the teeth, a hint of y.",
    examples: ["чита́ть", "мать", "жить"],
  },
  {
    id: "esh", end: "-ешь, -ишь", re: /(ешь|ишь|ёшь)$/, sounds: "-еш, -иш", say: "ешь",
    rule: "ш is always hard. The soft sign after it changes nothing you hear.",
    examples: ["де́лаешь", "говори́шь", "идёшь"],
  },
  {
    id: "ch", end: "-чь", re: /чь$/, sounds: "-ч", say: "очь",
    rule: "ч is always soft. The soft sign after it is there only for grammar.",
    examples: ["ночь", "дочь", "помо́чь"],
  },
  {
    id: "ye", end: "-ье, -ья, -ью", re: /(ье|ья|ью|ьё)$/, sounds: "-йе, -йа, -йу", say: "тье",
    rule: "A soft sign before a vowel adds a y: семья́ is сем-йа.",
    examples: ["семья́", "пла́тье", "воскресе́нье"],
  },
  {
    id: "yo", end: "-ё", re: /ё$/, sounds: "-йо, stressed", say: "ё",
    rule: "ё is always stressed. Books often print it as е, so её can look like ее.",
    examples: ["её", "моё", "всё"],
  },
  {
    id: "shi", end: "-жи, -ши", re: /(жи|ши)$/, sounds: "-жы, -шы", say: "ши",
    rule: "ж and ш are always hard, so и after them sounds like ы.",
    examples: ["на́ши", "ножи́", "ва́ши"],
  },
  {
    id: "tsi", end: "-ция, -ции", re: /(ция|ции|цию|цией)$/, sounds: "-цыйа", say: "ция",
    rule: "ц is always hard, so ци sounds like цы.",
    examples: ["ста́нция", "поли́ция", "информа́ция"],
  },
  {
    id: "nn", end: "-нн-", re: /нн[аеёиоуыэюяй]{1,3}$/, sounds: "a long н", say: "анный",
    rule: "A double н is held a moment longer than a single one.",
    examples: ["дли́нный", "ра́нний", "иностра́нный"],
  },
  {
    id: "stn", end: "-стн-", re: /стн[аеёиоуыэюяй]{1,3}$/, sounds: "-сн-", say: "есно",
    rule: "Between с and н, the т is silent.",
    examples: ["че́стно", "изве́стно", "ме́стный"],
  },
  {
    id: "vstv", end: "-вство", re: /вств[а-яё]{1,5}$/, sounds: "-ство", say: "ство",
    rule: "The first в in -вств- is silent.",
    note: "The same silent в is in здра́вствуйте.",
    examples: ["чу́вство", "чу́вства", "чу́вствовать"],
  },
  {
    id: "dts", end: "-дцать, -дц-", re: /дц[аеёиоуыэюя]{0,4}т?ь?$/, sounds: "-цать", say: "цать",
    rule: "дц merges into one ц.",
    examples: ["два́дцать", "три́дцать", "молодцы́"],
  },
  {
    id: "gk", end: "-гк-", re: /г[кч][аеёиоуыэюяй]{1,3}$/, sounds: "-хк-", say: "ахко",
    rule: "Before к or ч, a г is said as х.",
    examples: ["легко́", "мя́гкий", "лёгкий"],
  },
  {
    id: "shchik", end: "-зчик, -дчик, -тчик", re: /(зчик|счик|дчик|тчик)[аеуыом]{0,2}$/, sounds: "-щик, -чик", say: "щик",
    rule: "зч and сч are said as щ; дч and тч as a long ч.",
    examples: ["зака́зчик", "лётчик", "перево́дчик"],
  },
  {
    id: "oyu", end: "-ою, -ею", re: /(ою|ею)$/, sounds: "-ойу", say: "ою",
    rule: "A longer form of -ой and -ей, heard in songs, poems and careful speech.",
    examples: ["мно́ю", "тобо́ю", "собо́ю"],
  },
];

/* The comparison form of a word for counting: lower case, stress marks gone,
   ё kept — `fold()` turns ё into е, and one of the entries is about ё. */
export function norm(word) {
  return String(word || "").normalize("NFD").replace(/[̀́]/g, "")
    .normalize("NFC").toLowerCase();
}

const WORD = /[Ѐ-ӿ̀́]+/g;

/* Each ending with how often it turns up in the given sentences, commonest
   first — the owner's "sort in order of frequency". A word is counted once
   for every time it appears, because what a learner meets is running text,
   not a word list. Ties keep the authored order. */
export function rankEndings(sentences) {
  const counts = new Map(ENDINGS.map((e) => [e.id, 0]));
  for (const s of sentences || []) {
    for (const m of String(s).matchAll(WORD)) {
      const w = norm(m[0]);
      if (w.length < 2) continue;
      for (const e of ENDINGS) if (e.re.test(w)) counts.set(e.id, counts.get(e.id) + 1);
    }
  }
  return ENDINGS.map((e, k) => ({ ...e, count: counts.get(e.id), order: k }))
    .sort((a, b) => b.count - a.count || a.order - b.order);
}

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const VOWELS = /[аеёиоуыэюя]/;

/* The shape gate, and the one rule a past bug wrote: the ending's button
   must say something pronounceable. `known` (optional) answers whether a word
   is in the lexicon. Returns the complaints, empty when sound. */
export function checkEndings(known) {
  const bad = [];
  const ids = new Set();
  for (const e of ENDINGS) {
    if (ids.has(e.id)) bad.push(`two endings with the id ${e.id}`);
    ids.add(e.id);
    if (words(e.rule) > RULE_WORDS) bad.push(`${e.id}: the rule runs to ${words(e.rule)} words`);
    if (e.note && words(e.note) > NOTE_WORDS) bad.push(`${e.id}: the note runs to ${words(e.note)} words`);
    if (!e.say || !VOWELS.test(e.say)) bad.push(`${e.id}: "${e.say}" has no vowel to say`);
    if (/^[ьъ]/.test(e.say || "")) bad.push(`${e.id}: "${e.say}" starts with a sign, which a voice reads by name`);
    if (!e.examples || e.examples.length !== 3) bad.push(`${e.id}: wants three examples`);
    for (const x of e.examples || []) {
      /* An example must carry the ending it illustrates, or the screen is
         pointing at a word that does not show the thing. */
      if (!e.re.test(norm(x))) bad.push(`${e.id}: «${x}» does not end in ${e.end}`);
      if (known && !known(x)) bad.push(`${e.id}: «${x}» is not a word the lexicon knows`);
    }
  }
  return bad;
}
