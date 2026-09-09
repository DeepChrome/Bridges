# Bridges native — first-time-user interface review (2026-09-08)

Scope: `native/` read screen by screen in the order a learner meets them, plus the
emulator walkthrough renders in `native/screenshots/walk/`. Line numbers are from the
working tree on 2026-09-08. Nothing in the repository was edited.

## Verdict

The bones are those of a commercial product: one visual language, one runner for every
question kind, real recordings labelled honestly, a path that reads as a curriculum, and
almost no explanatory prose. Chapter titles, headers that say where you are, the word
sheet and the two-press link are better than most shipping apps. What stands between it
and Duolingo-grade polish is not visual finish but three flow faults a new learner hits
in the first ten minutes: (1) the distance from "Continue" to the first question is four
taps through two checklists; (2) the result screens get the hierarchy backwards — after
passing, the big button says "Try again" — and on the relief rule the result screen and
the lesson list disagree about whether you passed; (3) several silent states — a
streamed recording that fails offline plays nothing and says nothing, a Say step with no
way out but speaking, a mid-quiz back arrow that discards the run without a word.

## Findings, ranked by how much they would confuse or lose a learner

### 1. "Continue" lands on a checklist, not a question
- **Where:** `native/src/screens/Learn.js:259-264` navigates to `Unit`; `Unit.js:75-77`
  then to `Lesson`; `Unit.js:127-132` then to `Vocab`/`Quiz`/`Video`.
- **Experience:** Path → Unit (list of lessons) → Lesson (list of three steps) → the
  activity. Four taps and two lists with no primary action before any Russian appears.
  The north star says "within seconds I am studying"; the button that promises to
  continue does not.
- **Change:** `nextLesson` already knows the lesson; extend it (or a sibling in
  `data.js`) to return the first undone component, and have Continue navigate straight
  to `Vocab`/`Quiz` with `{unitId, index}`. Keep the Unit and Lesson screens for
  browsing, reached by tapping a disc. Give `LessonScreen` a primary button for its
  next undone step ("Start vocabulary" / "Take the quiz") so the list is not the only
  affordance.
- **Effort:** small (one helper, two call sites).

### 2. After passing a quiz, the primary button is "Try again"
- **Where:** `native/src/screens/Flows.js:157-170` — `onAgain` is always supplied, so
  `Done` (`Run.js:497-501`) renders `kind="pri"` "Try again" and a ghost "Back"
  whether the quiz passed or failed. Same shape for drills (`Flows.js:262-274`),
  listening (`317-323`) and the custom quiz (`416-422`).
- **Experience:** Screenshot `24-quiz-done.png` shows the failed case, where it is
  right. On a pass the learner is told "Quiz passed" and offered, in blue, to do it
  again; the way forward is 14px grey text. Progress does not feel like it moves.
- **Change:** In `Done`, when `passed === true` make the primary "Continue" (next
  lesson if one exists, else back to the unit) and demote "Try again" to ghost. For
  `QuizFlow` the next lesson is `index + 1 < lessonCount(unit)`, the same check
  `LessonScreen` makes at `Unit.js:145`.
- **Effort:** small.

### 3. The result screen and the lesson list disagree on the relief rule
- **Where:** `Flows.js:158` `passed = result.score >= PASS_MARK` and the title
  ``Not quite. ${PASS_MARK}% to pass``; but `data.js:168` marks the quiz done with
  `quizPassed(l)` (`core/state.js:28-31`: 70 % from the third try).
- **Experience:** Third attempt, 74 %: a red 74 % disc, "Not quite. 80% to pass",
  "Try again". Press Back: the quiz row carries a green tick and a green "74%" pill, and
  the path advances. The app contradicts itself on the one screen that is supposed to
  give a verdict.
- **Change:** Compute `passed` from the slot after `markComponent` (read
  `components(next, unit, index)[1].done`, or call `quizPassed({ q: score, tries })`
  with the incremented tries) and, when relief applied, say so in the detail
  ("Passed on the third try").
- **Effort:** small.

### 4. A recording that fails to stream plays nothing and says nothing
- **Where:** `native/src/audio.js:169-184`. A `playbackStatusUpdate` with `s.error`
  only calls `end()` (line 172); `speakTTS` fallback (line 183) runs only if
  `createAudioPlayer`/`play` throws synchronously, which a bad URL does not.
