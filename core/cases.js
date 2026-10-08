/* The case modules (the owner, 2026-10-08): one case at a time, in order, each
 * taught through the situations that call for it — *"Focus on teaching them
 * what situations call for which cases… It's important not to just drill them
 * with all of the cases at once. Hit them in a logical sequence."*
 *
 * Hand-authored teaching content, beside core/grammar.js: the lexicon knows
 * that «Москве́» is the prepositional of «Москва», and does not know that the
 * reason it is in that form is the «в» in front of it meaning *where*.
 *
 * A case is taught as its **uses**. Each use is one situation the learner can
 * recognise in a sentence — usually the word in front of the noun — with one
 * sentence saying when, and two examples. `triggers` are the words that call
 * for the use, folded; core/questions.js reads them to sort real sentences
 * from the corpus into uses, so a drill on "в meaning where" is a drill on
 * sentences that have «в» meaning where in them. A use with no trigger
 * (`verb`, `noun`, `none`) is recognised by what kind of word comes before.
 *
 * The order is the order courses teach them in (docs/grammar-sequence.md):
 * prepositional (where, about), accusative (the object, where to), genitive
 * (of, absence, amounts), dative (to whom), instrumental (with, as). The
 * nominative is the starting point every module assumes, not a module.
 *
 * `stage` is the chapter whose spine carries the module as a lesson step
 * (0-based): the prepositional and accusative modules sit in the chapters whose
 * cards introduce them (5 and 6), and the other three follow, one a chapter.
 */

export const CASES = [
  {
    id: "prepositional", row: "Prepositional", name: "Prepositional", stage: 4,
    intro: "Where something is, and what it is about. It always follows a preposition, and most nouns end in -е.",
    uses: [
      {
        id: "where", label: "в or на: where something is", triggers: ["в", "во", "на"],
        body: "After в (in) and на (on, at) when the question is где — where.",
        examples: [["Я живу́ в Москве́.", "I live in Moscow."], ["Кни́га на столе́.", "The book is on the table."]],
      },
      {
        id: "about", label: "о: what it is about", triggers: ["о", "об", "обо"],
        body: "After о (об before a vowel): talking, thinking, reading or writing about something.",
        examples: [["Мы говори́м о рабо́те.", "We are talking about work."], ["Он ду́мает о семье́.", "He is thinking about his family."]],
      },
    ],
  },
  {
    id: "accusative", row: "Accusative", name: "Accusative", stage: 5,
    intro: "The thing a verb is done to, and where something is going. Feminine -а becomes -у, -я becomes -ю; most masculine things stay as they are.",
    uses: [
      {
        id: "object", label: "The thing the verb acts on", triggers: [], after: "verb",
        body: "What you see, want, read, buy or love — the direct object, with no preposition.",
        examples: [["Я чита́ю кни́гу.", "I am reading a book."], ["Она́ лю́бит ма́му.", "She loves her mom."]],
      },
      {
        id: "to", label: "в or на: where to", triggers: ["в", "во", "на"],
        body: "After в and на when the question is куда — where to: going, putting, looking into.",
        examples: [["Я иду́ в шко́лу.", "I am going to school."], ["Мы е́дем на рабо́ту.", "We are going to work."]],
      },
    ],
  },
  {
    id: "genitive", row: "Genitive", name: "Genitive", stage: 6,
    intro: "Of, belonging to, missing, and how much. It has more jobs than any other case.",
    uses: [
      {
        id: "of", label: "Of, or belonging to", triggers: [], after: "noun",
        body: "A noun after another noun says whose it is, or what it is of.",
        examples: [["кни́га бра́та", "my brother's book"], ["центр го́рода", "the city center"]],
      },
      {
        id: "absence", label: "нет: something missing", triggers: ["нет"],
        body: "After нет, не́ было and не бу́дет, the thing that is not there.",
        examples: [["У меня́ нет вре́мени.", "I have no time."], ["Здесь нет воды́.", "There is no water here."]],
      },
      {
        id: "amount", label: "How much or how many",
        triggers: ["много", "мало", "сколько", "несколько", "немного", "два", "две", "три", "четыре",
                   "пять", "шесть", "семь", "восемь", "девять", "десять", "сто"],
        body: "After мно́го, ма́ло, ско́лько and numbers: singular after 2, 3, 4; plural from 5.",
        examples: [["мно́го рабо́ты", "a lot of work"], ["два часа́", "two hours"]],
      },
      {
        id: "from", label: "из, от, у, для, без, до, после",
        triggers: ["из", "от", "у", "для", "без", "до", "после", "около", "кроме", "против", "вокруг"],
        body: "After these prepositions: from, by, for, without, until, after, near.",
        examples: [["Я из Москвы́.", "I am from Moscow."], ["пода́рок для ма́мы", "a present for mom"]],
      },
    ],
  },
  {
    id: "dative", row: "Dative", name: "Dative", stage: 7,
    intro: "The person something is given, said or shown to — and the person who likes, needs or feels something.",
    uses: [
      {
        id: "person", label: "To or for a person", triggers: [], after: "none",
        body: "With no preposition: who you give, say, show or call to, and who likes or needs something.",
        examples: [["Я звоню́ ма́ме.", "I am calling mom."], ["Ма́ме нра́вится фильм.", "Mom likes the film."]],
      },
      {
        id: "towards", label: "к: towards, to someone's place", triggers: ["к", "ко"],
        body: "After к: going towards something, or to a person — to the doctor's, to a friend's.",
        examples: [["Я иду́ к врачу́.", "I am going to the doctor's."], ["Подойди́ к окну́.", "Come over to the window."]],
      },
      {
        id: "along", label: "по: along, by, on", triggers: ["по"],
        body: "After по: along a street, around a city, and by phone, by radio, on TV.",
        examples: [["Мы гуля́ем по у́лице.", "We are walking along the street."], ["Он говори́т по телефо́ну.", "He is talking on the phone."]],
      },
    ],
  },
  {
    id: "instrumental", row: "Instrumental", name: "Instrumental", stage: 8,
    intro: "With, by means of, and what someone is or becomes. Most nouns end in -ом or -ой.",
    uses: [
      {
        id: "with", label: "с: together with", triggers: ["с", "со"],
        body: "After с meaning with: who you are with, and what comes with something.",
        examples: [["Я иду́ с бра́том.", "I am going with my brother."], ["чай с молоко́м", "tea with milk"]],
      },
      {
        id: "as", label: "Works as, became, was", triggers: [], after: "as",
        body: "After рабо́тать, стать and был: what someone works as, became or was.",
        examples: [["Он рабо́тает врачо́м.", "He works as a doctor."], ["Она́ ста́ла учи́тельницей.", "She became a teacher."]],
      },
      {
        /* Not за: «за лека́рством» is "to fetch the medicine", and a drill
           filing it under "behind" would teach the wrong reading. */
        id: "position", label: "под, над, перед, между",
        triggers: ["под", "над", "перед", "между"],
        body: "After these prepositions: under, above, in front of or before, between.",
        examples: [["Кот под столо́м.", "The cat is under the table."], ["Маши́на пе́ред до́мом.", "The car is in front of the house."]],
      },
      {
        id: "means", label: "After a verb: the tool, or пользоваться", triggers: [], after: "verb",
        body: "With no preposition after a verb: what something is done with, and after пользоваться, заниматься, интересоваться.",
        examples: [["Я пишу́ ру́чкой.", "I write with a pen."], ["Он занима́ется спо́ртом.", "He does sport."]],
      },
    ],
  },
];

