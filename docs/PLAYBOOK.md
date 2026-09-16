# Bridges — Review & Ship Playbook
Written 2026-09-15 for the agent working inside `C:\Users\jared\projects\russian-blocks`.

## 0. How to use this file
- Save as `docs/PLAYBOOK.md` in the repo. Commit it.
- Read `CLAUDE.md` §23 first, then §30s/§30t. Then this file.
- Work phases **in order**. Each phase ends at a **gate** (tests green + walkthrough screenshots reviewed + commit). Do not start the next phase before the gate.
- Every phase starts with a **written audit** of the files it touches, posted to the user as a bullet list *before* editing. The reviewer who wrote this playbook did not have the repo; you do. Your audit is the real code review.
- Report to the user in short bullets. He will approve spend decisions (marked 💰) himself.
- Rules that never change:
  - `core/` stays pure JS: no React, no React Native, no I/O. Everything in `core/` must be testable with `node tools/core.test.mjs`.
  - `native/` is the product. `tools/app/` (web) is frozen — do not spend effort on it except to keep `node tools/smoke.js` green.
  - `data/curated/` is content. Content changes go through the review pipeline in Phase 3, never edited ad hoc.
  - Every behaviour change ships with a test. Every screen change ships with a walkthrough screenshot.
  - Add every new full-screen run screen to `native/src/fullscreen.js` (see Phase 1 fix).

---

## Phase 0 — Safety and triage (day 1)
### 0.1 Get a remote 🔴 do this first
- Repo has no git remote. One disk failure ends the project.
- Create a **private GitHub repo** (`gh repo create bridges --private --source=. --push`). Confirm `git remote -v` and that `master` is pushed. Enable branch protection later; not now.

### 0.2 Land the uncommitted Run.js change correctly
- Open `native/src/screens/Run.js`. Check the three things the summary flagged:
  1. `flexGrow: 1` on the question block with **keyboard up on a typed question** — wrap the screen body in `KeyboardAvoidingView` (behavior `"height"` on Android) or use `react-native-keyboard-controller`; verify the input and the Check button stay visible.
  2. **Long cloze prompt** — add a walkthrough step that opens the longest cloze in `data/curated` and screenshot it. Prompt must not overflow or push answers off-screen. `promptSize(q)` must have a floor (≥16) and ceiling (≤28).
  3. Short option labels centred — confirm alignment survives 2-line labels.
- Fix the walkthrough precondition ("fresh profile on sign-in gate") so `walk.ps1` completes end-to-end.
- Commit with message: `Run: centre question block; keyboard-safe; prompt scales by length`.

### 0.3 Six reviewer items — resolve each
| Item | Action |
|---|---|
| `ui.js` Screen `fill/safeTop/footer` | Add a `screen.test.js` that renders all 8 prop combinations and snapshots layout. Document the matrix in a comment table. |
| `fullscreen.js` hardcoded list | Invert the test: read `App.js`, find every screen registered under the run/learn stacks, assert each is in `fullscreen.js` **unless** in an explicit `TAB_BAR_SCREENS` allowlist. Completeness, not existence. |
| `state.js workedOn` full scan | Memoise on `(seen, day)`; or maintain `state.workedToday` counter updated on each answer. Add a perf test: 10,000 cards < 5 ms. |
| `questions.js partnerWrong` iterates all L | Build a once-per-session index `byAspectPairAndLength` (Map keyed on length bucket). Perf test: 100 aspect questions < 50 ms. |
| 266 rewritten listening options | Handled in Phase 3 (native review). Do not hand-review in code. |
| Struggling simulated learner ~114/168 | Log it; the FSRS work in Phase 2 changes the simulator. Re-measure after Phase 2. |

