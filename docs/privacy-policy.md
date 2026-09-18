# Privacy Policy — Bridges

**Last updated: 17 September 2026**

Bridges is a Russian-language learning app. This policy describes what it does
with your information. It is short because the app collects very little.

## The short version

- There is **no account**. You do not give us a name, an email address or a
  password.
- Your progress stays **on your phone**.
- There is **no analytics**, no advertising, and nothing is sold or shared for
  marketing.
- Three optional features send text to a server so a language model can reply.
  Nothing is stored there beyond a usage counter.
- Your voice **never leaves your phone**.

## What stays on your device

Everything by default. Your profile name, the character you pick, which words
you have studied, your review history, imported Anki decks, downloaded audio and
any crash reports are written to a database in the app's private storage. None
of it is transmitted anywhere unless you choose to export it.

You can export a backup at any time (Settings → Back up progress); the file goes
wherever you send it, and that is entirely your choice. Deleting the app deletes
everything it holds.

## Microphone and speech

Some exercises ask you to say a Russian sentence aloud. Speech recognition runs
**on the device** using the operating system's own Russian recogniser. The audio
is not recorded, not saved, and not uploaded. Only the words the recogniser
produced are compared with the sentence you were asked to say.

Microphone permission is requested the first time you use a speaking exercise,
never at launch, and the app works without it — those exercises are skipped and
do not count against your score.

## Features that use a server

Three optional features send text to a server operated for this app
(Cloudflare Workers), which passes it to Anthropic's language-model API to
generate a reply:

| Feature | What is sent |
|---|---|
| Written feedback on a spoken sentence | The transcript of what you said, and the target sentence |
| Talk (conversation practice) | The conversation so far, and the list of words you have studied |
| Chapter task | What you wrote, and the task you were given |

**No audio is ever sent** — only text. The server keeps no conversation history,
no learner profile and no copy of what you sent. It stores a per-day request
counter so the service cannot be run up without limit, and a count of tokens
used. Anthropic processes the text to produce the reply under its own terms and
does not use it to train models.

If you never open these features, nothing is sent.

## Videos

The video library plays YouTube videos inside the app. Playing one contacts
YouTube and Google, who may set cookies and collect information under
[Google's privacy policy](https://policies.google.com/privacy). Bridges does not
receive that information. Video thumbnails are fetched from YouTube when the
library is on screen and are not stored.

## Audio files

Recordings of words and sentences are downloaded from the app's own host as you
study. These requests carry no identifier of you beyond what any web request
carries (an IP address, which is not logged against a user).

## Notifications

If you turn on the daily reminder, notifications are scheduled **locally by your
phone**. No push service is used, nothing is registered with a server, and no
device token is created. Turning the setting off cancels them.

## Children

Bridges is not directed at children under 13 and does not knowingly collect
information from them.

## Your choices

- Turn off any of the server features simply by not using them.
- Decline microphone permission; the app still works.
- Turn off the daily reminder.
- Delete everything by uninstalling the app, or reset your progress in Settings.

## Changes

If this policy changes materially, the updated date above will change and the
new version will be published at the same address before the change takes
effect.

## Contact

Questions about this policy: **jared.a.flood@gmail.com**
