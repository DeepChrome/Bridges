# Listening scenarios — the brief for writing them (2026-09-19)

*Written for: whoever writes the conversations — the owner and the model he
hands this to. Everything the app's checker will enforce is here; the
vocabulary lists are generated from the curriculum, not typed.*

Twenty conversations: two per chapter, keys `core<N>:2` and `core<N>:4`,
each an episode of the cast's story (docs/cast.md).

## The prompt

Paste this once, then send each conversation's word list, printed by
`node tools/lesson_words.mjs <key>` (below).

```
You are writing short Russian listening exercises for a language-learning
app. I will give you one chapter at a time: its theme, the grammar it
teaches, the words the learner knows, and a few names. For each chapter
write TWO conversations. Return ONLY a JSON array of two objects in exactly
this shape:

{
  "key": "core3:2",
  "title": "Two to six English words naming the situation",
  "cast": [ { "id": "a", "ru": "Тедди", "en": "Teddy" }, { "id": "b", "ru": "Нежа", "en": "Nezha" } ],
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
- 12 to 16 turns, about 480 to 620 characters of Russian in total (that is
  50–65 seconds as the cast read it). **Monka speaks slowly**, so a scene he
  is in wants the lower end; the real limit is 70 seconds of voiced audio,
  measured by tools/audio_qa.mjs, and padding a scene to reach a length only
  pushes it over. Every turn is one to two sentences.
- A single sentence never exceeds the word cap lesson_words.mjs prints.
- The level starts at absolute beginner in chapter 1 (present tense, simple
  statements, questions with где/кто/что) and grows chapter by chapter, using
  the grammar each chapter has introduced (its spine unit's grammar card) and
  never grammar from a later chapter.
- Vocabulary: use ONLY the words lesson_words.mjs lists for the
  conversation's key, and the free words below — in any inflected form. Names too. Up to 6 other words are allowed per conversation, and they
  MUST be listed in "intro" (Russian dictionary form + English); prefer
  concrete nouns that make the situation real (a passport, a bus, a key).
- Spell ё as ё, never е. Put no stress marks in.

CAST — the conversations are episodes of one story (docs/cast.md)
- The speakers are the app's characters and nobody else: Тедди (Teddy, a
  small Yorkshire terrier, the hero), his mother Нежа (Nezha, a glamorous,
  loving rabbit), his father Ярик (Yarik, a big soft-hearted wolf), and Монька (Monka, a small goofy
  cosmonaut monkey who schemes to spoil the family's plans out of jealousy —
  and every scheme backfires on him, like the coyote's; unlucky, never
  humiliated, secretly kind). Supporting characters who come and go: Белка
  (Belka, Нежа's chatty squirrel best friend), Тортила (Tortila,
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


## Each chapter's words — generated, never typed

This file used to carry a block per chapter: its theme, its grammar and its
word list, typed out by hand. The curriculum was rebuilt around the videos on
2026-09-29 (CLAUDE.md §30bf) and every block went stale at once — the writers
of the 2026-09-30 episodes found chapter 5 was no longer "Health and Nature"
and wrote to what the checker allowed instead. So the lists live where they
cannot drift: the build.

- `node tools/lesson_words.mjs <key>` — the exact palette for one
  conversation (`core3:2`): the words that lesson may use, the sentence cap,
  and what is new in it. **This is the list to write from.**
- `node tools/lesson_words.mjs --intro <word> …` — whether a candidate
  intro word exists, and what a tap on it would open.
- The chapter's grammar is its spine unit's card in
  `data/curated/grammar_notes.json`; the chapter's name and its side
  quests are on the path in the app.
- `node tools/check_scripts.mjs --strict` is the judge, and it reads the
  current curriculum every time.
