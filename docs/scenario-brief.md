# Listening scenarios — the brief for writing them (2026-09-19)

*Written for: whoever writes the conversations — the owner and the model he
hands this to. Everything the app's checker will enforce is here; the
vocabulary lists are generated from the curriculum, not typed.*

Twenty conversations: two per chapter, keys `core<N>:2` and `core<N>:4`.
Chapter 1 keeps two as well; its other twelve are retired when these land.

## The prompt

Paste this once, then send one chapter block at a time (below).

```
You are writing short Russian listening exercises for a language-learning
app. I will give you one chapter at a time: its theme, the grammar it
teaches, the words the learner knows, and a few names. For each chapter
write TWO conversations. Return ONLY a JSON array of two objects in exactly
this shape:

{
  "key": "core3:2",
  "title": "Two to six English words naming the situation",
  "cast": [ { "id": "a", "ru": "Катя", "en": "Katya" }, { "id": "b", "ru": "Олег", "en": "Oleg" } ],
  "intro": [ { "ru": "паспорт", "en": "passport" } ],
  "lines": [ { "s": "a", "ru": "…", "en": "…" }, … ],
  "questions": [
    { "ask": "…?", "options": ["right answer", "wrong", "wrong", "wrong"], "answer": 0 },
    … five questions …
  ]
}

WHAT A CONVERSATION IS
- A real situation two or three specific people are actually in, with a
  reason to talk: something to decide, find out, fix, or agree on. It has a
  beginning, a middle where something changes, and an end. Name the stakes in
  the first two lines.
- Each person wants something slightly different. They react to what the other
  said; nobody announces facts for the listener's benefit.
- Natural spoken Russian: short turns, questions and answers, hesitation,
  agreement and disagreement, a joke where it fits. No lines that exist only
  to use a word.
- NOT this (the failure to avoid): "You have lived here many years." "Yes.
  Work all day." "Say one word. What do you want?" "Time… I want time."
  Lines that follow each other without following FROM each other.

LENGTH AND LEVEL
- 12 to 16 turns. 600 to 780 characters of Russian in total (that is 45–60
  seconds read aloud). Every turn is one to two sentences.
- A single sentence never exceeds the chapter's word cap given in the block.
- The level starts at absolute beginner in chapter 1 (present tense, simple
  statements, questions with где/кто/что) and grows chapter by chapter, using
  the grammar each chapter has introduced (listed in the block) and never
  grammar from a later chapter.
- Vocabulary: use ONLY the words in the chapter block — "this chapter's
  words", "carried in from earlier chapters", and "free" — in any inflected
  form. Names too. Up to 6 other words are allowed per conversation, and they
  MUST be listed in "intro" (Russian dictionary form + English); prefer
  concrete nouns that make the situation real (a passport, a bus, a key).
- Spell ё as ё, never е. Put no stress marks in.

CAST — the conversations are episodes of one story (docs/cast.md)
- The speakers are the app's characters and nobody else: Тедди (Teddy, a
  small Yorkshire terrier, the hero), his mother Нежа (Nezha, a glamorous,
  loving rabbit), his father Ярик (Yarik, a big soft-hearted wolf), Нежа's
  best friend Белка (Belka, a chatty squirrel), and Монька (Monka, a small goofy
  cosmonaut monkey who schemes to spoil the family's plans out of jealousy —
  and every scheme backfires on him, like the coyote's; unlucky, never
  humiliated, secretly kind). Neighbours for other roles: Тортила (Tortila,
  wise old turtle), Гена (Gena, grumpy crocodile shopkeeper), Лиса (Lisa, sly
  fox), Миша (Misha, warm bear).
- Teddy is in most conversations. Monka appears in about half; when he does,
  his scheme is the complication and it turns round on him by the end.
- Two or three speakers. Each speaker is addressed by name at least once in
  the dialogue (spoken aloud), each says at least two lines, and nobody says
  nearly all of them.
- Decline names correctly: Нежа → Нежи, Неже, Нежу, Нежей; Ярик → Ярика,
  Ярику, Яриком; Монька → Моньки, Моньке, Моньку, Монькой; Белка → Белки, Белке, Белку.
  Тедди never changes.
- The characters are animals living ordinary lives: shops, buses, doctors,
  school. Nobody remarks on it.

RULES THE CHECKER ENFORCES
- No line of three or more words appears twice anywhere in the two
  conversations.
- Exactly five questions, each about the SITUATION — who, where, why, what
  they decide, what the problem is — never "what does X mean" or "which word
  did you hear". Each has four DIFFERENT English options, at most eight
  words each; the right one is ALWAYS first (index 0; the app shuffles).
- The four options must be the same kind of thing and the same length
  (within two characters of each other) and equally specific. "Ivan brings
  it himself" against "Nobody", "Never", "Yes" is a giveaway and fails.
- At least one question must not be answerable by recognising a Russian word
  that sounds like its English (парламент/parliament).
- The "en" of every line is a faithful, natural English translation.
```

