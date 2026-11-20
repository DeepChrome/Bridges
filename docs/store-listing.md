# Google Play listing — Ya

*Written for the Play Console: the copy is what gets pasted in, the checklist
is what has to be true before Send for review. Rewritten against the app on
2026-11-19 (it was Bridges, 168 lessons and 1,045 words before).*

---

## Name and one-liner

Store title (30 characters, Play's limit; the keyword in the title is what
search weighs — the owner, 2026-09-19): **Ya: Learn Russian**. The app's own
label stays "Ya".

Short description (80 characters, Play's limit; "Beta" first, so nobody
installs it thinking otherwise):

> Beta. Learn Russian towards real videos: lessons, flashcards, speaking, a tutor.

## Full description

**Ya is in beta.** It works end to end and it is still being shaped; what
breaks is worth telling us about (Settings → Send feedback).

Every other app's finish line is the app. Ya's is a real video.

**A course built towards real Russian.** Ten chapters, 34 units, 185 lessons,
about 1,300 words. Each unit is built from one actual YouTube episode —
Easy Russian, Comprehensible Russian, Real Russian Club and others — and
teaches the words that episode says. You learn them, drill them, review them,
then watch the episode with every word tappable and the transcript following
the sound, and answer five questions about it. The next unit's video is a
little harder.

**Flashcards that match Anki.** FSRS-6 scheduling, one card per word, asked
Russian-first, English-first or sound-only as you choose. Every lesson
question and every flashcard feeds the same memory. Import your own Anki decks
and they schedule alongside the course.

**Every word is a link.** Tap any Russian word anywhere — a lesson, a card, a
transcript — to see what it is and what form it is in; tap again for the full
entry: every meaning, the complete tables with a recording in every cell, real
example sentences, and the videos that say it. The dictionary holds 52,000
words.

**Grammar in the order it is taught.** The cases one at a time, prepositional
first, each with a lesson on when it is used and drills on real sentences.
Aspect pairs, agreement, conjugation and stress drills. A reference you can
read in two minutes a topic.

**Speaking.** Say a sentence and it is checked word by word, on the phone.
Shadow a native sentence. Build long words from the end so the ending comes
out right. Talk through a situation with a character, and get your sentences
corrected.

**Hands-free.** Drive mode plays chapter-sized audio lessons — the English, a
pause for you, the Russian — with voice commands and your headset's buttons.

**A tutor and an interpreter.** Ask the tutor anything in English or Russian,
by voice or by typing. A sparkle on every screen answers questions about the
Russian in front of you. Translate turns the phone into a two-way interpreter.

**Watch real Russian.** 321 captioned episodes from seven Russian-teaching
channels, by level, each listing the words it actually says.

**No sign-up. No adverts. No analytics.** Progress lives on your phone; speech
recognition runs on the device. The AI features have daily limits.

---

## Graphics

| Asset | File | Notes |
|---|---|---|
| Feature graphic | `docs/store/feature-graphic.png` | 1024×500 — **redo for Ya** (`tools/make_feature_graphic.py` still draws the Bridges mark) |
| Icon | `native/assets/icon.png` | `tools/make_app_icon.py` |
| Screenshots | `docs/store/screenshots/1-word-card.png` … `8-tutor.png` (2026-11-19) | 1080×2400 |

Screenshots in order: the word card with its video line · the episode with
its transcript (**retake on the phone**: the emulator shows a black player) ·
a flashcard's back · Practice · Drive mode · the library · the path · the
tutor. Play takes two to eight phone screenshots. They were taken by
`native/tools/walk.ps1` on the emulator, which puts its status bar in shot.

---

## Data safety form

The answers, and what makes each one true:

| Question | Answer | Why |
|---|---|---|
| Data collected | **App activity → "Other user-generated content"**, optional, only when the user turns on Sync | Settings → Sync stores the learner's progress on the Worker under a random account id (§30cr). Off by default. |
| Data shared | Yes — "Other user-generated content", with a service provider | The *text* of what the learner said, typed or was looking at, for the AI features (feedback, tutor, Talk, Translate, Ask). Not stored. |
| Voice or audio recordings | **No** | Recognition runs on the device; audio never leaves it |
| Device or other IDs | No | The install's Worker token is random and made by the app; it is not a device id |
| Location, contacts, photos, files | No | Not requested |
| Encrypted in transit | Yes | HTTPS to the Worker and to Anthropic |
| Users can request deletion | Yes | Removing the devices in Settings → Sync removes the account's data; nothing else is stored |
| Data used for tracking | No | |

Permissions in the manifest — `tools/release_check.mjs --store` asserts the
fourth is gone from the store bundle:

- `RECORD_AUDIO` — the speaking exercises
- `MODIFY_AUDIO_SETTINGS` — the audio session for playback
- `POST_NOTIFICATIONS` — the optional daily reminder
- ~~`REQUEST_INSTALL_PACKAGES`~~ — the beta's in-app updater; **not in a
  store build** (`build.ps1 -Store`, §30cv)

Also in the merged manifest from the libraries: `INTERNET`, `VIBRATE`,
`WAKE_LOCK`, `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
(expo-audio's media session, which drive mode uses on the lock screen — a
"media playback" foreground-service declaration in the console), and the two
legacy storage permissions capped at SDK 32 (Anki import).

Content rating: Everyone. No ads, no purchases, no user-to-user communication.

**Privacy policy URL:** `https://bridges-dl.bridges-feedback.workers.dev/privacy`
(docs/privacy.md, published by `tools/dl/upload_privacy.mjs`; the route needs
the bridges-dl Worker deployed).

---

## Signing

Release builds sign with the upload key when `BRIDGES_UPLOAD_*` are in
`~/.gradle/gradle.properties` (they are, on the owner's machine; the keystore
is in OneDrive — `plugins/withUploadSigning.js`). Turn **Play App Signing on**
at the first upload: Google holds the app signing key, this one only signs
uploads, and losing it is then recoverable.

---

## Build

```
.\native\tools\build.ps1 -Store                               # Ya-<commit>-store.aab, ~40 min
node tools/release_check.mjs --store --file native\build-out\Ya-<commit>-store.aab
```

A bundle, not an APK: Play requires one and sends each phone its slice. The
versionCode is the build minute (§30cv), so every upload is newer than the
last and there is nothing to bump. The store build carries no update host
and no side-load permission; everything else is the beta's build.

**Upload path.** *Internal testing* first (up to 100 testers by email,
nothing on the store, no review clock): it proves the signing and the bundle.
*Closed testing* is what starts the fourteen-day, twelve-tester clock a
personal account needs before production unlocks — start it the same day.
The console asks for the Data safety form, the content rating and the
privacy policy URL before a testing track can be published.

---

## Before Send for review

**Done in the repo:** licence file, privacy policy (text and page), store
copy above, permissions minimal and asserted, the store build and its check,
screenshots.

**His, in the console or the shell:**

1. `cd tools/dl; npx wrangler deploy` — the privacy page and the audio packs
   route. Without it the policy URL is a 404 and strangers past chapter 2
   hear the device voice.
2. `cd backend; npx wrangler deploy` — the tutor's two-line marks and the
   sparkle's conversation mode.
3. Create the app record ("Ya: Learn Russian", package `app.bridges.russian`),
   upload the `-store.aab` to Internal testing with Play App Signing on, then
   promote the same bundle to a Closed testing track; make the tester list a
   Google Group with open membership so the opt-in link works for anyone.
4. Data safety form (table above), content rating, privacy URL, the
   foreground-service declaration (media playback).
5. Feature graphic for Ya.
6. Decide Free vs everyone-Premium for the beta (docs/BETA.md Phase E;
   `BETA_PREMIUM` is on, so today everyone gets Premium's allowance).
7. A native speaker's read of the 20 conversations (Gate 3) — or let the
   r/russian post be that read, and fix what comes back.
