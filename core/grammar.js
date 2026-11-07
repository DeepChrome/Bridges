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
 *
 * **In the order it is taught** (the owner, 2026-11-06: *"Revisit our grammar
 * rules and make sure they are taught extremely well and in an order that
 * makes sense. Look up how it's typically taught by more established Russian
 * language courses. Have tables where it makes sense… examples that show the
 * differences"*). The courses agree on the sequence (docs/grammar-sequence.md):
 * no articles and no "is", gender, the present tense, the plural, the
 * prepositional, the accusative, the past, the genitive, the dative, the
 * instrumental, aspect, the future. The topics follow it, each naming the unit
 * that teaches it (`from`) so the screen can say which chapter; the cases run
 * in teaching order, prepositional first, not the order a grammar book lists
 * them. Every case and every paradigm is shown on real words, with the ending
 * set apart (`|` in a cell: «стол|а́»), and a point that turns on one
 * difference is shown as a `contrast` — two sentences that differ in exactly
 * that, the differing words drawn in the brand colour.
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
/* The label on one line of a contrast: what that line is, in a few words. */
export const LABEL_WORDS = 5;

/* A topic:
 *   id, title, blurb
 *   from      optional; the unit whose card first teaches it — the chapter the
 *             list shows is read off that unit, never written here
 *
 * A section:
 *   heading   2–5 words, what this is
 *   rule      one sentence, <= RULE_WORDS
 *   why       WHY_MIN–WHY_MAX sentences, each <= WHY_WORDS: what the point is,
 *             when it applies, how to form it, the trap; Russian in «guillemets»
 *   uses      optional; short lines, each a separate job the form does
 *   table     optional; { title, columns, rows } — the paradigm-table shape, so
 *             one renderer draws these and a word's own declension alike. A
 *             cell may hold «stem|ending» to set the ending apart, or a list of
 *             forms. `tables` is a list of them.
 *   contrast  optional; [{ lines: [[russian, english, label], …] }] — two or
 *             three sentences that differ in the one thing the section is about
 *   examples  optional; [russian, english] pairs
 *   cards     optional; unit ids whose grammar card teaches this, drawn from
 *             the payload rather than restated here
 */

/* The endings every case page shows on the same eight nouns, so the pages
   read as one set: hard and soft of each gender, and the -ь feminine. */
const CASE_ROWS = ["m · hard", "m · soft", "f · -а", "f · -я", "f · -ь", "n · -о", "n · -е"];
const caseTable = (name, forms) => ({
  title: `Dictionary form → ${name}`,
  columns: ["", "Dictionary", name],
  rows: CASE_ROWS.map((label, k) => [label, forms[k][0], forms[k][1]]),
});

export const TOPICS = [
  /* ----------------------------------------------------- first sentences */
  {
    id: "first",
    title: "First sentences",
    blurb: "No a, no the, no is",
    from: "core1",
    sections: [
      {
        heading: "No a, no the",
        rule: "Russian has no words for a or the. «дом» is a house or the house.",
        why: [
          "English puts a or the before almost every noun; Russian has neither word, so a noun simply stands on its own.",
          "Whether «дом» means a house or the house comes from the situation, the way it does in a newspaper headline.",
          "So never look for a word to translate a or the, and never add one when you speak.",
        ],
        examples: [
          ["Э́то дом.", "This is a house."],
          ["Дом большо́й.", "The house is big."],
        ],
        cards: ["core1"],
      },
      {
        heading: "No is",
        rule: "In the present tense, is, am and are are left out.",
        why: [
          "Russian has a verb for to be, but in the present tense it is simply not said, so I am a student is «Я студе́нт».",
          "Between two nouns, writing often puts a long dash where English has is, and speech a short pause.",
          "The past and the future do use the verb, which is why «был» appears in the second line and nothing in the first.",
        ],
        contrast: [{ lines: [
          ["Я до́ма.", "I am at home.", "now: no verb"],
          ["Я был до́ма.", "I was at home.", "then: был"],
        ] }],
      },
      {
        heading: "Это and этот",
        rule: "On its own «э́то» means this is. Before a noun, this agrees with the noun.",
        why: [
          "At the start of a sentence «э́то» points at something and names it, so «Э́то магази́н» is this is a shop, whatever the gender.",
          "Before a noun, this is a describing word instead, and it copies the noun's gender and number like any adjective.",
          "With a neuter noun the two look the same: «э́то окно́» is this window, and «Э́то окно́.» is this is a window.",
        ],
        table: {
          title: "This, before a noun",
          columns: ["", "this", "Example"],
          rows: [
            ["Masculine", "э́тот", "э́тот магази́н"],
            ["Feminine", "э́та", "э́та у́лица"],
            ["Neuter", "э́то", "э́то окно́"],
            ["Plural", "э́ти", "э́ти дома́"],
          ],
        },
        contrast: [{ lines: [
          ["Э́то магази́н.", "This is a shop.", "this is"],
          ["Э́тот магази́н большо́й.", "This shop is big.", "this shop"],
        ] }],
        cards: ["city"],
      },
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
        heading: "Asking a question",
        rule: "A yes or no question is the statement itself, said with a rising voice.",
        why: [
          "Russian has no do or does for questions, and the word order stays as it is: only the voice rises.",
          "The rise lands on the word being asked about, so the same words can ask different questions.",
          "Any other question starts with a question word from the table, and the rest of the sentence keeps its usual order, as in «Где ты живёшь?».",
        ],
        table: {
          title: "Question words",
          columns: ["", "Russian"],
          rows: [
            ["who", "кто"],
            ["what", "что"],
            ["where", "где"],
            ["where to", "куда́"],
            ["when", "когда́"],
            ["why", "почему́"],
            ["how", "как"],
            ["how much", "ско́лько"],
          ],
        },
        contrast: [{ lines: [
          ["Э́то твой дом.", "This is your house.", "statement"],
          ["Э́то твой дом?", "Is this your house?", "question: the voice rises"],
        ] }],
        cards: ["home"],
      },
    ],
  },

  /* ------------------------------------------------------------- gender */
  {
    id: "gender",
    title: "Gender",
    blurb: "What the last letter tells you",
    from: "family",
    sections: [
      {
        heading: "The ending tells you",
        rule: "A noun's last letter says its gender. You almost never have to learn it separately.",
        why: [
          "Every Russian noun belongs to one of three groups called genders: masculine, feminine or neuter, and for most words this has nothing to do with meaning.",
          "To find a noun's gender, look at the last letter of its dictionary form and read across the matching row of the table.",
          "A consonant or «й» at the end makes «стол» masculine, «а» or «я» makes «кни́га» feminine, and «о» or «е» makes «окно́» neuter.",
          "The one letter that gives no answer is the soft sign «ь», which a section below covers.",
        ],
        table: {
          title: "Nouns",
          columns: ["Gender", "Ends in", "Examples"],
          rows: [
            ["Masculine", "a consonant, -й", "стол, брат, музе́й"],
            ["Feminine", "-а, -я", "кни́га, ма́ма, неде́ля"],
            ["Neuter", "-о, -е", "окно́, сло́во, мо́ре"],
            ["Learn it", "-ь", "день (m), дверь (f)"],
          ],
        },
        cards: ["family"],
      },
      {
        heading: "Words for men",
        rule: "A word for a man is masculine even when it ends in -а or -я.",
        why: [
          "The ending rule has one group of exceptions you can see coming: nouns that name a man or a boy.",
          "«па́па», «де́душка», «дя́дя» and «мужчи́на» end like feminine words but are masculine, because here the meaning wins over the ending.",
          "Everything that agrees with them is masculine too, so it is «мой па́па», and in the past tense «па́па был до́ма».",
        ],
        contrast: [{ lines: [
          ["мой па́па", "my dad", "masculine: a man"],
          ["моя́ ма́ма", "my mom", "feminine"],
        ] }],
      },
      {
        heading: "The soft sign",
        rule: "A noun ending in -ь can be either gender, so learn that one with the word.",
        why: [
          "The soft sign «ь» is a letter with no sound of its own, and a noun ending in it may be masculine or feminine.",
          "Because the ending gives no clue, the gender has to be remembered together with the word, the way its meaning is.",
          "Two patterns help: a noun ending in «-ость» that names a quality is feminine, and one ending in «-тель» is masculine.",
          "A noun ending in one of the four letters «ж ч ш щ» followed by «ь» is feminine, with no exceptions.",
        ],
        contrast: [{ lines: [
          ["мой день", "my day", "masculine"],
          ["моя́ дверь", "my door", "feminine"],
        ] }],
      },
      {
        heading: "Why it matters",
        rule: "Adjectives, possessives and the past tense all copy the gender of the noun.",
        why: [
          "Gender is not a fact about the noun alone; the words attached to it change their endings to match it.",
          "That includes an adjective in front of the noun, a possessive such as «мой», and a verb in the past tense.",
          "In the lines below «но́вый» is the same word three times, but its ending becomes «-ая» before the feminine «кни́га» and «-ое» before the neuter «сло́во».",
          "So the first step before choosing any ending is to find the noun's gender from its last letter.",
        ],
        contrast: [{ lines: [
          ["но́вый дом", "a new house", "masculine"],
          ["но́вая кни́га", "a new book", "feminine"],
          ["но́вое сло́во", "a new word", "neuter"],
        ] }],
        cards: ["core3"],
      },
    ],
  },

  /* ------------------------------------------------------ present tense */
  {
    id: "verbs",
    title: "The present tense",
    blurb: "Two patterns, and a few to learn",
    from: "core2",
    sections: [
      {
        heading: "Two patterns",
        rule: "Almost every verb follows the -е- pattern or the -и- pattern in the present tense.",
        why: [
          "The present tense is what someone does now or does regularly, and Russian changes the verb's ending for every person, where English only adds an \"s\" for he and she.",
          "Start from the infinitive, the dictionary form ending in «-ть», take «-ть» off, and add the ending in the row for your subject: «я» gives «чита́ю», «ты» gives «чита́ешь».",
          "The two columns are the two patterns: the left endings are built on «е», the right ones on «и», and the «я» and «они́» rows differ the most.",
          "Which pattern a verb takes is a fact about that verb, not a choice, so learn each new verb together with its «я» and «они́» forms.",
        ],
        table: {
          title: "Present tense",
          columns: ["", "-е- · чита́ть", "-и- · говори́ть"],
          rows: [
            ["я", "чита́|ю", "говор|ю́"],
            ["ты", "чита́|ешь", "говор|и́шь"],
            ["он, она́", "чита́|ет", "говор|и́т"],
            ["мы", "чита́|ем", "говор|и́м"],
            ["вы", "чита́|ете", "говор|и́те"],
            ["они́", "чита́|ют", "говор|я́т"],
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
        contrast: [{ lines: [
          ["они́ чита́ют", "they read", "-ют: first pattern"],
          ["они́ говоря́т", "they speak", "-ят: second pattern"],
        ] }],
      },
      {
        heading: "A changed я form",
        rule: "In many -ить and -еть verbs the last consonant changes in the я form, and only there.",
        why: [
          "Some second pattern verbs swap the consonant before the ending when the subject is «я», then go back to normal for every other person.",
          "The swaps are regular: «в» gains an «-л», as does «б», while «д» becomes «ж», «с» becomes «ш» and «т» becomes «ч».",
          "So «люби́ть» gives «люблю́» for I, then «лю́бишь» and «лю́бит» built on the stem you expect.",
          "Read each row across: the «я» form is the odd one, and the «ты» form shows the stem every other person uses.",
        ],
        table: {
          title: "я and ты",
          columns: ["Verb", "я", "ты"],
          rows: [
            ["люби́ть", "люблю́", "лю́бишь"],
            ["гото́вить", "гото́влю", "гото́вишь"],
            ["ви́деть", "ви́жу", "ви́дишь"],
            ["ходи́ть", "хожу́", "хо́дишь"],
            ["проси́ть", "прошу́", "про́сишь"],
            ["плати́ть", "плачу́", "пла́тишь"],
          ],
        },
      },
      {
        heading: "Ones to learn by heart",
        rule: "A handful of everyday verbs follow neither pattern fully. Learn their six forms as words.",
        why: [
          "The verbs you need first are also the least regular, because the commonest words keep their old shapes longest.",
          "«хоте́ть» mixes the two patterns, «мочь» has «г» in «могу́» and «мо́гут» but «ж» in between, and «есть», to eat, has endings of its own.",
          "«жить» and «е́хать» are regular once you know the stems the infinitive hides: «жив-» and «-ед-».",
          "Read each column down: it is one verb, and the rows are the same six people as in the patterns above.",
        ],
        tables: [
          {
            title: "Want, can, eat",
            columns: ["", "хоте́ть", "мочь", "есть"],
            rows: [
              ["я", "хочу́", "могу́", "ем"],
              ["ты", "хо́чешь", "мо́жешь", "ешь"],
              ["он, она́", "хо́чет", "мо́жет", "ест"],
              ["мы", "хоти́м", "мо́жем", "еди́м"],
              ["вы", "хоти́те", "мо́жете", "еди́те"],
              ["они́", "хотя́т", "мо́гут", "едя́т"],
            ],
          },
          {
            title: "Live, ride, drink",
            columns: ["", "жить", "е́хать", "пить"],
            rows: [
              ["я", "живу́", "е́ду", "пью"],
              ["ты", "живёшь", "е́дешь", "пьёшь"],
              ["он, она́", "живёт", "е́дет", "пьёт"],
              ["мы", "живём", "е́дем", "пьём"],
              ["вы", "живёте", "е́дете", "пьёте"],
              ["они́", "живу́т", "е́дут", "пьют"],
            ],
          },
        ],
        cards: ["food", "tech"],
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
            ["я", "учу́|сь"],
            ["ты", "у́чишь|ся"],
            ["он, она́", "у́чит|ся"],
            ["мы", "у́чим|ся"],
            ["вы", "у́чите|сь"],
            ["они́", "у́чат|ся"],
          ],
        },
        cards: ["school"],
      },
    ],
  },

  /* ---------------------------------------------------------- adjectives */
  {
    id: "adjectives",
    title: "Adjectives",
    blurb: "They copy the noun",
    from: "core3",
    sections: [
      {
        heading: "It copies its noun",
        rule: "An adjective takes the gender, number and case of the noun it describes.",
        why: [
          "An adjective is a describing word, and in Russian it has no fixed ending of its own; it borrows gender, number and case from the noun it sits with.",
          "Find the noun's gender from its last letter, find the adjective's row from its dictionary form, and read the cell where they cross.",
          "The plural column serves all three genders, so a masculine and a feminine noun take the same plural adjective.",
          "These are the subject forms; the full table for every case is further down this page.",
        ],
        table: {
          title: "Three kinds",
          columns: ["", "Masculine", "Feminine", "Neuter", "Plural"],
          rows: [
            ["Hard", "но́в|ый", "но́в|ая", "но́в|ое", "но́в|ые"],
            ["Soft", "си́н|ий", "си́н|яя", "си́н|ее", "си́н|ие"],
            ["Stressed", "молод|о́й", "молод|а́я", "молод|о́е", "молод|ы́е"],
          ],
        },
        contrast: [{ lines: [
          ["но́вый дом", "a new house", "masculine"],
          ["но́вая маши́на", "a new car", "feminine"],
          ["но́вые маши́ны", "new cars", "plural"],
        ] }],
      },
      {
        heading: "Which of the three",
        rule: "The dictionary form tells you: -ый is hard, -ий is soft, -ой is hard with the stress on the ending.",
        why: [
          "The three rows of the table above are three stem types, and the dictionary form of an adjective, its masculine nominative, says which row it belongs to.",
          "Look at the last two letters: «-ый» means hard, «-ий» means soft, and «-ой» means hard with the stress on the ending.",
          "The stressed type uses the hard endings throughout; it differs only in where the stress falls and in the masculine «-ой» in place of «-ый».",
          "The trap is an «-ий» that follows one of the seven spelling-rule letters; it looks soft and is not, as the next section shows.",
        ],
        examples: [
          ["но́вый", "new — hard"],
          ["си́ний", "dark blue — soft"],
          ["молодо́й", "young — stressed ending"],
        ],
      },
      {
        heading: "The seven letters again",
        rule: "After к г х ж ч ш щ a hard adjective is spelled -ий, though it behaves as hard.",
        why: [
          "The spelling rule reaches adjectives too: after «к г х» and «ж ч ш щ» the letter «ы» is not written, so «-ый» appears as «-ий».",
          "Such a word is still hard, and its other forms use the hard row: «ру́сский» gives «русская» and «русское», not the soft «-яя» and «-ее».",
          "After «ж ч ш щ» the second spelling rule applies as well, so «хоро́ший» has the neuter «хорошее», where «е» stands for an unstressed «о».",
          "Compare each row with the hard row above: only the letters the spelling rules touch have moved.",
        ],
        table: {
          title: "Spelled -ий, still hard",
          columns: ["", "Masculine", "Feminine", "Neuter", "Plural"],
          rows: [
            ["after к", "ру́сск|ий", "ру́сск|ая", "ру́сск|ое", "ру́сск|ие"],
            ["after ш", "хоро́ш|ий", "хоро́ш|ая", "хоро́ш|ее", "хоро́ш|ие"],
            ["stressed", "больш|о́й", "больш|а́я", "больш|о́е", "больш|и́е"],
          ],
        },
      },
      {
        heading: "In the plural",
        rule: "Every gender takes one plural ending: -ые, or -ие on soft stems and after the seven letters.",
        why: [
          "In the plural the three genders stop mattering, so one form serves «дома́», «маши́ны» and «о́кна» alike.",
          "A hard adjective takes «-ые», as «но́вые» does; a soft one, or one whose stem ends in «к г х ж ч ш щ», takes «-ие».",
          "So the only question in the plural is the adjective's own stem, which its dictionary form already told you.",
        ],
        contrast: [{ lines: [
          ["но́вые дома́", "new houses", "-ые"],
          ["больши́е дома́", "big houses", "-ие after ш"],
        ] }],
        cards: ["clothes"],
      },
      {
        heading: "In every case",
        rule: "Masculine and neuter differ only in two cases. The feminine ends in -ой in four of its six.",
        why: [
          "Read the table down one column for one gender; the rows are the six cases, in the order of the case pages.",
          "The ending «-ого» is said as if it were written «-ово», so «но́вого» sounds like novovo; the spelling keeps the old «г».",
          "Where the accusative shows two forms, the top one goes with a thing and the lower with a person or an animal, as the noun does.",
          "A soft adjective swaps each vowel for its soft partner, so «си́ний» gives «си́него», «си́нему» and «си́нюю».",
        ],
        tables: [
          {
            title: "Singular",
            columns: ["", "Masculine", "Neuter", "Feminine"],
            rows: [
              ["Nominative", "но́в|ый", "но́в|ое", "но́в|ая"],
              ["Prepositional", "но́в|ом", "но́в|ом", "но́в|ой"],
              ["Accusative", ["но́в|ый", "но́в|ого"], "но́в|ое", "но́в|ую"],
              ["Genitive", "но́в|ого", "но́в|ого", "но́в|ой"],
              ["Dative", "но́в|ому", "но́в|ому", "но́в|ой"],
              ["Instrumental", "но́в|ым", "но́в|ым", "но́в|ой"],
            ],
          },
          {
            title: "Plural, every gender",
            columns: ["", "Plural"],
            rows: [
              ["Nominative", "но́в|ые"],
              ["Prepositional", "но́в|ых"],
              ["Accusative", ["но́в|ые", "но́в|ых"]],
              ["Genitive", "но́в|ых"],
              ["Dative", "но́в|ым"],
              ["Instrumental", "но́в|ыми"],
            ],
          },
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
            ["но́вый", "нов|е́е", "newer"],
            ["бы́стрый", "быстр|е́е", "faster"],
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
        contrast: [{ lines: [
          ["Я гото́в.", "I am ready.", "a man"],
          ["Я гото́ва.", "I am ready.", "a woman"],
        ] }],
        examples: [
          ["Она́ ра́да.", "She is glad."],
          ["Мы должны́ идти́.", "We have to go."],
        ],
      },
    ],
  },

  /* ------------------------------------------------------------- numbers */
  {
    id: "numbers",
    title: "Numbers",
    blurb: "Which form follows a number",
    from: "time",
    sections: [
      {
        heading: "One, a few, many",
        rule: "The number decides the form of the noun after it: one, two to four, or five and up.",
        why: [
          "In English the noun after a number changes only once, from one table to two tables; Russian has three patterns instead of two.",
          "After «оди́н» the noun stays in its dictionary form, exactly as it appears in a word list: «оди́н час».",
          "After two, three or four, the noun takes the genitive singular, the \"of\" form of one thing, so «час» becomes «часа́».",
          "From five upwards it takes the genitive plural, the \"of\" form of several things, which for this word is «часо́в».",
          "The second table shows the three patterns on a noun of each gender; read down a column.",
        ],
        tables: [
          {
            title: "Counting",
            columns: ["Number", "Noun", "Example"],
            rows: [
              ["1", "dictionary form", "оди́н час"],
              ["2, 3, 4", "genitive singular", "два часа́"],
              ["5 and up", "genitive plural", "пять часо́в"],
            ],
          },
          {
            title: "One noun of each gender",
            columns: ["", "час", "неде́ля", "сло́во"],
            rows: [
              ["1", "оди́н час", "одна́ неде́ля", "одно́ сло́во"],
              ["2, 3, 4", "два часа́", "две неде́ли", "два сло́ва"],
              ["5 and up", "пять часо́в", "пять неде́ль", "пять слов"],
            ],
          },
        ],
        cards: ["time", "business"],
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
          "This holds at the end of a long number too, so twenty-one women is «двадцать одна́» and twenty-two women is «двадцать две».",
        ],
        contrast: [{ lines: [
          ["два бра́та", "two brothers", "masculine: два"],
          ["две сестры́", "two sisters", "feminine: две"],
        ] }],
      },
    ],
  },

  /* -------------------------------------------------------------- plural */
  {
    id: "plural",
    title: "The plural",
    blurb: "Two endings, and a few surprises",
    from: "core4",
    sections: [
      {
        heading: "The endings",
        rule: "Masculine and feminine nouns end in -ы or -и in the plural; neuter nouns in -а or -я.",
        why: [
          "The plural ending is chosen by the noun's own ending, so find the last letter of the dictionary form and read across the table.",
          "A consonant or «-а» takes «-ы»; «-й», «-я» and «-ь» take its soft partner «-и», and the «й» or «ь» itself goes.",
          "Neuter nouns take a different pair: «-о» becomes «-а» and «-е» becomes «-я», so a neuter plural can look like a feminine singular.",
          "Stress often moves in the plural, as in «окно́» and «о́кна», which is why the forms are worth hearing.",
        ],
        table: {
          title: "Singular and plural",
          columns: ["Ends in", "Singular", "Plural"],
          rows: [
            ["a consonant", "стол", "стол|ы́"],
            ["-й", "музе́й", "музе́|и"],
            ["-а", "ма́ма", "ма́м|ы"],
            ["-я", "неде́ля", "неде́л|и"],
            ["-ь", "дверь", "две́р|и"],
            ["-о", "окно́", "о́кн|а"],
            ["-е", "мо́ре", "мор|я́"],
          ],
        },
        cards: ["core4"],
      },
      {
        heading: "-и after seven letters",
        rule: "After к г х ж ч ш щ the plural ending is -и, never -ы.",
        why: [
          "Seven consonants are never followed by «ы» in Russian spelling, so where the table above would give «-ы» they take «-и».",
          "The noun has not become soft; it is the same hard noun, spelled the only way the letters allow.",
          "That is why «кни́га», an ordinary feminine in «-а», has the plural «кни́ги» and not «-ы».",
        ],
        table: {
          title: "Spelling, not softness",
          columns: ["After", "Singular", "Plural"],
          rows: [
            ["к", "язы́к", "язык|и́"],
            ["г", "кни́га", "кни́г|и"],
            ["ч", "врач", "врач|и́"],
          ],
        },
      },
      {
        heading: "Stressed -а for some masculines",
        rule: "A few common masculine nouns take a stressed -а́ in the plural instead of -ы.",
        why: [
          "These are a closed set of common words, so learn the plural with the word rather than by rule.",
          "The ending is always stressed, which is how to recognise one when you hear it: «города́», never with «-ы».",
          "Everything else about them is regular; only the plural looks different.",
        ],
        table: {
          title: "-а́ plurals",
          columns: ["", "Singular", "Plural"],
          rows: [
            ["city", "го́род", "город|а́"],
            ["house", "дом", "дом|а́"],
            ["eye", "глаз", "глаз|а́"],
            ["evening", "ве́чер", "вечер|а́"],
            ["train", "по́езд", "поезд|а́"],
            ["teacher", "учи́тель", "учител|я́"],
          ],
        },
      },
      {
        heading: "A different word",
        rule: "A few plurals have to be learned as words: челове́к gives лю́ди, ребёнок gives де́ти.",
        why: [
          "The commonest nouns for people have plurals that are a different word or a changed stem.",
          "«лю́ди» and «де́ти» are separate words that serve as the plural of «челове́к» and «ребёнок».",
          "Others add «-ья» or change the stem: «друг» becomes «друзья́» and «брат» becomes «бра́тья».",
        ],
        table: {
          title: "Plurals to learn",
          columns: ["", "Singular", "Plural"],
          rows: [
            ["person", "челове́к", "лю́ди"],
            ["child", "ребёнок", "де́ти"],
            ["friend", "друг", "друзья́"],
            ["brother", "брат", "бра́тья"],
            ["son", "сын", "сыновья́"],
            ["chair", "стул", "сту́лья"],
          ],
        },
        cards: ["body"],
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
        contrast: [{ lines: [
          ["стол, столы́", "a table, tables", "hard: -ы"],
          ["слова́рь, словари́", "a dictionary, dictionaries", "soft: -и"],
        ] }],
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
            ["Genitive", "стол|а́", "словар|я́"],
            ["Dative", "стол|у́", "словар|ю́"],
            ["Plural", "стол|ы́", "словар|и́"],
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
          "The lines below are the neuter adjective ending seen twice: «большо́е» is stressed on the ending, so it keeps «о»; «хоро́шее» is stressed on the stem, so it takes «е».",
          "Check two things: whether the last stem letter is one of those five, and whether the ending is unstressed; «е» is written only when both are true.",
          "The letter «ц» joins this rule but not the previous one; after «ц» the plural ending «-ы» stays «-ы», as in «отцы».",
        ],
        contrast: [{ lines: [
          ["большо́е окно́", "a big window", "stressed: о"],
          ["хоро́шее окно́", "a good window", "unstressed: е"],
        ] }],
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

  /* ------------------------------------------------------------ movement */
  {
    id: "motion",
    title: "Going somewhere",
    blurb: "Walking, driving, one way or many",
    from: "travel",
    sections: [
      {
        heading: "On foot or by transport",
        rule: "Russian says how you go: идти́ is on foot, е́хать is by car, bus or train.",
        why: [
          "English \"go\" covers walking and driving alike; Russian has no such general word, and every sentence about going says which it is.",
          "«идти́» is going on foot, and «е́хать» is going in or on anything with wheels or rails, so \"I am going home\" depends on how you get there.",
          "In the two lines below only the verb changed, and with it the way of getting home.",
          "The destination after «в» or «на» takes the accusative, the case of the thing the action is aimed at, which is why it is «шко́лу» and not «школа».",
        ],
        contrast: [{ lines: [
          ["Я иду́ домо́й.", "I am walking home.", "on foot"],
          ["Я е́ду домо́й.", "I am driving home.", "by transport"],
        ] }],
        cards: ["travel"],
      },
      {
        heading: "Once, or back and forth",
        rule: "идти́ and е́хать are one trip in one direction. ходи́ть and е́здить are round trips and habits.",
        why: [
          "Each of the two verbs has a partner, and the partner is not about the means of travel but about the shape of the trip.",
          "«идти́» and «е́хать» are a single movement in one direction, usually under way right now or at one moment: on the way, heading there.",
          "«ходи́ть» and «е́здить» cover the rest: going there and back, going regularly, or moving around with no fixed direction.",
          "All four verbs are imperfective, and a round trip that is over is still the second kind: «Я ходил в магази́н» is I went to the shop and came back.",
        ],
        table: {
          title: "The two pairs",
          columns: ["", "One way, now", "Round trips, habits"],
          rows: [
            ["On foot", "идти́", "ходи́ть"],
            ["By transport", "е́хать", "е́здить"],
          ],
        },
        contrast: [{ lines: [
          ["Я иду́ в шко́лу.", "I am on my way to school.", "one trip, now"],
          ["Я хожу́ в шко́лу.", "I go to school.", "a habit"],
        ] }],
      },
      {
        heading: "The four in the present",
        rule: "идти́ and е́хать follow the first pattern; ходи́ть and е́здить the second, with a changed я form.",
        why: [
          "All four are everyday verbs, so their forms are worth knowing by heart.",
          "«идти́» builds on «-ид-» and «е́хать» on «-ед-», stems the infinitives hide.",
          "«ходи́ть» and «е́здить» change their consonant in the «я» form only: «хожу́», «е́зжу».",
          "In the past «идти́» is irregular too: «шёл» for a man, «шла» for a woman, «шли» for several.",
        ],
        table: {
          title: "Present tense",
          columns: ["", "идти́", "е́хать", "ходи́ть", "е́здить"],
          rows: [
            ["я", "иду́", "е́ду", "хожу́", "е́зжу"],
            ["ты", "идёшь", "е́дешь", "хо́дишь", "е́здишь"],
            ["он, она́", "идёт", "е́дет", "хо́дит", "е́здит"],
            ["мы", "идём", "е́дем", "хо́дим", "е́здим"],
            ["вы", "идёте", "е́дете", "хо́дите", "е́здите"],
            ["они́", "иду́т", "е́дут", "хо́дят", "е́здят"],
          ],
        },
      },
      {
        heading: "A prefix gives the direction",
        rule: "A prefix on идти́ says where the movement goes, and makes the verb perfective.",
        why: [
          "A prefix is a short piece added to the front of a verb, and on the verbs of motion it does the work of English \"arrive\", \"leave\" or \"go out\".",
          "The table shows four of them on «идти́», which changes its shape to «-йти» after a prefix; that is why «прийти́» and «уйти́» do not contain «идти́» whole.",
          "Adding the prefix also makes the verb perfective, so each of these names one completed movement, and its present endings point to the future: «приду» is \"I will arrive\".",
          "For the process or the habit the same prefixes go on «ходить» instead, and that verb stays imperfective: «приходить» is \"to come\" regularly or to be on the way.",
          "The prefixed verbs keep the irregular past of «идти́», as «пришёл» and «ушла́» in the examples show.",
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

  /* -------------------------------------------------------------- cases */
  {
    id: "cases",
    title: "The six cases",
    blurb: "What each one is for, in order",
    from: "core5",
    sections: [
      {
        heading: "What a case is",
        rule: "The ending of a noun says what job it does in the sentence. Word order does not.",
        why: [
          "In English the order of the words says who did what: Mom loves her daughter and Her daughter loves Mom are two different sentences.",
          "Russian puts that information in the ending instead, so in the two lines below the endings show who loves whom.",
          "A case is one of six sets of endings, one for each job a noun can do in a sentence, from subject to of to with.",
          "The pages follow the order courses teach them in: the prepositional first, then the accusative, genitive, dative and instrumental.",
        ],
        /* «до́чку», not «дочь»: a feminine noun in -ь looks the same in the
           nominative and accusative, so «Дочь лю́бит ма́ма» reads as the
           daughter loving Mum and disproves the rule it was here to show
           (found by the review pre-pass, 2026-09-30). */
        contrast: [{ lines: [
          ["Ма́ма лю́бит до́чку.", "Mom loves her daughter.", "Mom does the loving"],
          ["До́чка лю́бит ма́му.", "The daughter loves Mom.", "the daughter does"],
        ] }],
        examples: [
          ["До́чку лю́бит ма́ма.", "Mom loves her daughter — the order moved, the meaning did not."],
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
        cards: ["core1", "body"],
      },
      {
        heading: "Prepositional", page: true,
        rule: "Where something is, and what something is about. It always follows a preposition.",
        why: [
          "The prepositional says where something is or what something is about, and it is used only after a preposition, which is where its name comes from.",
          "After «в» (in) and «на» (on, at) it answers «где», where, as in «Я живу́ в го́роде»; after «о» it means about, as in «о рабо́те».",
          "It is the easiest ending to form, which is why courses teach it first: take off the dictionary ending, if any, and add «-е» whatever the gender.",
          "A feminine noun in «-ь» takes «-и», one in «-ия» takes «-ии» («в России»), and a few short masculine nouns take a stressed «-у» («в лесу»).",
          "The trap is the same two prepositions with the accusative: «в шко́ле» is being at school, but «в шко́лу» is going to school.",
        ],
        uses: [
          "After в and на meaning where",
          "After о meaning about",
          "Almost always ends in -е",
        ],
        table: caseTable("Prepositional", [
          ["дом", "в до́м|е"], ["музе́й", "в музе́|е"], ["шко́ла", "в шко́л|е"], ["неде́ля", "о неде́л|е"],
          ["дверь", "о две́р|и"], ["окно́", "в окн|е́"], ["мо́ре", "в мо́р|е"],
        ]),
        contrast: [{ lines: [
          ["Я в шко́ле.", "I am at school.", "where: prepositional"],
          ["Я иду́ в шко́лу.", "I am going to school.", "where to: accusative"],
        ] }],
        cards: ["core5", "nature", "art"],
      },
      {
        heading: "Accusative", page: true,
        rule: "The direct object: the thing the verb is done to.",
        why: [
          "The accusative marks the direct object, the thing the verb is done to: ask what or whom after the verb and the answer is in this case.",
          "For feminine nouns, take off «-а» and add «-у», or take off «-я» and add «-ю», so «кни́га» becomes «кни́гу».",
          "Masculine nouns for things and all neuter nouns keep their dictionary form, so «стол» stays «стол».",
          "The trap is masculine nouns for people and animals: these take the genitive ending instead, so «брат» becomes «бра́та».",
          "After «в» and «на» the accusative means going somewhere, as in «Я иду́ в шко́лу»; with the prepositional the same two mean being somewhere.",
        ],
        uses: [
          "What the verb acts on",
          "After в and на meaning motion towards",
          "Animate masculine copies the genitive",
        ],
        table: {
          title: "Dictionary form → Accusative",
          columns: ["", "Dictionary", "Accusative"],
          rows: [
            ["m · thing", "стол", "стол"],
            ["m · person", "брат", "бра́т|а"],
            ["f · -а", "кни́га", "кни́г|у"],
            ["f · -я", "неде́ля", "неде́л|ю"],
            ["f · -ь", "дверь", "дверь"],
            ["n · -о", "окно́", "окно́"],
          ],
        },
        contrast: [{ lines: [
          ["Я ви́жу дом.", "I see a house.", "a thing: no change"],
          ["Я ви́жу бра́та.", "I see my brother.", "a person: -а"],
        ] }],
        cards: ["core6", "animals"],
      },
      {
        heading: "Genitive", page: true,
        rule: "Of, belonging to, and absent. It has more jobs than any other case.",
        why: [
          "The genitive is the \"of\" case: a noun in it follows another noun and says whose it is, so «кни́га бра́та» is my brother's book.",
          "It also marks what is missing after «нет», what is counted after «мно́го», «ма́ло» or a number, and the noun after prepositions such as «из», «от» and «у».",
          "Masculine and neuter nouns add «-а» or «-я», feminine ones change to «-ы» or «-и», so «стол» gives «стола́» and «ма́ма» gives «ма́мы».",
          "The spelling rule applies: after «к г х ж ч ш щ» the feminine ending is «-и», which is why «кни́га» gives «кни́ги».",
          "After 2, 3 and 4 the noun is genitive singular, as in «два часа́», but from 5 on it is genitive plural, «пять часо́в».",
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
          title: "Dictionary form → Genitive",
          columns: ["", "Dictionary", "Genitive"],
          rows: [
            ["m · hard", "стол", "стол|а́"],
            ["m · soft", "музе́й", "музе́|я"],
            ["f · -а", "ма́ма", "ма́м|ы"],
            ["f · after к", "кни́га", "кни́г|и"],
            ["f · -я", "неде́ля", "неде́л|и"],
            ["f · -ь", "дверь", "две́р|и"],
            ["n · -о", "окно́", "окн|а́"],
            ["n · -е", "мо́ре", "мо́р|я"],
          ],
        },
        contrast: [{ lines: [
          ["У меня́ есть брат.", "I have a brother.", "have: dictionary form"],
          ["У меня́ нет бра́та.", "I don't have a brother.", "have not: genitive"],
        ] }],
        examples: [
          ["кни́га бра́та", "my brother's book"],
          ["два часа́, пять часо́в", "two hours, five hours"],
        ],
        cards: ["work", "politics", "medicine"],
      },
      {
        heading: "Dative", page: true,
        rule: "To whom, and for whom: the person something is given, said or shown to.",
        why: [
          "The dative is the to someone or for someone case: the person who receives, is told or is shown something, with no preposition needed.",
          "Ask to whom after the verb and the answer is dative, so «Я звоню́ ма́ме» is I am calling Mom, the call going to her.",
          "It also names the person who feels something: liking, needing or being cold go with the dative, so I like is «Мне нра́вится», literally it pleases me.",
          "Masculine and neuter nouns add «-у» or «-ю», feminine nouns in «-а» or «-я» change to «-е», and those in «-ь» to «-и».",
          "The prepositions «к», towards someone, and «по», along or by, take the dative too.",
        ],
        uses: [
          "The indirect object — to whom",
          "The person who likes, needs or is cold",
          "After к and по",
        ],
        table: caseTable("Dative", [
          ["брат", "бра́т|у"], ["учи́тель", "учи́тел|ю"], ["ма́ма", "ма́м|е"], ["неде́ля", "неде́л|е"],
          ["дверь", "две́р|и"], ["окно́", "окн|у́"], ["мо́ре", "мо́р|ю"],
        ]),
        contrast: [{ lines: [
          ["Я ви́жу ма́му.", "I see Mom.", "whom: accusative"],
          ["Я звоню́ ма́ме.", "I am calling Mom.", "to whom: dative"],
        ] }],
        examples: [["Мне нра́вится э́тот го́род.", "I like this city."]],
        cards: ["emotion", "religion"],
      },
      {
        heading: "Instrumental", page: true,
        rule: "By, with, using — and what someone is or has become.",
        why: [
          "The instrumental is the with or by means of case: the tool you do something with, as in «Я пишу́ ру́чкой», I write with a pen.",
          "It also follows «с» meaning together with, as in «с бра́том», and names what someone works as or became, so «Он стал врачо́м».",
          "Masculine and neuter nouns add «-ом» or «-ем», feminine ones «-ой» or «-ей», and a feminine in «-ь» takes «-ью».",
          "After «ж ч ш щ ц» an unstressed «-ом» is written «-ем»: «врачо́м» is stressed and keeps its «о», «му́жем» is not.",
          "The place prepositions «под», «над», «за» and «пе́ред» take it too, and «с» with the genitive instead means from, so the ending tells the two apart.",
        ],
        uses: [
          "The tool something is done with",
          "After с meaning together with",
          "What someone works as or became",
          "After ме́жду, над, под, пе́ред, за",
        ],
        table: caseTable("Instrumental", [
          ["брат", "бра́т|ом"], ["учи́тель", "учи́тел|ем"], ["ма́ма", "ма́м|ой"], ["неде́ля", "неде́л|ей"],
          ["дверь", "две́р|ью"], ["окно́", "окн|о́м"], ["мо́ре", "мо́р|ем"],
        ]),
        contrast: [{ lines: [
          ["Я пишу́ ру́чкой.", "I write with a pen.", "the tool"],
          ["Я иду́ с бра́том.", "I am walking with my brother.", "together with: с"],
        ] }],
        examples: [["Он стал врачо́м.", "He became a doctor."]],
        cards: ["sport", "science", "law", "military"],
      },
      {
        heading: "Every case at a glance",
        rule: "Three nouns, one of each gender, through all six cases.",
        why: [
          "This is the whole system on one screen, in the order the pages above teach it.",
          "Read down a column to follow one noun, or across a row to compare the genders in one case.",
          "Two rows repeat others: a thing's accusative is its nominative, except for a feminine in «-а», and «кни́ге» serves both the prepositional and the dative.",
          "The plural table is simpler than the singular: from the dative on, every gender takes the same ending.",
        ],
        tables: [
          {
            title: "Singular",
            columns: ["", "стол", "кни́га", "окно́"],
            rows: [
              ["Nominative", "стол", "кни́г|а", "окн|о́"],
              ["Prepositional", "стол|е́", "кни́г|е", "окн|е́"],
              ["Accusative", "стол", "кни́г|у", "окн|о́"],
              ["Genitive", "стол|а́", "кни́г|и", "окн|а́"],
              ["Dative", "стол|у́", "кни́г|е", "окн|у́"],
              ["Instrumental", "стол|о́м", "кни́г|ой", "окн|о́м"],
            ],
          },
          {
            title: "Plural",
            columns: ["", "стол", "кни́га", "окно́"],
            rows: [
              ["Nominative", "стол|ы́", "кни́г|и", "о́кн|а"],
              ["Prepositional", "стол|а́х", "кни́г|ах", "о́кн|ах"],
              ["Accusative", "стол|ы́", "кни́г|и", "о́кн|а"],
              ["Genitive", "стол|о́в", "книг", "о́кон"],
              ["Dative", "стол|а́м", "кни́г|ам", "о́кн|ам"],
              ["Instrumental", "стол|а́ми", "кни́г|ами", "о́кн|ами"],
            ],
          },
        ],
      },
      {
        heading: "The plural endings",
        rule: "Four of the six are the same for every gender in the plural, which makes them the easy half.",
        why: [
          "In the plural, gender stops mattering for most cases: the dative, instrumental and prepositional take one ending each, in a hard and a soft spelling.",
          "Read the table by the last letter: a consonant, «-а» or «-о» takes the hard column, and «-ь», «-й» or «-я» takes the soft.",
          "The accusative plural is missing from the table because it borrows: the nominative plural for things, the genitive plural for people and animals of any gender.",
          "The genitive plural row shows two options, an ending or nothing at all, because that ending depends on the word; the next section covers it.",
        ],
        table: {
          title: "Plural",
          columns: ["Case", "Hard", "Soft"],
          rows: [
            ["Nominative", "-ы", "-и"],
            ["Prepositional", "-ах", "-ях"],
            ["Genitive", "-ов / —", "-ей / —"],
            ["Dative", "-ам", "-ям"],
            ["Instrumental", "-ами", "-ями"],
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
        table: {
          title: "Genitive plural",
          columns: ["Pattern", "Singular", "Genitive plural"],
          rows: [
            ["adds -ов", "стол", "стол|о́в"],
            ["adds -ей", "врач", "врач|е́й"],
            ["adds -ей", "день", "дн|ей"],
            ["no ending", "кни́га", "книг"],
            ["vowel slipped in", "окно́", "о́кон"],
          ],
        },
      },
    ],
  },

  /* -------------------------------------------------------- prepositions */
  {
    id: "prepositions",
    title: "Prepositions",
    blurb: "Which case each one takes",
    from: "core5",
    sections: [
      {
        heading: "Where, and where to",
        rule: "в and на take the prepositional for where something is, the accusative for where it goes.",
        why: [
          "«в» means \"in\" or \"at\" and «на» means \"on\" or \"at\", and each can describe either a position or a destination.",
          "English shows the difference with the preposition itself, \"at school\" against \"to school\"; Russian keeps the preposition and changes the noun's ending instead.",
          "For where something is, the noun takes the prepositional case, the location form, which for most nouns ends in «е»: «в шко́ле».",
          "For where something is going, after a verb of motion, the noun takes the accusative, the direct object form, so «школа» becomes «шко́лу».",
          "The trap is that both lines use «в»: the preposition does not tell you which meaning it is, only the ending and the verb do.",
        ],
        contrast: [{ lines: [
          ["Я в шко́ле.", "I am at school.", "where"],
          ["Я иду́ в шко́лу.", "I am going to school.", "where to"],
        ] }],
      },
      {
        heading: "Each one, its case",
        rule: "Every other preposition always takes the same case. Learn the case with the word.",
        why: [
          "Apart from «в» and «на», most prepositions are tied to one case, so the ending of the noun after them is decided by the preposition alone.",
          "Find the preposition in the left column, and the middle column tells you which form the following noun needs.",
          "Learn the case as part of the word, because «с» appears twice: with the genitive it means off or from, with the instrumental it means with.",
          "Single letter prepositions are said together with the next word, so «к ма́ме» sounds like one word.",
        ],
        table: {
          title: "Prepositions",
          columns: ["Preposition", "Case", "Meaning"],
          rows: [
            ["без", "genitive", "without"],
            ["для", "genitive", "for"],
            ["до", "genitive", "until, as far as"],
            ["из", "genitive", "out of"],
            ["о́коло", "genitive", "near"],
            ["от", "genitive", "from someone"],
            ["у", "genitive", "at, by"],
            ["к", "dative", "towards"],
            ["по", "dative", "along, by"],
            ["че́рез", "accusative", "across, in (time)"],
            ["про", "accusative", "about"],
            ["с", "instrumental", "with"],
            ["над", "instrumental", "above"],
            ["под", "instrumental", "under"],
            ["пе́ред", "instrumental", "in front of"],
            ["о", "prepositional", "about"],
          ],
        },
        cards: ["sport"],
      },
      {
        heading: "Out of, and away from",
        rule: "из is out of a place entered with в; с is off one entered with на; от is from a person.",
        why: [
          "English says \"from\" for all three; Russian has three words, and all of them take the genitive, the \"of\" form.",
          "The choice mirrors how you went there: a place you enter with «в» is left with «из», and a place you go to with «на» is left with «с».",
          "So «в шко́лу» pairs with «из шко́лы», and «на рабо́ту» pairs with «с рабо́ты», which is why the lines come in pairs.",
          "«от» is for a person or a source rather than a place: a letter «от бра́та» is a letter from my brother.",
          "The trap is that «с» here takes the genitive, while «с» meaning \"with\" takes the instrumental, so the ending tells them apart: «с рабо́ты» against «с братом».",
        ],
        contrast: [
          { lines: [
            ["Я иду́ в шко́лу.", "I am going to school.", "в: there"],
            ["Я иду́ из шко́лы.", "I am coming from school.", "из: back"],
          ] },
          { lines: [
            ["Я иду́ на рабо́ту.", "I am going to work.", "на: there"],
            ["Я иду́ с рабо́ты.", "I am coming from work.", "с: back"],
          ] },
        ],
        examples: [["письмо́ от бра́та", "a letter from my brother"]],
      },
    ],
  },

  /* ------------------------------------------------------------ pronouns */
  {
    id: "pronouns",
    title: "Pronouns",
    blurb: "Every person, in every case",
    from: "work",
    sections: [
      {
        heading: "They decline too",
        rule: "A pronoun takes a case like any noun, and the forms are worth knowing by heart.",
        why: [
          "English already does this with I and me: the same person gets a different word depending on its job in the sentence.",
          "Russian has six such jobs, the cases, and a pronoun changes its form for each one, as a noun does.",
          "Forms repeat down each column: the genitive and the accusative share «меня́», «тебя́», «его́»; the dative and the prepositional share «мне» and «тебе́».",
          "The trap is the instrumental, «мной» and «тобо́й», which look nothing like «я» and «ты» and must be learned as words.",
        ],
        tables: [
          {
            title: "Singular",
            columns: ["", "я", "ты", "он, оно́", "она́"],
            rows: [
              ["Nominative", "я", "ты", "он", "она́"],
              ["Prepositional", "мне", "тебе́", "нём", "ней"],
              ["Accusative", "меня́", "тебя́", "его́", "её"],
              ["Genitive", "меня́", "тебя́", "его́", "её"],
              ["Dative", "мне", "тебе́", "ему́", "ей"],
              ["Instrumental", "мной", "тобо́й", "им", "ей"],
            ],
          },
          {
            title: "Plural",
            columns: ["", "мы", "вы", "они́"],
            rows: [
              ["Nominative", "мы", "вы", "они́"],
              ["Prepositional", "нас", "вас", "них"],
              ["Accusative", "нас", "вас", "их"],
              ["Genitive", "нас", "вас", "их"],
              ["Dative", "нам", "вам", "им"],
              ["Instrumental", "на́ми", "ва́ми", "и́ми"],
            ],
          },
        ],
      },
      {
        heading: "An н after a preposition",
        rule: "After a preposition, его, её, им and их gain an н: у него́, с ней, о них.",
        why: [
          "The forms of «он», «она́» and «они́» that begin with a vowel take an «н» in front whenever a preposition comes before them.",
          "So «его́» on its own is him, but at his place is «у него́», and with her is «с ней».",
          "That is also why the prepositional column of the table starts with «н»: that case always has a preposition in front.",
          "The possessive his, «его́», never takes the «н», because there the preposition belongs to the noun after it: «у его́ бра́та».",
        ],
        contrast: [{ lines: [
          ["Я ви́жу его́.", "I see him.", "no preposition"],
          ["Я у него́.", "I am at his place.", "after у: н"],
        ] }],
      },
      {
        heading: "My, your, our",
        rule: "мой, твой, наш and ваш take the gender of the thing owned, never of the owner.",
        why: [
          "«мой» is my and «твой» is the your that goes with «ты»; «наш» is our and «ваш» is the your that goes with «вы», polite or plural.",
          "In English my has one shape; in Russian the word changes its ending to agree with the thing owned, as an adjective would.",
          "To choose the form, look at the noun after it and read its column: «мой дом», «моя́ кни́га», «моё окно́».",
          "The trap is that the owner's own gender plays no part: a woman still says «мой дом», because «дом» is masculine.",
        ],
        table: {
          title: "Possessives",
          columns: ["", "Masculine", "Feminine", "Neuter", "Plural"],
          rows: [
            ["my", "мой", "моя́", "моё", "мои́"],
            ["your (ты)", "твой", "твоя́", "твоё", "твои́"],
            ["our", "наш", "на́ша", "на́ше", "на́ши"],
            ["your (вы)", "ваш", "ва́ша", "ва́ше", "ва́ши"],
          ],
        },
        contrast: [{ lines: [
          ["мой дом", "my house", "masculine"],
          ["моя́ кни́га", "my book", "feminine"],
          ["моё окно́", "my window", "neuter"],
        ] }],
        cards: ["family"],
      },
      {
        heading: "His, hers, theirs never change",
        rule: "его́, её and их are fixed. They are the easiest possessives in the language.",
        why: [
          "«его́» is his, «её» is her and «их» is their, and these three keep one shape whatever noun follows.",
          "Unlike «мой», they do not agree with the thing owned: it is «её дом» and «её кни́га» with the same «её» before both.",
          "The reason is that they are really the genitive, the of form, of «он», «она» and «они», so her house is literally the house of her.",
          "The trap is that «его́» is also him and «её» is also her as the object of a verb, so the words around them tell you which reading is meant.",
        ],
        examples: [["её дом, её кни́га", "her house, her book"]],
      },
      {
        heading: "One's own: свой",
        rule: "When the owner is the subject of the sentence, «my», «his», «her» are all свой.",
        why: [
          "English his is ambiguous: in He loves his work the work may be his own or another man's.",
          "Russian separates the two: «свой» means one's own and points back to the subject of the sentence, whoever that is.",
          "So when the owner is the one doing the action, use «свой» whatever the person, and keep «мой» or «его́» for an owner who is somebody else.",
          "«свой» changes its ending like «мой»: in the first line it is «свою́» because «рабо́ту» is feminine and the object of the verb.",
        ],
        contrast: [{ lines: [
          ["Он лю́бит свою́ рабо́ту.", "He loves his own work.", "his own: свой"],
          ["Он лю́бит его́ рабо́ту.", "He loves his work.", "someone else's: его"],
        ] }],
      },
    ],
  },

  /* ----------------------------------------------- past, aspect, future */
  {
    id: "tenses",
    title: "Past, aspect, future",
    blurb: "When it happened, and how",
    from: "core7",
    sections: [
      {
        heading: "The past agrees with the subject",
        rule: "Drop -ть and add -л, -ла, -ло or -ли. It matches gender, not person.",
        why: [
          "Russian has a single past tense covering English read, was reading and has read; the difference is carried by the choice of verb, explained under aspects below.",
          "To form it, take the infinitive, remove «-ть» and add «-л»; that is already the form for a male subject, as in «он чита́л».",
          "The ending then agrees with who did it, the way an adjective agrees with its noun: a woman adds «-а», a neuter noun «-о», and any plural «-и».",
          "The form does not change with person, so a man says «я чита́л» and a woman says «я чита́ла», and «вы» always takes «-ли», even to one person.",
        ],
        table: {
          title: "Past tense",
          columns: ["Subject", "Ending", "Example"],
          rows: [
            ["a man", "-л", "чита́|л"],
            ["a woman", "-ла", "чита́|ла"],
            ["neuter", "-ло", "чита́|ло"],
            ["plural, вы", "-ли", "чита́|ли"],
          ],
        },
        contrast: [{ lines: [
          ["Он чита́л.", "He was reading.", "a man: -л"],
          ["Она́ чита́ла.", "She was reading.", "a woman: -ла"],
          ["Они́ чита́ли.", "They were reading.", "several: -ли"],
        ] }],
        cards: ["core7"],
      },
      {
        heading: "Past forms to learn",
        rule: "Verbs whose infinitive does not end in -ть build the past on another stem.",
        why: [
          "The rule above needs an infinitive in «-ть»; verbs ending in «-ти» or «-чь» have a past of their own.",
          "«идти́» gives «шёл», a different word entirely, and «мочь» gives «мог», with no «л» for a man.",
          "«есть», to eat, drops more than its ending, and «быть» moves its stress onto the ending for a woman: «была́».",
          "The other genders follow from the man's form by the usual endings, so learning the first column is most of the work.",
        ],
        table: {
          title: "Irregular past",
          columns: ["Verb", "он", "она́", "они́"],
          rows: [
            ["идти́", "шёл", "шла", "шли"],
            ["мочь", "мог", "могла́", "могли́"],
            ["есть", "ел", "е́ла", "е́ли"],
            ["быть", "был", "была́", "бы́ли"],
          ],
        },
      },
      {
        heading: "Two aspects",
        rule: "Imperfective is the process or a habit; perfective is one act, finished.",
        why: [
          "Most Russian verbs come in pairs, and the pair splits one English verb by how you see the action: as something going on, or as a finished result.",
          "The imperfective is the process, a habit, or something repeated, and it answers what was happening or what do you usually do.",
          "The perfective is one act seen whole, with a result, and it answers what got done.",
          "The partner is often the same verb with a prefix, so «чита́ть» and «прочита́ть» differ by three letters; others are a different word entirely, as «говори́ть» and «сказа́ть».",
        ],
        table: {
          title: "Common pairs",
          columns: ["Meaning", "Imperfective", "Perfective"],
          rows: [
            ["do", "де́лать", "с|де́лать"],
            ["read", "чита́ть", "про|чита́ть"],
            ["write", "писа́ть", "на|писа́ть"],
            ["see", "ви́деть", "у|ви́деть"],
            ["buy", "покупа́ть", "купи́ть"],
            ["give", "дава́ть", "дать"],
            ["take", "брать", "взять"],
            ["say", "говори́ть", "сказа́ть"],
          ],
        },
        contrast: [{ lines: [
          ["Я чита́л кни́гу.", "I was reading a book.", "the process"],
          ["Я прочита́л кни́гу.", "I read the book through.", "the result"],
        ] }],
        cards: ["core8"],
      },
      {
        heading: "Which one to use",
        rule: "How often or how long wants the imperfective; done, once, wants the perfective.",
        why: [
          "Words in the sentence often decide it for you, so look for them before choosing the verb.",
          "Every day, often, always and for a long time all describe repetition or duration, and take the imperfective.",
          "Already, finally and once describe a single act that reached its end, and take the perfective.",
          "With nothing like that in the sentence, ask whether the result matters: if it does, use the perfective.",
        ],
        table: {
          title: "Signal words",
          columns: ["", "Russian", "Aspect"],
          rows: [
            ["every day", "ка́ждый день", "imperfective"],
            ["often", "ча́сто", "imperfective"],
            ["always", "всегда́", "imperfective"],
            ["for a long time", "до́лго", "imperfective"],
            ["already", "уже́", "perfective"],
            ["finally", "наконе́ц", "perfective"],
          ],
        },
        contrast: [{ lines: [
          ["Я ка́ждый день покупа́ю хлеб.", "I buy bread every day.", "a habit"],
          ["Сего́дня я купи́л хлеб.", "Today I bought bread.", "once, done"],
        ] }],
      },
      {
        heading: "The future, both ways",
        rule: "A perfective verb in its present forms already means the future. For a process use бу́ду.",
        why: [
          "There are two futures because there are two aspects, so the first decision is whether you mean a finished result or an activity going on.",
          "A perfective verb has no present tense, so its present endings mean the future: «сде́лаю» is I will do, not I do.",
          "For a process or a habit, use the future of to be, «бу́ду», and the imperfective infinitive unchanged, as in «бу́ду рабо́тать».",
          "The trap runs both ways: a perfective verb cannot describe what is happening right now, and «бу́ду» is never followed by a perfective verb.",
        ],
        table: {
          title: "Future",
          columns: ["", "Imperfective", "Perfective"],
          rows: [
            ["я", "бу́ду рабо́тать", "сде́ла|ю"],
            ["ты", "бу́дешь рабо́тать", "сде́ла|ешь"],
            ["он, она́", "бу́дет рабо́тать", "сде́ла|ет"],
            ["мы", "бу́дем рабо́тать", "сде́ла|ем"],
            ["вы", "бу́дете рабо́тать", "сде́ла|ете"],
            ["они́", "бу́дут рабо́тать", "сде́ла|ют"],
          ],
        },
        contrast: [{ lines: [
          ["Я бу́ду де́лать э́то.", "I will be doing it.", "a process: бу́ду"],
          ["Я сде́лаю э́то.", "I will do it.", "a result: perfective"],
        ] }],
        cards: ["core9"],
      },
      {
        heading: "Asking for something",
        rule: "The imperative is the ты form with -й, -и or -ь; add -те for вы.",
        why: [
          "The imperative is the form for telling or asking someone to do something, English read or tell me, and Russian has one for «ты» and one for «вы».",
          "Build it from the «они» form of the present: take off its last two letters and what is left is the stem.",
          "A stem ending in a vowel adds «-й», as «чита́й»; one ending in a consonant adds «-и» when the «я» form stresses its ending, and «-ь» otherwise.",
          "For «вы», or for anyone you address politely, add «-те»; and a request for one act is usually perfective, as «Скажи́те» from «сказа́ть».",
        ],
        table: {
          title: "Imperative",
          columns: ["Verb", "ты", "вы"],
          rows: [
            ["чита́ть", "чита́|й", "чита́|йте"],
            ["говори́ть", "говор|и́", "говор|и́те"],
            ["сказа́ть", "скаж|и́", "скаж|и́те"],
            ["помо́чь", "помог|и́", "помог|и́те"],
            ["дать", "дай", "да́йте"],
          ],
        },
        contrast: [{ lines: [
          ["Чита́й!", "Read!", "to ты"],
          ["Чита́йте!", "Read!", "to вы: -те"],
        ] }],
        cards: ["core10"],
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
        heading: "There is, there is not",
        rule: "есть says a thing exists or someone has it; нет says it does not, and takes the genitive.",
        why: [
          "Russian has no everyday verb for to have; instead it says at me there is a brother, with «у» plus the owner and then «есть».",
          "«у меня́» is at me, with «я» in the genitive, and «есть» is there is, so «У меня́ есть брат» is I have a brother.",
          "To say the thing is absent, swap «есть» for «нет» and put the thing itself into the genitive: «брат» becomes «бра́та».",
          "The trap is leaving the noun in its dictionary form after «нет»; the missing thing must take the genitive ending whatever its gender.",
        ],
        contrast: [{ lines: [
          ["У меня́ есть брат.", "I have a brother.", "есть"],
          ["У меня́ нет бра́та.", "I don't have a brother.", "нет + genitive"],
        ] }],
        cards: ["work"],
      },
      {
        heading: "No is said twice",
        rule: "With никто́, ничего́, никогда́ the verb still takes не. Two negatives make one.",
        why: [
          "English allows one negative in a clause: I don't know anything uses anything rather than nothing.",
          "Russian stacks them: a word like «ничего́», nothing, or «никогда́», never, still needs «не» in front of the verb.",
          "In «Я ничего́ не зна́ю» the «не» sits before «зна́ю» and «ничего́» comes earlier, which is the usual order.",
          "The trap is reading the two negatives as a positive, as English would: here they do not cancel, so the sentence means exactly I know nothing.",
        ],
        contrast: [{ lines: [
          ["Я всё зна́ю.", "I know everything.", "всё"],
          ["Я ничего́ не зна́ю.", "I don't know anything.", "ничего́ + не"],
        ] }],
        examples: [["Он никогда́ не был в Москве́.", "He has never been to Moscow."]],
      },
      {
        heading: "Would: бы",
        rule: "бы and the past tense make «would», for wishes and for things that did not happen.",
        why: [
          "English makes would with a helper verb; Russian uses the small word «бы» together with the past tense of the verb.",
          "The past tense here does not mean the past: «Я бы хоте́л ко́фе» is a present wish, I would like a coffee.",
          "In an if sentence both halves take «бы», so «Е́сли бы я знал, я бы пришёл» has it twice.",
          "The trap is that one form covers both would and would have, and only the context says which.",
        ],
        contrast: [{ lines: [
          ["Я хочу́ ко́фе.", "I want a coffee.", "plain"],
          ["Я бы хоте́л ко́фе.", "I would like a coffee.", "polite: бы"],
        ] }],
        examples: [["Е́сли бы я знал, я бы пришёл.", "If I had known, I would have come."]],
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
  aspect: "tenses",
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

/* A section's tables, whichever field holds them. */
export const tablesOf = (s) => (s.tables || []).concat(s.table ? [s.table] : []);
/* A cell's forms, with the stem|ending marker taken out. */
const cellForms = (cell) =>
  (Array.isArray(cell) ? cell : [cell]).filter((f) => typeof f === "string").map((f) => f.replace(/\|/g, ""));

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
    for (const c of s.contrast || []) for (const [ru] of c.lines || []) add(ru, where);
    for (const t of tablesOf(s)) {
      for (const row of t.rows) for (const cell of row) for (const f of cellForms(cell)) add(f, where);
      for (const c of t.columns) add(c, where);
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
   `hasCard` answers whether a unit id has a grammar card — for `cards` and
   for a topic's `from`.
   Returns a list of complaints, empty when the file is sound. */
export function checkGrammar(known, hasCard) {
  const bad = [];
  const seen = new Set();
  for (const t of TOPICS) {
    if (seen.has(t.id)) bad.push(`two topics with the id ${t.id}`);
    seen.add(t.id);
    if (words(t.blurb) > BLURB_WORDS) bad.push(`${t.id}: the blurb runs to ${words(t.blurb)} words`);
    if (!t.sections.length) bad.push(`${t.id}: no sections`);
    if (t.from && hasCard && !hasCard(t.from)) bad.push(`${t.id}: from names no unit «${t.from}» with a card`);
    const headings = new Set();
    for (const s of t.sections) {
      const at = `${t.id} · ${s.heading}`;
      if (!s.heading) bad.push(`${t.id}: a section with no heading`);
      if (headings.has(s.heading)) bad.push(`${at}: two sections with this heading`);
      headings.add(s.heading);
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
      if (!tablesOf(s).length && !s.examples && !s.uses && !s.cards && !s.contrast) {
        bad.push(`${at}: prose with nothing under it`);
      }
      for (const u of s.uses || []) {
        if (words(u) > USE_WORDS) bad.push(`${at}: "${u}" runs to ${words(u)} words`);
      }
      for (const tb of tablesOf(s)) {
        const n = tb.columns.length;
        for (const r of tb.rows) {
          if (r.length !== n) bad.push(`${at}: a row of ${r.length} under ${n} columns`);
        }
      }
      for (const ex of s.examples || []) {
        if (ex.length !== 2) bad.push(`${at}: an example that is not a pair`);
      }
      /* A contrast is two or three lines that differ in the point being made;
         one line contrasts with nothing, and a line with no label leaves the
         reader to work out what it is showing. */
      for (const c of s.contrast || []) {
        const lines = c.lines || [];
        if (lines.length < 2 || lines.length > 3) bad.push(`${at}: a contrast of ${lines.length} lines`);
        for (const l of lines) {
          if (l.length !== 3 || !l[0] || !l[1] || !l[2]) bad.push(`${at}: a contrast line needs Russian, English and a label`);
          else if (words(l[2]) > LABEL_WORDS) bad.push(`${at}: the label "${l[2]}" runs to ${words(l[2])} words`);
        }
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
