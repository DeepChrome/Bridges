# Ya — Privacy Policy

Last updated: 19 November 2026

Ya (package `app.bridges.russian`) is a Russian-learning app for Android. This
policy says what the app does with information. It is short because the app
does very little with it.

## The short version

Ya has no sign-up, no analytics and no advertising. Your learning progress
stays on your phone unless you turn on Sync. Your voice never leaves your phone.

## What stays on your phone

- **Your progress** — the words you have studied, when each is next due, your
  streak, your settings and any Anki decks you import. All of it is stored in
  the app's own storage on the device. You can export it to a file from
  Settings → Back up progress, and that file goes wherever you send it.
- **Your voice.** Speech recognition runs on the device. The audio is not
  recorded, not stored and not transmitted.
- **Problem reports.** If the app fails, it writes what went wrong to the
  device so you can look at it later in Settings. It is sent nowhere unless you
  choose to share it, and it contains no learning data.

## What leaves your phone, and when

- **Recordings of words and sentences** are downloaded from our host as you
  reach each chapter. That is an ordinary file request; it carries no
  identifier for you.
- **The AI features** — spoken-sentence feedback, the tutor, Talk, Translate,
  and the "Ask the AI" button — send the *text* involved (what the on-device
  recogniser heard or what you typed, the sentence or screen you were on) to
  our own server (a Cloudflare Worker) and from there to Anthropic's API, which
  answers. **No audio is sent.** The server keeps a per-day request count and a
  token count per install so the service cannot be run up without limit; it
  does not keep the text. Each install is identified to the server by a random
  token it makes for itself; nothing ties it to you. These features are
  optional and nothing is sent unless you use them.
- **Sync, if you turn it on** (Settings → Sync). Your progress is then stored
  on our server under a random account id so a paired computer can share it.
  Turning Sync off stops the copying; removing every device from the account
  in Settings leaves nothing on the server that is yours. Sync is off by
  default.
- **Feedback you send** from Settings → Send feedback, or from the "Report a
  problem" button, goes to our server with the build number and the screen it
  came from, and nothing else that you did not type.
- **Videos are YouTube embeds.** Playing one is a request to YouTube and is
  subject to Google's privacy policy. Ya sends YouTube nothing about you.
- **Dictionary look-ups outside the app's own dictionary** fetch the entry from
  Wiktionary when you ask for it. **Photographs and links** open in your
  browser when you tap them.

## What we do not do

We do not collect personal information, build a profile of you, sell or share
data with advertisers, or use third-party analytics or crash-reporting
services.

## Children

Ya is not directed at children under 13 and collects no personal information
from anyone.

## Your control

Everything the app holds is on your device. Uninstalling Ya removes it.
Settings → Reset progress erases your learning history while leaving the app
installed. With Sync off there is no server-side account; with it on, removing
your devices in Settings → Sync removes the account's data.

## Third-party material

Ya includes dictionary and sentence data from OpenRussian (CC BY-SA 4.0),
Tatoeba (CC BY 2.0 FR) and English Wiktionary (CC BY-SA 3.0), photographs from
Wikimedia Commons under their individual licences, and open-source software
listed in the app under Settings → Credits.

## Contact

jared.a.flood@gmail.com

---

*Hosting note (not part of the published policy): the page is served at
https://bridges-dl.bridges-feedback.workers.dev/privacy by the bridges-dl
Worker; `node tools/dl/upload_privacy.mjs` republishes it after an edit.*
