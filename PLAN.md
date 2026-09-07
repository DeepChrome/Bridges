# Bridges

A mobile Russian learning app built from Jared's Anki decks. Lessons on a path,
flashcards, and a dictionary where every word in every sentence is clickable.

Live: https://bridges-jf.netlify.app

Doctrine and engineering standards: `CLAUDE.md`. Read it first.

## Pipeline

```
Anki collection ──► tools/ingest_anki.py   ──► data/corpus.db
OpenRussian dump ─► tools/build_lexicon.py ──► data/lexicon.db   (+ curated closed-class)
        both ─────► tools/build_topics.py  ──► data/topics.db    (units + path layout)
        all ──────► tools/build_site.py    ──► site/             (the app)
```

Python builds the data once; the app is static. Rebuild everything with:

```
python tools/ingest_anki.py      # after any Anki sync
python tools/build_lexicon.py
python tools/ingest_tatoeba.py   # dictionary examples his decks never use
python tools/build_topics.py
python tools/build_audio.py      # export the collection's recordings
python tools/make_app_icon.py    # only if the icon changes
python tools/build_site.py
node   tools/smoke.js            # 157 checks against the generated page
node   tools/visual.js           # layout, at 390px and 320px, both themes
node   tools/contrast.js         # palette: contrast + the two platforms agreeing
cd native; npx jest              # the native suite
.\tools\deploy.ps1
```

## Where things stand

| Phase | State |
|---|---|
| Ingest | Done — 6 decks, 13.5k sentences, 10k vocabulary entries, 23.5k audio refs |
| Lexicon | Done — 58,844 lemmas, 567k inflected forms, 97.7% coverage of the decks' text |
| Blocks | Done — 27 units (8 core stages, 19 topics) laid out as a path |
| App | Done — mobile shell, lesson engine, flashcards, dictionary, PWA |
| YouTube | Done — 27 episodes matched to units, with word-level timings |
| Audio | Done — 13,368 recordings exported, 86.8% of studied lemmas; TTS labelled as fallback |
| Dictionary | Done — all 45,987 glossed lemmas, 89.3% with a paradigm |
| Examples | Done — 48.8% of glossed lemmas have a sentence (7,488 his, 14,952 Tatoeba) |
| Native | Done — full parity with the web app, one shared `core/` |

## App structure

Sources live in `tools/app/` and are inlined into one file by `build_site.py`:

- `shell.html` — top bar, five screens, bottom tab bar
- `app.css` — design tokens, both themes, mobile-first layout
- `app.js` — store, router, path, practice, dictionary, profile, settings
- `lessons.js` — the lesson engine
- `manifest.json`, `sw.js` — PWA

Two outputs: `site/index.html` (full document, for Netlify and the APK) and
`site/artifact.html` (same app without document furniture, for Claude Artifacts).

### Screens

One mechanism per screen, as intended:

- **Path** — stages down a rail. A core unit per stage with topic branches beside it.
  Resume button jumps to the first unfinished lesson.
- **Lesson** — a unit's lessons, then the exercise runner.
- **Practice** — flashcards over any chosen sets, scheduled by FSRS, with the four
  Anki buttons. Previous/Skip step through the deck.
- **Words** — dictionary: paradigm tables, examples, a star to bank a word, and links
  out to every other word.
- **You** — profile: name, level, streak, and the trouble-word bank.

### Drills

A separate tab. Six types, all generated from the paradigm data already in the payload —
there is no authored question bank to drift out of date. Distractors come from the same
word's other cells wherever possible, so the drill trains the distinction that matters.

| Drill | Built from | Available |
|---|---|---|
| Cases | noun declension tables | 2,238 nouns |
| Aspect pairs | verb `partner` field | 358 verbs |
| Agreement | adjective declension × noun gender | 940 adjectives |
| Conjugation | present/future tables | 392 verbs |
| Stress | stress-marked headwords, accent moved to other vowels | 3,446 words |
| Grammar rules | the curated grammar notes | 27 notes |

Each question can pull up the table that answers it. Peeking is allowed and costs
something honest: the word is graded **Hard** rather than Good in FSRS, the button
disables for that question, and the run reports how many answers were assisted.

Never ask for a form that is already on screen — the headword is usually the nominative
singular, and asking for it answers itself.

### Audio

`tools/build_audio.py` exports the best recording per utterance, ranked by whether a
human said it and then by measured fidelity:

| Rank | Source | Chosen for |
|---|---|---|
| 5 | Tatoeba native speakers | 185 |
| 4 | Languages on Fire (human studio) | 170 |
| 3 | Yandex neural TTS | 2,339 |
| 2 | Core 5000 | 10,314 |
| 1 | Google TTS | 168 |

Ranking alone drops Google TTS from 10,366 files to 168 utterances, because Core 5000
covers 10,314 of them at double the bitrate. 13,183 utterances, 209 MB, content-hashed
so duplicates across decks are stored once.

`tools/fetch_tatoeba_audio.py` pulls the native recordings, matching Tatoeba's Russian
sentences to the corpus by folded text. Use the CDN host — `audio.tatoeba.org` serves
the original upload, the app endpoint re-encodes it smaller (31,978 bytes against
21,545 on the same sentence). Speakers and licences are recorded in
`data/raw/tatoeba/ATTRIBUTION.txt`, which the CC licences require.

**Core 5000's provenance is still unverified.** Uniform 64 kbps mono with an ffmpeg tag
is consistent with either TTS or normalised human recordings, and it is 10,314 of the
13,183 utterances — so whether the app "sounds human" mostly rests on an open question.
Listening settles it; nothing else will.