## Names allowed

The cast only (`core/cast.js`; the checker refuses any other name). In
"cast", use exactly these `ru`/`en` pairs:

Тедди (Teddy, he), Нежа (Nezha, she), Ярик (Yarik, he), Белка (Belka, she),
Монька (Monka, he), Тортила (Tortila, she), Гена (Gena, he), Лиса (Lisa, she),
Миша (Misha, he)

## Free in every chapter (never counted against the list)

в = in; я = I; на = on (place); не = not; он = he; и = and; этот = this; с = with; быть = be (impf); мы = we; она = she; что = what; ты = you (singular, informal); это = this is; вы = you (plural or formal); у = at; по = along; они = they; тот = that; из = from; к = towards; наш = our; за = behind; все = everybody; свой = one's own (belonging to the subject); для = for; от = from (away); очень = very; как = how; о = about; мой = my; здесь = here; весь = all; так = so; уже = already; а = and; до = to (direction); такой = such; ваш = your; только = only; себя = oneself; ещё = still; где = where; кто = who; нет = no; бы = would; какой = which; но = but; чтобы = so that; при = at; мой = my; когда = when; твой = your; же = and; там = there; почему = why; сколько = how much; ли = whether; если = if; или = or; вот = there; да = yes; тоже = also; тут = here; весь = all; оно = it; также = also; про = about; чей = whose

---

## Chapter 1 — People and Time

Keys: `core1:2`, `core1:4`. Sentence cap: **7 words**. Spine unit: Pronouns & Being.

Theme: People and Time. The chapter's side quests, which say what the chapter is
about and are good settings — Family & People, Time & Numbers.

Grammar this chapter introduces (use it; nothing from later chapters):
- **No “a”, no “the”, no “is”** — Russian has no articles, and it leaves out the present tense of “to be”.
- **“My” agrees with what is owned** — мой, твой, наш, ваш and свой take the gender of the thing possessed, not of the owner. (его, её and их never change.)
- **Numbers change the noun after them** — 1 takes the plain form, 2–4 take a second form, and 5 and above take a third — оди́н час, два часа́, пять часо́в.

This chapter's words:

в = in; я = I; на = on (place); не = not; он = he; и = and; этот = this; с = with; быть = be (impf); мы = we; она = she; что = what; ты = you (singular, informal); это = this is; вы = you (plural or formal); у = at; по = along; они = they; тот = that; из = from; мочь = be able (impf); к = towards; наш = our; за = behind; все = everybody; год = year; хотеть = want (impf); свой = one's own (belonging to the subject); знать = to know (impf); говорить = to speak (impf)

Carried in from earlier chapters: nothing — this is the first chapter.

---

## Chapter 2 — Food and School

Keys: `core2:2`, `core2:4`. Sentence cap: **8 words**. Spine unit: Time, Life & People.

Theme: Food and School. The chapter's side quests, which say what the chapter is
about and are good settings — Food & Drink, School & Learning.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Two verb patterns** — Most verbs follow either the -е- pattern (чита́ю, чита́ешь) or the -и- pattern (говорю́, говори́шь).
- **Saying what you want** — хоте́ть is irregular — я хочу́, ты хо́чешь, он хо́чет, мы хоти́м — and the thing you want follows it directly.
- **Three ways to “study”** — учи́ть is to memorise something, учи́ться is to be a student, изуча́ть is to study a subject in depth.

This chapter's words:

для = for; от = from (away); очень = very; как = how; человек = person; о = about; мой = my; ребёнок = child; здесь = here; один = one; время = time; весь = all; так = so; уже = already; работать = work (impf); а = and; до = to (direction); есть = there is; любить = love (impf); такой = such; ваш = your; сделать = make (pf); день = day; делать = make (impf); новый = new; себя = oneself; только = only; ещё = still; идти = go (impf); работа = work

Carried in from earlier chapters: every word listed under chapters 1–1 above.

---

## Chapter 3 — Home and Clothes

Keys: `core3:2`, `core3:4`. Sentence cap: **9 words**. Spine unit: Wanting & Knowing.

Theme: Home and Clothes. The chapter's side quests, which say what the chapter is
about and are good settings — Home, Clothes & Looks.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Every noun has a gender** — A noun ending in a consonant is masculine, in -а/-я feminine, in -о/-е neuter. Everything that describes it must agree.
- **The ending tells you the gender** — ко́мната, ку́хня, спа́льня end in -а/-я and are feminine; стол, стул, пол end in a consonant and are masculine; окно́ is neuter.
- **Adjectives take the noun’s gender** — -ый/-ий with a masculine noun, -ая with a feminine one, -ое with a neuter one.

This chapter's words:

где = where; книга = book; кто = who; нет = no; страна = country; бы = would; жить = live (impf); должный = due; какой = which; сказать = say (pf); но = but; сегодня = today; чтобы = so that; большой = big; друг = friend; сейчас = now; раз = time; при = at; стать = to become (pf); думать = think (impf); смотреть = look (impf); час = hour; жизнь = life; видеть = see (impf); первый = first; слово = word; после = after; город = town; когда = when; много = a lot of

Carried in from earlier chapters: every word listed under chapters 1–2 above.

---

## Chapter 4 — Town and Travel

Keys: `core4:2`, `core4:4`. Sentence cap: **10 words**. Spine unit: Everyday Things.

Theme: Town and Travel. The chapter's side quests, which say what the chapter is
about and are good settings — Around Town, Travel & Transport.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Making things plural** — Masculine and feminine nouns usually take -ы or -и; neuter nouns take -а or -я. (A few masculine nouns take a stressed -а́ instead — дом → дома́ — and Around Town shows them.)
- **Places in the plural** — Most take -ы/-и, but some common masculine nouns take a stressed -а́: дом → дома́, го́род → города́.
- **Two verbs for “go”** — идти́ is one trip in one direction happening now; ходи́ть is going regularly or there and back.

This chapter's words:

вопрос = question; машина = car; всегда = always; прийти = come (pf); каждый = each; Россия = Russia; же = and; твой = your; можно = one can; почему = why; рука = hand; там = there; через = across; читать = read (impf); деньги = money; место = place; проблема = problem; фильм = movie; хорошо = it is good; школа = school; врач = physician; который = which; надо = it is necessary; нужно = it is necessary; дом = house; играть = play (impf); отец = father; стоить = cost (impf); никогда = never; пойти = go (pf)

Carried in from earlier chapters: every word listed under chapters 1–3 above.

---

## Chapter 5 — Health and Nature

Keys: `core5:2`, `core5:4`. Sentence cap: **11 words**. Spine unit: Family & Home Life.

Theme: Health and Nature. The chapter's side quests, which say what the chapter is
about and are good settings — Body & Health, Nature & Weather, Medicine.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Saying where something is** — After в or на meaning “in” or “on”, the noun takes the prepositional case, usually ending in -е.
- **What hurts is the subject** — Russian says “by me hurts the head” — the aching part is the subject, and the person comes after у: у меня́, у неё.
- **Where in nature** — A few short nouns take a stressed -у́ instead of -е in the prepositional: в лесу́, в снегу́; open places take на: на мо́ре, на у́лице.
- **At the doctor's** — у plus a person means at their place — у врача́ — while в plus the prepositional is the building you are in: в больни́це.

This chapter's words:

самый = the most; женщина = woman; то = then; об = about; стоять = stand (impf); больше = bigger; купить = buy (pf); дать = give (pf); Москва = Moscow; последний = last; перед = in front of; сколько = how much; дверь = door; ждать = wait (impf); ли = whether; находиться = be situated (impf); семья = family; вода = water; выйти = leave (pf); девушка = girl; дома = at home; мама = mom; получить = receive (pf); язык = language; русский = Russian; пожалуйста = please; данный = given; компания = company; минута = minute; найти = find (pf)

Carried in from earlier chapters: every word listed under chapters 1–4 above.

---

## Chapter 6 — Work and Animals

Keys: `core6:2`, `core6:4`. Sentence cap: **12 words**. Spine unit: Health & Getting Around.

Theme: Work and Animals. The chapter's side quests, which say what the chapter is
about and are good settings — Work & Money, Animals.

Grammar this chapter introduces (use it; nothing from later chapters):
- **The accusative marks the object** — The thing an action is done to changes form. Feminine -а becomes -у; inanimate masculine looks unchanged.
- **Having and not having** — у меня́ есть + the plain form for having; у меня́ нет + the genitive for not having — the genitive’s first job.
- **Living things take the genitive as object** — For masculine animate nouns — and all animate plurals — the accusative copies the genitive.

This chapter's words:

улица = street; даже = even; лицо = face; ни = neither; часто = often; квартира = flat; увидеть = see (pf); являться = is (impf); голова = head; если = if; дело = business; жена = wife; иметь = have (impf); собака = dog; вчера = yesterday; или = or; ничего = not badly; более = more; два = two; без = without; под = under; музыка = music; история = history; пить = drink (impf); стол = table; уметь = be able (impf); вино = wine; всего = in all; задача = task; любимый = favorite

Carried in from earlier chapters: every word listed under chapters 1–5 above.

---

## Chapter 7 — Mind and Language

Keys: `core7:2`, `core7:4`. Sentence cap: **13 words**. Spine unit: Days, Talk & the World.

Theme: Mind and Language. The chapter's side quests, which say what the chapter is
about and are good settings — Feelings & Mind, Speech & Language, Business & Finance.

Grammar this chapter introduces (use it; nothing from later chapters):
- **The past tense agrees with the subject** — Drop -ть and add -л, -ла, -ло or -ли. It matches gender and number, not person — “I read” differs for a man and a woman.
- **Liking is done “to” you** — нра́виться puts the person in the dative and the thing liked in the nominative — literally “to me is pleasing”.
- **Speaking a language** — говори́ть по-ру́сски uses an adverb with no case at all; the noun form needs на + prepositional.
- **How much does it cost?** — ско́лько сто́ит plus the thing; the answer counts in roubles the way hours are counted — оди́н рубль, два рубля́, пять рубле́й.

This chapter's words:

многие = many; остаться = remain (pf); писать = write (impf); бояться = be afraid (impf); над = above; помочь = help (pf); правда = truth; рассказать = say (pf); телевизор = television set; вот = there; маленький = small; ночь = night; забыть = forget (pf); просто = it is simple; тогда = then; готовый = ready; завтра = tomorrow; небольшой = small; огромный = enormous; окно = window; пройти = pass (pf); рубль = rouble (Russian currency); случай = case; теперь = now; учёный = scientist; глаз = eye; другой = other; сам = himself; слушать = listen (impf); цена = price

Carried in from earlier chapters: every word listed under chapters 1–6 above.

---

## Chapter 8 — Conflict, Tech and Sport

Keys: `core8:2`, `core8:4`. Sentence cap: **14 words**. Spine unit: Things & Happenings.

Theme: Conflict, Tech and Sport. The chapter's side quests, which say what the chapter is
about and are good settings — Military & Conflict, Technology & Media, Sport & Games.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Two aspects of every verb** — Imperfective verbs describe the process or a repeated action; perfective verbs describe one completed act.
- **“With” takes the instrumental** — с plus the instrumental means together with — including who you are fighting or negotiating with.
- **Communicating “by” something** — по plus the dative case gives the medium something travels through.
- **Playing games vs playing instruments** — игра́ть в plus the accusative for sports and games; игра́ть на plus the prepositional for instruments.

This chapter's words:

главный = main; да = yes; компьютер = computer; мать = mother; молодой = young; начаться = begin (pf); продукт = product; самолёт = aircraft; ходить = go (impf); вызвать = to call (pf); комната = room; никто = nobody; слышать = to hear (imperfective) (impf); магазин = shop; мир = world; пока = bye (informal); помощь = help; программа = program; произойти = happen (pf); быстро = fast; вернуться = return (pf); спать = sleep (impf); телефон = telephone; вещь = thing; взять = take (pf); готовить = cook (impf); давать = give (impf); несколько = some; тоже = also; хороший = good

Carried in from earlier chapters: every word listed under chapters 1–7 above.

---

## Chapter 9 — Culture and Society

Keys: `core9:2`, `core9:4`. Sentence cap: **15 words**. Spine unit: Where, When & How.

Theme: Culture and Society. The chapter's side quests, which say what the chapter is
about and are good settings — Art & Music, Politics & Society, Science.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Talking about the future** — A perfective verb in its present-tense forms already means the future: я сде́лаю is “I will do”. For a process use бу́ду plus the imperfective: я бу́ду рабо́тать.
- **Talking about a work** — о (об before a vowel) plus the prepositional case means “about”.
- **Quantity words take the genitive** — After мно́го, ма́ло, ско́лько and similar words the noun goes into the genitive: plural for things you count, singular for things you measure.
- **Doing something with something** — The instrumental, with no preposition, is the field or the tool: занима́ться матема́тикой; and what someone became: стать учёным.

This chapter's words:

слишком = too (much); тут = here; около = by; против = against; сторона = side; второй = second; земля = earth; между = between; почти = almost; спасибо = thanks; лучше = better; иногда = sometimes; любой = any; необходимо = it is necessary; понимать = to understand (imperfective) (impf); потом = afterwards; три = three; вид = appearance; результат = result; ну = well; откуда = from where; оставаться = remain (impf); сила = power; получать = receive (impf); вдруг = suddenly; домой = homeward; медленно = slowly; проходить = to pass (impf); плохо = it is bad; принимать = take (impf)

Carried in from earlier chapters: every word listed under chapters 1–8 above.

---

## Chapter 10 — Law and Faith

Keys: `core10:2`, `core10:4`. Sentence cap: **16 words**. Spine unit: Thought & Society.

Theme: Law and Faith. The chapter's side quests, which say what the chapter is
about and are good settings — Law & Crime, Faith & Tradition.

Grammar this chapter introduces (use it; nothing from later chapters):
- **Asking someone to do something** — The imperative is the ты form with -й, -и or -ь: чита́й, скажи́, забу́дь; add -те to one person you say вы to, or to several.
- **What someone is, was, or became** — After рабо́тать, стать and the past of быть, the role goes into the instrumental: юри́ст → юри́стом, судья́ → судьёй.
- **Believing in** — ве́рить в plus the accusative is to believe in something; ве́рить plus the dative is to believe someone.

This chapter's words:

однажды = one day; рядом = near; часть = part; конец = end; нельзя = can't; постоянно = constantly; примерно = around; рано = it is early; начинать = begin (impf); возможность = possibility; лишь = only; некоторый = some; приходить = to come (impf); считать = consider (impf); именно = exactly; образ = shape; приходиться = have to (impf); поэтому = so; система = system; также = also; выходить = go out (impf); отношение = relation; хотя = though; конечно = certainly; вообще = in general; ничто = nothing; однако = however; отвечать = answer (impf); решать = decide (impf); становиться = become (impf)

Carried in from earlier chapters: every word listed under chapters 1–9 above.