- **Experience:** On a train with no signal and "Audio for offline" off (the default),
  every Speaker is live and blue, every Hear step autoplays silence, "Play again"
  plays silence, and the step is unanswerable. Nothing on screen distinguishes "still
  loading" from "failed". CLAUDE.md §27 promises the fallback for the web `say()`; the
  native one does not have it.
- **Change:** In the status listener, on `s.error` call `speakTTS(text, …)` (labelled
  as the device voice is elsewhere) and, if that returns false, surface a state the
  Speaker can render ("No connection") — `Speaker` already has a silent state at
  `ui.js:223-228`; give it a third for "unreachable". For Hear, if neither source can
  play, offer the runner's `skip()` the way Say does when the mic is blocked.
- **Effort:** medium.

### 5. A Say step has no way out except speaking
- **Where:** `native/src/activities/Say.js:223-232` renders only the hold button, the
  live transcript and "N left". `Blocked` (line 194) and its Skip appear only when the
  microphone is refused or the model missing.
- **Experience:** In a library, on a bus, with a cold: the only ways past the step are
  to say something wrong three times (three Again grades on every word) or to leave
  the quiz. Hear has the typed fallback; Say has none.
- **Change:** A ghost "Can't speak now" under the hold button that calls `r.skip()` —
  it already grades nothing and drops the step from the total (`Run.js:355-362`).
- **Effort:** small.

### 6. The back arrow discards a run silently
- **Where:** No `beforeRemove` listener anywhere in `native/src` (grep). `Runner`
  (`Run.js:276`) has no leave guard; `QuizFlow`, `PlacementFlow` (50 questions),
  `SectionFlow`, `Talk` likewise.
- **Experience:** The header back arrow is 44 px from the Home button. One mis-tap
  during a placement test throws away ten minutes with no confirmation. Grades already
  written stay written, so the scheduler has reviews from a quiz that never counted.
- **Change:** `navigation.addListener("beforeRemove", …)` in `Runner` when `at > 0`
  and not finished, with a two-button Alert ("Leave the quiz? Your answers so far are
  kept for review but the quiz will not count"). Talk: the same on End/Restart
  (finding 12).
- **Effort:** small.

### 7. "Stage" leaks into learner-facing copy, in three places
- **Where:** `Misc.js:405` `Placed at stage ${a.placed}`; `You.js:218`
  `placed at stage ${account.placed}`; `Flows.js:481-482`
  `Stages 1–${placed} are marked done. You start at stage ${placed + 1}.`
- **Experience:** Everywhere else the learner sees "Chapter 3 · Home and Clothes"; the
  placement result and the profile call the same thing "stage". CLAUDE.md §30b forbids
  exactly this.
- **Change:** "Chapters 1–N are done. You start at chapter N+1." and "Placed at
  chapter N". (Related: `Flows.js:477` mutates `account.placed` on the derived object
  and never calls `saveAccounts`, so the gate's "Placed at…" is lost on restart —
  `session.js:56` recomputes `account` from `accounts.list` but nothing persists the
  field.)
- **Effort:** trivial for the copy; small for the persistence.

### 8. A Worker-side cap reads as a generic failure with a useless retry
- **Where:** `native/src/lib/feedback.js:62` returns `{ reason: "http", status,
  detail }` on any non-2xx; `Talk.js:336` tests `reply.reason === "cap"`, which an
  HTTP 429 never satisfies. The local allowance is `Infinity` (`core/state.js:111`),
  so "Today's conversations are used up." is unreachable.
- **Experience:** At the 240-turn backstop the learner sees "The tutor could not
  answer. Try again." and a Try again button that fails identically. Same for a build
  with no `EXPO_PUBLIC_FEEDBACK_URL` (`reason: "unconfigured"`): an endless retry.
- **Change:** Branch on `reply.status === 429 || reply.detail === "cap"` for the cap
  message, and on `reason === "unconfigured"` say "Conversation is not available in
  this build" with no retry (or hide the Practice row when `config()` is null).
- **Effort:** small.

