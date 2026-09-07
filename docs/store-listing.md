# Store listing prep (ROADMAP P8.7) — 2026-09-07

What a Google Play listing needs, drafted from the app as it is. Nothing here is
submitted; Phase 8 waits on the owner (P8.1's audio decision comes first — the
current recordings cannot ship publicly, see licensing.md).

## Name and one-liner

**Bridges — Russian from your own words**
Russian lessons built on your Anki decks: a path, real recordings, listening
scenes, speaking practice, a short conversation with a tutor, and a video library
that lists only the words each video actually says.

## Description (draft)

Bridges turns a Russian vocabulary collection into a course. Eight chapters of the
commonest words, each with side quests — food, home, travel, health, work, law,
science — that you take or skip. Every lesson teaches a handful of words, then asks
for them in seven ways: meaning, the Russian, a gap in a real sentence, typing,
hearing a word, hearing a sentence, and saying one aloud. A listening scene plays
a few sentences with the questions on screen first. Flashcards are scheduled by
FSRS, the same algorithm Anki uses, and any Anki deck imports straight in.

Tap any Russian word, anywhere, to see what it is and what form it is in; tap
again for the full entry: meaning, every form, and the sentences it appears in,
from a dictionary of 46,000 words.

Immerse holds 321 YouTube episodes from seven Russian-teaching channels, searchable
by topic, grammar point or level, each listing the study words it actually says
and jumping to the moment it says them.

Talk is a short conversation with a tutor on a topic you choose; every sentence
you say is corrected word by word. Three conversations a day.

## Privacy disclosure

Data handled, and where it goes:

- **Your voice never leaves the phone.** Speech recognition runs on the device.
  For Say and Talk, the *text* the recogniser heard is sent to our server
  (a Cloudflare Worker) and from there to Anthropic's API to be graded; it is not
  stored by us beyond a same-day request counter and a token count. Nothing is
  sent unless you speak to one of those two activities.
- **Your progress stays on the phone**, in the app's storage. Export it as a file
  from Settings; nothing is uploaded.
- **Recordings stream from our web host** when a word is played; with "Audio for
  offline" on, they are downloaded to the phone's cache.
- **Videos are YouTube embeds.** Playing one is subject to YouTube's terms and
  YouTube sees the playback. The app sends YouTube nothing about you.
- **No accounts, no analytics, no advertising.**

Google Play data-safety form, as it would be filled in: data collected — none;
data shared — "Voice or sound recordings": no; "Other user-generated content"
(the transcript of what you said, for the two speaking activities): shared with a
service provider, not stored, optional; encryption in transit: yes; deletion:
nothing to delete server-side.

## Screenshots

Six from the emulator walkthrough, 1080×2400, in `docs/store/`:

| File | Shows |
|---|---|
| 41-learn-home-button.png | The path with its chapters and side quests |
| 44-practice.png | Practice: quiz, listening, talk, the grammar drills |
| 48-listening-scene.png | A listening scene, questions before the audio |
| 50-immerse.png | The video library with its search bar |
| 53-video.png | A video and the words it says |
| 58-settings-more.png | Settings: keyboard, reading speed, the ten sounds |

Retake them on a real device before submission; the emulator's status bar is
visible in these.

## Before submission

1. P8.1's audio decision, then P8.2 (regenerate or license) and P8.3 (`build_audio.py --commercial`).
2. `build_site.py --public` for the payload (no caption text).
3. Per-user tokens (P8.4, done) — the listing build must not carry the owner's token: give each install its own via `backend/tools/user.mjs`.
4. A privacy policy URL (this section, hosted).
5. Onboarding (P8.6, done): the tour on first run.
