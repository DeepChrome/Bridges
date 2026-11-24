/* Case triggers: the word in front of a noun that decides its case (the owner,
 * 2026-11-23: *"for learning cases, maybe it's best to look at triggers and
 * example cases… sequenced flashcards that focus on triggers… when you
 * identify the za trigger's a case, you have many many many words and
 * sentences that are eligible there. Sometimes it's specific verbs that are
 * triggers."*). docs/case-cards.md is the framework this serves.
 *
 * A trigger is **one word in one meaning**, not a word: «за» meaning *behind*
 * takes the instrumental and «за» meaning *for* takes the accusative, and they
 * are two triggers, siblings, because telling them apart is the lesson. What
 * settles which one a real sentence holds is the noun's own form — core/
 * questions.js `triggerSightings` keeps only nouns whose form belongs to one
 * case, so the case is read off the table, never guessed from the meaning.
 *
 * Hand-authored beside core/cases.js, and it writes no Russian sentences: a
 * trigger is matched against the corpus, and every sentence a card shows is
 * attested. The Russian here is only the trigger words themselves, folded,
 * which core.test.mjs checks against the lexicon.
 *
 *   words  the trigger as it stands before the noun (prepositions, counting
 *          words), folded
 *   verbs  the verbs, as folded lemmas, aspect partners together
 *   gov    what kind of word governs: "verb" for any verb not named by a verb
 *          trigger of the same case (the plain object), "noun" for a noun
 *   when   "time" or "place": a meaning that turns on the noun (в субботу is
 *          a day, в школу a place), read against TIME_WORDS
 *   case   the case, as core/cases.js names it
 *   en     the meaning, short: it is the front of a card
 *   ask    the question the case answers here
 */

import { CASES } from "./cases.js";

