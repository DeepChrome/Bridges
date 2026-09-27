/* The grammar reference (2026-09-27).
 *
 * Hand-authored, beside core/alphabet.js and core/scenarios.js: teaching
 * content the pipeline cannot generate. The lexicon knows that «книга» takes
 * «книги» in the plural; it does not know that the reason is a spelling rule
 * about к г х, and that this one rule explains half of what looks like
 * irregularity to a beginner.
 *
 * Why it exists. The course already teaches grammar — 34 cards in
 * data/curated/grammar_notes.json, one per unit, each a real rule with real
 * examples. But a card is only ever met twice: inside the lesson that owns it,
 * and under a wrong answer on a question it governs. There was nowhere to go
 * and *look something up*, and three things the cards never said at all:
 *
 *   - hard and soft stems, which is why endings come in pairs;
 *   - what each case is FOR, gathered in one place rather than spread over six
 *     chapters and four side quests;
 *   - the two spelling rules that make endings look irregular when they are not.
 *
 * The owner, 2026-09-27: *"there's no clear mechanism for communicating hard vs
 * soft stems, rules, when to use genitive, etc. We really just skip a lot of
 * the rules in general."*
 *
 * The shape is the point. A section is a heading, ONE sentence of rule, and
 * then structure — a table, a list of jobs, a pair of contrasting examples.
 * Never a paragraph. `checkGrammar()` enforces both halves of that: the length
 * of the prose, and that every Russian word written here is a real word.
 *
 * It does not restate the course. Where a unit card already teaches a point,
 * the section names the unit and the screen draws that card, so the reference
 * and the lesson cannot come to disagree (§22).
 */

/* The most a `rule` may run to. A rule that needs more than this is two rules,
   or it wants a table. */
export const RULE_WORDS = 22;
/* A `blurb` sits under a topic's name in the list: a label, not a summary. */
export const BLURB_WORDS = 7;
/* One job of one case. These are the bullets that replace a paragraph. */
export const USE_WORDS = 10;

/* A section:
 *   heading   2–5 words, what this is
 *   rule      one sentence, <= RULE_WORDS
 *   uses      optional; short lines, each a separate job the form does
 *   table     optional; { title, columns, rows } — the paradigm-table shape, so
 *             one renderer draws these and a word's own declension alike
 *   examples  optional; [russian, english] pairs
 *   cards     optional; unit ids whose grammar card teaches this, drawn from
 *             the payload rather than restated here
 */

