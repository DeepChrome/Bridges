# The Reddit post (drafted 2026-11-19)

Where to post, in order, and why. Reddit blocks scripts, so the rules below
are from third-party summaries of each sub's sidebar; read the sidebar once
before posting.

| Where | Why | What the rules say |
|---|---|---|
| **r/russian** (~413k) | The one place the people who would use this already are, and the one place native speakers will read the conversations and say what is wrong — which is the review Gate 3 never got. | Learning resources are allowed; keep it infrequent and relevant. Post once, answer every comment, do not re-post. |
| **r/languagelearning** (~3.4M) — the stickied **"Share your resources"** monthly thread | Promotion outside that thread gets removed and a new account banned; inside it is explicitly allowed and does not count against the sub's limits. | Disclose that it is yours. A thread post is a comment, so use the short version below. |
| r/droidappshowcase (~17k), optional | A dev-showcase sub, one app post a week. Low traffic, but it is what r/androidapps points developers at (r/androidapps itself removes dev posts). | Flair it, one post. |

Do not post it on r/androidapps or as a stand-alone post on r/languagelearning.

**Before posting** you need the thing people tap: the Play closed-test opt-in
link (Play Console → Testing → Closed testing → Alpha → Testers → "Join on the
web" → Copy link). It only works once Google has approved the closed-test
release. The tester list is the open Google Group ya-russian-testers
(groups.google.com/g/ya-russian-testers): joining it is what makes someone a
tester. Replace `<PLAY LINK>` below. Post from u/YaLearnRussian after it has a
few genuine comments, or the spam filter eats a new account's first post.

Reply to every comment the first day. That is most of what the post is for.

---

## r/russian — the long version

**Title:** I built a free Android app around 321 real Russian YouTube videos — every lesson works toward understanding the next one. Looking for people to try it (and natives to tell me what's wrong).

I've been learning Russian for a couple of years and the thing that kept bugging me about every app was that the finish line was the app itself. You clear the level, you get the badge, and then you open a real video and understand nothing.

So I built one where the video is the finish line. It's called Ya (Я). Each unit of the course is built from one actual YouTube episode — Easy Russian, Comprehensible Russian, Real Russian Club, Russian With Max and a few others, 321 captioned episodes in all. The unit teaches the words that episode actually says, you drill them, you review them as flashcards, and then you watch the episode with every word tappable and the transcript following along. Then five questions about what happened. The next unit's video is a little harder.

Other things in it, roughly in the order I use them:

- Flashcards on FSRS (same scheduler as current Anki), one card per word, Russian-first or English-first or audio-only. You can import your own Anki decks and they schedule alongside everything else.
- A dictionary of about 52,000 words. Any Russian word anywhere in the app is tappable: one tap tells you what form it is, a second gives you the full entry with every table and real example sentences. Each table cell has its own recording.
- Case-by-case grammar modules (prepositional first, then accusative, genitive…), drilled on real sentences sorted by what triggers the case, not "here are all six cases, good luck".
- Speaking: say a sentence and it's checked word by word on the phone (nothing leaves the device). A word-building drill that builds long words from the end, Pimsleur-style, so the ending comes out right.
- Drive mode: hands-free audio lessons in chapter-sized episodes, Pimsleur-shaped, with voice commands and headset buttons. I use this on the commute.
- An AI tutor you can talk to in either language, and a sparkle button on every screen that answers questions about whatever Russian is in front of you. Also a two-way interpreter mode.
- Twenty short listening scenarios (30–45 seconds, two or three voices, five questions about the situation) at the level of the chapter they're in.

Free, no ads, no account. Your progress lives on the phone; speech recognition is on-device.

Honest caveats, because this is a beta:

- Android only. There is a Windows app that syncs with it, but no iPhone.
- The 20 scenario dialogues and the grammar reference were written with AI help and checked by machine for level and vocabulary, but **no native speaker has read them yet**. If you're a native speaker and something in there makes you wince, I genuinely want to hear it. That's half of why I'm posting.
- The AI features run through my own server and have daily limits, because I'm paying for them.
- The first download is big (the bundled audio).

How to get it (it's a closed test, so it's two taps instead of one):

1. Join the tester group: https://groups.google.com/g/ya-russian-testers (it's just the guest list — nobody gets emailed).
2. Then open this on your phone and install: <PLAY LINK>

Screenshots in the comments. Happy to answer anything about how it's built.

---

## r/languagelearning "Share your resources" thread — the short version

Disclosure: this is mine.

**Ya** (Android, free, beta): a Russian course where every unit is built from a real YouTube episode. The unit teaches the words the episode actually says, you drill and review them (FSRS flashcards, Anki import), then watch the episode with a tap-to-look-up transcript and five comprehension questions. Also: a 52k-word dictionary with recorded paradigms, case modules drilled on real sentences, on-device speech checking, a hands-free drive mode, and an AI tutor that works in either language. No ads, no account.

Caveat: the written dialogues haven't had a native-speaker read yet. If you are one and you try it, tell me what's off.

To install: join https://groups.google.com/g/ya-russian-testers, then <PLAY LINK>

---

## Screenshots to attach (docs/store/screenshots/)

In this order, with these captions:

1. `1-word-card.png` — "A word card. The sentence under it is from the unit's video, at the moment it's said."
2. `2-episode.png` — "The episode: transcript follows the audio, every word tappable, machine English underneath." **Retake this one on your phone; the emulator shows a black player.**
3. `3-flashcard.png` — "Flashcards on FSRS. The ring is how well the word is held."
4. `4-practice.png` — "Practice."
5. `5-drive.png` — "Drive mode: chapter-sized audio episodes, voice commands."
6. `6-library.png` — "The library: 321 episodes from seven channels, by level."
7. `7-path.png` — "The path. Each node ends on a video."
8. `8-tutor.png` — "The tutor. It knows what you got wrong yesterday."

Taken on the emulator, so the emulator's status bar is in shot.