export const TRIGGERS = [
  // ----------------------------------------------------------- prepositional
  { id: "v-where", words: ["в", "во"], when: "place", case: "prepositional", en: "in (where)", ask: "где?" },
  { id: "na-where", words: ["на"], when: "place", case: "prepositional", en: "on, at (where)", ask: "где?" },
  { id: "v-when-prep", words: ["в", "во"], when: "time", case: "prepositional", en: "in (a month, a year)", ask: "когда?" },
  { id: "o", words: ["о", "об", "обо"], case: "prepositional", en: "about", ask: "о ком? о чём?" },
  { id: "pri", words: ["при"], case: "prepositional", en: "in the presence of, under", ask: "при ком? при чём?" },
  // -------------------------------------------------------------- accusative
  { id: "object", gov: "verb", case: "accusative", en: "a verb's object", ask: "кого? что?" },
  { id: "v-to", words: ["в", "во"], when: "place", case: "accusative", en: "into, to (where to)", ask: "куда?" },
  { id: "na-to", words: ["на"], when: "place", case: "accusative", en: "onto, to (where to)", ask: "куда?" },
  { id: "v-when-acc", words: ["в", "во"], when: "time", case: "accusative", en: "on (a day), at (an hour)", ask: "когда?" },
  { id: "za-acc", words: ["за"], case: "accusative", en: "for; behind (going); within (time)", ask: "за что? куда?" },
  { id: "cherez", words: ["через"], case: "accusative", en: "through, across; in (time)", ask: "через что?" },
  { id: "pro", words: ["про"], case: "accusative", en: "about", ask: "про кого? про что?" },
  // --------------------------------------------------------------- genitive
  { id: "of", gov: "noun", case: "genitive", en: "of (a noun after a noun)", ask: "кого? чего?" },
  { id: "net", words: ["нет"], case: "genitive", en: "there is no", ask: "кого? чего?" },
  { id: "many", words: ["много", "мало", "сколько", "несколько", "немного"], case: "genitive", en: "a lot of, few, how many", ask: "сколько?" },
  { id: "two-four", words: ["два", "две", "три", "четыре", "оба"], case: "genitive", en: "two, three, four (singular)", ask: "сколько?" },
  { id: "five-up", words: ["пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать",
                           "пятнадцать", "двадцать", "тридцать", "сорок", "пятьдесят", "сто", "двести",
                           "триста", "пятьсот"], case: "genitive", en: "five and up (plural)", ask: "сколько?" },
  { id: "iz", words: ["из"], case: "genitive", en: "from, out of", ask: "откуда?" },
  { id: "ot", words: ["от"], case: "genitive", en: "from (a person), away from", ask: "от кого? от чего?" },
  { id: "u", words: ["у"], case: "genitive", en: "at someone's, by; has", ask: "у кого?" },
  { id: "dlya", words: ["для"], case: "genitive", en: "for", ask: "для кого?" },
  { id: "bez", words: ["без"], case: "genitive", en: "without", ask: "без кого? без чего?" },
  { id: "do", words: ["до"], case: "genitive", en: "until, before, as far as", ask: "до чего?" },
  { id: "posle", words: ["после"], case: "genitive", en: "after", ask: "после чего?" },
  { id: "okolo", words: ["около", "возле"], case: "genitive", en: "near, about", ask: "около чего?" },
  { id: "krome", words: ["кроме"], case: "genitive", en: "except", ask: "кроме кого?" },
  { id: "protiv", words: ["против"], case: "genitive", en: "against", ask: "против кого?" },
  { id: "vokrug", words: ["вокруг"], case: "genitive", en: "around", ask: "вокруг чего?" },
  { id: "s-gen", words: ["с", "со"], case: "genitive", en: "from, off; since", ask: "откуда? с какого?" },
  { id: "boyatsya", verbs: ["бояться", "испугаться"], case: "genitive", en: "to be afraid of", ask: "кого? чего?" },
  { id: "zhdat-gen", verbs: ["ждать", "подождать"], case: "genitive", en: "to wait for (something abstract)", ask: "чего?" },
  { id: "dostigat", verbs: ["достигать", "достичь", "добиваться", "добиться"], case: "genitive", en: "to reach, to achieve", ask: "чего?" },
  { id: "izbegat", verbs: ["избегать", "избежать"], case: "genitive", en: "to avoid", ask: "кого? чего?" },
  { id: "trebovat", verbs: ["требовать", "потребовать", "желать", "пожелать"], case: "genitive", en: "to demand, to wish", ask: "чего?" },
  // ----------------------------------------------------------------- dative
  { id: "k", words: ["к", "ко"], case: "dative", en: "towards, to someone's", ask: "к кому? к чему?" },
  { id: "po", words: ["по"], case: "dative", en: "along, around; by phone; on Mondays", ask: "по чему?" },
  { id: "nado", preds: ["надо", "нужно", "нужен", "нужна", "нужны", "можно", "нельзя", "пора", "жаль",
                        "холодно", "жарко", "скучно", "интересно", "трудно", "легко", "страшно", "стыдно", "лень"],
    case: "dative", en: "needs, may, must; feels (impersonal)", ask: "кому?" },
  { id: "pomogat", verbs: ["помогать", "помочь"], case: "dative", en: "to help", ask: "кому?" },
  { id: "zvonit", verbs: ["звонить", "позвонить"], case: "dative", en: "to call (someone)", ask: "кому?" },
  { id: "nravitsya", verbs: ["нравиться", "понравиться"], case: "dative", en: "to be liked by", ask: "кому?" },
  { id: "davat", verbs: ["давать", "дать", "отдавать", "отдать", "дарить", "подарить", "показывать", "показать",
                     "покупать", "купить", "приносить", "принести", "посылать", "послать", "присылать", "прислать"],
    case: "dative", en: "to give, show, buy (to someone)", ask: "кому?" },
  { id: "govorit", verbs: ["говорить", "сказать", "рассказывать", "рассказать", "писать", "написать",
                       "отвечать", "ответить", "объяснять", "объяснить", "обещать", "пообещать"],
    case: "dative", en: "to tell, write, answer (someone)", ask: "кому?" },
  { id: "meshat", verbs: ["мешать", "помешать", "верить", "поверить", "советовать", "посоветовать",
                      "улыбаться", "улыбнуться", "радоваться", "обрадоваться", "принадлежать"],
    case: "dative", en: "to bother, believe, advise, smile at", ask: "кому? чему?" },
  // ----------------------------------------------------------- instrumental
  { id: "s-instr", words: ["с", "со"], case: "instrumental", en: "with, together with", ask: "с кем? с чем?" },
  { id: "za-instr", words: ["за"], case: "instrumental", en: "behind; after (follow); to fetch", ask: "где? за чем?" },
  { id: "pod", words: ["под"], case: "instrumental", en: "under", ask: "где?" },
  { id: "nad", words: ["над"], case: "instrumental", en: "above, over", ask: "где? над чем?" },
  { id: "pered", words: ["перед"], case: "instrumental", en: "in front of, before", ask: "где? перед чем?" },
  { id: "mezhdu", words: ["между"], case: "instrumental", en: "between", ask: "между чем?" },
  { id: "zanimatsya", verbs: ["заниматься", "заняться", "увлекаться", "увлечься", "интересоваться", "заинтересоваться"],
    case: "instrumental", en: "to do; be into, interested in", ask: "чем?" },
  { id: "polzovatsya", verbs: ["пользоваться", "воспользоваться", "управлять", "владеть", "гордиться"],
    case: "instrumental", en: "to use, manage, own, be proud of", ask: "чем?" },
  { id: "stat", verbs: ["стать", "становиться", "работать", "быть", "являться", "оказаться", "казаться",
                    "считаться", "остаться", "оставаться"],
    case: "instrumental", en: "to become, work as, be", ask: "кем? чем?" },
];

/* Nouns that make «в» a time rather than a place: «в субботу» is a day and
   «в январе́» a month. A where/where-to trigger passes them over; a time
   trigger takes only them. Folded lemmas. */
