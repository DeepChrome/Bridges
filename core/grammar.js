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

/* `page: true` on a section gives it a screen of its own: the topic lists it
   as a row instead of drawing it inline. The six cases are each one (the
   owner, 2026-10-03: "break the page for cases into sub categories one per
   case rather than throwing it all on one page"). */

/* The most a `rule` may run to. A rule that needs more than this is two rules,
   or it wants a table. */
export const RULE_WORDS = 22;
/* The explanation under the rule (the owner, 2026-10-13: "the grammar is
   really really really vague… 'it's this and this but never this and this'
   and in isolation that means literally nothing"). A rule line names the
   point; `why` says what it is, how to recognise when it applies, how to form
   it, and the trap — as separate sentences, each on its own line on screen
   (ui.js Note), never a paragraph. Every section must carry one. */
export const WHY_WORDS = 30;
export const WHY_MIN = 2;
export const WHY_MAX = 5;
/* A `blurb` sits under a topic's name in the list: a label, not a summary. */
export const BLURB_WORDS = 7;
/* One job of one case. These are the bullets that replace a paragraph. */
export const USE_WORDS = 10;

/* A section:
 *   heading   2–5 words, what this is
 *   rule      one sentence, <= RULE_WORDS
 *   why       WHY_MIN–WHY_MAX sentences, each <= WHY_WORDS: what the point is,
 *             when it applies, how to form it, the trap; Russian in «guillemets»
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
        why: [
          "Every Russian noun belongs to one of three groups called genders: masculine, feminine or neuter, and for most words this has nothing to do with meaning.",
          "To find a noun's gender, look at the last letter of its dictionary form and read across the matching row of the table.",
          "A consonant or «й» at the end makes «стол» masculine, «а» or «я» makes «кни́га» feminine, and «о» or «е» makes «окно́» neuter.",
          "The one letter that gives no answer is the soft sign «ь», which the next section covers.",
        ],
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
        why: [
          "The soft sign «ь» is a letter with no sound of its own, and a noun ending in it may be masculine or feminine.",
          "Because the ending gives no clue, the gender has to be remembered together with the word, the way its meaning is.",
          "Two patterns help: a noun ending in «-ость» that names a quality is feminine, and one ending in «-тель» is masculine.",
          "The examples show the problem in one pair: «день» is masculine and «дверь» is feminine, though both end the same way.",
          "A noun ending in one of the four letters «ж ч ш щ» followed by «ь» is feminine, with no exceptions.",
        ],
        examples: [
          ["день", "a day — masculine"],
          ["дверь", "a door — feminine"],
        ],
      },
      {
        heading: "Why it matters",
        rule: "Adjectives, possessives and the past tense all copy the gender of the noun.",
        why: [
          "Gender is not a fact about the noun alone; the words attached to it change their endings to match it.",
          "That includes an adjective in front of the noun, a possessive such as «мой», and a verb in the past tense.",
          "In the examples «но́вый» is the same word three times, but its ending becomes «-ая» before the feminine «кни́га» and «-ое» before the neuter «сло́во».",
          "So the first step before choosing any ending is to find the noun's gender from its last letter, and the cards below show the point inside the lessons.",
        ],
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
        why: [
          "Ten vowel letters stand for only five vowel sounds; each sound has a plain letter and a second letter that does one extra job.",
          "That job is to soften the consonant before it: the consonant is said with the tongue raised toward the roof of the mouth, as the n sounds in English onion.",
          "Read the table across: each row is one sound, the left letter written after a hard consonant and the right letter after a soft one.",
          "This matters for endings because one and the same ending is spelled with the left letter on one word and the right letter on another, as the next sections show.",
          "At the start of a word or after another vowel the soft letters gain a y sound in front, so «я» on its own sounds like ya.",
        ],
        /* The first column of a table is its row label (rules.js Table), so a
           two-column table lost its "Hard" heading on screen; the sound is the
           label. */
        table: {
          title: "Vowel pairs",
          columns: ["Sound", "Hard", "Soft"],
          rows: [
            ["a", "а", "я"],
            ["o", "о", "ё"],
            ["u", "у", "ю"],
            ["i", "ы", "и"],
            ["e", "э", "е"],
          ],
        },
      },
      {
        heading: "A stem is hard or soft",
        rule: "A stem ending in a plain consonant is hard. One ending in -ь or -й is soft.",
        why: [
          "The stem is the word with its ending taken off, the part that stays the same while the endings change.",
          "To decide whether a stem is hard or soft, cover the ending and look at the last letter left: a plain consonant means hard, «ь» or «й» means soft.",
          "Here «стол» ends in a plain «л», so it is hard and takes «-ы» in the plural; «слова́рь» ends in «ь», so it is soft and takes «-и».",
          "The «ь» or «й» is not kept: a soft ending takes its place, which is why «слова́рь» has no soft sign in «словари́».",
          "For a noun ending in a vowel, that vowel decides: «книга» has a hard stem because «а» is hard, «неделя» a soft one because «я» is soft.",
        ],
        examples: [
          ["стол — столы́", "a table — tables"],
          ["слова́рь — словари́", "a dictionary — dictionaries"],
        ],
      },
      {
        heading: "So every ending has two shapes",
        rule: "Pick the hard or the soft column by the stem. The meaning never decides it.",
        why: [
          "Every case ending, meaning the ending a noun takes for its role in the sentence, comes in two spellings: one for hard stems and one for soft.",
          "They are one ending, not two, said after a different kind of consonant and therefore written with the other letter of the pair.",
          "Read the table down a column: the left column is what «стол» does, the right is what «слова́рь» does, and each row is one case.",
          "The vowels pair exactly as in the first table: «а» against «я», «у» against «ю», «ы» against «и».",
          "So the procedure is: find the case needed, find the stem type by its last letter, read the cell where they meet; meaning plays no part.",
        ],
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
        why: [
          "Seven consonants refuse to be followed by «ы»: the three «к г х» and the four «ж ч ш щ».",
          "Wherever a hard ending would call for «ы», after one of these letters the spelling switches to «и», and nothing else about the ending changes.",
          "That is why «кни́га», an ordinary hard noun, has the plural «кни́ги» rather than the «-ы» that «стол» takes.",
          "The word stays hard; this is a spelling rule, not a change of stem type, so its other endings keep their hard shapes.",
          "The same seven letters are also why some adjectives end in «-ий» rather than «-ый», which the adjectives topic covers.",
        ],
        examples: [
          ["кни́га — кни́ги", "a book — books"],
          ["ру́сский язы́к", "the Russian language"],
        ],
      },
      {
        heading: "And о only when stressed",
        rule: "After ж ч ш щ ц an unstressed о is written е instead.",
        why: [
          "Five consonants carry a second rule, this one about «о»: after «ж ч ш щ» and «ц» an ending may contain «о» only when the stress falls on it.",
          "When the stress sits on the stem instead, that «о» is written «е», and the ending is otherwise unchanged.",
          "The examples are the neuter adjective ending seen twice: «большо́е» is stressed on the ending, so it keeps «о»; «хоро́шее» is stressed on the stem, so it takes «е».",
          "Check two things: whether the last stem letter is one of those five, and whether the ending is unstressed; «е» is written only when both are true.",
          "The letter «ц» joins this rule but not the previous one; after «ц» the plural ending «-ы» stays «-ы», as in «отцы».",
        ],
        examples: [
          ["большо́е окно́", "a big window — stressed, so о"],
          ["хоро́шее ме́сто", "a good place — unstressed, so е"],
        ],
      },
      {
        heading: "A vowel that drops out",
        rule: "In some nouns the last о or е of the stem disappears once any ending is added.",
        why: [
          "Some nouns carry an «о» or «е» in their last syllable that is present only in the dictionary form and vanishes as soon as an ending is attached.",
          "This is called a fleeting vowel; the dictionary shows the word with it, and every other form, including the plural, is built without it.",
          "Read each example as a pair: «день» keeps its «е» only while it has no ending, and «дня», of a day, is the same word with the vowel gone.",
          "No ending predicts which nouns do this, so when a dictionary gives a second form such as «отца́» beside «оте́ц», that second form shows the real stem.",
          "A common tell is a masculine noun ending in «-ок» or «-ец», which almost always drops the vowel.",
        ],
        examples: [
          ["день — дня", "a day — of a day"],
          ["оте́ц — отца́", "a father — of a father"],
          ["сон — сна", "a dream — of a dream"],
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
        why: [
          "In English the order of the words says who did what: \"Mom loves her daughter\" and \"Her daughter loves Mom\" are two different sentences.",
          "Russian puts that information in the ending instead, so «ма́ма» is the one loving and «до́чку» the one loved, whichever of them comes first.",
          "A case is one of six sets of endings, one for each job a noun can do in a sentence, from subject to \"of\" to \"with\".",
          "The two examples under the rule are the same words in a different order, and the meaning has not moved because the endings have not.",
          "The pages that follow take one case each: what it is for, how to recognise that it applies, and which ending to add.",
        ],
        examples: [
          /* «до́чку», not «дочь»: a feminine noun in -ь looks the same in the
             nominative and accusative, so «Дочь лю́бит ма́ма» reads as the
             daughter loving Mum and disproves the rule it was here to show
             (found by the review pre-pass, 2026-09-30). */
          ["Ма́ма лю́бит до́чку.", "Mom loves her daughter."],
          ["До́чку лю́бит ма́ма.", "Mom loves her daughter — same meaning."],
        ],
      },
      {
        heading: "Nominative", page: true,
        rule: "The subject, and the form a dictionary lists. It is the word before anything happens to it.",
        why: [
          "The nominative is the plain form of a noun, the one the dictionary lists and the one you learn first.",
          "It marks the subject, the person or thing doing the action, so in «Ма́ма лю́бит до́чку» the word «ма́ма» is nominative because she is the one loving.",
          "Russian has no word for \"is\" in the present, so \"my brother is a doctor\" puts both nouns in the nominative, «брат» and «врач», with nothing between them.",
          "There is nothing to form: the nominative is the word as it stands, and every other case is made by changing this ending.",
          "A masculine noun for a thing and any neuter noun look the same as subject and object, so «стол» could be either; the rest of the sentence says which.",
        ],
        uses: [
          "Who or what is doing the verb",
          "The dictionary form of every noun",
          "After the unspoken «is»",
        ],
        examples: [["Мой брат — врач.", "My brother is a doctor."]],
        cards: ["core1"],
      },
      {
        heading: "Accusative", page: true,
        rule: "The direct object: the thing the verb is done to.",
        why: [
          "The accusative marks the direct object, the thing the verb is done to: ask what or whom after the verb and the answer is in this case.",
          "For feminine nouns, take off «-а» and add «-у», or take off «-я» and add «-ю», so «кни́га» becomes «кни́гу».",
          "Masculine and neuter nouns keep their dictionary form, which is what the table means by \"like nominative\", so «стол» stays «стол».",
          "The trap is animate masculine nouns, meaning a man or an animal whose word is masculine: these take the genitive ending instead, so «брат» becomes «бра́та».",
          "After «в» and «на» the accusative means going somewhere, as in «Я иду́ в шко́лу»; the same two prepositions with the prepositional case mean being somewhere.",
        ],
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
        heading: "Genitive", page: true,
        rule: "Of, belonging to, and absent. It has more jobs than any other case.",
        why: [
          "The genitive is the \"of\" case: a noun in it follows another noun and says whose it is, so «кни́га бра́та» is my brother's book.",
          "It also marks what is missing after «нет», what is counted after «мно́го», «ма́ло» or a number, and the noun after prepositions such as «из», «от» and «у».",
          "Take off the dictionary ending, if there is one, and add the table's: «-а» or «-я» for masculine and neuter, «-ы» or «-и» for feminine, so «стол» gives «стола́».",
          "Hard or soft is read off the dictionary form: a plain consonant, «-а» or «-о» is hard, while «-ь», «-й» or «-я» is soft.",
          "After 2, 3 and 4 the noun is genitive singular, as in «два часа́», but from 5 on it is genitive plural, «пять часо́в», which the last section covers.",
        ],
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
        heading: "Dative", page: true,
        rule: "To whom, and for whom: the person something is given, said or shown to.",
        why: [
          "The dative is the \"to someone\" or \"for someone\" case: the person who receives, is told or is shown something, with no preposition needed.",
          "In English that person often follows \"to\", so «Я говорю́ бра́ту» is \"I am speaking to my brother\"; ask to whom after the verb and the answer is dative.",
          "It also names the person who feels something: liking, needing or being cold go with the dative, so \"I like\" is «Мне нра́вится», literally \"it pleases me\".",
          "Take off the dictionary ending, if any, and add «-у» or «-ю» for masculine and neuter, «-е» for feminine in «-а» or «-я», so «брат» gives «бра́ту».",
          "The preposition «к» means towards or to someone's place and takes the dative, and so does «по» meaning along, as in «Мы гуля́ем по у́лице».",
        ],
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
        heading: "Instrumental", page: true,
        rule: "By, with, using — and what someone is or has become.",
        why: [
          "The instrumental is the \"with\" or \"by means of\" case: the tool you do something with, as in «Я пишу́ ру́чкой», I write with a pen.",
          "It also follows «с» meaning together with, as in «с бра́том», and names what someone is or became after «рабо́тать», «стать» and «был», so «Он стал врачо́м».",
          "Take off the dictionary ending, if any, and add «-ом» or «-ем» for masculine and neuter, «-ой» or «-ей» for feminine, so «врач» becomes «врачо́м».",
          "The row is hard for a word ending in a plain consonant, «-а» or «-о», and soft for one ending in «-ь», «-й» or «-я».",
          "The place prepositions «под», «над» and «пе́ред» take it too, and so does «с», which with the genitive instead means from, so the ending tells the two apart.",
        ],
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
        heading: "Prepositional", page: true,
        rule: "The only case that never appears without a preposition in front of it.",
        why: [
          "The prepositional says where something is or what something is about, and it is used only after a preposition, which is where its name comes from.",
          "After «в» (in) and «на» (on, at) it answers «где», where, as in «Я живу́ в го́роде»; after «о» it means about, as in «о рабо́те».",
          "It is the easiest ending to form: take off the dictionary ending, if any, and add «-е» whatever the gender, hard or soft, so «го́род» becomes «го́роде».",
          "A feminine noun in «-ь» takes «-и» («в двери»), one in «-ия» takes «-ии» («в России»), and a few short masculine nouns take a stressed «-у» («в лесу»).",
          "The trap is the same two prepositions with the accusative: «в го́роде» is being in the city, but «в го́род» is going to the city.",
        ],
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
        why: [
          "In the plural, gender stops mattering for most cases: the dative, instrumental and prepositional take one ending each, in a hard and a soft spelling.",
          "Read the table by the last letter: a consonant, «-а» or «-о» takes the hard column, and «-ь», «-й» or «-я» takes the soft.",
          "The spelling rule still applies: «кни́га» gives «кни́ги», since «ы» is not written after к or the other six letters named under hard and soft.",
          "The accusative plural is missing from the table because it borrows: the nominative plural for things, the genitive plural for people and animals of any gender.",
          "The genitive plural row shows two options, an ending or nothing at all, because that ending depends on the word; the next section covers it.",
        ],
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
        why: [
          "The genitive plural is the one ending with no single rule, so read it off the word's own table rather than working it out.",
          "Most often a masculine noun in a consonant adds «-ов» («стол», «столо́в»), while a feminine noun in «-а» drops its ending and adds nothing («кни́га», «книг»).",
          "A word ending in «-ь», or in a hushing letter such as ч, takes «-ей», so «день» gives «дней» and «врач» gives «врачей».",
          "When dropping the ending would leave two consonants together, a vowel is often slipped in between them, so «окно́» gives «окон».",
          "This is the form that counting needs: after «пять» and the numbers up to twenty, and after «мно́го» or «ма́ло» with anything you can count, as in «мно́го книг».",
        ],
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
        why: [
          "An adjective is a describing word, and in Russian it has no fixed ending of its own; it borrows gender, number and case from the noun it sits with.",
          "Case means the form a noun takes for its job in the sentence; the table here covers only the nominative, the form used for the subject.",
          "To use it, find the noun's gender from its last letter, find the adjective's row from its stem type, and read the cell where they cross.",
          "The plural column serves all three genders, so a masculine and a feminine noun take the same plural adjective ending.",
          "The stem type, hard, soft or stressed, is read off the adjective's dictionary form, which the next section explains.",
        ],
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
        why: [
          "The three rows of the table are three stem types, and the dictionary form of an adjective, its masculine nominative, says which row it belongs to.",
          "Look at the last two letters: «-ый» means hard, «-ий» means soft, and «-ой» means hard with the stress on the ending.",
          "The stressed type uses the hard endings throughout; it differs only in where the stress falls and in the masculine «-ой» in place of «-ый».",
          "Only the masculine form has to be remembered, because the others follow from the row: «но́вый» gives «новая» and «новое» by reading along the hard line.",
          "The trap is an «-ий» that follows one of the seven spelling-rule letters; it looks soft and is not, as the next section shows.",
        ],
        examples: [
          ["но́вый", "new — hard"],
          ["си́ний", "dark blue — soft"],
          ["большо́й", "big — stressed ending"],
        ],
      },
      {
        heading: "The seven letters again",
        rule: "After к г х ж ч ш щ a hard adjective is spelled -ий, though it behaves as hard.",
        why: [
          "The stems topic's spelling rule reaches adjectives too: after «к г х» and «ж ч ш щ» the letter «ы» is not written, so «-ый» appears as «-ий».",
          "Such a word is still hard, and its other forms use the hard row: «ру́сский» gives «русская» and «русское», not the soft «-яя» and «-ее».",
          "To tell this «-ий» from a truly soft one, look at the letter before it: «н» as in «синий» means soft, one of the seven means hard.",
          "After «ж ч ш щ» the second spelling rule applies as well, so «хоро́ший» has the neuter «хорошее», where «е» stands for an unstressed «о».",
          "The feminine «хорошая» keeps its «а», because that rule touches only «о».",
        ],
        examples: [
          ["ру́сский", "Russian — hard, spelled -ий"],
          ["хоро́ший", "good — hard, spelled -ий"],
        ],
      },
      {
        heading: "Comparing: more and less",
        rule: "Most adjectives add -ее for «more». A few common ones change their stem entirely.",
        why: [
          "The comparative is the form that means more of the quality, as newer and faster do in English.",
          "For most adjectives it is one fixed word that does not change for gender, number or case.",
          "To form it, take the ending off and add «-ее» to the stem; the first two rows are built that way, and the stress often moves onto the new ending.",
          "The last four rows are the exceptions: common words like «хоро́ший» and «плохо́й» build their comparative on a different stem, so «лу́чше» and «ху́же» are learned as separate words.",
          "The example sentence shows the usual frame: the comparative, then «чем» for than, then the thing compared.",
        ],
        table: {
          title: "Comparative",
          columns: ["Adjective", "More", "Meaning"],
          rows: [
            ["но́вый", "нове́е", "newer"],
            ["бы́стрый", "быстре́е", "faster"],
            ["хоро́ший", "лу́чше", "better"],
            ["плохо́й", "ху́же", "worse"],
            ["большо́й", "бо́льше", "bigger"],
            ["ма́ленький", "ме́ньше", "smaller"],
          ],
        },
        examples: [["Э́тот дом бо́льше, чем тот.", "This house is bigger than that one."]],
      },
      {
        heading: "The short form",
        rule: "After «is» an adjective often takes a short form: the stem plus nothing, -а, -о or -ы.",
        why: [
          "Most adjectives have a second, shorter set of endings used only when the adjective is the whole statement, as in he is ready, rather than sitting before a noun.",
          "Russian has no word for is in the present tense, so the short adjective stands straight after its subject and the ending alone shows the agreement.",
          "The masculine is the bare stem; the other three add a single vowel, and the rule above lists them in the order feminine, neuter, plural.",
          "Read «Я гото́в.» as a man speaking; a woman saying the same thing adds «-а», because the ending copies the speaker.",
          "A few words are met almost only in this form, and «должен», must, is one: «должны́» in the last example is its plural.",
        ],
        uses: [
          "Only after a subject, never before a noun",
          "Some words exist mostly in this form",
        ],
        examples: [
          ["Я гото́в.", "I am ready — a man speaking"],
          ["Она́ ра́да.", "She is glad."],
          ["Мы должны́ идти́.", "We have to go."],
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
        why: [
          "The present tense is what someone does now or does regularly, and Russian changes the verb's ending for every person, where English only adds an \"s\" for he and she.",
          "Start from the infinitive, the dictionary form ending in «-ть», take «-ть» off, and add the ending in the row for your subject: «я» gives «чита́ю», «ты» gives «чита́ешь».",
          "The two columns are the two patterns: the left endings are built on «е», the right ones on «и», and the «я» and «они́» rows differ the most.",
          "Which pattern a verb takes is a fact about that verb, not a choice, so learn each new verb together with its «я» and «они́» forms.",
          "A common trap is the «я» form of many «-ить» verbs, where the stem changes once and nowhere else: «любить» gives «люблю», then «любишь», «любит» as the table predicts.",
        ],
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
        why: [
          "Before you can conjugate a new verb you have to know which pattern it follows, and the infinitive alone does not reliably tell you.",
          "The «они́» form is the one dependable clue, so read its last two letters wherever you meet it, in the app's tables or in a sentence.",
          "If they are «-ют» or «-ут», the other five forms use the «е» endings of «читать»; if they are «-ят» or «-ат», the «и» endings of «говорить».",
          "Most verbs ending in «-ать» or «-ять» follow the first pattern and most ending in «-ить» the second, but exceptions exist, so check the «они́» form.",
        ],
        examples: [
          ["они́ чита́ют", "they read — first pattern"],
          ["они́ говоря́т", "they speak — second pattern"],
        ],
      },
      {
        heading: "The past agrees with the subject",
        rule: "Drop -ть and add -л, -ла, -ло or -ли. It matches gender, not person.",
        why: [
          "Russian has a single past tense covering English \"read\", \"was reading\" and \"has read\"; the difference between those is carried by the choice of verb, explained under aspects below.",
          "To form it, take the infinitive, remove «-ть» and add «-л»; that is already the form for a male subject, as in «он чита́л».",
          "The ending then agrees with who did it, the way an adjective agrees with its noun: a woman adds «-а», a neuter noun «-о», and any plural «-и».",
          "The form does not change with person, so a man says «я чита́л» and a woman says «я чита́ла», and the same two forms serve for «ты».",
          "The last row of the table covers «вы» even when it addresses one person politely, so a shopkeeper is asked «вы чита́ли», not «вы чита́л».",
        ],
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
        why: [
          "Most Russian verbs come in pairs, and the pair splits one English verb by how you see the action: as something going on, or as a finished result.",
          "The imperfective is the process, a habit, or something repeated, and it answers \"what was happening\" or \"what do you usually do\".",
          "The perfective is one act seen whole, with a result, and it answers \"what got done\".",
          "The partner is often the same verb with a prefix, a short piece added at the front, so «чита́л» and «прочита́л» differ by three letters and mean different things.",
          "A sentence that says how long or how often something happened wants the imperfective; one that says the thing was finished, or will be, wants the perfective.",
        ],
        examples: [
          ["Я чита́л кни́гу.", "I was reading a book."],
          ["Я прочита́л кни́гу.", "I finished the book."],
        ],
        cards: ["core8"],
      },
      {
        heading: "The future, both ways",
        rule: "A perfective verb in its present forms already means the future. For a process use бу́ду.",
        why: [
          "There are two futures because there are two aspects, so the first decision is whether you mean a finished result or an activity going on.",
          "A perfective verb has no present tense, so its present endings from the table of patterns mean the future: «сде́лаю» is \"I will do\", not \"I do\".",
          "For a process or a habit in the future, use the future of \"to be\", «бу́ду» for «я», and the imperfective infinitive unchanged, as in «бу́ду рабо́тать».",
          "«бу́ду» changes by person like a first pattern verb, «будешь», «будет», «будем», while the infinitive after it stays the same for everyone.",
          "The trap runs both ways: a perfective verb cannot describe what is happening right now, and «бу́ду» is never followed by a perfective verb.",
        ],
        examples: [
          ["Я сде́лаю э́то.", "I will do it."],
          ["Я бу́ду рабо́тать.", "I will be working."],
        ],
        cards: ["core9"],
      },
      {
        heading: "Verbs ending in -ся",
        rule: "Conjugate the verb as normal, then add -ся after a consonant and -сь after a vowel.",
        why: [
          "The «-ся» is a reflexive tag, a piece that once meant \"oneself\"; a verb carrying it often names an action done to oneself, or one with no object.",
          "«учи́ться» is \"to study\", literally to teach oneself, and the tag stays on in every form, including the past: «учился», «училась».",
          "The tag does not change how the verb conjugates: take «-ся» off, work out the ordinary form from the patterns above, and put the tag back on.",
          "Which spelling you put back depends only on the last letter before it: «-ся» after a consonant, «-сь» after a vowel.",
          "So in the table «учу́сь» and «у́читесь» end in «-сь» because «у» and «е» come before it, while the other four rows end in «-ся».",
        ],
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
        why: [
          "The imperative is the form for telling or asking someone to do something, English \"read\" or \"tell me\", and Russian has one for «ты» and one for «вы».",
          "Build it from the «они» form of the present: take off its last two letters and what is left is the stem.",
          "A stem ending in a vowel adds «-й», as «чита́й»; one ending in a consonant adds «-и» when the «я» form stresses its ending, and «-ь» otherwise.",
          "For «вы», or for anyone you address politely, add «-те» to that form, which is why «Скажи́те» ends the way it does.",
          "Aspect applies here too: a request for one act is perfective, as «Скажи́те» from «сказать», while «Чита́й» from the imperfective asks for the activity itself.",
        ],
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
        why: [
          "These are the subject pronouns, the words that stand in for a name: the rows are the speaker, the person spoken to and the person spoken about.",
          "English has one \"you\"; Russian has two, and the choice depends on the relationship rather than only on how many people there are.",
          "Say «ты» to a friend, a child or a relative, and «вы» to a stranger, a shop assistant or anyone older than you.",
          "The trap is that «вы» is also the polite word to one person, so a stranger and a group take the same form and the same verb ending.",
          "For a thing, \"it\" follows the noun's gender: a table is «он», a book is «она́», and only a neuter noun is «оно́».",
        ],
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
        why: [
          "English already does this with \"I\" and \"me\": the same person gets a different word depending on its job in the sentence.",
          "Russian has six such jobs, called cases, and a pronoun changes its form for each one, as a noun does.",
          "The left column names the case; the other two give \"I\" and \"you\" in that case, so «я» becomes «меня́» as the object of a verb.",
          "Forms repeat: the genitive (the \"of\" case) and the accusative (the direct object) share «меня́»; the dative (the \"to\" case) and the prepositional (the \"about\" case) share «мне».",
          "The trap is «мной» and «тобо́й», the instrumental (\"with\" or \"by\") forms, which look nothing like «я» and «ты» and must be learned as words.",
        ],
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
        why: [
          "«мой» is \"my\" and «твой» is the \"your\" that goes with «ты».",
          "«наш» is \"our\" and «ваш» is the \"your\" that goes with «вы», so it is also the polite \"your\" to one person.",
          "In English \"my\" has one shape; in Russian the word changes its ending to agree with the thing owned, as an adjective would.",
          "To choose the form, look at the noun after it: a masculine noun takes «мой», a feminine one «моя́» and a neuter one «моё».",
          "The trap is that the owner's own gender plays no part: a woman still says «мой дом», because «дом» is masculine.",
        ],
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
        why: [
          "«его́» is \"his\", «её» is \"her\" and «их» is \"their\", and these three keep one shape whatever noun follows.",
          "Unlike «мой», they do not agree with the thing owned: it is «её дом» and «её кни́га» with the same «её» before both.",
          "The reason is that they are really the genitive (the \"of\" form) of «он», «она» and «они», so \"her house\" is literally \"the house of her\".",
          "They do not change for case either, so the same «их» appears whether the thing owned is the subject or the object.",
          "The trap is that «его́» is also \"him\" and «её» is also \"her\" as the object of a verb, so the words around them tell you which reading is meant.",
        ],
        examples: [["её дом, её кни́га", "her house, her book"]],
      },
      {
        heading: "One's own: свой",
        rule: "When the owner is the subject of the sentence, «my», «his», «her» are all свой.",
        why: [
          "English \"his\" is ambiguous: in \"He loves his work\" the work may be his own or another man's.",
          "Russian separates the two: «свой» means \"one's own\" and points back to the subject of the sentence, whoever that is.",
          "So when the owner is the one doing the action, use «свой» whatever the person, and keep «мой» or «его́» for an owner who is somebody else.",
          "«свой» changes its ending like «мой»: in the first example it is «свою́» because «рабо́ту» is feminine and the object of the verb.",
          "The trap: «свой» only points back to the subject of its own sentence, so it cannot describe the subject itself, and \"his work is good\" uses «его́».",
        ],
        examples: [
          ["Он лю́бит свою́ рабо́ту.", "He loves his own work."],
          ["Он лю́бит его́ рабо́ту.", "He loves his work — someone else's."],
        ],
      },
    ],
  },

  /* ------------------------------------------------------------- numbers */
  {
    id: "numbers",
    title: "Numbers",
    blurb: "Which case follows a number",
    sections: [
      {
        heading: "One, a few, many",
        rule: "The number decides the case of the noun after it: one, two to four, or five and up.",
        why: [
          "In English the noun after a number changes only once, from \"one table\" to \"two tables\"; Russian has three patterns instead of two.",
          "After «оди́н» the noun stays in its dictionary form, the nominative, exactly as it appears in a word list: «оди́н стол».",
          "After two, three or four, the noun takes the genitive singular, the \"of\" form of one thing, so «стол» becomes «стола́».",
          "From five upwards it takes the genitive plural, the \"of\" form of several things, which for this word is «столо́в».",
          "To use the table, find the number's row, read the middle column for the form the noun needs, and the example shows that form on «стол».",
        ],
        table: {
          title: "Counting",
          columns: ["Number", "Noun", "Example"],
          rows: [
            ["1", "nominative singular", "оди́н стол"],
            ["2, 3, 4", "genitive singular", "два стола́"],
            ["5 and up", "genitive plural", "пять столо́в"],
          ],
        },
        cards: ["time"],
      },
      {
        heading: "The last digit decides",
        rule: "In a long number only the last word counts: 21 is like 1, 22 like 2.",
        why: [
          "A long number is read from its last word, because that word is the one standing next to the noun.",
          "So 21 behaves like one, 22 to 24 like two, and 25 to 30 like five, and the noun follows the same three rows as in the section above.",
          "The examples show it on \"year\": «год» after «оди́н», «го́да» after «два», and «лет» after «пять», although every number is in the twenties.",
          "The trap is 11 to 14: «одиннадцать» is a single word, not \"ten and one\", so it counts as a large number and takes the genitive plural.",
          "Notice too that «лет» is a separate word standing in for the genitive plural of «год»; the pattern is regular here, the word is not.",
        ],
        examples: [
          ["два́дцать оди́н год", "twenty-one years"],
          ["два́дцать два го́да", "twenty-two years"],
          ["два́дцать пять лет", "twenty-five years"],
        ],
      },
      {
        heading: "One and two have genders",
        rule: "оди́н, одна́, одно́ agree with the noun, and two is две for feminine nouns.",
        why: [
          "«оди́н» behaves like an adjective and agrees with the noun's gender, so a feminine noun takes «одна́» and a neuter one «одно́».",
          "Two has a feminine form only: «две» goes before feminine nouns, while masculine and neuter nouns both take «два».",
          "Three, four and the higher numbers have one form for every gender, so the gender question only arises for one and two.",
          "To decide, look at the noun: «брат» is masculine, so «оди́н брат» and «два бра́та»; «сестра́» is feminine, so «одна́ сестра́» and «две сестры́».",
          "This holds at the end of a long number too, so twenty-one women is «двадцать одна́» and twenty-two women is «двадцать две».",
        ],
        examples: [
          ["оди́н брат, одна́ сестра́", "one brother, one sister"],
          ["два бра́та, две сестры́", "two brothers, two sisters"],
        ],
      },
    ],
  },

  /* ------------------------------------------------------------ movement */
  {
    id: "motion",
    title: "Going somewhere",
    blurb: "Walking, driving, one way or many",
    sections: [
      {
        heading: "On foot or by transport",
        rule: "Russian says how you go: идти́ is on foot, е́хать is by car, bus or train.",
        why: [
          "English \"go\" covers walking and driving alike; Russian has no such general word, and every sentence about going says which it is.",
          "«идти́» is going on foot, and «е́хать» is going in or on anything with wheels or rails, so \"I am going to school\" depends on how you get there.",
          "Walking there it is «Я иду́ в шко́лу», taking the bus it is «Я еду в шко́лу», and the only word that changed is the verb.",
          "Both verbs are irregular in the present, so learn the forms as they stand in the examples: «иду́» and «идёт» from «идти́», «е́дем» and «еду» from «е́хать».",
          "The destination after «в» or «на» takes the accusative, the case of the thing the action is aimed at, which is why it is «шко́лу» and not «школа».",
        ],
        examples: [
          ["Я иду́ в шко́лу.", "I am walking to school."],
          ["Мы е́дем домо́й.", "We are driving home."],
        ],
      },
      {
        heading: "Once, or back and forth",
        rule: "идти́ and е́хать are one trip in one direction. ходи́ть and е́здить are round trips and habits.",
        why: [
          "Each of the two verbs has a partner, and the partner is not about the means of travel but about the shape of the trip.",
          "«идти́» and «е́хать» are a single movement in one direction, usually under way right now or at one moment: on the way, heading there.",
          "«ходи́ть» and «е́здить» cover the rest: going there and back, going regularly, or moving around with no fixed direction.",
          "The table's rows are the means, its columns the shape; in the examples «ка́ждый день» signals a habit, so «хожу́», and \"on his way\" is one trip, so «идёт».",
          "All four verbs are imperfective, and a round trip that is over is still the second kind: «Я ходил в магази́н» is \"I went to the shop and came back\".",
        ],
        table: {
          title: "The two pairs",
          columns: ["", "One way, now", "Round trips, habits"],
          rows: [
            ["On foot", "идти́", "ходи́ть"],
            ["By transport", "е́хать", "е́здить"],
          ],
        },
        examples: [
          ["Я хожу́ в шко́лу ка́ждый день.", "I go to school every day."],
          ["Он идёт в магази́н.", "He is on his way to the shop."],
        ],
      },
      {
        heading: "A prefix gives the direction",
        rule: "A prefix on идти́ says where the movement goes, and makes the verb perfective.",
        why: [
          "A prefix is a short piece added to the front of a verb, and on the verbs of motion it does the work of English \"arrive\", \"leave\" or \"go out\".",
          "The table shows four of them on «идти́», which changes its shape to «-йти» after a prefix; that is why «прийти́» and «уйти́» do not contain «идти́» whole.",
          "Adding the prefix also makes the verb perfective, so each of these names one completed movement, and its present endings point to the future: «приду» is \"I will arrive\".",
          "For the process or the habit the same prefixes go on «ходить» instead, and that verb stays imperfective: «приходить» is \"to come\" regularly or to be on the way.",
          "The past of «идти́» is irregular, «шёл» for a man and «шла» for a woman, and the prefixed verbs keep it, as «пришёл» and «ушла́» in the examples show.",
        ],
        table: {
          title: "Prefixes",
          columns: ["Prefix", "Meaning", "Example"],
          rows: [
            ["при-", "arrive", "прийти́"],
            ["у-", "leave", "уйти́"],
            ["в-", "go in", "войти́"],
            ["вы-", "go out", "вы́йти"],
          ],
        },
        examples: [
          ["Он пришёл домо́й.", "He came home."],
          ["Она́ ушла́.", "She has left."],
        ],
      },
    ],
  },

  /* -------------------------------------------------------- prepositions */
  {
    id: "prepositions",
    title: "Prepositions",
    blurb: "Which case each one takes",
    sections: [
      {
        heading: "Where, and where to",
        rule: "в and на take the prepositional for where something is, the accusative for where it goes.",
        why: [
          "«в» means \"in\" or \"at\" and «на» means \"on\" or \"at\", and each can describe either a position or a destination.",
          "English shows the difference with the preposition itself, \"at school\" against \"to school\"; Russian keeps the preposition and changes the noun's ending instead.",
          "For where something is, the noun takes the prepositional case, the location form, which for most nouns ends in «е»: «в шко́ле».",
          "For where something is going, after a verb of motion, the noun takes the accusative, the direct object form, so «школа» becomes «шко́лу».",
          "The trap is that both examples use «в»: the preposition does not tell you which meaning it is, only the ending and the verb do.",
        ],
        examples: [
          ["Я в шко́ле.", "I am at school — where"],
          ["Я иду́ в шко́лу.", "I am going to school — where to"],
        ],
      },
      {
        heading: "Each one, its case",
        rule: "Every other preposition always takes the same case. Learn the case with the word.",
        why: [
          "Apart from «в» and «на», most prepositions are tied to one case, so the ending of the noun after them is decided by the preposition alone.",
          "The table is organised by case: find the preposition in the middle column, and the left column tells you which form the following noun needs.",
          "The genitive is the \"of\" form and the dative is the \"to\" form, used for movement towards someone.",
          "The accusative is the direct object form, the instrumental the \"with\" or \"by\" form, and the prepositional the location form from the section above.",
          "Learn the case as part of the word, because «с» appears in two rows: with the genitive it means \"off\" or \"from\", with the instrumental it means \"with\".",
        ],
        table: {
          title: "Prepositions",
          columns: ["Case", "Prepositions", "Meaning"],
          rows: [
            ["Genitive", "из, с, от, у, без, для", "from, at, without, for"],
            ["Dative", "к, по", "towards, along"],
            ["Accusative", "че́рез, про", "across, about"],
            ["Instrumental", "с, над, под, за", "with, above, under, behind"],
            ["Prepositional", "о, при", "about, in the time of"],
          ],
        },
      },
      {
        heading: "Out of, and away from",
        rule: "из is out of a place entered with в; с is off one entered with на; от is from a person.",
        why: [
          "English says \"from\" for all three; Russian has three words, and all of them take the genitive, the \"of\" form.",
          "The choice mirrors how you went there: a place you enter with «в» is left with «из», and a place you go to with «на» is left with «с».",
          "So «в шко́лу» pairs with «из шко́лы», and «на рабо́ту» pairs with «с рабо́ты», which is why each example shows both halves.",
          "«от» is for a person or a source rather than a place: a letter «от бра́та» is a letter from my brother.",
          "The trap is that «с» here takes the genitive, while «с» meaning \"with\" takes the instrumental, so the ending tells them apart: «с рабо́ты» against «с братом».",
        ],
        examples: [
          ["из шко́лы", "from school — you go в шко́лу"],
          ["с рабо́ты", "from work — you go на рабо́ту"],
          ["от бра́та", "from my brother"],
        ],
      },
    ],
  },

  /* ----------------------------------------------------------- sentences */
  {
    id: "sentences",
    title: "Building sentences",
    blurb: "No, would, there is",
    sections: [
      {
        heading: "No is said twice",
        rule: "With никто́, ничего́, никогда́ the verb still takes не. Two negatives make one.",
        why: [
          "English allows one negative in a clause: \"I don't know anything\" uses \"anything\" rather than \"nothing\".",
          "Russian stacks them: a word like «ничего́» (\"nothing\") or «никогда́» (\"at no time\") still needs «не» in front of the verb.",
          "The mechanical step is to put «не» directly before the verb whenever a word like «никто́» or «ничего́» is in the sentence, however many of them there are.",
          "In «Я ничего́ не зна́ю» the «не» sits before «зна́ю» and «ничего́» comes earlier, which is the usual order.",
          "The trap is reading the two negatives as a positive, as English would: here they do not cancel, so the sentence means exactly \"I know nothing\".",
        ],
        examples: [
          ["Я ничего́ не зна́ю.", "I don't know anything."],
          ["Он никогда́ не был в Москве́.", "He has never been to Moscow."],
        ],
      },
      {
        heading: "There is, there is not",
        rule: "есть says a thing exists or someone has it; нет says it does not, and takes the genitive.",
        why: [
          "Russian has no everyday verb for \"to have\"; instead it says \"at me there is a brother\", with «у» plus the owner and then «есть».",
          "«у меня́» is \"at me\", with «я» in the genitive (the \"of\" form), and «есть» is \"there is\", so «У меня́ есть брат» is \"I have a brother\".",
          "To say the thing is absent, swap «есть» for «нет» and put the thing itself into the genitive: «брат» becomes «бра́та».",
          "«нет» therefore does two jobs: on its own it is \"no\", and before a noun in the genitive it is \"there is no\".",
          "The trap is leaving the noun in its dictionary form after «нет»; the missing thing must take the genitive ending whatever its gender.",
        ],
        examples: [
          ["У меня́ есть брат.", "I have a brother."],
          ["У меня́ нет бра́та.", "I don't have a brother."],
        ],
      },
      {
        heading: "Would: бы",
        rule: "бы and the past tense make «would», for wishes and for things that did not happen.",
        why: [
          "English makes \"would\" with a helper verb; Russian uses the small word «бы» together with the past tense of the verb.",
          "The past tense here does not mean the past: «Я бы хоте́л ко́фе» is a present wish, \"I would like a coffee\".",
          "The mechanical step is to put the verb in its past form and add «бы», usually right after the subject or after «е́сли» (\"if\").",
          "In an \"if\" sentence both halves take «бы», so «Е́сли бы я знал, я бы пришёл» has it twice.",
          "The trap is that one form covers both \"would\" and \"would have\": the same sentence can mean either, and only the context says which.",
        ],
        examples: [
          ["Я бы хоте́л ко́фе.", "I would like a coffee."],
          ["Е́сли бы я знал, я бы пришёл.", "If I had known, I would have come."],
        ],
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
  numeral: "numbers",
  preposition: "prepositions",
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
    for (const w of s.why || []) add(w, where);
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
      /* The explanation: present, sentence by sentence, each short, no dashes
         (ui.js Note splits on full stops, so a sentence is one line). */
      if (!Array.isArray(s.why) || s.why.length < WHY_MIN) bad.push(`${at}: no explanation under the rule (why)`);
      else {
        if (s.why.length > WHY_MAX) bad.push(`${at}: the explanation runs to ${s.why.length} sentences`);
        for (const w of s.why) {
          if (words(w) > WHY_WORDS) bad.push(`${at}: "${w.slice(0, 40)}…" runs to ${words(w)} words`);
          if (/[—–]/.test(w)) bad.push(`${at}: a dash in "${w.slice(0, 40)}…"`);
          if (!/[.!?]$/.test(w.trim())) bad.push(`${at}: "${w.slice(0, 40)}…" does not end a sentence`);
          if (/[Ѐ-ӿ]/.test(w) && !/«[^»]*[Ѐ-ӿ][^»]*»/.test(w)) bad.push(`${at}: Russian outside guillemets in "${w.slice(0, 40)}…"`);
        }
      }
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