### Navigation

Five tabs: **Learn** (the path), **Study** (flashcards), **Practice** (drills),
**Immerse** (the video library), **Search** (dictionary). The profile moved out of the
tab bar to an avatar in the top bar.

Immerse is its own screen rather than a shelf inside Practice because passive listening
and active retrieval are different acts, and one mechanism per screen is the rule.

The app plays the real file and falls back to the device voice only for what the
collection lacks. `build_site.py` ships a manifest entry only when the file is actually
present, so a partial export cannot promise audio the build does not carry.

### Scheduling

`fsrs.js` implements **FSRS-4.5** with the published default weights. Each word keeps
stability, difficulty, due day, reps and lapses; the four buttons are labelled with
the interval each would schedule. *Again* requeues the word inside the session.

### Trouble bank

A word banks itself after 4 lapses, or at high difficulty once it has been seen a few
times; starring one from the dictionary banks it by hand. The profile screen lists them
and can drill them as a set. This is the prototype of the profile system — it lives in
`localStorage` today and is the natural thing to move to a server account later.

### Navigation

Every screen change is a history entry carrying its own depth, so the back arrow
retraces the trail: word to word, lesson to unit, unit to path. Inside a lesson the
arrow beside the progress bar reviews the previous exercise and its answer; inside a
deck, Previous steps back a card.

Settings sits behind the cog: developer mode, theme, card direction, install, reset.

### Lesson engine

Each unit is split into lessons of 7 words. A lesson is **three components, doable in
any order**, each with a circle on the hub that fills green when done:

| Component | What happens |
|---|---|
| `vocab` | The unit's grammar rule (first lesson only), then each new word with audio and a real sentence, with two practice questions folded in after every pair. Not scored. |
| `quiz` | 8 mixed questions, no hints. 80% ticks the component. |
| `video` | An Easy Russian episode on the unit's subject. **Shared across the unit** — watching once ticks it for every lesson, because there is one video per unit's worth of vocabulary. |

All components ticked = lesson complete. All lessons complete = unit complete, which is
what unlocks the next stage. Units with no video have two components.

Practice teaches, so its mistakes cost nothing — but every answer in either component
grades the word through FSRS (correct → Good, wrong → Again). That is what ties lessons
to the scheduler and the trouble bank; only the Practice screen lets you self-grade with
the four buttons.

Exercise types used by the practice and quiz phases:

| Type | Prompt |
|---|---|
| `choose-en` | Russian word → four English meanings |
| `choose-ru` | English meaning → four Russian words |
| `listen` | Spoken word → four Russian spellings (only when a Russian voice exists) |
| `type` | English meaning → type it in Russian (Latin spelling accepted) |
| `cloze` | A sentence from your decks with the word blanked |
| `match` | Four pairs to link up |

80% on the quiz clears a lesson. Clearing every lesson in a stage's core unit unlocks
the next stage; a stage's branches open once its core unit is underway.

### Video

`tools/build_videos.py` matches Easy Russian videos to units, scoring titles against the
same keyword sets `build_topics.py` uses for vocabulary, so there is only one taxonomy.
26 of 27 units have a video; Military & Conflict has no confident match on the channel
and is deliberately left empty. Two bad keyword matches are corrected by hand in that
tool's `OVERRIDES`, the same convention as topic misfilings.

Videos are per **unit**, not per lesson — the channel has 160 videos against 27 units,
so a video per lesson would mean inventing associations that do not exist. Each unit
shows its video on the unit screen and again as the final step of its last lesson.

### Progress

`localStorage` under `rb.state`, schema version 4, keyed by the Russian word itself so
progress survives a rebuild. Holds per-word FSRS state, per-lesson component completion,
the trouble bank, XP and streak. Migrations from v1–v3 run on load and are covered by
the smoke test; Copy / Export / Import in settings move it between devices or origins.

**Developer mode ships on** and unlocks every lesson. Turn it off in settings to see
the real gating.

## Turning it into an APK

The app is already an installable PWA (manifest, service worker, maskable icon,
offline shell). The APK route is a Trusted Web Activity:

1. `npx @bubblewrap/cli init --manifest https://bridges-jf.netlify.app/manifest.json`
2. `npx @bubblewrap/cli build` — produces a signed APK/AAB.
3. Host `.well-known/assetlinks.json` on the Netlify site with the signing key's
   fingerprint, so Android drops the browser chrome.

Needs the Android SDK and a signing keystore, and a decision on the package name.
The alternative is Capacitor, which is worth it only if native APIs are wanted —
a TWA keeps the single codebase.

## Known gaps

- **The repo directory is still named `russian-blocks`.** Cosmetic only; the Netlify
  project is linked by id, not by path.

- **Topic grouping is 36% coverage and heuristic.** Concrete nouns sort well;
  abstract words do not. Misfilings are hand-overridden in `build_topics.py`.
  A re-file control on the word screen would let curation happen while studying.
- **Audio is device TTS.** The 23.5k recordings already in `collection.media` are
  not shipped yet; wiring them in means hosting ~120 MB and referencing by filename.
- **Anki media sync is incomplete** — 6,654 Core 5000 files are on the phone but not
  the desktop, so re-running ingest still reports them missing.
- **No lesson for grammar itself.** The 209 lessons salvaged from the llama and LoF
  decks are ingested but unused.

## Ground rules

- Never write to the live Anki collection; read a copy.
- Every generated artifact is reproducible by re-running a tool.
- Manual curation lives in its own table and is never clobbered by a rebuild.
- `node tools/smoke.js` must pass before deploying.
