# Case cards: the framework (2026-11-23)

The owner: *"for learning cases, maybe it's best to look at triggers and
example cases… sequenced flashcards that focus on triggers and each one is a
path of 3-4 cards (but the cards can be sort of mix and matched)… when you
identify the za trigger's a case, you have many many many words and sentences
that are eligible there. Sometimes it's specific verbs that are triggers."*

This file is the design. `core/triggers.js` is the catalogue,
`core/questions.js triggerSightings` sorts the corpus under it,
`core/casecards.js` builds the paths and the session, and
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

**A path is three or four cards on one trigger, and every card shows a
different word.** The trigger stays the same and the word changes, so one
trigger reaches dozens of nouns. That is the owner's "many many many words".
There are four card faces:

| Face | The front | The answer | Checked by |
|---|---|---|---|
| **Notice** | A real sentence with the noun marked | Which case | A tap on the case: right or wrong |
| **Trigger** | The trigger and its meaning: «за» *behind* | Which case | A tap on the case |
| **Form** | The trigger and the noun's dictionary form: «без» + «сестра́» | «без сестры́» | Self-graded, as a flashcard |
| **Use** | The sentence with a gap, the dictionary form given | The form in place | Self-graded, as a flashcard |

The two recognition faces are checked by the app, because "which case" has
one right answer. The two production faces are self-graded, as every
flashcard in the app is. The case buttons are always the same five, in
teaching order, so their position cannot give the answer away.

**The order of a path varies.** There are four templates:

- **Example first** (the default for a trigger never met): Notice, Trigger,
  Form, Use. See it, name the rule, make it, use it. This is point 2.
- **Rule first**: Trigger, Form, Use, Notice. Used for variety once a
  trigger has been met (point 3).
- **Contrast**: a trigger and its sibling side by side. Notice «за» +
  instrumental, Notice «за» + accusative, Use, Use. Offered once both have
  been met, because discrimination needs two things to tell apart (point 4).
- **Review**: Notice, Form, Use. Three cards for a trigger already held
  well, so a strong trigger costs less time.

**A session is several paths, mixed.** It holds five paths by default
(about eighteen cards). Within a path the cards are blocked, which is how a
trigger gets learned. Across paths the triggers are mixed, never two of the
same case running when that can be avoided, which is how the triggers get
told apart (point 4). Due triggers come first, then at most two new ones in
teaching order, then the ones least recently seen. Teaching order starts with
the contrasts a beginner needs first: «в»/«на» for where, then for where to.
A single trigger can also be practised on its own from the list.

**What is remembered.** Each trigger has its own FSRS card in `st.caseCards`.
That is a progress key, so it syncs and a reset clears it. A path grades its
trigger once. A wrong case or an Again gives Again. Any Hard gives Hard.
Otherwise the result is Good, or Easy when every production card was Easy.
A contrast path grades both siblings from their own cards. Production cards
also move the noun's "Cases & forms" score, as Form cards do (§30by). They
never move the word's meaning card. The last 200 sentences shown are kept,
so the next sessions draw others first.

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