/* The verbs whose complement is a role in the instrumental (`as`). Folded
   lemmas, matched on the verb before the noun. */
export const AS_VERBS = ["быть", "стать", "становиться", "работать", "являться", "оказаться", "казаться",
  "считаться", "остаться", "оставаться"];

/* Set phrases a preposition makes with a noun, which a learner should not be
   taught as the preposition's ordinary meaning: «к сожале́нию» is
   "unfortunately", not "towards regret"; «в тече́ние» and «в слу́чае» are
   prepositions of their own. Folded, the words as they stand together. */
export const SET_PHRASES = ["к сожалению", "к счастью", "в течение", "в случае", "в качестве", "в виде",
  "в результате", "в том числе", "в конце концов", "на самом деле", "в самом деле", "по крайней мере",
  "в общем", "в основном", "в целом", "в частности", "в связи", "в отличие", "по сравнению", "по поводу",
  "в зависимости", "на основе", "в рамках", "в пользу", "в силу", "в ходе", "с помощью", "по мнению"];

/* Words that say *when*, not where: «в феврале́» and «на неде́ле» are a time.
   A where/to use passes them over rather than teaching them as places. */
export const TIME_NOUNS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь",
  "октябрь", "ноябрь", "декабрь", "год", "неделя", "век", "минута", "секунда", "час", "момент", "время",
  "детство", "прошлое", "будущее", "начало", "конец"];

export const caseById = (id) => CASES.find((c) => c.id === id) || null;

/* Every preposition any use names: a noun after one of these is not an
   object of the verb, whatever the verb is. */
export const PREPOSITIONS = ["в", "во", "на", "о", "об", "обо", "из", "от", "у", "для", "без", "до", "после",
  "около", "кроме", "против", "вокруг", "к", "ко", "по", "с", "со", "за", "под", "над", "перед", "между",
  "через", "про", "при"];

/* The shape the module promises: short labels (they are options in a
   question), one-sentence bodies, two examples a use, triggers folded. */
export const LABEL_WORDS = 8;
export function checkCases() {
  const errors = [];
  const words = (s) => s.trim().split(/\s+/).length;
  for (const c of CASES) {
    if (!c.uses.length) errors.push(`${c.id}: no uses`);
    for (const u of c.uses) {
      if (words(u.label) > LABEL_WORDS) errors.push(`${c.id}/${u.id}: label over ${LABEL_WORDS} words`);
      if (u.body.split(/(?<=[.!?])\s/).length > 1) errors.push(`${c.id}/${u.id}: body is more than one sentence`);
      if ((u.examples || []).length !== 2) errors.push(`${c.id}/${u.id}: wants two examples`);
      if (!u.triggers.length && !u.after) errors.push(`${c.id}/${u.id}: no way to recognise it`);
    }
  }
  return errors;
}
