# Case cards: the framework (2026-11-23)

The owner: *"for learning cases, maybe it's best to look at triggers and
example cases… sequenced flashcards that focus on triggers and each one is a
path of 3-4 cards (but the cards can be sort of mix and matched)… when you
identify the za trigger's a case, you have many many many words and sentences
that are eligible there. Sometimes it's specific verbs that are triggers."*

This file is the design. `core/triggers.js` is the catalogue,
`core/questions.js triggerSightings` sorts the corpus under it,
`core/casecards.js` builds the deck from them and `core/caserules.js`, and
`native/src/flows/CaseCards.js` is the screen.

## What the research says

Most of what is online about learning Russian cases is course marketing, not
research, so it is read for its consensus, not its claims. Where there is
research, it points the same way.

1. **Learn a case through what calls for it.** Russian teaching material
   organises cases by their triggers: the prepositions (в, на, без, к, с, за),
   the verbs (помогать takes the dative, бояться the genitive, заниматься the
   instrumental), and the counting words. Learners are told to learn phrases
   in context ("на работе", "к врачу") rather than endings on their own.
   ([FluentU][fluentu], [Fluent in 3 Months][fi3m], [elon.io][elon])
2. **See it before saying it.** VanPatten's *processing instruction* is the
   best-studied approach to case marking. Learners read for meaning and skip
   endings, so "structured input" activities make them notice the form to get
   the meaning before they are asked to produce it. Comer and deBenedette
   tested it on Russian. ([Comer & deBenedette][pi])
3. **Neither order wins outright.** Studies comparing rule-first (deductive)
   with example-first (inductive) teaching disagree, and the reviews conclude
   both have a place. ([Cambridge][induct], [COERLL][coerll]) So the cards use
   both orders: example first by default, since that also matches point 2.
4. **Mix the categories.** Interleaved practice beats blocked practice at
   telling categories apart. Rohrer's classroom study is the best known
   (72 % against 38 % at a delayed test), and a meta-analysis puts the
   effect at g = 0.42. ([Rohrer 2014][rohrer], [Brunmair & Richter][meta])
   Choosing between the dative and the instrumental after «с» or «за» is
   exactly that kind of discrimination.
5. **Retrieve, spaced.** This is the app's premise already (FSRS).

## The framework

**The unit is a trigger: one word in one meaning.** «за» meaning *behind*
(instrumental) and «за» meaning *for* (accusative) are two triggers. They are
siblings, because telling them apart is the lesson. A verb is a trigger
(«помога́ть» → dative). So is a word like «на́до» («мне на́до»), a counting
word («пять» → genitive plural), and the plain object of any verb
(accusative). There are 52 triggers. 44 of them have enough real sentences
(eight or more) to make cards from, and those 44 are the ones offered.

**The sentences are real, never written for the card.** Every sentence on a
card is from the corpus: the learner's decks, Tatoeba, and the bought
listening pools. A sentence is filed under a trigger only when two things
hold. The noun's own table must say which case it is. And what stands in
front of the noun must settle any doubt: «ма́ме» is dative or prepositional,
so after «к» it is dative, after «о» prepositional, and with no preposition
it can only be dative. Personal pronouns count as nouns («у меня́», «с ним»,
«помоги́ мне»), since that is mostly what the verb triggers take.

**Single cards, each about one thing, asked many ways.** The owner tried
paths of three or four cards the same day and set them aside: *"just stick
to flashcards similar to the vocab/sentence flashcards except they can all
target different parts of cases… Make sure the cards go multiple
directions… some cards can even just be like… plural genitive ending."*
So a card is about one of four kinds of thing — a trigger, an ending rule
(`core/caserules.js`), a counting rule or a case's question words, or one of
the learner's own words — and there are thirteen kinds of card
(`core/casecards.js CARD_TYPES`):