### 0.4 Toolchain
- Upgrade to the **latest stable Expo SDK** (`npx expo install expo@latest && npx expo install --fix`). New Architecture on. Record the SDK number in `CLAUDE.md`.
- Replace `expo-av` with `expo-audio` if still on `expo-av` (deprecated).
- Add `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `lottie-react-native`, `react-native-svg`, `expo-sqlite` now so all later phases build on them. Run `npx expo-doctor`.
- **Gate 0:** all suites green, remote pushed, walkthrough completes, `expo-doctor` clean.

---

## Phase 1 — Data layer (days 2–3)
Why first: FSRS needs review logs; UI needs fast reads; sync later needs a schema.

- Move persistence from JSON blob (AsyncStorage or file) to **`expo-sqlite`** (WAL mode). Tables:
  - `cards(id TEXT PK, word TEXT, direction TEXT, due INT, stability REAL, difficulty REAL, elapsed_days INT, scheduled_days INT, reps INT, lapses INT, state INT, last_review INT)`
  - `review_log(id INTEGER PK, card_id, rating INT, state INT, due INT, stability REAL, difficulty REAL, elapsed_days INT, last_elapsed_days INT, scheduled_days INT, review INT)`
  - `progress(key TEXT PK, value TEXT)` for lesson/day/streak state.
  - `settings(key TEXT PK, value TEXT)`.
- `core/` gets a **repository interface** (`getDue(now, limit)`, `save(card, log)`, …). `native/` implements it with SQLite; tests implement it in-memory. Core never imports SQLite.
- Write a **one-time migration** from the current `seen[w]` shape. Keep the old blob until migration is verified, then delete.
- **Gate 1:** migration test (old fixture → new tables, row counts match), app boots on emulator with migrated data, all suites green.

---

## Phase 2 — Spaced repetition: meet or beat Anki (days 3–6)
### 2.1 Algorithm
- Use **`ts-fsrs`** (FSRS-6; stable line is 5.4.x — verify current stable on npm, avoid the 6.0.0 beta). Do not hand-roll the formulas.
- Defaults: `request_retention: 0.9`, `maximum_interval: 365`, `enable_fuzz: true`, `enable_short_term: true`, default `w` parameters.
- Card = one `(word, direction)` pair. Directions: RU→EN recognition, EN→RU production, listening. Siblings share a `word`.
- Store the full `review_log` row from `scheduler.next()` every answer. This is what lets you run the FSRS optimiser later (`@open-spaced-repetition/binding`) to personalise `w`. Add a Settings action "Optimise scheduling" once ≥1,000 reviews exist.

### 2.2 Queue builder — this is the bug he hit ("131 cards, sequential")
Implement `core/queue.js: buildSession(now, opts)`:
1. Pull due reviews (`due <= now`). **Sort by retrievability ascending** (most-forgotten first), then shuffle within ties. Never file order.
2. Pull learning/relearning cards whose intra-day step is due.
3. Pull new cards up to `newPerDay` (default 15) not already introduced today.
4. **Interleave**: reviews with new cards spread evenly (Anki "mix"), never all-new-then-all-review.
5. **Bury siblings**: if a card was answered this session, its siblings are excluded for the rest of the session.
6. Cap session at `sessionSize` (default 20). Show "20 of 131 due — continue?" between chunks. Remaining count visible on the flashcard tab.
7. `reviewsPerDay` cap (default 200) with a clear "you're done for today" state.
8. Again → card re-enters the same session after ≥3 other cards (learning step), not at the end.

### 2.3 Card UX (Anki parity)
- Four buttons: Again / Hard / Good / Easy, each showing the predicted next interval (`scheduler.repeat()` preview: "10m · 1d · 4d · 9d").
- Undo last answer (pop `review_log`, restore card).
- Flip animation (Reanimated), audio auto-plays on the Russian side, tap-to-replay.
- Stats screen: due today, retention (from logs), forecast next 7 days, per-card history.
- Settings: new/day, reviews/day, desired retention (0.8–0.95), learn-ahead limit.

### 2.4 Tests (all in `core.test.mjs` / jest)
- Queue with 131 due cards: order ≠ storage order; first card has lowest retrievability.
- New cards never exceed `newPerDay`; interleaving ratio within ±1.
- Sibling burying holds.
- Again re-queues before session end.
- Intervals monotonic across Hard<Good<Easy for the same card.
- Undo restores exact card state.
- Simulator (`tools/simulate.mjs`) rewired to FSRS; re-measure the three profiles and record numbers in `CLAUDE.md`.
- **Gate 2:** above tests green; he does a real 20-card session on the emulator and confirms ordering.

---

## Phase 3 — Content accuracy (runs in parallel from day 3; blocks store release)
No authored Russian ships without a native-speaker read. Non-negotiable.

### 3.1 Export for review
- `node tools/export_review.mjs` → `review/content_v1.csv`: `id, type (word|sentence|scenario_line|option|ui_copy), ru, en, context, audio_file`. One row per authored Russian string. Include stress marks and ё exactly as authored.
- Sort by chapter so the reviewer works in order.

### 3.2 Automated pre-pass (cheap, before paying a human)
- **Yandex.Speller API** (free) over every `ru` cell → flag typos.
- **LanguageTool** (self-host Docker, `ru`) → grammar flags.
- **Claude pass** (this model, via API or Claude Code): for each row output `ok | suspect: <reason>`. Treat as a filter only; it does **not** approve content.
- Rules enforced by `check_scripts.mjs --strict` (extend): every noun in dictionary has gender + stress; every verb has aspect pair; ё is never written as е in curated data; each scenario has ≥1 comprehension question that cannot be answered from a single cognate.

### 3.3 Native speaker review 💰
- Hire one **native Russian speaker with teaching/editing background** (Upwork/Fiverr Pro). Brief: "Correct every row for grammar, naturalness, register, stress. Mark scenario dialogue that sounds unnatural. Do not simplify." Give them the CSV + read-only audio links.
- Budget: ~$20–35/hr, 25–40 hrs for ~5,000 rows → **$600–1,400**. Second reviewer on a 10% sample: **~$150**.
- Ingest: `node tools/import_review.mjs review/content_v1_reviewed.csv` applies changes **by id**, writes a diff, and re-runs all content checks. Never hand-edit JSON.

### 3.4 Listening scenarios — bar to clear
Each of the 168 scenarios must have:
- A one-line **situation** in English ("At a pharmacy, asking for painkillers").
- **Two voices** where it's a dialogue; distinct male/female.
- Audio plays **before** options appear; replay and 0.75× slow buttons; transcript revealed only after answering; tap any word in the transcript for the dictionary entry.
- Questions test **meaning**, not a single keyword. Distractors equal length (already enforced) **and** semantically plausible in the situation.
- At least two exercise types per scenario: choose-the-answer and listen-and-type (short).
- **Gate 3:** reviewed CSV ingested, zero `suspect` rows outstanding, `check_scripts --strict` 0 errors.

---

## Phase 4 — Audio that doesn't sound like crap (days 6–9) 💰
### 4.1 Provider (his call; recommendation first)
| Option | Fit | Cost |
|---|---|---|
| **ElevenLabs (v3 multilingual)** — recommended for scenarios | Best naturalness/emotion; distinct dialogue voices | Creator ~$22/mo or Pro ~$99/mo for one generation month |
| Google Cloud TTS Chirp 3 HD `ru-RU` | Very good, cheap, stable | ~$30/M chars, 1M free/month |
| Azure Neural HD `ru-RU` (Dmitry/Svetlana) | Very good, strong SSML control | ~$16/M chars, 500k free |
- Total corpus is small (~4,000 words + sentences + 168 scenarios ≈ well under 1M chars). One month of any tier covers everything. **Recommendation:** ElevenLabs for scenario dialogue; Google Chirp 3 HD for single words/sentences (cheaper, consistent). Generate 5 samples from each, let him listen, then lock the choice in `CLAUDE.md`.

### 4.2 Pipeline (`tools/audio/`)
- `manifest.json`: `{id, text, voice, provider, sha256, file, duration_ms}`. Regenerate only when `sha256(text+voice)` changes.
- Stress: pass stress marks/ё to the provider (SSML `<phoneme>` or provider stress syntax). Homographs (за́мок/замо́к) must be explicitly marked.
- Post-process with ffmpeg: mono, 48 kbps Opus in `.m4a`/`.ogg` (check `expo-audio` Android support), `loudnorm I=-16 TP=-1.5`, trim silence to 100 ms each side.
- Storage: words/sentences bundled in the app (size check: keep app < 60 MB); scenarios bundled too unless size forces a CDN. If CDN: **Cloudflare R2** behind the existing Worker, with on-device cache and a "download all audio" button.
- QA script: every scenario/word has a file; no file < 300 ms or > 30 s; peak < -1 dBTP. Fails CI.
- Playback: preload next card's audio; no visible latency on flip.
- **Gate 4:** 100% coverage in manifest, QA script green, he listens to 20 random scenarios and 50 random words on the phone.

---

## Phase 5 — Duolingo-grade UI (days 9–16)
### 5.1 Design system (`native/src/theme/`)
- `tokens.js`: 4-pt spacing scale, radius (8/12/16/24), type scale (12–32, one display face + one text face via `expo-font`), light + dark palettes (primary, success green, error red, warning, neutral 50–900), elevation.
- `Btn`: Duolingo-style **3D press** (solid bottom edge 4 px, translateY on press, Reanimated spring), tones: primary / secondary / plain / link / danger / success. Haptic `impactLight` on press.
- Every screen consumes tokens only. `node tools/contrast.js` runs against tokens.

### 5.2 Motion & feedback
- Lesson **progress bar** at top with animated fill and a "checkpoint" pulse.
- **Answer feedback sheet** sliding up from the bottom: green (correct, haptic success) / red (wrong, haptic error) with correct answer + "Why" expander. Continue button pinned in the sheet.
- Question transitions: slide-out/slide-in (Reanimated layout animations), 250 ms.
- Flashcard: 3D flip; swipe left = Again, right = Good (optional, buttons remain).
- Lesson complete: Lottie confetti, XP counter roll-up, streak flame animation.
- Skeleton loaders on any screen that reads the DB.
- All animations ≥ 60 fps on his phone; verify with Perf Monitor in dev.

### 5.3 Screens (list the current 23, then the target set)
- **Home / Path**: vertical unit path (chapters as nodes, locked/active/done), streak + XP + due-cards pill at top.
- **Lesson Runner** (`Run.js`): footer-pinned actions, keyboard-safe, prompt scaling (from Phase 0).
- **Flashcards**: session chunking, 4 buttons with intervals, undo, stats entry.
- **Listening**: scenario player (Phase 3.4 spec).
- **Dictionary**: search with Cyrillic/Latin transliteration, paradigm tables, example sentences with audio.
- **Profile/Stats**: streak calendar, retention, forecast, settings.
- **Onboarding** (new): 3 screens — goal (daily minutes), level check (10 questions → placement), notifications permission.
- Accessibility: `accessibilityLabel` on all pressables, dynamic type respected, touch targets ≥ 44 pt.
- Update `walkthrough4.txt` → `walkthrough5.txt` covering every screen; screenshots reviewed by him.
- **Gate 5:** walkthrough green, contrast green, he approves screenshots side-by-side with the prior build.

---

## Phase 6 — Reliability & observability (days 16–18)
- Root `ErrorBoundary` with a "Something broke — restart lesson" screen; never a white screen.
- **Sentry** (`@sentry/react-native`, free tier) with source maps via EAS.
- **PostHog** (free tier) events: lesson_start/complete, card_reviewed(rating), scenario_completed, session_length. No PII.
- Local backup/restore: export SQLite to a file share sheet; import. (Cloud sync via Worker + D1 is post-launch.)
- Offline-first: app fully usable with airplane mode on. Test it.
- Perf budget: cold start < 2 s on his phone; DB queries for session build < 50 ms.
- **Gate 6:** crash-free run through full walkthrough with Sentry receiving a deliberate test error.

---

## Phase 7 — Store release (days 18–25) 💰
### 7.1 Decisions he makes
- **Licence:** app code proprietary (private repo); content © him. Add `LICENSE` + third-party notices screen (Expo/RN deps, fonts, any dictionary sources — check each source's licence before shipping).
- **Name/brand:** "Bridges" — search Play Store + trademark for conflicts; have a backup name.
- **Monetisation:** launch free; add IAP later (RevenueCat) after retention data. Don't build it now.
- **iOS:** yes, but after Android is live. Needs Apple Developer ($99/yr) and EAS cloud builds (no Mac needed).

### 7.2 Android checklist
- Google Play developer account (**$25 one-time**). New personal accounts have a **closed-testing requirement** (roughly: a minimum number of testers opted in for 14 days) before production access — verify the current rule in Play Console and start it immediately, it is the long pole.
- `app.json`: package id, versionCode strategy (`autoIncrement`), adaptive icon, splash, permissions minimal (no CAMERA/LOCATION).
- Target SDK: whatever Play currently requires (verify; it ratchets yearly). `expo-doctor` + `eas build --profile production --platform android`.
- Play App Signing on; keep the upload keystore backed up outside the machine.
- **Privacy policy** URL (host on Cloudflare Pages/Worker). Data Safety form: analytics + crash data, no account required, no sale.
- Content rating questionnaire (Everyone). Ads: none.
- Store listing: 8 phone screenshots (from walkthrough, framed), feature graphic 1024×500, short + full description, promo video optional.
- Notifications: daily reminder via `expo-notifications`, opt-in during onboarding, scheduled locally.
- **Release train:** internal → closed testing (his phone + ~12 testers: friends, r/russian volunteers) → production. Fix top crashes from Sentry between each.
- **Gate 7:** production build approved on Play.

### 7.3 Post-launch (not in scope now, record only)
- Cloud sync (Worker + D1), FSRS parameter optimisation from real logs, iOS, IAP, more chapters, speaking exercises (speech-to-text).

---

## Spend summary for him 💰
| Item | Cost | When |
|---|---|---|
| GitHub private repo | $0 | Phase 0 |
| Native-speaker review (+10% second reviewer) | $750–1,550 | Phase 3 |
| TTS generation month (ElevenLabs Creator/Pro + Google) | $25–100 | Phase 4 |
| Cloudflare R2 (if CDN needed) | ~$0–5/mo | Phase 4 |
| Sentry, PostHog | $0 (free tiers) | Phase 6 |
| Google Play account | $25 | Phase 7 |
| Apple Developer (later) | $99/yr | Post-launch |
| EAS Build (free tier likely enough; paid ~$19/mo if queue is slow) | $0–19/mo | Phases 4–7 |
| **Total to Android launch** | **~$800–1,700** | |

---

## Open items carried from the summary
- Cloudflare Worker deploy blocked on his token → needed for privacy-policy hosting and CDN; ask him for the token in Phase 4.
- EAS build not run since native modules changed → run at Gate 0 to catch breakage early.
- 156 unread photographs → his task; not blocking.
- Struggling learner 114/168 → re-measure at Gate 2.

## Definition of done (whole project)
- Every gate passed and committed to `master`, pushed to remote.
- All authored Russian native-reviewed; all audio generated, normalised, QA'd.
- FSRS-6 scheduling with logs, interleaved queue, Anki-parity controls.
- Walkthrough covers 100% of screens; screenshots approved.
- Live on Google Play production.