export const TIME_WORDS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье",
  "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь",
  "декабрь", "год", "час", "минута", "секунда", "момент", "время", "век", "неделя", "день", "вечер", "утро",
  "ночь", "детство", "прошлое", "будущее", "начало", "конец", "выходные"];

/* The order new triggers are met in (docs/case-cards.md): «в» and «на» for
   where and then for where to come first, since telling those apart is the
   first thing every course teaches about cases; then the commonest trigger of
   each case in turn, the case modules' order; the rare ones last. Every id
   once (checkTriggers). */
export const TEACH_ORDER = [
  "v-where", "na-where", "v-to", "na-to", "object", "o", "u", "net", "s-instr", "k", "nado", "po",
  "iz", "dlya", "bez", "stat", "nravitsya", "pomogat", "za-instr", "za-acc", "many", "two-four", "five-up",
  "of", "ot", "s-gen", "do", "posle", "v-when-acc", "v-when-prep", "govorit", "davat", "pod", "nad", "pered",
  "mezhdu", "zanimatsya", "polzovatsya", "cherez", "pri", "boyatsya", "meshat", "zvonit", "okolo", "protiv",
  "pro", "krome", "vokrug", "zhdat-gen", "dostigat", "izbegat", "trebovat",
];

export const triggerById = (id) => TRIGGERS.find((x) => x.id === id) || null;

/* Three kinds, for the options sheet and the list: the prepositions, the
   verbs (and «на́до», and a verb's plain object), and the counting words with
   «нет» and the noun that owns another. */
export const TRIGGER_KINDS = [
  { id: "prep", name: "Prepositions" },
  { id: "verb", name: "Verbs" },
  { id: "count", name: "Counting, нет, of" },
];
const PREP_WORDS = new Set(["в", "во", "на", "о", "об", "обо", "из", "от", "у", "для", "без", "до", "после",
  "около", "возле", "кроме", "против", "вокруг", "к", "ко", "по", "с", "со", "за", "под", "над", "перед",
  "между", "через", "про", "при"]);
export function triggerKind(x) {
  if (x.verbs || x.preds || x.gov === "verb") return "verb";
  // A trigger with no words of its own («of», a noun after a noun) is not a
  // preposition: `[].every` is true, and the meaning maker then read x.words.
  if (x.words && x.words.length && x.words.every((w) => PREP_WORDS.has(w))) return "prep";
  return "count";
}

/* The case a trigger takes, as core/cases.js holds it: its id, display name,
   and the row name of a declension table. */
const caseOfTrigger = (x) => CASES.find((c) => c.id === x.case) || null;

/* The other meanings of the same word: «за» behind against «за» for. A verb
   trigger has none — a verb that takes two cases is two triggers only where
   the meaning really changes (ждать), and those share a verb, not a word. */
export function siblingsOf(x) {
  if (!x) return [];
  const mine = new Set(x.words || x.verbs || x.preds || []);
  return TRIGGERS.filter((y) => y !== x && y.case !== x.case &&
    (y.words || y.verbs || y.preds || []).some((w) => mine.has(w)));
}

/* The shape the catalogue promises: an id once, a case that exists, one way to
   recognise it, a meaning short enough for the front of a card. */
export const EN_WORDS = 7;
export function checkTriggers() {
  const errors = [];
  const ids = new Set();
  for (const x of TRIGGERS) {
    if (ids.has(x.id)) errors.push(`${x.id}: listed twice`);
    ids.add(x.id);
    if (!caseOfTrigger(x)) errors.push(`${x.id}: no case "${x.case}"`);
    const ways = [x.words, x.verbs, x.gov, x.preds].filter(Boolean).length;
    if (ways !== 1) errors.push(`${x.id}: wants exactly one of words, verbs, preds, gov`);
    if (x.preds && x.case !== "dative" && x.case !== "instrumental") errors.push(`${x.id}: preds are read only for the dative and instrumental`);
    if (x.en.trim().split(/\s+/).length > EN_WORDS) errors.push(`${x.id}: meaning over ${EN_WORDS} words`);
    if (!x.ask) errors.push(`${x.id}: no question word`);
    if (x.when && !x.words) errors.push(`${x.id}: "when" needs words`);
  }
  const order = new Set(TEACH_ORDER);
  if (order.size !== TEACH_ORDER.length) errors.push("TEACH_ORDER lists an id twice");
  for (const x of TRIGGERS) if (!order.has(x.id)) errors.push(`${x.id}: not in TEACH_ORDER`);
  for (const id of TEACH_ORDER) if (!ids.has(id)) errors.push(`TEACH_ORDER: no trigger "${id}"`);
  // Two triggers on the same word and case would split one meaning's sentences.
  for (const a of TRIGGERS) for (const b of TRIGGERS) {
    if (a.id >= b.id || a.case !== b.case || (a.when || "") !== (b.when || "")) continue;
    const shared = (a.words || a.verbs || []).filter((w) => (b.words || b.verbs || []).includes(w));
    if (shared.length) errors.push(`${a.id}/${b.id}: share ${shared.join(", ")} in one case`);
  }
  return errors;
}