| Card | The front | The answer | Checked by |
|---|---|---|---|
| Trigger → case | «без», or «помога́ть» as a sentence used it | the case | a tap on the five |
| Case → trigger | "Instrumental" | which of four words takes it | one of four |
| Trigger → meaning | «за» + Instrumental | *behind*; the sibling's meaning always a wrong option | one of four |
| Sentence → case | a real sentence, the noun marked | the case | a tap |
| What sets the case | the sentence and its case | which of its words does | one of four |
| Fill the gap | the sentence with a gap, the dictionary form | the form | self-graded |
| Build the phrase | «без» + «сестра́» | «без сестры́» | self-graded |
| Word → case form | «кни́га», Instrumental | «кни́гой», with the rule it follows | self-graded |
| Form → case | «кни́гой» | the case (only a form that is one case in its table) | a tap |
| Case → ending | Genitive plural, masculine, like «стол» | -ов | self-graded |
| Ending → case | -ами / -ями (only endings no other case has) | the case | a tap |
| Counting | «два, три, четы́ре» + … ; or «три» + «стол» | genitive singular; «три стола́» | one of four; self-graded |
| Question words | «кому́? чему́?» ; or Dative | the case; the questions | a tap; self-graded |

The case buttons are always the same five, in teaching order, so their
position cannot give the answer away.

**No example is written for a rule.** An ending rule names the kinds of noun
it is for and how to check one; the example on the card is a real noun's own
form read off its table, and a noun whose form does not follow the rule
(«друг», «друзе́й») is never shown under it. The counting phrases are a
number and a table cell, as the drills build.

**The words are the learner's own** (the owner: *"prioritize the vocabulary
words that the user is familiar with… especially ones where the user has
maybe a high recall but a low case performance"*). Every met noun and
case-taking pronoun is weighted by its recall (its meaning scores) against
its "Cases & forms" score, and the word cards draw by that weight; the
sentences for a trigger prefer the same words. A learner with fewer than 25
of their own words also gets the course's first nouns, at a low weight.

**It is a stack, like the word cards.** It is Study's **Cases** tab, beside
Vocabulary: ten cards dealt at a time, the next ten when they run out, until
Finish. No two cards in a deal are about one thing, no kind of card comes
twice running, no sentence twice. Due things come first, then new ones (three
triggers and three rules in the first deal, two after), then the least
recently seen; what this sitting has met goes to the back. A trigger never
met is first met as something to look at (point 2). Back steps to the card
before, as it was answered. The options pick the cards, the cases, singular
or plural, the kinds of trigger, or one trigger asked every way.

**What is remembered.** Each trigger and rule has its own FSRS card in
`st.caseCards` (a trigger by its id; `end:`, `count:`, `q:` for the rest).
That is a progress key, so it syncs and a reset clears it. Every answer
grades at once: a right tap Good, a wrong one Again, a said card its own
grade. A card on one word's forms moves that word's "Cases & forms" score, as
Form cards do (§30by), never its meaning card. The last 200 sentences shown
are kept, so the next deals draw others first.

**What it deliberately does not do.**

- **No invented sentences.** Teaching content here is a mapping, not prose.
  The only Russian the catalogue holds is the trigger words, and the tests
  check each one against the lexicon.
- **No grade for skimming.** A recognition answer is right or wrong. Only a
  production card is graded by the learner.
- **No sentence that does not settle its case.** «кни́ги» could be genitive
  singular or a plural subject, and with no preposition it is left out rather
  than guessed.

[fluentu]: https://www.fluentu.com/blog/russian/russian-cases/
[fi3m]: https://www.fluentin3months.com/russian-cases/
[elon]: https://elon.io/grammar/russian/verbs/government/overview
[pi]: https://core.ac.uk/download/213401901.pdf
[induct]: https://www.cambridge.org/core/product/0A256FD27F2DF9B1C21C577FA0A24725
[coerll]: https://coerll.utexas.edu/methods/modules/grammar/07
[rohrer]: https://www.gwern.net/doc/psychology/spaced-repetition/2014-rohrer.pdf
[meta]: https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf
