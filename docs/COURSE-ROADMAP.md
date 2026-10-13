# The course roadmap — from the 2026-10-12 review

Written for whoever works on Bridges/Ya next, including an AI with less
context than the one that wrote it. It turns seven review reports (five
chapter reviews, a whole-course review, a code-quality audit — the evidence is
quoted inline, so the reports themselves are not needed) into work packages
with exact edits, verification commands and acceptance checks. Read
`CLAUDE.md` first: Part II is how to work, §30bf–§30bx is how the curriculum
is built. Nothing here overrides it.

The owner's words that started this: *"a lot of repetition in an unhelpful
way… a lot of incomplete groupings of words. Words shouldn't arrive to the
learner individually. They should appear in clusters of similar words like
foods, sports, countries… introduce manageable sets of new words at a
reasonable pace… organize the content to flow like a professional course and
app."* And on the look: *"clean up all the sloppy code and really focus on
improving the aesthetic."*

---

## 0. Standards — read before doing anything

These are the rules every package below is held to. A change that cannot pass
them is not done.

1. **Measure before and after.** Every claim in this file came from an
   instrument or a read of generated output, never from a feeling. The
   instruments: `node tools/dump_units.mjs` (the course's words by unit,
   lesson and group), `node tools/walk_lessons.mjs [from] [to]` (the course as
   a learner meets it — steps, cards, every question of one draw),
   `node tools/audit_repeats.mjs` (repetition counted off the generators),
   `node tools/quiz_mix.mjs` (share of older material in quizzes),
   `node tools/audit_banks.mjs --pool 150`, `node tools/audit_options.mjs`,
   `node tools/sample_grammar.mjs`, `node tools/sample_cases.mjs`,
   `node tools/design.mjs`, `node tools/contrast.js`, `node tools/copy.mjs`,
   `node tools/audit_dead.mjs`. **Dump `units.txt` before a content change and
   diff it after**; the diff is the review, not the intention.
2. **A content change is one rebuild, not many.** Moving a word re-cuts
   lessons (§30bi), which moves the scripted conversations (they are checked
   against their lesson's words — `node tools/check_scripts.mjs --strict`
   must end at 0 errors), changes the curriculum stamp (every learner's
   progress is re-mapped on next launch, §30bf V7) and wants audio for new
   words (`build_word_audio`, `build_form_audio`, `build_scenario_audio` —
   money). Batch the data edits of §2–§4 into one rebuild. Procedure in §9.
3. **Never invent Russian** (§30a). Words come from the lexicon; sentences
   from the pools or are authored into `data/curated/scripts/` and checked.
   A set member not in the pool is brought in from the lexicon by a `keep`
   (§30bi) — check it exists with `python tools/lookup.py <word>` first.
4. **Labels, not prose** (rule 20.7); show, don't explain (§25). A new group
   name is 1–3 words a learner recognises (Drinks, Tableware, Family). A name
   that describes the app ("Useful phrases", "Everyday actions", "Kinds of
   things") is a grab-bag telling on itself: regroup rather than rename.
5. **Sets are taught whole, in natural order** (§30bi, §30bo). A set is a
   thing a learner would expect to meet together — foods, family, days,
   colours, numbers, body parts, clothes, rooms, professions, countries. A
   group of one or two words, or a word alone in a lesson about something
   else, is a defect. A set split across chapters is a defect unless the
   second visit is a deliberate deepening and named as one.
6. **Pace**: lessons target 5/6/7 words by chapter (`LESSON_RAMP`,
   `LESSON_SIZE`), may run to +3 to finish a group, and never 1–2
   (`SHORT_LESSON`). A chapter should carry about 90–130 required words; a
   chapter with only optional quests is not a chapter.
7. **One source of truth** (§22): what a lesson contains is `components` in
   `native/src/data.js`; what follows a step is `nextComponent`/`nextRoute`;
   what the learner has met is `metBy` in `core/questions.js`. Do not add a
   second rule beside one of these.
8. **The suites are the floor.** Before "done": `node tools/core.test.mjs`,
   `cd native && npx jest`, `node tools/check_scripts.mjs --strict`,
   `node tools/build_word_groups.mjs --check`, `node tools/copy.mjs`,
   `node tools/audit_repeats.mjs`, and for data changes the full list in
   CLAUDE.md §31. A locally built APK cannot update an EAS install (§31).
9. **Report honestly** (§7, §17): Implemented / Verified / Code review /
   Remaining. A number you did not measure is not a number.

---

## 1. Where the course stands (measured 2026-10-12)

- 34 units, 1,268 words, 185 lessons, 10 chapters. Required words per
  chapter: 88 · 99 · 106 · **157** · 126 · 135 · 125 · **60 · 73 · 41** — a
  hump at chapter 4 and a required course that ends at chapter 7; chapters
  8–10 are a spine plus optional quests, chapter 10 has no required quest.
- The spines are named and filled by their goal video's words, so the
  backbone reads "First Words → People & Places → The Little Words → Winter &
  Gifts → Spending & Saving → Before & After → Feelings & Fears → Cooking &
  Celebrating → Style & Fashion → Swamps & Berries". Three spine goal videos
  are grammar/intermediate monologues (ch5 «денежные глаголы», ch6 «ПОСЛЕ…»,
  ch10 «Про грибы и ягоды»). Spine names describe 10–15 % of their unit.
- Survival Russian is missing or late: no здравствуйте, до свидания,
  извините, меня зовут, есть "to eat", завтракать; пожалуйста chapter 7,
  читать chapter 7, вчера/завтра chapter 10, час chapter 8, оно chapter 8,
  цвет five chapters after the colours, плохой/молодой in Medicine (ch9).
  Numbers stop at ten.
- Natural sets split across units: family (core1 L6 + family quest +
  родитель in Nature), food (ch1 + core8 cooking + яйцо/салат in optional
  Faith + meals in core6), clothes (ch4 quest + ch9 spine), body/medicine
  (ch6 + ch9 + врач in Work), feelings (ch5 quest + ch7 spine), time words
  (core2, time, core4, core5, core8, core10), ordinals (3 chapters),
  possessives (4 chapters), motion verbs (4 units), professions (8 units),
  money/shopping (6 units, цена optional), indefinites/negatives (4 chapters).
- Repetition mechanics (the "unhelpful repetition"): **fixed this session**,
  see §2. Residual: the quiz may ask a word in a shape the walk also used
  (random, ~2 a lesson); two quiz questions of one shape adjacent ~0.5 a
  lesson.
- Study flashcards repeating for a week: **fixed this session** (§2).
- Code: `design.mjs` reports 158 inline font sizes and 379 spacing values
  off the scales; 105 hand-rolled row bodies; 11 hand-rolled round icon
  buttons (two under 44 px); four coexisting press models; seven heading
  sizes for the same level; Flows.js 1,702 lines, Study.js 1,244, Misc.js
  913, Run.js's `Runner` 525; one real bug (`t.lineSoftSoft`).

---

## 2. Done this session (2026-10-12) — for the record

- **Study rotation** (`core/queue.js goalSession`): the daily goal's make-up
  fill sorted by familiarity (stability alone), so the same card won every
  day; it sorts by retrievability now, a card answered today is not dealt
  again today, the mastered sprinkle walks least-recently-seen first.
  `native/__tests__/goalfill.test.js` fails against the old code.
- **Repetition rules** (`core/questions.js`; instrument
  `tools/audit_repeats.mjs`; pinned in `tools/core.test.mjs` "a lesson does
  not ask the same thing twice"): per-word shape memory in the walk; the
  closing round never re-asks the pair just presented; chapter review words
  in a lesson-fixed order with the previous lesson's picks demoted
  (`chapterReview`); gap sentences planned once per lesson and shared with the
  quiz (`clozePlan`), none twice, capped at a third of a quiz; the lesson's
  grammar practice walks the unit's words in a fixed order offset by the
  lesson and the quiz's form question avoids them; two lesson words sharing a
  first meaning are not both asked by it (`meaningClash`); review slots skip
  top-100 closed-class words; `spread`/`slotApart` keep shapes apart;
  `lessonFreeRank` 0/50/100 by chapter; plural forms taught only from the
  plural card (`formTaught`); chapter 2 conjugates only `plainPresent` verbs;
  `NO_IMPERATIVE` verbs take no imperative question; agreement prefers an
  adjective with a practised partner noun; spoken steps read `metBy`.

Before → after over 555 lesson draws: same shape in a walk 1366→0, sentence
twice 100→0, grammar twice 80→0, free-word review 208→0, speech ahead 37→0,
same-meaning pair 47→0, review repeating 215→6, adjacent shape 797→~280.

---

## 3. WP1 — Chapter 1: day one (data; one rebuild with WP2–WP4)

> **Done 2026-10-13** (commit "The course re-cut"), WP1–WP4 together in one
> rebuild. What differs from the plan below, and why: «до свидания» is not a
> lexicon entry, so the greetings set is приве́т здра́вствуйте спаси́бо
> пожа́луйста извини́те пока́ (пока́ glossed as the goodbye first); `family`
> stayed `parents and children` (renaming the set would re-cut core1 for
> nothing); `possessives` was not made a set (мой/твой sit on the family card
> and наш/ваш where they are); the adjective set stopped at eight (дорого́й
> дешёвый интере́сный stay with money and work, where their sentences are);
> places in town has no банк/рестора́н/университе́т (рестора́н is food's);
> `holidays` is пра́здник рождество́ па́сха (the lexicon has no «Новый год»
> entry); sports stayed on the optional quest — an owner decision (§13).
> `build_word_groups.mjs --stale` could not run (no model key on disk), so
> the groups file was regrouped by hand and brought into step with the sets
> — a file group **named as its set** is what the build merges the set into.
> Result: 169 words moved units, 52 left, 96 joined, 1,312 taught; core1
> opens Greetings · Pronouns · Linking words · Family; chapter 1 spine
> followability fell 81 % → 55 % because greetings are not video words
> (accepted — a day-one lesson comes first). Still owed: the audio for the
> new words (quoted below in §9), and WP5.

**Goal.** A learner's first lesson is greetings and people, not seven
prepositions. Family and food taught whole.

**Evidence.** `units.txt`: core1 L1 = э́то в на с и а не; no greeting until
L4 (приве́т спаси́бо да нет only); no noun until L6; L7 = рестора́н борщ пи́цца
(3 words). здесь and тут both "here" in one lesson. Family in core1 L6,
family L1 and family L4. Meals verbs in food L3, meal nouns in core6 L9.
пожа́луйста core7, оно́ core8.

**Edits.**
1. `data/curated/grammar_notes.json` core1 examples →
   `[["Приве́т! Я — Те́дди.","Hi! I am Teddy."],["Э́то ма́ма.","This is Mom."]]`
   (`card_words` in build_topics promotes the groups holding a card's
   example words — this is what reorders the unit; §30bu).
2. `data/curated/word_sets.json`:
   - new `greetings`: members приве́т, здра́вствуйте, спаси́бо, пожа́луйста,
     до свида́ния, извини́те; quiet пока́; `unit: "core1"`. Check each
     exists in the lexicon (`lookup.py`); «до свидания» may need to be
     «свидание»-based or replaced by «пока́» if the lexicon has no entry.
   - new `pronouns`: я ты он она́ оно́ мы вы они́, `unit: "core1"`.
   - `parents and children` → rename `family`, add ба́бушка де́душка семья́;
     delete `grandparents`.
   - `here and there`: members здесь там (drop тут from the set).
   - `meals`: add обе́дать у́жинать за́втракать.
   - new `food`: хлеб мя́со ры́ба суп яйцо́ сыр сала́т карто́шка ку́рица,
     home `food`.
   - `pets`: соба́ка ко́шка кот, home `home` (or `animals` — decide one;
     the cozy-home video says кот).
   - new `big and small`: большо́й ма́ленький, home `core4` (or the basic
     adjectives set in WP2, which supersedes this).
3. `data/curated/unit_words.json`:
   - core1 drop борщ пи́цца рестора́н тут; food keep борщ пи́цца рестора́н.
   - family keep мой (the family card teaches мой/моя; мой was core2 L2),
     drop ма́ленький, фотогра́фия (if the video does not need it).
   - core2 drop кот.
4. `data/curated/word_groups.json` core1: это → Pronouns; the rest of
   "Linking words" → "Little words" (comes last). family: "Family" =
   семья́ оте́ц мать ребёнок муж жена́; describing "My and your" = твой мой;
   "Photos and names" = фотогра́фия посмотре́ть звать роди́ться расти́.
   food: вку́сный → a describing group; ресторан into "Eating out" with
   заказа́ть.
5. `data/curated/gloss_overrides.json`: де́вушка → "young woman; girlfriend";
   `pos_overrides.json`: приве́т → other (it shows as [noun]).

**Expected order after rebuild** (read it in `units.txt`): Greetings ·
Pronouns + это · Family · Common verbs · Question words · Here and there ·
Little words. Food quest: Drinks · Food · Meals · Tableware · Eating out.

**Accept when:** `dump_units.mjs` shows the order above; no lesson of 3
words in chapter 1; `check_scripts.mjs --strict` 0 errors (core1:2, core1:3,
core2:1, core2:4 will need re-homing or a line each); `core.test.mjs` passes
("a unit opens on the words its rule card speaks with" will re-check core1).

---

## 4. WP2 — Sets across the course (data; same rebuild)

Each line: set name · members · home. Add to `word_sets.json`; bring
out-of-pool members in via `unit_words.json keep` on the home unit. Check
every member exists (`lookup.py`). Then `build_word_groups.mjs --stale` and
read the regrouping.

| set | members | home | why |
|---|---|---|---|
| today, yesterday, tomorrow | сего́дня вчера́ за́втра | core3 (or core2) | вчера/завтра are chapter 10 L6 |
| units of time | секу́нда мину́та час неде́ля ме́сяц год | time | the time card's table is built on час, taught chapter 8 |
| how often | обы́чно всегда́ ча́сто иногда́ | core4 | split core4/core5 |
| ordinals | пе́рвый второ́й тре́тий после́дний | time | split time/core5/core6 |
| possessives | мой твой наш ваш; quiet свой | core2 | split ch1/ch2/ch3/ch5 |
| can and may | мо́жно нельзя́ | core3 | нельзя́ chapter 8 |
| numbers | add два́дцать … сто (11–100 as the lexicon has them) | time | numbers stop at ten; no age, price or clock |
| basic adjectives | хоро́ший плохо́й большо́й ма́ленький но́вый ста́рый молодо́й краси́вый дорого́й дешёвый интере́сный | core3 | the gender card's example is «новый дом» and новый is chapter 4; плохой/молодой are in Medicine |
| places in town | магази́н апте́ка по́чта шко́ла музе́й оте́ль центр кафе́ парк банк рестора́н университе́т; quiet банк рестора́н университе́т | city | 7 of a set met over nine chapters; кафе/парк absent |
| going on foot and by transport | идти́ ходи́ть е́хать е́здить; quiet идти́ | city | motion verbs in four units |
| money | де́ньги рубль до́ллар е́вро цена́ счёт | core5 | цена only in optional Business |
| professions | врач учи́тель преподава́тель медсестра́ рабо́чий води́тель | work | врач/до́ктор, учи́тель/преподава́тель splits |
| feelings | ра́дость любо́вь страх смех настрое́ние сча́стье наде́жда эмо́ция | emotion | feeling nouns in ch5, ch7, ch9 |
| temperature | холо́дный тёплый горя́чий жа́ркий | nature | in three units; жа́ркий absent |
| head and face | голова́ лицо́ зуб во́лос глаз нос рот у́хо | body | two headings for one set |
| indefinites | что́-то кто́-то где́-то ка́к-то како́й-то | core7 | four chapters |
| negatives | никто́ ничего́ никогда́ никако́й нигде́ | core7 | four chapters |
| rooms | ко́мната ку́хня спа́льня ва́нная туале́т гости́ная | home | last three absent |
| languages | ру́сский англи́йский неме́цкий кита́йский францу́зский | speech (or school) | one language name in the course |
| ingredients | карто́шка ку́рица лук морко́вь капу́ста яйцо́ ма́сло соль са́хар | core8 | "Cooking" has one vegetable, one meat |
| holidays | пра́здник Но́вый год день рожде́ния Рождество́ | core8 | "Holidays" has no holiday |
| instruments | гита́ра пиани́но скри́пка бараба́н | art | one instrument |
| sports | existing set; `home: "core8"` | core8 | a learner who skips the optional quest never meets футбо́л |
| clothes | reorder: оде́жда first; руба́шка футбо́лка сви́тер джи́нсы брю́ки ю́бка пла́тье; drop ма́йка | clothes | the set absorbed the group and buried оде́жда; two "T-shirt"s |
| friends | друг подру́га | core4 | split core4/emotion |

Also `data/curated/word_groups.json` regroupings named by the chapter
reviews (clothes "Coats and shoes"/"Suits and accessories"; core2 "How much,
how often"; nature "Weather words" vs "Describing"; core10 "Dry and wet";
medicine Hospital/Illness/Injury; religion "Celebrations"/"At church";
military "Victory and defeat"; core7 "To here, to there", "Size and kind").
A group's `kind` must match its words' class — `build_word_groups.mjs
--check` prints `!!` on a mismatch; fix every one.

**Accept when:** `units.txt` shows each set in one lesson block under its
name; `--check` clean; no group of 1–2 words except a deliberate pair
(муж/жена is fine); no lesson under 4 words.

---

## 5. WP3 — Misfilings, drops and glosses (data; same rebuild)

`unit_words.json` keep/drop (a drop moves the word to the next unit that
wants it — check where it lands in the diff; a word nobody should teach goes
in `VIDEO_NOISE` in build_topics.py):

- family keep роди́тель; nature drop роди́тель вы́бор.
- core7 drop лес гриб ка́мень; nature keep them. core7 keep брать; school
  drop брать. core7 keep немно́го; core9 drop немно́го.
- core8 drop осо́бо, ма́лый, зимо́й, час (час → time). core8 keep блин яйцо́
  сала́т; animals drop блин; religion drop яйцо́ сала́т.
- core6 drop приро́да свет уро́к учи́тель оши́бка; nature keep приро́да свет;
  school keep уро́к учи́тель оши́бка (or professions set takes учи́тель —
  pick one).
- core4 drop бы носи́ть; clothes gets носи́ть with "to wear" first (gloss).
  core4 keep цвет; core9 drop цвет. core3 keep под пе́ред ваш хоро́ший но́вый
  большо́й; core4/core5 drop same.
- time drop писа́ть рассказа́ть зна́чить еди́нственный; speech keep the three
  verbs. time keep час.
- travel drop отправля́ться уходи́ть поле́зный гла́вный. speech drop стра́шный
  гру́ппа поря́док попроси́ть позвони́ть договори́ться услы́шать крича́ть
  пла́кать; emotion keep крича́ть пла́кать чу́вствовать. clothes drop приме́р
  вариа́нт де́тство назва́ть ма́йка.
- work drop бухга́лтерский о́трасль де́ятельность клуб покупа́ть; work keep
  дешёвый; business drop дешёвый изде́лие включи́ть уще́рб; core5 keep
  покупа́ть продава́ть прода́ть.
- emotion drop о́бщий звуча́ть. body drop сон держа́ть. animals drop мы́шка
  конь. science drop социа́льный пра́вить.
- medicine keep поликли́ника ана́лиз давле́ние; drop внима́ние. religion drop
  пост (or gloss as fast/Lent with a Lent sentence — there is none). law keep
  адвока́т; business keep догово́р контра́кт; law drop same. military keep
  служи́ть автома́т. politics drop госду́ма предме́т; school keep предме́т.
- home drop о́бувь бесплатный ра́зный. core2 drop банк о́фис бар (→ city) or
  rename the group "In town". tech drop получи́ться.
- B1 strays out of required units: здравоохране́ние бухга́лтерский о́трасль
  де́ятельность соо́бщество при́нцип до́ступ.

`gloss_overrides.json` (`_8`): тем "(all) the — тем лу́чше"; лу́чший "best";
живо́т "belly, stomach"; желу́док "stomach (the organ)"; про "about
(colloquial, + acc.)"; об "about (before a vowel)"; ме́рить "to measure; to
try on"; изме́рить "to measure (once)"; конь "steed; knight (chess)"; ма́рка
"brand, make; (postage) stamp"; ме́лкий "small (fine, petty)"; бо́лее "more
(formal)"; практи́чески "practically"; пье́са "play (the text)"; спекта́кль
"performance"; карти́нка "small picture"; уе́хать "to leave (by transport)";
уйти́ "to leave (on foot)"; прие́хать "to arrive (by transport)"; до́лгий
"long (in time)"; потряса́ющий "amazing"; дед "grandfather; Дед Моро́з";
автомоби́ль "car (formal)"; до́ктор "doctor (title)"; кана́л "channel (TV);
canal"; набра́ть "to gather, to pick; to dial"; да́нный "this (formal)";
носи́ть first sense "to wear". `build_lexicon.py` fails on an override that
matches nothing — rebuild the lexicon after.

`sentence_review.json`: drop «Нейроны — это клетки» (cells vs cage), the
«курс» exchange-rate sentence under "course".

**Accept when:** the `units.txt` diff shows only intended moves; every
drop's new home is read and accepted (or `VIDEO_NOISE`d); the `--check` is
clean; `check_scripts --strict` 0.

---

## 6. WP4 — The grammar ladder (data + small code; same rebuild)

**Evidence.** Four of seven cards in chapters 3–4 open on words the learner
has not met (core3 «но́вый дом/но́вая кни́га» — но́вый ch4, кни́га ch6; core4
«стол → столы́, кни́га → кни́ги»; city «э́тот го́род»; time's whole table on час).
The genitive has no spine card; dative's card is on an optional-adjacent
quest three chapters before its module; instrumental only on optional quests;
imperative in chapter 10 on verbs that take none; no card for reflexive -ся
or for бы; aspect pairs taught as vocabulary from chapter 1 with no word
about aspect until chapter 8.

**Edits.**
1. Card examples use the unit's own words (`grammar_notes.json`): core3 →
   «краси́вый дом / краси́вая маши́на» (or the WP2 adjective set's words);
   core4 → «пода́рок → пода́рки», «страна́ → стра́ны»; city → «э́тот магази́н»;
   core2 → знать/говори́ть instead of чита́ть; tech → «Хо́чешь посмотре́ть
   ви́део?»; core5 → «на рабо́те», «в фи́рме»; core7 → «Он игра́л. / Она́
   игра́ла.»; art → «кни́га о худо́жнике»; emotion → «Мне нра́вится э́та иде́я».
   **Rewriting examples re-orders the unit** (`card_words`): rebuild, diff,
   accept or pin.
2. Swap core4↔core5 cards? No — core4 plural stays; swap **core5
   (prepositional) ↔ core6 (accusative)** only if the re-cut in WP5 does not
   move the spine videos (it will; do this inside WP5).
3. A genitive card on the shopping spine; dative off emotion onto its
   chapter's spine; instrumental on a required unit; imperative with
   Medicine (ch9), future to ch10. `core/cases.js` `stage` 4..8 → 3..7 if the
   modules move a chapter earlier; `docs/grammar-sequence.md` updated.
4. A one-line "two verbs, one meaning" aspect card in chapter 2–3 and a
   reflexive (-ся) card in chapter 3–4 (`grammar_notes.json`; cards need
   `form` only if they are to be drilled).
5. body card `form: Declension/Nominative/Plural` as a stopgap; animals
   card `form: Declension/Accusative/Singular` (its nouns are animate).
6. `check_grammar_cards` in `build_site.py`: lower its free rank to
   `LESSON_FREE_RANK` so a card using a chapter-7 word in chapter 2 fails.

**Accept when:** `walk_lessons.mjs` shows every card's examples made of words
taught by that lesson; `sample_grammar.mjs` shows no imperative of an
impersonal verb and chapter 2 conjugating only plain verbs; `core.test.mjs`
("no tense or case asked before a card has taught it") passes.

---

## 7. WP5 — The arc: one re-cut (skeleton; OWNER decisions first)

This is the one package that changes what the course *is*. It re-cuts every
spine, re-maps every learner's progress once, breaks and re-homes most
conversations (~100 errors, as §30n/§30bh record) and wants audio for new
words. Do it once, after WP1–WP4 are decided, in one rebuild.

**Proposed arc** (the whole-course review; a publisher's A1→A2 order):

| Ch | Title | Grammar | Spine video | Required quests | Optional |
|---|---|---|---|---|---|
| 1 | Hello | no articles/"is"; мой/моя | TPRS Lesson 1 (+ Greetings SER 49 as a lesson video) | family | — |
| 2 | About me | present tense; хотеть | Introduce Yourself SER 28 or Practice ACTIVELY | food, home | — |
| 3 | My day | gender; numbers + noun | TPRS 4 or Morning ER 43 | time (+ numbers to 100), school | — |
| 4 | Around town | plural; prepositional | Shopping ER 104 / Grocery SER 48 | city, travel (transport), tech | — |
| 5 | Buying and wearing | accusative; genitive phrases | Money ER 121 | clothes (+ colours), work (money) | business |
| 6 | Food and home life | past tense | Cook ER 83 (core8's) | weather (split from nature; Dacha SER 51), animals (Pets ER 101) | religion |
| 7 | Going places | genitive | Travel phrases SER 39 or Winter St Petersburg | travel (trip), speech | art |
| 8 | Work and study | dative; aspect | Profession ER 80 (law's) | work (jobs), school | business, politics, science |
| 9 | Health and body | instrumental; imperative | Doctors ER 103 (medicine's) | body, medicine, sport | — |
| 10 | Feelings and the world | future; бы; aspect | Emotions ER 99 (core7's) or a culture episode | emotion, nature (land) | politics, law, military |

**Owner decisions needed** (ask; do not guess):
1. Adopt the arc above, or keep the current spine videos and only fix names?
2. Which quests are required: sport and holidays become required (every A1/A2
   syllabus has them); business, science, politics, law, military stay optional?
3. One name per chapter (drop the spine name) — yes/no.
4. Spine cap ~45 words with the everyday-word promotion going to required
   quests rather than the spine (`build_topics.py walk()` second pass).
5. Chapter 10's ending: a culture episode + the final test, not a mushroom clip.

**Edits once decided.** `data/curated/skeleton.json` (goal video per unit,
chapter order, quests per chapter — `tools/build_skeleton.py --write --force`
rewrites it; edit by hand after and re-run `build_topics`), `OPTIONAL` and
`CHAPTERS` in `tools/build_topics.py`, `build_videos.py OVERRIDES` where a
quest's video should be the topical one (Sport ER 91, Pets ER 101). Then §9.

**Accept when:** required words per chapter are 90–130 with no hump; every
chapter has a required quest; every spine name describes its unit (read the
word list); `check_scripts --strict` 0; `units.txt` diff read end to end.

---

## 8. WP6 — The lesson shape (code)

- Lesson titles are the group names, not word lists («э́то, в, на…»);
  the card's example is the model sentence (Unit.js / Flows.js VocabFlow).
- A "Listen first" step: 3–4 of the unit's video lines (`u.v.lines`) before
  the word cards (data.js `components`, Flows.js).
- The rule questions closing a walk (`GRAMMAR_IN_LESSON`) are not optional.
- A lesson-final Say step on the model sentence from chapter 2 (`SPEECH_MIX`).
- One summary per lesson: Summary and VideoSummary both list the unit's words
  with scores — one component.
- A quiz for a 4-word lesson fills from the chapter, not by asking each word
  three times (`quizStepsIn` core/extra split).

**Accept when:** `walk_lessons.mjs` shows the new step order; jest
`summary`, `videoquiz`, `roundafter`, `routes` suites pass; the emulator
walkthrough (`native/flows/walkthrough8.txt` or a new one) reads right.

---

## 9. The rebuild procedure after any content change

```
node tools/dump_units.mjs > before.txt
# edit data/curated/{word_sets,word_groups,unit_words,grammar_notes,gloss_overrides,sense_overrides}.json
python tools/build_lexicon.py            # only if gloss/pos/sense overrides changed
python tools/build_topics.py             # read: every keep/drop that did not take, every !!, followability before -> after
node tools/build_word_groups.mjs --stale # regroup units whose words changed; read the proposals
node tools/build_word_groups.mjs --check
python tools/build_videos.py             # only if skeleton/overrides changed
python tools/build_site.py               # read: pools per unit, check_pools_guaranteed, check_grammar_cards
node tools/dump_units.mjs > after.txt    # DIFF before/after and read every move
node tools/check_scripts.mjs --strict    # re-home or edit conversations until 0 errors (docs/scenario-brief.md)
node tools/build_word_audio.mjs --dry-run   # what new words want audio, and the price
node tools/build_word_audio.mjs; node tools/build_form_audio.mjs; node tools/build_scenario_audio.mjs
node tools/build_scene_tracks.mjs; node tools/build_word_assets.mjs
node tools/audio_qa.mjs
node tools/core.test.mjs; cd native && npx jest; cd ..
node tools/audit_repeats.mjs; node tools/quiz_mix.mjs; node tools/audit_banks.mjs --pool 150
node tools/walk_lessons.mjs 1 2          # read chapter 1 as a learner
```

Then build, install, and walk the first two lessons on the emulator before
anything goes to the owner's phone. Progress is re-mapped on first launch
(§30bf V7): say so in the report.

Two more steps the 2026-10-13 rebuild needed, now part of the procedure:
`node tools/rehome_scripts.mjs` (dry run, then `--apply`) moves each failing
conversation to the lesson of its unit it fits and fixes its intro list —
what is left is a writer's job; and `python tools/build_images.py` plus
`node tools/build_cast_art.mjs --ship` prune the photographs and drawings
of words that left (`image_focus.json` must not name a word that ships no
photo). A new word with no example sentence (entry.test.js) is usually a
shared form the resolver gave to another lemma — «сыр» was «сырой»'s short
form — and belongs in `lemma_overrides.json`, not in a wider set.

**Audio owed after the 2026-10-13 re-cut, not yet bought** (the owner
approves purchases): 406 words ≈ $0.34, 725 table forms ≈ $0.18, 33
scenario clips ≈ $0.05. Until bought, the new words play in the device
voice and `wordaudio.test.js` / `scenario.test.js` fail on exactly them.

---

## 10. WP7 — Code cleanup (the audit's Tier 1; safe, mechanical)

Each is one edit; do them in one commit with the suite green.

1. `native/src/screens/Learn.js:162` `t.lineSoftSoft` → `t.lineSoft` (a locked
   disc's ring track is currently undefined); add an assertion to
   `path.test.js` reading the locked disc's track stroke.
2. Stale comments that contradict the code (the reference cell is marked, not
   blanked, since §30az): `Run.js:267-279`, `rules.js:10-20`,
   `core/questions.js` near `formQuestion` ("left blank"), near the `at`
   comment in drills ("the cell the reference blanks"), the "three cards"
   comment near `mature`, the "setup screen" comment near `allows`;
   `Study.js:5-7`; `ui.js:1-4`, `ui.js` reference to `Passage.js`.
3. Unused imports/state: `Flows.js` `Card`, `Speaker`, `knownWords`, the
   unused `t` in `VocabFlow`; `Unit.js` `Tick`. Rename `Study.js knownWords`
   → `reviewableKnown` (it means something else).
4. `Run.js` `EXPLAIN_KINDS` → `MISS_KINDS`, not exported.
5. `core/questions.js drillOpensAt` — no caller; delete with its test.
6. `Flows.js LISTENING_N` loop → one draw.
7. Delete `textTransform`/`letterSpacing` at the nine sites `ui.js Text`
   already strips (ui.js Subheading, HeaderTitle, sectionLabel; Run.js;
   Learn.js; Talk.js; activities/Build.js; rules.js) and the `caps` hack in
   `ui.js Text`; retitle "NOW OPEN" and "THE RULE" to sentence case.
8. `Misc.js` COG path → import `COG_PATH` from ui.js (export it beside
   `BULB_PATH`).
9. `Talk.js`/`Tutor.js` `studiedFor` → `data.js`.
10. `Flows.js` score arithmetic → `scoreOf`.
11. `Misc.js Video.finish` computes `markComponent` twice → once.
12. `Study.js SetPicker` header → `Sheet title`.
13. `Flows.js QuizSetup` inner `Section` component → hoist or inline.
14. `Learn.js` stop importing ui `styles`; use `SectionLabel`; stop exporting
    `styles`.
15. `core/questions.js drillQuestions` `n || DRILL_N` → `n === undefined ?
    DRILL_N : n`; delete the workaround comment in `grammarRunIn`.
16. `App.js` `palette(useScheme())` ×5 → `useTheme()`.
17. Imports after consts in `Summary.js`, `You.js` → top.
18. Two scrims (0.45/0.55) → one constant.
19. `Learn.js FinalCard` → `FinalRow`.
20. `Run.js` Match cells: `disabled` on Pressable (§23 trap), no role → `Lift`
    + `accessibilityRole`.
21. `ui.js Thumb` radius 12 → `radius.xl`.
22. `fontWeight: "800"` ×11 → `"700"` (PT Serif ships 400/700; 800 falls
    back to Roboto on Android — §30bj).
23. Pass marks as literals (80 ×3, 70 in Shadow) → constants in
    `core/state.js` beside `PASS_MARK`.

**Accept when:** `npx jest` green; `audit_dead.mjs` clean; `design.mjs` no
worse; a grep for `lineSoftSoft`, `textTransform`, `"800"` finds none.

---

## 11. WP8 — The look (code; read screenshots, not code, to judge)

How to judge: run the emulator (`native/tools/emulator.ps1 -Apk <universal
apk>`; a universal build is needed — `assembleRelease` without
`-PreactNativeArchitectures`), run `native/tools/walk.ps1 -Flow
native/flows/walkthrough8.txt -Device emulator-5554`, and **look at every
shot** (§31). Compare against §30bo (the exercise-book look: PT Serif, cut
corners 4·6·8·10, no shadows, labels not all-caps) and §30ah (one depth
model: `Lift`). Fix at the primitive, never per screen (§30s).

1. **`RowText` primitive** in `ui.js` (title, sub, bold) at `type.body` (16),
   replacing the 105 hand-written `<View style={{flex:1}}><Text fontSize:15…>`
   bodies (Flows 31, You 19, Study 8, Misc, Unit, Word, Talk, Tutor, Search).
   Removes ~80 of the 87 off-scale 15s.
2. **`IconButton`** (size 40/44, `on`, label, testID) replacing 11 hand-rolled
   round Pressables (CogButton, BulbButton, Talk Tool, Tutor Replay 34 px,
   LangToggle, ConverseToggle, Send, askai iconBox, Misc history, prep Jump
   36 px, prep moment, Misc Heart). Every target ≥ 44 (rule 20.12).
3. **One press model**: `Lift` everywhere a box is pressed (Unit.js
   LessonScreen steps still thin a border; Flows.js "Build a quiz"); opacity
   only on flat icon buttons.
4. **Two heading sizes for the app**: page title = `T.title` (23), section =
   `Heading` (19). Move `ui.Title` (26), Sheet/Bubble titles (17), You's
   24/26, Summary's `Subheading`-as-title onto them; `Summary.js` and
   `VideoSummary` must agree; `Bubble` title weight = `Sheet`'s.
5. **One section rhythm**: `SectionLabel` takes a `gap`; delete the
   `marginTop: 18` and `marginBottom: 18` wrappers (off the 4-grid).
6. **`ToggleRow`** primitive for the nine Switch rows.
7. Study grade buttons read `Btn`'s tone table (export `toneOf`), not a copy.
8. `contrast.js`: add `ink3 on brandBg` (Learn.js opening notice, Talk HintCard,
   You gaps box) or use `ink2` there.
9. Then the structural splits, each a pure move with imports updated and the
   suite green: `Flows.js` → `screens/Practice.js` + `flows/{Lesson, Drills,
   Cases, Listening, Quiz, Tests, VideoQuiz}.js`; `Run.js` → extract
   `Verdict` to `verdict.js`, `useResume`/`ResumePrompt` to `resume.js`;
   `Misc.js` → `screens/Immerse.js`, `Video.js`, `VideoSummary.js` +
   `video.js` helpers; `Study.js` → `studycards.js`, `studypicker.js`;
   `You.js Settings` → `screens/Settings.js`; `afterStep()`/`goOnward()` in
   `data.js` replacing the five hand-rolled "what follows this step" scans
   (QuizFlow, CaseFlow, Summary.onwardOf, VideoQuiz/VideoSummary/Video).
   `routes.test.js` reads App.js, so it keeps holding.

**Accept when:** `design.mjs` off-scale font sizes under 40 and spacing under
120; no Pressable under 44 px; one press model in the walkthrough shots; the
owner's phone build read screen by screen.

---

## 12. WP9 — Generator and content items still open

- `realPartner`: prefer a partner that is itself a taught word (платить →
  заплатить, not выплатить); exclude разгова́ривать (no perfective).
- Cases drill prompt prints the whole gloss (`вы́пуск | issue, output,
  discharge, …`) → `firstSense`.
- The quiz's drill slot repeats across lessons (`aspect отвеча́ть → отве́тить`
  three lessons running): carry the previous quiz's drill keys in `last`, or
  widen to `metBy` when the chapter pool yields under ~5 distinct questions.
- The quiz may echo a walk shape (~2 a lesson): acceptable; if wanted, seed
  the walk's retrieval shapes too and pass them to the quiz as `last`.
- `QUIZ_KINDS` still offers `scene` in Build-a-quiz — the per-sentence corpus
  scene the owner rejected (§30af): owner's call to remove.
- Conjugation of «мы» for verbs whose examples never show a personal subject
  («начина́емся»): ask он/она/они only.
- The corpus-scene fallback (`sceneFor`) still serves lessons with no script.
- Chapter 10's Law and Military have no goal video (`skeleton.json quests: {}`).

---

## 13. Owner decisions, in one place

| # | decision | default if unanswered |
|---|---|---|
| 1 | Adopt the WP5 arc (new spine videos for ch4/5/6/8/9/10; quests moved) | do WP1–WP4 only |
| 2 | Required quests: sport, holidays required; business/science/politics/law/military optional | as stated |
| 3 | One chapter name, no spine name | yes |
| 4 | Spine cap ~45; everyday-word promotion into required quests | yes |
| 5 | Remove `scene` from Build-a-quiz | leave |
| 6 | Remove the Hard grade when the bulb is opened (§30az) | leave |
| 7 | Neutrals' saturation (12–23 %) — the slate cast of the palette | leave |
| 8 | Pay for new audio after the re-cut (cents to a few dollars) | ask before buying |
