# Emulator walkthrough — 2026-09-06, build 582c8472

Fresh install on the `bridges` AVD, driven with `native/tools/walk.ps1` along
`native/flows/walkthrough.txt`; 34 screenshots in `native/screenshots/walk/`.
Every screen was reached; nothing crashed. What was found, worst first.

## Bugs

- **A. The first tap after typing is swallowed.** On the gate, Continue needed two
  presses after entering a name; in the quiz, Check needed two presses after typing
  an answer; Search results needed two taps. The Screen's ScrollView dismisses the
  keyboard on the first touch and drops it (`keyboardShouldPersistTaps` default).
  Every typed interaction in the app feels broken.
- **B. Typed text carries over.** Question 8 (Write "he") opened with "chto" still
  in the field from question 7. The Typed view is reused across consecutive typed
  steps without a reset.
- **C. The gap lands inside another word.** Cloze for «в» produced
  «Это я_____ление продолжает…» — `replace(token, "_____")` hit the first
  substring, inside «явление». Whole-word replacement.
- **D. The typing hint gives the answer away.** "Latin spelling works — “chto”"
  is shown *before* answering "what". Show the transliteration after the verdict,
  or only the generic hint before.
- **H. "Lessons cleared" counts attempts.** After failing the quiz at 75% with
  vocabulary untouched, You says "1 lessons cleared". It counts lessons with any
  recorded score, not lessons done.
- **K. The avatar button has no accessibility label** — the only control in the
  app the screen reader (and the walker) cannot find. Icon-only controls need one.

## Curve and content

- **E. Unit word lists repeat words.** Chapter 1's spine teaches 28 "words" of
  which five are the same word twice (я, он, весь, свой, мой — separate
  OpenRussian rows for the same form) and one is «том» "volume", which is Tom from
  the Tatoeba sentences. Lesson 1 teaches я; lesson 2 teaches я again. "volume"
  appears as a quiz distractor for «в». build_topics must dedupe by bare form and
  the name needs an override.
- **F. Cloze sentences are not gated.** Lesson 1 of chapter 1 asked a gap in «Это
  явление продолжает оставаться в фокусе внимания экспертов». The example is
  whichever of the word's dictionary sentences contains it; it should be the one
  the learner can read — shortest, most covered, as the speech pools now do.
- **G. Practice drills are not gated either.** "Cases" opened on the genitive plural
  of «рис» for a learner who knows six words. Drills draw from all ~4,000 lemmas;
  they should draw from what has been met, widening as the learner advances.
- **L. Inside the vocabulary flow, every question says "1/1"** with an empty bar,
  because each question runs in its own runner. The lesson's own progress (3/16)
  is what belongs there.

## Polish

- **I.** Drill header reads "cases" — the id, not the name "Cases".
- **J.** An Immerse title shows "&#128512;" (an HTML entity from the feed) instead
  of the emoji.
- The `#187` chip on a word entry (frequency rank) has no explanation.
- The path with developer mode on shows every node in the same "open" state, so a
  fresh learner sees no locked/done difference; expected, but worth remembering
  when judging the path visually.

## Not reproducible here

Audio and speech (no microphone, no audio on the emulator); the Hear and Say steps
were exercised through jest and on the owner's phone instead.
