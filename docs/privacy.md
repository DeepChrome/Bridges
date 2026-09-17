# Bridges — Privacy Policy

Last updated: 17 September 2026

Bridges is a Russian-learning app for Android. This policy says what the app
does with information. It is short because the app does very little with it.

## The short version

Bridges has no accounts, no analytics and no advertising. Your learning
progress stays on your phone. Your voice never leaves your phone.

## What stays on your phone

- **Your progress** — the words you have studied, when each is next due, your
  streak, your settings and any Anki decks you import. All of it is stored in
  the app's own storage on the device. You can export it to a file from
  Settings → Back up progress, and that file goes wherever you send it. Nothing
  is uploaded automatically and there is no server copy.
- **Your voice.** Speech recognition runs on the device. The audio is not
  recorded, not stored and not transmitted.
- **Problem reports.** If the app fails, it writes what went wrong to the
  device so you can look at it later in Settings. It is sent nowhere unless you
  choose to share it, and it contains no learning data.

## What leaves your phone, and when

- **Audio for words and sentences** is downloaded from our web host as you
  study. That is an ordinary file request; it carries no identifier for you.
- **Two speaking activities** — the spoken-sentence feedback and the
  conversation tutor — send the *text* the on-device recogniser heard, plus the
  sentence you were attempting, to our own server (a Cloudflare Worker) and
  from there to Anthropic's API, which grades it and replies. **No audio is
  sent.** We keep a per-day request count and a token count so the service
  cannot be run up without limit; we do not keep the text. These activities are
  optional and nothing is sent unless you use them.
- **Videos are YouTube embeds.** Playing one is a request to YouTube and is
  subject to Google's privacy policy. Bridges sends YouTube nothing about you.
- **Photographs and dictionary links** open in your browser when you tap them.

## What we do not do

We do not collect personal information, build a profile of you, sell or share
data with advertisers, or use third-party analytics or crash-reporting
services.

## Children

Bridges is not directed at children under 13 and collects no personal
information from anyone.

## Your control

Everything the app holds is on your device. Uninstalling Bridges removes it.
Settings → Reset progress erases your learning history while leaving the app
installed. There is no server-side account to delete, because there is none.

## Third-party material

Bridges includes dictionary and sentence data from OpenRussian (CC BY-SA 4.0),
Tatoeba (CC BY 2.0 FR) and English Wiktionary (CC BY-SA 3.0), photographs from
Wikimedia Commons under their individual licences, and open-source software
listed in the app under Settings → Credits.

## Contact

jared.a.flood@gmail.com

---

*Hosting note (not part of the published policy): Google Play requires this at
a public URL. Cloudflare Pages or a route on the existing Worker are both free;
the Worker already exists and is the shorter path.*