export const TOPICS = [
  /* ------------------------------------------------------------- gender */
  {
    id: "gender",
    title: "Gender",
    blurb: "What the last letter tells you",
    sections: [
      {
        heading: "The ending tells you",
        rule: "A noun's last letter says its gender. You almost never have to learn it separately.",
        table: {
          title: "Nouns",
          columns: ["Gender", "Ends in", "Example"],
          rows: [
            ["Masculine", "a consonant, -й", "стол, музе́й"],
            ["Feminine", "-а, -я", "кни́га, неде́ля"],
            ["Neuter", "-о, -е", "окно́, мо́ре"],
            ["Either", "-ь", "день, дверь"],
          ],
        },
      },
      {
        heading: "The soft sign is the exception",
        rule: "A noun ending in -ь can be either gender, so learn that one with the word.",
        examples: [
          ["день", "a day — masculine"],
          ["дверь", "a door — feminine"],
        ],
      },
      {
        heading: "Why it matters",
        rule: "Adjectives, possessives and the past tense all copy the gender of the noun.",
        examples: [
          ["но́вый дом", "a new house"],
          ["но́вая кни́га", "a new book"],
          ["но́вое сло́во", "a new word"],
        ],
        cards: ["core3", "home", "clothes", "family"],
      },
    ],
  },

  /* -------------------------------------------------------------- stems */
  {
    id: "stems",
    title: "Hard and soft",
    blurb: "Why endings come in pairs",
    sections: [
      {
        heading: "Two of every vowel",
        rule: "Russian vowels come in pairs. Both are the same sound; the second softens the consonant before it.",
        table: {
          title: "Vowel pairs",
          columns: ["Hard", "Soft"],
          rows: [
            ["а", "я"],
            ["о", "ё"],
            ["у", "ю"],
            ["ы", "и"],
            ["э", "е"],
          ],
        },
      },
      {
        heading: "A stem is hard or soft",
        rule: "A stem ending in a plain consonant is hard. One ending in -ь or -й is soft.",
        examples: [
          ["стол — столы́", "a table — tables"],
          ["слова́рь — словари́", "a dictionary — dictionaries"],
        ],
      },
      {
        heading: "So every ending has two shapes",
        rule: "Pick the hard or the soft column by the stem. The meaning never decides it.",
        table: {
          title: "Same case, two stems",
          columns: ["", "Hard · стол", "Soft · слова́рь"],
          rows: [
            ["Genitive", "стола́", "словаря́"],
            ["Dative", "столу́", "словарю́"],
            ["Plural", "столы́", "словари́"],
          ],
        },
      },
      {
        heading: "Never ы after these seven",
        rule: "After к г х ж ч ш щ write и, never ы. This is why plurals look irregular.",
        examples: [
          ["кни́га — кни́ги", "a book — books"],
          ["ру́сский язы́к", "the Russian language"],
        ],
      },
      {
        heading: "And о only when stressed",
        rule: "After ж ч ш щ ц an unstressed о is written е instead.",
        examples: [
          ["большо́е окно́", "a big window — stressed, so о"],
          ["хоро́шее ме́сто", "a good place — unstressed, so е"],
        ],
      },
    ],
  },

  /* -------------------------------------------------------------- cases */
  {
    id: "cases",
    title: "The six cases",
    blurb: "What each one is for",
    sections: [
      {
        heading: "What a case is",
        rule: "The ending of a noun says what job it does in the sentence. Word order does not.",
        examples: [
          ["Ма́ма лю́бит дочь.", "Mum loves the daughter."],
          ["Дочь лю́бит ма́ма.", "Mum loves the daughter — same meaning."],
        ],
      },
      {
        heading: "Nominative",
        rule: "The subject, and the form a dictionary lists. It is the word before anything happens to it.",
        uses: [
          "Who or what is doing the verb",
          "The dictionary form of every noun",
          "After the unspoken «is»",
        ],
        examples: [["Мой брат — врач.", "My brother is a doctor."]],
        cards: ["core1"],
      },
      {
        heading: "Accusative",
        rule: "The direct object: the thing the verb is done to.",
        uses: [
          "What the verb acts on",
          "After в and на meaning motion towards",
          "Animate masculine copies the genitive",
        ],
        table: {
          title: "Accusative singular",
          columns: ["", "Masculine", "Feminine", "Neuter"],
          rows: [
            ["Hard", "like nominative", "-у", "like nominative"],
            ["Soft", "like nominative", "-ю", "like nominative"],
          ],
        },
        examples: [
          ["Я чита́ю кни́гу.", "I am reading a book."],
          ["Я зна́ю его́ бра́та.", "I know his brother — animate, so genitive."],
        ],
        cards: ["core6", "animals"],
      },
      {
        heading: "Genitive",
        rule: "Of, belonging to, and absent. It has more jobs than any other case.",
        uses: [
          "Of, and belonging to",
          "After нет — the thing that is missing",
          "After мно́го, ма́ло, ско́лько",
          "Singular after 2, 3, 4; plural after 5 and up",
          "After без, для, до, из, о́коло, от, у",
          "As the object of an animate masculine noun",
        ],
        table: {
          title: "Genitive singular",
          columns: ["", "Masculine", "Feminine", "Neuter"],
          rows: [
            ["Hard", "-а", "-ы", "-а"],
            ["Soft", "-я", "-и", "-я"],
          ],
        },
        examples: [
          ["кни́га бра́та", "my brother's book"],
          ["У меня́ нет вре́мени.", "I have no time."],
          ["два часа́, пять часо́в", "two hours, five hours"],
        ],
        cards: ["work", "politics", "time", "animals"],
      },
      {
        heading: "Dative",
        rule: "To whom, and for whom: the person something is given, said or shown to.",
        uses: [
          "The indirect object — to whom",
          "The person who likes, needs or is cold",
          "After к and по",
        ],
        table: {
          title: "Dative singular",
          columns: ["", "Masculine", "Feminine", "Neuter"],
          rows: [
            ["Hard", "-у", "-е", "-у"],
            ["Soft", "-ю", "-е", "-ю"],
          ],
        },
        examples: [
          ["Я говорю́ бра́ту.", "I am speaking to my brother."],
          ["Мне нра́вится э́тот го́род.", "I like this city."],
        ],
        cards: ["emotion", "tech"],
      },
      {
        heading: "Instrumental",
        rule: "By, with, using — and what someone is or has become.",
        uses: [
          "The tool something is done with",
          "After с meaning together with",
          "What someone works as or became",
          "After ме́жду, над, под, пе́ред, за",
        ],
        table: {
          title: "Instrumental singular",
          columns: ["", "Masculine", "Feminine", "Neuter"],
          rows: [
            ["Hard", "-ом", "-ой", "-ом"],
            ["Soft", "-ем", "-ей", "-ем"],
          ],
        },
        examples: [
          ["Он стал врачо́м.", "He became a doctor."],
          ["Я иду́ с бра́том.", "I am going with my brother."],
        ],
        cards: ["military", "law", "science"],
      },
      {
        heading: "Prepositional",
        rule: "The only case that never appears without a preposition in front of it.",
        uses: [
          "After в and на meaning where",
          "After о meaning about",
          "Almost always ends in -е",
        ],
        table: {
          title: "Prepositional singular",
          columns: ["", "Masculine", "Feminine", "Neuter"],
          rows: [
            ["Hard", "-е", "-е", "-е"],
            ["Soft", "-е", "-е", "-е"],
          ],
        },
        examples: [
          ["Я живу́ в го́роде.", "I live in the city."],
          ["Мы говори́м о рабо́те.", "We are talking about work."],
        ],
        cards: ["core5", "nature", "art", "speech"],
      },
      {
        heading: "The plural endings",
        rule: "Four of the six are the same for every gender in the plural, which makes them the easy half.",
        table: {
          title: "Plural",
          columns: ["Case", "Hard", "Soft"],
          rows: [
            ["Nominative", "-ы", "-и"],
            ["Genitive", "-ов / —", "-ей / —"],
            ["Dative", "-ам", "-ям"],
            ["Instrumental", "-ами", "-ями"],
            ["Prepositional", "-ах", "-ях"],
          ],
        },
      },
      {
        heading: "The one to look up",
        rule: "The genitive plural is genuinely irregular. Check the table for the word rather than guessing.",
        examples: [
          ["стол — столо́в", "tables — masculine adds -ов"],
          ["кни́га — книг", "books — feminine drops its ending"],
        ],
      },
    ],
  },

  /* ---------------------------------------------------------- adjectives */
  {
    id: "adjectives",
    title: "Adjectives",
    blurb: "Three stem types, one agreement",
    sections: [
      {
        heading: "It copies its noun",
        rule: "An adjective takes the gender, number and case of the noun it describes.",
        table: {
          title: "Nominative",
          columns: ["", "Masculine", "Feminine", "Neuter", "Plural"],
          rows: [
            ["Hard", "-ый", "-ая", "-ое", "-ые"],
            ["Soft", "-ий", "-яя", "-ее", "-ие"],
            ["Stressed", "-о́й", "-а́я", "-о́е", "-ы́е"],
          ],
        },
        cards: ["clothes"],
      },
      {
        heading: "Which of the three",
        rule: "The dictionary form tells you: -ый is hard, -ий is soft, -ой is hard with the stress on the ending.",
        examples: [
          ["но́вый", "new — hard"],
          ["си́ний", "dark blue — soft"],
          ["большо́й", "big — stressed ending"],
        ],
      },
      {
        heading: "The seven letters again",
        rule: "After к г х ж ч ш щ a hard adjective is spelled -ий, though it behaves as hard.",
        examples: [
          ["ру́сский", "Russian — hard, spelled -ий"],
          ["хоро́ший", "good — hard, spelled -ий"],
        ],
      },
    ],
  },

  /* --------------------------------------------------------------- verbs */
  {
    id: "verbs",
    title: "Verbs",
    blurb: "Two patterns, two aspects",
    sections: [
      {
        heading: "Two patterns",
        rule: "Almost every verb follows the -е- pattern or the -и- pattern in the present tense.",
        table: {
          title: "Present tense",
          columns: ["", "-е- · чита́ть", "-и- · говори́ть"],
          rows: [
            ["я", "чита́ю", "говорю́"],
            ["ты", "чита́ешь", "говори́шь"],
            ["он, она́", "чита́ет", "говори́т"],
            ["мы", "чита́ем", "говори́м"],
            ["вы", "чита́ете", "говори́те"],
            ["они́", "чита́ют", "говоря́т"],
          ],
        },
        cards: ["core2"],
      },
      {
        heading: "Telling them apart",
        rule: "The они́ form decides it: -ют or -ут is the first pattern, -ят or -ат the second.",
        examples: [
          ["они́ чита́ют", "they read — first pattern"],
          ["они́ говоря́т", "they speak — second pattern"],
        ],
      },
      {
        heading: "The past agrees with the subject",
        rule: "Drop -ть and add -л, -ла, -ло or -ли. It matches gender, not person.",
        table: {
          title: "Past tense",
          columns: ["Subject", "Ending", "Example"],
          rows: [
            ["a man", "-л", "чита́л"],
            ["a woman", "-ла", "чита́ла"],
            ["neuter", "-ло", "чита́ло"],
            ["plural, вы", "-ли", "чита́ли"],
          ],
        },
        cards: ["core7"],
      },
      {
        heading: "Two aspects",
        rule: "Imperfective is the process or a habit; perfective is one act, finished.",
        examples: [
          ["Я чита́л кни́гу.", "I was reading a book."],
          ["Я прочита́л кни́гу.", "I finished the book."],
        ],
        cards: ["core8"],
      },
      {
        heading: "The future, both ways",
        rule: "A perfective verb in its present forms already means the future. For a process use бу́ду.",
        examples: [
          ["Я сде́лаю э́то.", "I will do it."],
          ["Я бу́ду рабо́тать.", "I will be working."],
        ],
        cards: ["core9"],
      },
      {
        heading: "Verbs ending in -ся",
        rule: "Conjugate the verb as normal, then add -ся after a consonant and -сь after a vowel.",
        table: {
          title: "учи́ться",
          columns: ["", "Form"],
          rows: [
            ["я", "учу́сь"],
            ["ты", "у́чишься"],
            ["он, она́", "у́чится"],
            ["мы", "у́чимся"],
            ["вы", "у́читесь"],
            ["они́", "у́чатся"],
          ],
        },
      },
      {
        heading: "Asking for something",
        rule: "The imperative is the ты form with -й, -и or -ь; add -те for вы.",
        examples: [
          ["Чита́й!", "Read! — to one person you know"],
          ["Скажи́те, пожа́луйста.", "Tell me, please."],
        ],
        cards: ["core10"],
      },
    ],
  },

  /* ------------------------------------------------------------ pronouns */
  {
    id: "pronouns",
    title: "Pronouns",
    blurb: "People, and what they own",
    sections: [
      {
        heading: "The people",
        rule: "ты is one person you know. вы is a stranger, someone older, or several people.",
        table: {
          title: "Subject",
          columns: ["", "Singular", "Plural"],
          rows: [
            ["1st", "я", "мы"],
            ["2nd", "ты", "вы"],
            ["3rd", "он, она́, оно́", "они́"],
          ],
        },
      },
      {
        heading: "They decline too",
        rule: "A pronoun takes a case like any noun, and the forms are worth knowing by heart.",
        table: {
          title: "я and ты",
          columns: ["Case", "я", "ты"],
          rows: [
            ["Nominative", "я", "ты"],
            ["Genitive", "меня́", "тебя́"],
            ["Dative", "мне", "тебе́"],
            ["Accusative", "меня́", "тебя́"],
            ["Instrumental", "мной", "тобо́й"],
            ["Prepositional", "мне", "тебе́"],
          ],
        },
      },
      {
        heading: "My, your, our",
        rule: "мой, твой, наш and ваш take the gender of the thing owned, never of the owner.",
        examples: [
          ["мой дом", "my house"],
          ["моя́ кни́га", "my book"],
          ["моё окно́", "my window"],
        ],
        cards: ["family"],
      },
      {
        heading: "His, hers, theirs never change",
        rule: "его́, её and их are fixed. They are the easiest possessives in the language.",
        examples: [["её дом, её кни́га", "her house, her book"]],
      },
    ],
  },
];

/* Where the app sends a learner from a question. A drill, a case name or a
   part of speech, to the topic that explains it — the bulb's second half, so a
   reference is one tap from the thing that prompted the question rather than a
   screen they have to think to visit.

   Keyed by what the app already has: the drill ids in core/questions.js, and
   the case names panel.py writes into a paradigm's row labels. */
const TOPIC_OF = {
  cases: "cases",
  agreement: "adjectives",
  conjugation: "verbs",
  aspect: "verbs",
  form: "cases",
  nominative: "cases",
  genitive: "cases",
  dative: "cases",
  accusative: "cases",
  instrumental: "cases",
  prepositional: "cases",
  noun: "gender",
  adjective: "adjectives",
  verb: "verbs",
  pronoun: "pronouns",
};

export function topicFor(what) {
  if (!what) return null;
  const id = TOPIC_OF[String(what).toLowerCase().trim()];
  return id ? TOPICS.find((t) => t.id === id) : null;
}

export function topicById(id) {
  return TOPICS.find((t) => t.id === id) || null;
}

/* Every Russian *word* written anywhere in a topic, for the checker: the thing
   that must not be invented (§30a). Returned with its position so a failure
   can name where it is.
 *
 * Two kinds of Cyrillic here are not words and must not be looked up, or the
 * check reports sixty failures on a sound file and stops being read (§30r —
 * a metric that cannot tell the skill from the flaw is worse than none):
 *
 *   - an ending, always written with a leading hyphen: -ы, -ов, -ами, -ся;
 *   - a single letter, which is how the spelling rules name them: "after
 *     к г х ж ч ш щ write и".
 *
 * Neither exclusion opens a hole. A word that is genuinely wrong is two or
 * more letters and is not preceded by a hyphen, so it is still looked up.
 */