### 9. "Done" is drawn six different ways, and Immerse draws it three times on one row
- **Where:** `Learn.js:285` Pill "done"; `Learn.js:64-66` green ring; `ui.js:157-163`
  green-bordered Thumb; `Unit.js:14-29` 28 px round Tick; `Study.js:245-255` 24 px
  square Tick; `Misc.js:23-39` green border + ✓ badge on the thumbnail **and**
  `Misc.js:138` a "seen" Pill on the same row; `Misc.js:330` a primary button whose
  label becomes "Watched" but still fires `goBack`.
- **Experience:** The learner relearns the completion mark on every screen; on Immerse
  a watched row shouts it three times.
- **Change:** One `Tick` in `ui.js` (Unit's round one) used by Lesson, the Study
  picker and the Immerse thumbnail; drop the "seen" Pill; on Video, when watched, show
  the tick beside the title and no primary button.
- **Effort:** small.

### 10. Hear gives no way to hear the sentence after answering
- **Where:** `Hear.js:94-105` — the post-answer view has the alignment, the linked
  sentence and the English, but no `Speaker`; the `PlayButton` is only in the
  pre-answer branch (line 109). `Say.js:206` does show a Speaker after answering.
- **Experience:** The moment the learner sees which word they missed is the moment
  they want to hear it again, and the control has gone.
- **Change:** Add `<Speaker text={q.target} size={36} />` beside the Linked sentence,
  as Say does. Scene (`Scene.js:135-143`) would benefit from one per sentence too.
- **Effort:** trivial.

### 11. Hints cost the grade and nothing says so beforehand
- **Where:** `Run.js:416-436` — "Show the table" (plain) and "Hint" (ghost) both set
  `usedHint`, which makes a right answer Hard instead of Good (`gradeFor`). The only
  signal is the label changing to "Table used" afterwards.
- **Experience:** A new learner opens the table out of curiosity on every question,
  never learns that it halves their scheduling credit, and the trouble bank fills for
  reasons they cannot see. The two hint affordances also have different visual weight
  for the same cost.
- **Change:** One control, one style, and a one-word cost on it: "Hint · counts" or a
  small "−" pill; after use, the verdict line says "Right, with a hint". Tooltips are
  not available on native, so the cost has to be in the label or the verdict.
- **Effort:** small.

### 12. Talk's Restart wipes the conversation with no confirmation; End is a stop square
- **Where:** `Talk.js:501-506` — `start(scenario)` on one tap; End is `END` (a
  square). Both are 40 px icon-only tools with a11y labels but no visible name.
- **Experience:** The four tools sit in a row at the top; the two destructive ones are
  next to the two harmless ones. A mis-tap on the circular arrow destroys ten graded
  turns.
- **Change:** Confirm Restart (Alert); make End the primary way out at the bottom
  ("See how it went" already exists at line 547 for the last turn — use it for End
  too); leave the bulb and EN as top tools.
- **Effort:** small.

### 13. Study's empty state keeps two live buttons above a dead card
- **Where:** `Study.js:312-327` — "Shuffle" and "Fast 20" render regardless of
  `queue.length`; the empty Card says "Pick a set to practise." with no action; the
  action is the "Change" Pill in the row above (`Study.js:308`), which is styled as a
  status pill.
- **Experience:** Screenshot `55-study-empty.png`: a first visit to Study is two
  buttons that do nothing, a sentence, and a blue chip that does not look pressable.
  The tab the app calls "Study" starts empty for every new learner.
- **Change:** Hide Shuffle/Fast 20 when the queue is empty; put a primary "Choose what
  to review" in the empty card; consider a "Due today" virtual set (like
  `__trouble__`) as the default so a new profile's Study tab shows what the scheduler
  wants without reintroducing the un-switchable first unit the owner objected to.
  "Fast 20" needs a plainer label ("20 most urgent").
- **Effort:** small–medium.

### 14. Four chip components, three of them under the 44 px target
- **Where:** `Flows.js:354-362` Chip minHeight 40; `Talk.js:282-300` Choice minHeight
  34, 13 px text; `You.js:40-58` Choice minHeight 36; `Misc.js:272-290` and
  `Search.js:65-77` 44 px. Study's "export"/"remove" are `Pill`s (11 px text) inside
  Pressables at `Study.js:181-188`.
- **Experience:** The same "pick one of these" control is a different size on every
  screen, and on Talk and Settings it is below rule 20.12's minimum.
- **Change:** One `Chip` in `ui.js` (44 px, 14 px text, `selected` state) used by
  QuizSetup, Talk, Settings, Video and Search; real `Btn kind="ghost"` for export and
  remove.
- **Effort:** small.

### 15. "Reset progress" leaves half the progress behind
- **Where:** `You.js:173-176` resets `seen, trouble, pinned, unit, drills, xp,
  streak, day` but not `speech` (attempts, tagCounts, talk), `watched`, `recent`,
  `sets`.
- **Experience:** After "Erase all progress", the Grammar section still lists the old
  tag counts, Immerse still shows "12 of 321 watched", the Study picker still has sets
  ticked. The learner was told "all".
- **Change:** Rebuild from `DEFAULTS` keeping only settings (`dev, dir, osk, offline,
  speed, cue, talkLevel, talkSpeed, talkEn, theme`) and `decks`.
- **Effort:** trivial.

### 16. Immerse ends in a paragraph
- **Where:** `Misc.js:148-151` — "Videos from Easy Russian, … The words under each one
  are the ones it actually says."
- **Experience:** The one sentence of explanatory prose in the app, on a library
  screen, restating a rule the Video screen already shows by its heading "Listen for".
- **Change:** Cut it; the channel names belong in a credits row on the You/Settings
  sheet next to the OpenRussian attribution if they are needed at all.
- **Effort:** trivial.

### 17. The search fields have no clear button on Android
- **Where:** `Misc.js:113` `clearButtonMode="while-editing"` is iOS-only; `Search.js:44`
  has nothing.
- **Experience:** On the owner's platform, clearing a query means holding backspace.
- **Change:** A ✕ Pressable inside the field when `text` is non-empty, shared by both
  screens.
- **Effort:** trivial.

### 18. Word entry carries an unexplained "#187" and single-letter pills
- **Where:** `Word.js:98-100` — `w.g` renders as "f"; `w.fr` as "#187". Open since
  the first trials (ROADMAP A23 finding 5). Screenshot `32-word.png`.
- **Experience:** A learner cannot tell "#187" is a frequency rank or that "f" is
  gender.
- **Change:** "feminine" / "№187 most common"; or drop the rank from the card and
  keep it for the sheet.
- **Effort:** trivial.

### 19. Word sheet jargon: "form not in the paradigm"
- **Where:** `words.js:138`.
- **Change:** "form not listed" — or nothing: the headword and gloss are the answer.
- **Effort:** trivial.

### 20. Developer mode is the first row of Settings for a new user
- **Where:** `You.js:80-90`; `store.js:22` ships it on. The path therefore never
  shows a lock, the fork never animates open, Talk is open from day one.
- **Experience:** The owner's decision stands (rule 20.9), but the first-time learner's
  first settings row is a developer switch, and the gating design the walkthrough
  screenshots were taken to check is never seen with it on.
- **Change:** Move the row to the foot of the sheet under a muted "Advanced" label;
  do not change the default.
- **Effort:** trivial.

### 21. Practice is two unlabelled lists
- **Where:** `Flows.js:197-243`; screenshot `44-practice.png`.
- **Experience:** Two cards stacked with a 12 px gap and no headings; the learner has
  to infer that the second is "grammar drills".
- **Change:** `styles.sectionLabel` above each ("Practise" / "Grammar drills"), or
  merge into one list with the drills after a divider.
- **Effort:** trivial.

### 22. The vocabulary progress pill changes colour between teaching and question steps
- **Where:** `Flows.js:64` `<Pill>` (grey) vs `Run.js:395` `<Pill tone="brand">`;
  screenshots `10-vocab-word.png` vs `12-vocab-q.png`.
- **Change:** Same tone in both.
- **Effort:** trivial.

### 23. "Previous" on a flashcard lets a graded card be graded again
- **Where:** `Study.js:398-400` — sets `shown` true on the previous card, whose four
  grade buttons then write a second `fsrsReview` for the same day.
