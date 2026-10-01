# Bridges — the road to a public beta

Written 2026-09-30, while the owner tests the current build. Five phases, in
order; each ends at a check that has to pass before the next one starts.
**Owner** marks a decision or an action only he can take; everything else is
engineering work. ROADMAP.md stays the long log; this is the short list.

How we work through it: he tests and sends notes as they come (a screenshot
plus one line is plenty). Notes are fixed in batches. Each batch ends with the
full suite, a build on his phone, and a short report: what changed, what was
checked, what is still open.

---

## Phase A — Smooth what he is testing (now)

The app is feature-complete for a beta. This phase is about it feeling right
on the phone.

- [ ] Work through his test notes in batches, as above.
- [ ] Re-run the full emulator walkthrough on the current build and read
      every screenshot. It has not been run since the drill settings cog, the
      tutor, the word groups or the UI test skin went in.
- [ ] See the dark theme on a real device. It has never been looked at
      outside the contrast audit.
- [ ] Listen for the things no test can hear:
  - the stress on word-building fragments
  - the word-ending clips cut from recordings
  - the speaking checks' new leniency (§30c)
  - the cast's voices in the conversations
- [ ] A fresh install from zero: the welcome screens, the placement test,
      chapter 1 lesson 1, the first flashcard session, Talk, the tutor.
- [ ] **Owner:** decide on the 18 words the last review pushed out of their
      units (лошадь, этаж, поле, берег, лапа…). Any of them can go back.

**Check:** a week of his own daily use with no bug that blocks study.

## Phase B — Content he can trust

Authored Russian has to be read by a person before strangers see it (Gate 3).
The job is much smaller than when it was first priced: 20 conversations
instead of 168.

- [ ] Re-export the review sheet (`tools/export_review.mjs`) against today's
      content: conversations, questions, grammar reference, word endings.
- [ ] A Claude pre-pass over every row first, for a few dollars, so the
      paid reader spends their time on what a machine can't judge.
- [ ] **Owner:** hire one native speaker for the read. Re-scope the old
      $220–385 estimate (§30x) against the smaller sheet before hiring.
- [ ] Apply their corrections (`tools/import_review.mjs`), rebuy the changed
      lines' audio (cents) and rebuild.
- [ ] Read the remaining photographs (ROADMAP 13.5) and blank any wrong ones.
- [ ] **Owner:** redraw страна and the four rewritten word pictures when the
      OpenAI credit is topped up (about $0.25 in all).

**Check:** the review sheet comes back with every row resolved; the
conversation checker and audio QA are clean.

## Phase C — Release engineering

- [ ] Build an upload-signed app bundle (AAB) and bump `versionCode`. Read
      what is inside the bundle, not the repo (§23).
- [ ] Size: the phone APK is now 154 MB, mostly bundled audio. Measure what
      Play would actually download against its 200 MB limit for the base
      module. If it is over, move the form recordings into a Play asset pack.
- [ ] One EAS build (the free monthly quota renews 1 October) to confirm the
      native modules build off this machine as well.
- [ ] Confirm which signing key his phone's install carries before moving it
      to the store's build. If it differs: back up in Settings, uninstall,
      install, restore.
- [ ] Worker: spot-check the token log and the global daily cap for a week,
      so a beta can't run up a bill.
- [ ] **Owner:** crash reporting. Today crashes are logged on the phone only
      (§30ad). For strangers, Sentry is worth reconsidering (ROADMAP 13.37).

**Check:** `release_check.mjs` 4/4, the bundle installs on his phone and on
the emulator, and a week passes with no Worker surprises.

## Phase D — Play Store closed test

- [ ] **Owner:** finish Play account verification, then create the app
      record.
- [ ] Upload to a **closed test** with Play App Signing on. A new personal
      developer account must run a closed test with **at least 12 testers for
      14 days** before it can publish publicly. That clock is the long pole,
      so it starts as soon as the account allows.
- [ ] **Owner:** recruit the 12 testers.
- [ ] Store listing (`docs/store-listing.md`): new screenshots with the cast
      and the current screens; a short description that leads with "your
      path to understanding real Russian videos".
- [ ] Host the privacy policy (`docs/privacy.md`) at a public URL.
- [ ] Data Safety form, to match what the app does:
  - speech recognition runs on the phone
  - typed or transcribed text goes to the Worker for feedback
  - no accounts, no ads, no analytics
- [ ] Content rating questionnaire.
- [ ] Licensing pass before any money changes hands (`docs/licensing.md`):
  - drop the Tatoeba recordings that bar commercial use (`build_audio.py --commercial`)
  - credits for the photographs and the YouTube creators
  - OpenRussian and Wiktionary attribution

**Check:** 14 days of closed testing, testers' notes worked through like
Phase A's, and no blocking report open.

## Phase E — Premium, only before charging

Premium exists today as daily allowances granted by hand
(`backend/tools/user.mjs plan <id> premium`). Selling it needs:

- [ ] Google Play Billing in the app and a subscription product in the Play
      Console.
- [ ] Receipts verified in the Worker, which then grants the plan. Never
      trust the app's word for it.
- [ ] A Premium screen worth tapping: one line on what it unlocks and the
      price from the store.
- [ ] **Owner:** decide whether the beta is free with everyone on Premium,
      or tests the Free limits from day one. Recommended: everyone on
      Premium for the closed test, so testers judge the product rather than
      the limits; the limits come with billing.

**Check:** a test purchase in Play's licence-testing mode turns a Free
install into Premium within a minute, and a cancelled one turns it back.

---

## Decisions waiting on the owner, in one place

| # | Decision | Phase |
|---|---|---|
| 1 | The 18 words cut from their units | A |
| 2 | Hiring the native-speaker reader | B |
| 3 | Topping up OpenAI for five redraws | B |
| 4 | Crash reporting (Sentry or not) | C |
| 5 | Play verification, app record, 12 testers | D |
| 6 | Free vs everyone-Premium during the beta | E |