export function russianIn(topic) {
  const out = [];
  const add = (text, where) => {
    if (typeof text !== "string") return;
    for (const m of text.matchAll(/[Ѐ-ӿ̀́]+/g)) {
      if (m[0].length < 2) continue;
      if (text[m.index - 1] === "-") continue;
      out.push({ word: m[0], where });
    }
  };
  for (const s of topic.sections) {
    const where = `${topic.id} · ${s.heading}`;
    for (const [ru] of s.examples || []) add(ru, where);
    if (s.table) {
      for (const row of s.table.rows) for (const cell of row) add(cell, where);
      for (const c of s.table.columns) add(c, where);
    }
    for (const u of s.uses || []) add(u, where);
    add(s.rule, where);
  }
  return out;
}

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

/* The shape gate. Run from core.test.mjs with a `known` predicate that answers
   whether a folded word is in the lexicon; without one it checks only the
   shape, which is what lets it run where no payload has been loaded.
   Returns a list of complaints, empty when the file is sound. */
export function checkGrammar(known, hasCard) {
  const bad = [];
  const seen = new Set();
  for (const t of TOPICS) {
    if (seen.has(t.id)) bad.push(`two topics with the id ${t.id}`);
    seen.add(t.id);
    if (words(t.blurb) > BLURB_WORDS) bad.push(`${t.id}: the blurb runs to ${words(t.blurb)} words`);
    if (!t.sections.length) bad.push(`${t.id}: no sections`);
    for (const s of t.sections) {
      const at = `${t.id} · ${s.heading}`;
      if (!s.heading) bad.push(`${t.id}: a section with no heading`);
      if (!s.rule) bad.push(`${at}: no rule`);
      else if (words(s.rule) > RULE_WORDS) bad.push(`${at}: the rule runs to ${words(s.rule)} words`);
      /* A heading and a sentence and nothing else is the block of text this
         file exists to replace. */
      if (!s.table && !s.examples && !s.uses && !s.cards) bad.push(`${at}: prose with nothing under it`);
      for (const u of s.uses || []) {
        if (words(u) > USE_WORDS) bad.push(`${at}: "${u}" runs to ${words(u)} words`);
      }
      if (s.table) {
        const n = s.table.columns.length;
        for (const r of s.table.rows) {
          if (r.length !== n) bad.push(`${at}: a row of ${r.length} under ${n} columns`);
        }
      }
      for (const ex of s.examples || []) {
        if (ex.length !== 2) bad.push(`${at}: an example that is not a pair`);
      }
      /* A card id that names no unit draws nothing, and a section that meant to
         point at the course would silently stop pointing anywhere. */
      if (hasCard) {
        for (const id of s.cards || []) {
          if (!hasCard(id)) bad.push(`${at}: no unit «${id}» with a grammar card`);
        }
      }
    }
    if (known) {
      for (const { word, where } of russianIn(t)) {
        if (!known(word)) bad.push(`${where}: «${word}» is not a word the lexicon knows`);
      }
    }
  }
  return bad;
}