- **Experience:** Not confusing, but it is a duplicate review into high-integrity
  state from a navigation control (rule 20.4's warning about duplicate reviews).
- **Change:** Show the previous card read-only (no grade row), or drop Previous.
- **Effort:** small.

### 24. The interval captions on the grade buttons are 10 px at 75 % opacity
- **Where:** `Study.js:386-391` — white on `good`/`bad`/`brand` at `opacity: 0.75`.
  `contrast.js` audits the tokens, not an opacity applied at the call site.
- **Change:** Drop the opacity (the `*On` tokens are already the audited pair) and use
  11–12 px.
- **Effort:** trivial.

### 25. The tour's "grey speaker" demo is dead on a phone without a Russian voice
- **Where:** `Intro.js:56` — a nonsense phrase forces the device voice; with no
  `ru-RU` voice the `Speaker` renders disabled at 0.35 opacity while the card says
  "A grey one uses the phone's own Russian voice".
- **Change:** When `hasRussianVoice()` is false, change the caption to "no Russian
  voice on this phone" — the honest state is more useful than the demo.
- **Effort:** trivial.

## Consistency table

| Pattern | Where it differs | Note |
|---|---|---|
| Completion mark | Pill "done" (Learn), green ring (PathNode), green Thumb border (Unit), round Tick 28 px (Lesson), square Tick 24 px (Study picker), thumb border + ✓ badge + "seen" Pill (Immerse), "Watched" button label (Video), "in review" Pill (Talk summary) | Finding 9 |
| Chips / choice pills | 40 px (QuizSetup), 34 px (Talk), 36 px (Settings), 44 px (Video, Search) | Finding 14 |
| Pill as a button | "Change" (Study row), "export"/"remove" (Study picker) vs Pill as status everywhere else | Finding 14 |
| Section label | `styles.sectionLabel` exists in `ui.js:315` but is used only on Learn; Word/Search/Video use weight 700, You/Talk/QuizSetup weight 600, all inline | Cosmetic, one import |
| Hint mechanism | "Show the table" plain Btn vs "Hint" ghost Btn (Run.js); bulb Tool + HintCard (Talk); "Hint (the English)" for Hear | Finding 11 |
| Post-answer replay | Speaker present in Say, absent in Hear and per-sentence in Scene | Finding 10 |
| Result screen hierarchy | Primary "Try again" on pass and fail alike | Finding 2 |
| Progress pill | grey in VocabFlow teaching steps, brand in Runner | Finding 22 |
| Header right | Home + avatar on every stack screen; Home only on Word (`App.js:267`) | Minor; add MeButton or drop Home for symmetry |
| Sheets | Word sheet closes on backdrop press (`words.js:115-118`); Settings and Set picker do not (`You.js:69-73`, `Study.js:129-133`) | Make all three close on backdrop |
| Empty states | Muted line (You, Search, Immerse, Word) vs Card with sentence (Study) vs Done screen (drills with no questions) | Pick the Muted line + one action |
| Level chip captions | "Beginner · set by where you are" caption under chips (Talk) vs no caption under Speed chips until a second line | Finding, minor: label the speed row "Pace" |
| Word chip counts | "×4" muted suffix on Video chips; "×3" Pill on trouble/grammar rows; "· ×3" in Word's Heard-in rows | Same datum, three renderings |
| "Chapter" vs "stage" | Chapter everywhere except placement copy and profile | Finding 7 |

## What is genuinely good

- The path. Rings, lips, the fork and the return lanes read as a road without a word of
  explanation; the four disc states are distinguishable and the a11y labels say what the
  rings say. Chapter titles ("People and Time") are real names.
- Headers that say where you are: "Lesson 3 / PRONOUNS & BEING", "Pronouns & Being /
  CHAPTER 1 · PEOPLE AND TIME".
- The two-press word link and the sheet: underlined, form named from the paradigm, one
  button through. Every Russian sentence in the app is linked, including the tutor's.
- Honesty about audio: a blue ring means a recording, grey means the phone's voice, a
  dead speaker says why in its label; the tour teaches this on day one.
- The runner: one contract, twelve kinds, partial credit with a reason ("One letter
  off", "3 of 4 words"), recycled questions marked "Comes round again", the verdict
  anchored in one place, autoplay that waits for the previous recording.
- Scene's "read the questions first, then Play" is a real listening-pedagogy choice.
- The Talk summary — went well / to work on / words with Add — is the right place for
  vocabulary, and the failure states in the transcript are plain and retryable.
- Copy is labels, not prose, almost everywhere; the one paragraph is finding 16.
- Skip on a blocked Say grades nothing and is left out of the total, so a phone with
  the mic off scores the same quiz — the right rule, implemented.
