# Bridges — Roadmap v1: Speaking/Listening Mode

Prepared 2026-09-05 by the owner from the read-only assessment (HEAD `9db4abd`, 13
commits, all suites green). Codified into the repo the same day by the executing agent;
the agent's amendments are in §0a and marked `[AMENDED]` inline. Everything else is the
owner's text and is not to be re-litigated.

---

## 0. Operating rules for the executing agent

Read these before every phase. They override anything else in this document.

1. **Verify, never recite.** Every number you report must come from a command run this
   session. CLAUDE.md has drifted before. If a figure disagrees with CLAUDE.md, report
   both.
2. **One task = one commit.** Commit after each task ID below with the task ID in the
   message (e.g. `P1.3: add eas.json`). Never batch phases into one commit.
3. **Suites stay green.** Run `tools/smoke.js`, `tools/visual.js`, `tools/contrast.js`,
   `tools/core.test.mjs`, and `native/` jest after any change under `core/`, `native/`,
   or `site/`. A red suite blocks the commit — fix or revert, don't skip.
4. **Do not touch the doctrine files** (CLAUDE.md rules, honesty rules about audio
   provenance). If a task seems to require changing them, STOP and report.
   `[AMENDED — see §0a A2]`
5. **Do not embed secrets in the app.** No API keys in `native/`, `site/`, `core/`, or
   any tracked file. Ever.
6. **STOP gates.** Some tasks are marked `[STOP — user]`. Finish everything up to that
   point, write the phase report (§12), and end your turn. Do not proceed past a gate
   on assumptions.
7. **Fold discipline.** Any new comparison of Russian text goes through the existing
   `fold()` (NFD → strip U+0300/U+0301 → NFC → lowercase → ё→е → trim). Do not write a
   fifth implementation. Import the existing one.
8. **Learner state keys on the Russian string,** not an index. New state slots follow
   that rule.
9. **Estimates are estimates.** Effort figures below are for scheduling, not deadlines.
   Report actuals.
10. **Prefer boring.** If two approaches work, pick the one with fewer moving parts.
    This is a one-person tool first.

## 0a. Conflicts resolved by the executing agent

Each of these is a place where the roadmap as handed over contradicted itself, the
doctrine, or the measured state of the machine. The resolution is stated; the owner
can overrule any of them.

- **A1 — Title.** The handed-over title read "Speaking/Listening Mode + Polish". The
  owner said he did not know why. Dropped. §10 is retitled "acceptance checklist".
- **A2 — Rule 4 vs. tasks P1.9, P2.8, P4.8, P5.13, P6.7.** Rule 4 forbids touching
  CLAUDE.md; five tasks require updating it, and CLAUDE.md §8.8 itself requires
  updating it when durable knowledge changes. Resolution: the doctrine's **rules** are
  immutable — §20 non-negotiables, the honesty rules on audio provenance and TTS
  labelling, §6, §7. The doctrine's **state and knowledge** sections (§1 known gaps,
  §20a, §21 layout, §27, §30–31, the traps) are updated as the tasks direct. A change
  that would alter a rule stops and reports.
- **A3 — `PHONE_PLATFORM`** was blank. Set to **android**, not as the roadmap's default
  but from evidence: CLAUDE.md §1 and §23 both name AnkiDroid as the phone's Anki,
  and the collection syncs AnkiDroid → AnkiWeb → desktop. Owner to correct if wrong;
  it changes Phases 1 and 3.
- **A4 — Machine state.** Verified 2026-09-05: `gh`, `eas`, `wrangler`, `maestro`,
  `adb` and `java` are all absent. Consequences: P0.1 needs GitHub authentication,
  which is an interactive browser flow the agent cannot complete; Phase 1 needs
  Android Studio, a JDK and the EAS CLI installed, and `eas login`, also interactive.
  These are reported as user actions at the point they block, not assumed.
- **A5 — P0.6 test location.** The task says "cover with a core test" but the runner's
  grade mapping (`gradeInto`) lives in `native/src/screens/Run.js`, and the web has
  its own `gradeWord`. Resolution: the grade mapping moves to `core/` so both
  platforms share one rule (§20a), and *that* is what `core.test.mjs` covers.
- **A6 — P2.1 location.** Sentence difficulty is computed in `build_site.py`, not
  `build_topics.py`. `build_topics.py` ranks the curriculum from `item_tokens` with no
  kind filter and must not grow sentence concerns; `build_site.py` already holds the
  studied set, the sentence pool and `keys_of`.
- **A7 — P2.4 schema parity.** Migrations are duplicated: `tools/app/app.js:47` and
  `native/src/store.js` both carry `MIGRATIONS` at version 4, and the settings sheet
  exports/imports state between them. A v5 that lands on one side only corrupts a
  profile moved across. Resolution: v5 lands on both. Extracting the migrations to
  `core/` is recorded as a follow-up, not done inside Phase 2.
- **A8 — P0.4 backup target.** `C:\Users\jared\OneDrive` exists on this machine and is
  the backup target. Whether it is actually syncing to the cloud cannot be verified
  from a shell; the report says so. Drives D:, E: and H: also exist with >1 TB free
  each; whether they are separate physical disks is UNVERIFIED.
- **A9 — P0.5.** `data/orphans/` is gitignored; archived audio must not enter history.
- **A10 — Cost figures in §9** are the owner's estimates. Per rule 1 the agent does not
  repeat a price it has not verified at the source at the time of reporting.
- **A11 — Commit trailer.** Commits carry
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` per the session's
  attribution instruction.
- **A12 — P2.6 key.** The roadmap says "keyed on `q.t`". The generators' step objects
  carry `t`, but what `present()` hands the runner carries `kind`; the registry is
  keyed on `kind`. Same intent, the field that actually exists.
- **A13 — P2.3 and Core 5000.** "Confirmed-human or Yandex" read literally drops the
  78% of recordings that are Core 5000, leaving 1,732 listening prompts instead of
  10,811. The stated reason for the exclusion is quality, and Core 5000's 64 kbps /
  48 kHz matches Yandex; whether a human or a voice recorded it is unverified, not
  known. Core 5000 stays in the listening pool; Google TTS and "other" are excluded;
  the build prints the count without Core 5000 beside the pool so the owner can pull
  it with one constant.
- **A14 — P2.4 extraction done inside Phase 2**, reversing A7's deferral: the
  roadmap's own "done when" required the v4→v5 step to be tested from
  `core.test.mjs`, which only makes sense if the step lives in `core/`. Both apps now
  run `core/state.js`; the web app dropped its private copies to avoid a collision in
  the single script scope.
- **A16 — P1.4 before P1.3.** The development build needs `expo-dev-client`, and a
  dev client is only useful with `expo start` running on this machine and the phone on
  the same network — the owner is remote. The standalone **preview** APK works offline
  and is what the Phase 3 STT gate actually needs, so it was built first and the dev
  client deferred until someone is on the LAN. Saves an EAS build too.
- **A17 — app name.** The Expo scaffold left `name`/`slug` as "native", which is what
  the phone's home screen would have shown. `name` is now "Bridges". The slug stays
  "native" because the EAS project was already linked under it and recreating the
  project to change an internal identifier is not worth it.
- **A15 — P2.1 shipping.** Difficulty and unit are computed for all 13,517 sentences
  and reported as a histogram on every build; the payload carries only the pooled
  subset (11,608 rows for both pools), since nothing consumes the rest and the native
  payload grew 1.7 MB as it is.
- **A18 — P3.5 test set, revised.** The set as specified (difficulty 0, 3–10 tokens,
  five units) was read on the phone on 2026-09-06 and measured the owner's reading,
  not the recogniser: median WER 67% on sentences such as «Институт я окончила с
  отличием», with transcripts phonetically faithful to what was said. A non-native
  beginner cannot read those, so the number said nothing about the engine. Replaced by
  thirty sentences of 2–4 words, every word in the top-300 lemmas, each with a native
  recording to hear before reading (`native/src/sttset.js` states the selection). The
  P3.6 gate is decided on this set; the first export is kept as
  `data/stt/export-2026-09-06.json` for the record.
- **A19 — the English audio was the data, not the device.** The owner reported
  English speech from the speaker button twice: first on dictionary example
  sentences (2026-09-06, preview build), then on the STT set. The first report was
  answered with a device-voice guard (correct in itself, and kept) that was not the
  cause. The cause: `fetch_tatoeba_audio.py` fetched by sentence id from an endpoint
  keyed by audio id — 84 of 190 Tatoeba recordings were other people's English
  sentences. Fixed at the source, refetched, verified by language detection
  (`data/stt/` neighbours hold no audio; the scan lives in the session scratchpad),
  rebuilt and redeployed. Recorded as a CLAUDE.md trap. The gate export
  `export-2026-09-06b.json` was read on the affected build: the three Tatoeba items
  played English, so the owner could not hear a model for them.
- **A20 — P5.4 trouble writes.** The task says feedback tags go "to `trouble` for
  the affected lemma". Not done that way: `trouble` is governed by the FSRS leech
  rule through `applyGrade` (core.test.mjs pins it), and a second path writing
  into it from model output would make the bank count things the scheduler does
  not call trouble. The tags go to `speech.tagCounts` and onto the attempt
  (`tagAttempt`), and the affected lemma already receives Again through the
  alignment grade. Revisit only if the bank proves too quiet.
- **A21 — "smoke extended" (P5.5, P5.10).** Smoke drives the web build, which does
  not carry the speech activities (web is on hold, A-series above). The equivalent
  is `native/__tests__/registry.test.js`, which now proves Hear and Say have
  views, plus `hear.test.js` and `say.test.js` through the real runner.
- **A22 — order of Phases 4 and 5.** Phase 5's local parts (Hear, Say with the
  local verdict, grammar section) were built before Phase 4 because Phase 4 stops
  at P4.3 on the owner's accounts; the Say → Worker wiring (P5.3) landed once the
  client existed. P5.12 (offline audio cache) is not started.

---

## 1. User inputs

```
PHONE_PLATFORM:          android        ← inferred (A3); owner to confirm
DEV_MACHINE:             windows        ← verified (deploy.ps1, this shell)
APPLE_DEV_ACCOUNT:       n/a while android
PHONE_DOES_RU_DICTATION: untested       ← owner: Google voice typing → languages → Russian?
VOICE_MAY_LEAVE_DEVICE:  [ yes | no ]   ← owner to set before Phase 3 decision rule
GITHUB_USERNAME:         ______         ← needed for P0.1; agent cannot authenticate
ANTHROPIC_API_KEY:       set as a Cloudflare secret in Phase 4 — never written here
```

---

## 2. Decisions already made — do not relitigate

| Decision | Value | Why |
|---|---|---|
| Budget | ~$30/mo hard cap, all-in | Owner-stated |
| LLM billing | Anthropic Console (prepaid API credits), NOT the Claude Pro subscription | Pro does not include API access; separate account required |
| LLM model | `claude-haiku-4-5-20251001` default; escalate to `claude-sonnet-5` only if the eval in P4.6 fails | Cost |
| Backend | Cloudflare Worker (free tier) as a thin proxy | Zero hosting cost, no server to maintain, holds the secret |
| Pronunciation tier for v1 | **(a) only** — "did they say the right words" | (b) stress needs a server-side aligner; (c) articulation not achievable with this stack |
| STT | On-device first. Cloud STT only if on-device fails the P3 gate AND `VOICE_MAY_LEAVE_DEVICE=yes` | Privacy, cost, offline |
| Audience | Tool for the owner first. Licensing/public-release work is Phase 8, deferred | Owner-stated |
| Web app | Stays on hold. Do not spend time on the 12.6 MB page | Assessment |
| Native visual testing | Android emulator + Maestro screenshots | Cheapest path that actually sees pixels |

---

## 3. Phase overview

| Phase | Name | Blocks | Effort | Gate |
|---|---|---|---|---|
| 0 | Backup & hygiene | everything | ~half day | — |
| 1 | Get it on a phone | 3, 5 | 2–3 days | — |
| 2 | Data & state foundations | 5 | 2–3 days | — |
| 3 | STT spike | 4, 5 | 1–2 days | **[STOP — user must speak]** |
| 4 | Backend | 5, 6 | 2–3 days | **[STOP — user sets secret]** |
| 5 | "Say it" + "Hear it" activities | 6 | 1–2 weeks | — |
| 6 | Conversation mode | — | 1–2 weeks | — |
| 7 | Stress feedback spike (optional) | — | 2–4 weeks | **[STOP — user decides]** |
| 8 | Pre-dissemination | — | 1–2 weeks | **[STOP — user decides]** |

Phases 0 → 1 → 2 can run in that order without any user input, **except** where A4
applies: P0.1 (GitHub auth) and the installs in Phase 1 are user actions. Phase 3 is
the first designed gate.

---

## Phase 0 — Backup & hygiene

Goal: the project cannot be lost, and generated files stop polluting history.

| ID | Task | Done when | Effort |
|---|---|---|---|
| P0.1 | Create **private** GitHub repo `bridges` under `GITHUB_USERNAME`. Add remote `origin`. Push `master`. `[AMENDED A4: needs owner authentication]` | `git remote -v` shows origin; GitHub shows 13+ commits | 10 min |
| P0.2 | Stop tracking generated files: `git rm --cached data/audio.json data/topics.db`. Add both to `.gitignore`. Confirm the pipeline regenerates them (`build_audio.py`, `build_topics.py`). | Both files absent from `git ls-files`; a clean rebuild recreates them byte-identical or the diff is explained | 30 min |
| P0.3 | Inventory everything gitignored that is **not** regenerable in < 1 hour (`data/transcripts.json` 42.5 MB, the Anki collection copy, OpenRussian dump, `site/audio/`). Write `BACKUP.md` listing each, its source, and how to regenerate or where a copy lives. | `BACKUP.md` committed | 1 hr |
| P0.4 | Back up the non-regenerable set from P0.3 to a second location. `[AMENDED A8: OneDrive]` Record the location in `BACKUP.md`. | Owner can name where the audio lives besides the dev machine | 30 min |
| P0.5 | Archive the 185 orphan audio files in `site/audio/` (sha1-confirmed unreferenced) to `data/orphans/` (gitignored, A9) rather than delete, since provenance is unknown. | `site/audio/` count == `payload.audio.files` count | 30 min |
| P0.6 | Widen runner grading: add a path so an activity can submit a grade 1–4 directly (not just `record(correct: bool, wordIdxs)`). Keep the boolean path working. `[AMENDED A5: mapping lives in core/]` | New test in `core.test.mjs` passes; existing 93 still pass | 2 hr |
| P0.7 | Fix native `Run.js` verdict Continue anchoring (was fixed in `Flows.js` only). | jest render test asserts anchor | 1 hr |

Phase 0 report: remote URL, backup location, suite counts.

---

## Phase 1 — Get it on a phone

Goal: a real binary on the owner's phone, and a way to *see* the native UI.

### 1A. Distribution — Android path (default)

| ID | Task | Done when | Effort |
|---|---|---|---|
| P1.1 | Install EAS CLI. Create `native/eas.json` with profiles `development` (dev client, internal), `preview` (APK, internal). | File exists, `eas build:configure` succeeds | 1 hr |
| P1.2 | Add to `app.json`: `android.package`, `android.permissions: ["RECORD_AUDIO"]`, `ios.infoPlist.NSMicrophoneUsageDescription` (harmless on Android). | `expo prebuild --platform android` runs clean | 30 min |
| P1.3 | Run `eas build --profile development --platform android`. Install the dev client APK on the phone. Confirm `expo start --dev-client` connects. | App boots on phone from dev client | 2 hr (queue time varies) |
| P1.4 | Run `eas build --profile preview --platform android`. Sideload APK. | Standalone APK runs offline: path, lessons, dictionary all work with airplane mode on | 1 hr |
| P1.5 | Document the build/install loop in `native/README.md` — 5 commands max. | README committed | 30 min |

EAS free tier has a monthly build limit — check current limits at expo.dev before
assuming unlimited. If exceeded, `expo run:android` with a local Android SDK on Windows
is the fallback (needs Android Studio).

### 1B. Distribution — iOS path (only if `PHONE_PLATFORM=ios`)

- Requires `APPLE_DEV_ACCOUNT=yes`. Without it, no build reaches an iPhone from a
  Windows machine. **STOP and report** if `ios` and `no`.
- Replace P1.3/P1.4 with `eas build --profile development --platform ios` → TestFlight
  internal testing. `eas credentials` handles signing.
- Everything else in Phase 1 is unchanged.

### 1C. Native visual verification

| ID | Task | Done when | Effort |
|---|---|---|---|
| P1.6 | Set up Android emulator (Android Studio, Pixel-class AVD, API 34). Document in `native/README.md`. | `adb devices` lists the emulator | 2 hr |
| P1.7 | Install Maestro. Write `native/flows/smoke.yaml`: launch → profile gate → path → open unit → start lesson → complete one of each activity type → back. Take a screenshot at each screen. | `maestro test native/flows/smoke.yaml` passes; screenshots in `native/screenshots/` | 1 day |
| P1.8 | Add a `native/tools/visual.js` (or shell script) that runs the Maestro flow and compares screenshots against `native/screenshots/baseline/` (pixel diff with tolerance). Commit baselines. | Script exits non-zero on a deliberate colour change | half day |
| P1.9 | Add P1.8 to the suite list in rule 3 (§0) and in CLAUDE.md's verification section. Update CLAUDE.md gap list: native visual suite now exists. `[A2 applies]` | CLAUDE.md accurate | 30 min |

Phase 1 report: APK/TestFlight status, emulator status, Maestro screenshot count, any
EAS quota consumed.

---

## Phase 2 — Data & state foundations

Goal: everything the speaking activity will need from the data layer and learner
state, built before any UI.

| ID | Task | Done when | Effort |
|---|---|---|---|
| P2.1 | **Sentence difficulty.** In `build_site.py` `[AMENDED A6]`, compute per corpus sentence: `n_tokens`, `n_studied` (tokens resolving to the 4,000 studied lemmas), `difficulty = 1 - n_studied/n_tokens`, `unit_id` of the *latest* unit that introduces any of its lemmas. Ship in payload. | 13,516 sentences carry `difficulty` and `unit_id`; histogram reported | half day |
| P2.2 | **Speaking prompt pool.** Filter: has audio + has English + `difficulty ≤ 0.2` + 3–12 tokens. Group by `unit_id`. Report count per unit. Any unit with < 15 prompts gets flagged. | Pool exists in payload as `payload.speak.byUnit` | 2 hr |
| P2.3 | **Listening prompt pool.** Same filter, `difficulty ≤ 0.35`, 4–15 tokens, audio must be from a confirmed-human or Yandex source (exclude Google TTS 32 kbps — too low quality for dictation). | `payload.listen.byUnit` | 1 hr |
| P2.4 | **Learner state v5.** Add `MIGRATIONS[5]` on both platforms `[AMENDED A7]`: `speech: { attempts: [], tagCounts: {} }`. `attempts` entries: `{ ts, key, kind: "say"\|"hear"\|"talk", transcript, target, wer, tags: [], grade, latencyMs }`. Cap `attempts` at last 200 (drop oldest). `tagCounts` is `{ TAG: n }`. No audio blobs. | v4 → v5 migration test in `core.test.mjs`; smoke test covers migration | half day |
| P2.5 | **Error tag taxonomy.** Create `core/errortags.js` exporting the fixed list: `CASE, NUMBER, GENDER_AGREE, ASPECT, TENSE, PERSON, WORD_ORDER, PREPOSITION, WRONG_WORD, MISSING_WORD, EXTRA_WORD, STRESS, UNCLEAR`. Each with a one-line English description and, where possible, a link to the existing grammar step that teaches it. | File exists; every tag has a description | 1 hr |
| P2.6 | **Activity registry.** Refactor `native/src/screens/Run.js:320-327` from a shape ternary to a registry keyed on `q.t`. Existing six types register themselves. Web `lessons.js:586` EXERCISES map already works this way — mirror it. | All 27 jest + 157 smoke still pass; adding a dummy 7th type requires touching exactly: one generator case, one registry entry, one component | 1 day |
| P2.7 | **Transcript compare utility.** `core/compare.js`: `compare(transcript, target) → { wer, alignment: [{said, expected, status: ok\|sub\|del\|ins}] }` using `fold()` on both sides and Levenshtein at word level. Pure, no platform globals. | ≥ 10 unit tests including ё/е, stress-mark stripping, punctuation | half day |
| P2.8 | Update CLAUDE.md data section with new payload keys and state version. `[A2 applies]` | Accurate | 30 min |

Phase 2 report: prompt pool sizes per unit, state version, registry diff summary.

---

## Phase 3 — STT spike **[GATE]**

Goal: know, with numbers, whether on-device Russian recognition is good enough on the
owner's voice. Nothing in Phase 5 is worth building if this fails.

| ID | Task | Done when | Effort |
|---|---|---|---|
| P3.1 | Install `expo-speech-recognition`. Rebuild dev client (P1.3). | Package in `package.json`, dev client rebuilt | 2 hr |
| P3.2 | Build a **hidden dev screen** `native/src/screens/SttLab.js` (dev-mode gated, same gate as existing dev features): shows a sentence from the P2.2 pool, records via `expo-speech-recognition` with `lang: "ru-RU"`, `requiresOnDeviceRecognition: true`, displays transcript + `compare()` result + latency. Button: next sentence. Log every attempt to `speech.attempts` with `kind: "lab"`. | Screen reachable in dev mode; 5 attempts logged in state | 1 day |
| P3.3 | Add an **export** button that dumps `speech.attempts` as JSON to the share sheet. | JSON arrives on the dev machine | 1 hr |
| P3.4 | Write `tools/stt_report.py`: reads the exported JSON, prints mean/median WER, WER by sentence length, latency p50/p95, and the 10 worst sentences. | Script runs on a sample | 2 hr |
| P3.5 | **Prepare the test set:** 30 sentences from P2.2, `difficulty = 0` (all studied vocab), lengths 3–10, spread across 5 units. Hardcode as the SttLab default list. | List committed | 30 min |
| P3.6 | **[STOP — user]** Write the Phase 3 report with exact instructions: "Open dev mode → STT Lab → read each of the 30 sentences aloud once, naturally, don't over-enunciate → tap Export → send me the JSON." | Report written, turn ended | — |

**Decision rule (agent applies after receiving the JSON):**

| Median WER | Action |
|---|---|
| ≤ 15% | Proceed to Phase 4. On-device is the STT. |
| 15–30% | Proceed, but in Phase 5 treat sub/del as `UNCLEAR` (offer retry) not `WRONG_WORD`. Also run P3.7. |
| > 30% | Run P3.7 before anything else. |

| ID | Task (conditional) | Done when | Effort |
|---|---|---|---|
| P3.7 | Try `whisper.rn` (whisper.cpp on-device) with the `small` multilingual ggml model. Add as a second engine in SttLab. Same 30 sentences. Compare WER. | Second report | 1–2 days |
| P3.8 | If both engines > 30% AND `VOICE_MAY_LEAVE_DEVICE=yes`: add a cloud STT engine (Whisper-class API) as a third option in SttLab, routed through the Phase 4 Worker. If `VOICE_MAY_LEAVE_DEVICE=no`: **STOP and report** — the speaking feature is not viable with current constraints. | Third report or stop | 1 day |

Pick the engine with the lowest median WER. Record the choice and the numbers in
CLAUDE.md.

---

## Phase 4 — Backend **[GATE at P4.3]**

Goal: a thin, secret-holding proxy that the app calls for LLM feedback. Nothing else.

| ID | Task | Done when | Effort |
|---|---|---|---|
| P4.1 | Create `backend/` (new top-level dir) with a Cloudflare Worker (`wrangler`). Single route `POST /v1/feedback`. Reads `ANTHROPIC_API_KEY` and `APP_TOKEN` from Worker secrets. Rejects requests without `Authorization: Bearer <APP_TOKEN>`. | `wrangler dev` serves 401 without token | half day |
| P4.2 | **Cost guard.** KV-backed daily counter. Hard cap: 300 requests/day (≈ 10× a heavy study day). Return 429 with a clear message past the cap. Log input/output token counts per request to KV with date key. | Test hits the cap | 2 hr |
| P4.3 | **[STOP — user]** Report: "Create an Anthropic Console account (console.anthropic.com), add $10 prepaid credits, generate a key. Run `wrangler secret put ANTHROPIC_API_KEY` and `wrangler secret put APP_TOKEN` (any long random string). Then `wrangler deploy`. Send me the Worker URL." | Turn ended | — |
| P4.4 | **Feedback prompt.** `backend/prompt.js`. System prompt states: learner is beginner/intermediate Russian, input is an STT transcript (may contain recognition errors — do not penalise homophones), target sentence, unit grammar topic, list of studied lemmas in the sentence. Output **strict JSON only**, no prose, schema below. Model: Haiku 4.5. `max_tokens: 400`. | Prompt file committed | half day |
| P4.5 | **Response schema** — enforce with a JSON-schema validator in the Worker; on failure, retry once, then return `{ ok: false, reason: "parse" }`: `{ "words": [{ "said", "expected", "lemma", "status": "ok\|sub\|del\|ins", "tags": ["CASE"] }], "grammar": [{ "tag": "CASE", "note": "≤ 20 words, English" }], "wordChoice": [{ "said", "better", "note": "≤ 20 words" }], "overall": "ok\|minor\|major", "praise": "≤ 12 words or empty" }`. Tags must be from `core/errortags.js`; the Worker rejects unknown tags. | Validator test suite (≥ 8 cases) passes | half day |
| P4.6 | **Eval.** `backend/eval/cases.json`: 30 hand-written learner errors (agent writes them: 5 each of CASE, ASPECT, GENDER_AGREE, WRONG_WORD, WORD_ORDER, plus 5 correct sentences). Each has expected `overall` and expected primary tag. Script `backend/eval/run.js` scores tag accuracy and false-positive rate on the 5 correct sentences. **Pass bar: ≥ 80% primary-tag accuracy, ≤ 1/5 false positives.** If Haiku fails, re-run with `claude-sonnet-5` and report both. | Eval report committed | 1 day |
| P4.7 | **Native client.** `native/src/lib/feedback.js`: `getFeedback({ transcript, target, unitId, lemmas }) → Promise<schema \| { ok:false, reason }>`. 8 s timeout. Offline → `{ ok:false, reason:"offline" }` immediately. Worker URL and token in `native/.env` (gitignored) via `expo-constants`; `.env.example` committed. | Jest test with mocked fetch | half day |
| P4.8 | Update CLAUDE.md: backend exists, what it does, what it never does (no audio, no state, no persistence beyond cost counters). `[A2 applies]` | Accurate | 30 min |

Phase 4 report: Worker URL (redacted token), eval scores per model, cost per request
from KV logs.

---

## Phase 5 — "Say it" and "Hear it" activities

Goal: two new activity types in the lesson engine, fully offline-capable for the (a)
tier, LLM-enhanced when online.

### 5A. "Say it" (`t: "say"`)

| ID | Task | Done when | Effort |
|---|---|---|---|
| P5.1 | Generator case in `core/questions.js`: for a lesson in unit U, pick 2 prompts from `payload.speak.byUnit[U]` weighted toward sentences containing the lesson's target words. Emit `{ t: "say", prompt_en, target_ru, audioKey, lemmas[] }`. | Generator test | half day |
| P5.2 | Component `native/src/activities/Say.js`: shows English prompt; "Hold to speak" button (expo-audio recorder + chosen STT engine); on release → transcript → `compare()` → local verdict. Show the alignment: ok words green, sub/del red, ins grey. Show target sentence *after* attempt. "Play native" button plays `audioKey`. Retry button (max 3). | Renders in jest; Maestro flow covers one attempt | 2 days |
| P5.3 | Online enhancement: after local verdict, call `getFeedback()`. While pending, show a small spinner *below* the local result — never block it. On success, render `grammar[]` and `wordChoice[]` as collapsible rows with the tag chip. On `ok:false`, show nothing extra (silent degrade). | Both paths covered in jest with mocked fetch | 1 day |
| P5.4 | Grading → FSRS. Per word in `lemmas[]`: `ok` → grade 3 (or 4 if `overall==="ok"` on first try); `sub`/`del` → grade 1; `UNCLEAR` (per P3 decision rule) → grade 2. Uses the P0.6 direct-grade path. Sentence-level tags → `speech.tagCounts` and `trouble` for the affected lemma. Attempt logged to `speech.attempts` with `kind:"say"`. | Core test: a scripted attempt produces expected FSRS writes | 1 day |
| P5.5 | Register in P2.6 registry. Add to lesson composition: 1–2 "say" per lesson from unit 3 onward (units 1–2 stay reading-only). Make the ratio a constant in one place. | Lessons show the new type; smoke test extended | half day |
| P5.6 | Microphone permission flow: request on first "say" activity, not at app launch. Denied → activity shows "Skip (mic off)" and grades nothing. | Jest covers denied path | 2 hr |

### 5B. "Hear it" (`t: "hear"`) — dictation, no backend

| ID | Task | Done when | Effort |
|---|---|---|---|
| P5.7 | Generator: 1–2 prompts from `payload.listen.byUnit[U]`. Emit `{ t: "hear", audioKey, target_ru, en }`. | Generator test | 2 hr |
| P5.8 | Component `Hear.js`: play button (auto-play once), text input (reuse the existing `type` activity's Cyrillic keyboard handling), replay (max 3), submit → `compare()` → same alignment UI as Say. Every recognised token in the revealed target is a two-press dictionary link (existing behaviour). | Renders; Maestro covers | 1 day |
| P5.9 | Grading: identical to P5.4 minus the LLM call. `kind:"hear"`. | Core test | 2 hr |
| P5.10 | Register; add 1 per lesson from unit 2 onward. | Smoke extended | 1 hr |

### 5C. Surfacing the new data

| ID | Task | Done when | Effort |
|---|---|---|---|
| P5.11 | **Trouble view addition:** a "Grammar" section under the existing trouble bank listing `tagCounts` sorted desc, each tag → its description and a link to the grammar step that teaches it (from `errortags.js`). | Renders; jest | half day |
| P5.12 | **Audio offline cache.** On unit open, if online, prefetch that unit's speak+listen audio to `FileSystem.cacheDirectory` (bounded: current unit + next unit only, ~≤ 15 MB). Playback prefers cache. Settings toggle "Download audio for offline". | Airplane-mode test: a prefetched unit's Hear activity plays | 1–2 days |
| P5.13 | Update CLAUDE.md: activity count is 8, describe both, describe grading rules, describe degrade behaviour. `[A2 applies]` | Accurate | 30 min |

Phase 5 report: activity counts, suite counts, Maestro screenshots of both activities,
one real logged attempt's JSON (transcript redacted if the owner prefers).

**Phase 5 is the proof-of-concept milestone.** After it ships, the owner uses it for
2–3 weeks before Phase 6.

---

## Phase 6 — Conversation mode (`kind: "talk"`)

Goal: free-form spoken exchange constrained to what the learner knows. This is the
"stand-out" feature. Costs more per session — budget it.

| ID | Task | Done when | Effort |
|---|---|---|---|
| P6.1 | **Full lexicon at runtime.** The 567,526 folded form keys are not shipped; free speech will hit non-studied inflections constantly. Option A: ship `forms(key, lemma_id)` as an `expo-sqlite` asset. Measure size first. If > 25 MB, Option B: ship only forms for lemmas with `freq_rank ≤ 20,000`. Option C: resolve server-side in the Worker (it can hold the full lexicon). **Agent picks A/B/C by measured size and reports the numbers.** | Runtime resolves «пью» AND an inflection of a non-curriculum verb; size reported | 2–3 days |
| P6.2 | Worker route `POST /v1/talk`. Input: conversation history (client sends full history each turn — stateless), unit, studied lemma list (top-N by FSRS stability), learner's latest transcript. Output JSON: `{ reply_ru, reply_en, feedback: <P4.5 schema for the learner's last turn>, newWords: [{ ru, lemma, en }] }`. System prompt: reply in Russian at learner's level using mostly studied vocab, ≤ 2 sentences, one question back; `newWords` lists any non-studied lemma the model chose to use (max 2 per turn). `max_tokens: 600`. | Validator + 10 eval cases | 1–2 days |
| P6.3 | Screen `Talk.js`: scenario picker (agent writes 10 scenarios tied to units: café, directions, introductions, weather, shopping…). Transcript view: learner bubbles show alignment-coloured text; tutor bubbles show Russian with tap-to-reveal English and two-press dictionary on every recognised token. Mic button. "Play" on tutor bubbles uses device TTS **labelled "device voice"** (doctrine). End-session summary: tags, new words, per-word grades. | Renders; Maestro covers a 3-turn exchange with mocked backend | 3–4 days |
| P6.4 | Grading: same rules as P5.4 per turn. `newWords` → offered as "Add to study?" → adds to `pinned`. `kind:"talk"`. | Core test | 1 day |
| P6.5 | **Session cost cap.** Max 12 turns per session, max 3 sessions/day, enforced client-side and in the Worker counter. Show remaining sessions on the picker. | Cap test | 2 hr |
| P6.6 | Entry point: a "Talk" tab or a card on the path after each chapter. Locked until unit 5 done. | Navigation test | half day |
| P6.7 | CLAUDE.md update. `[A2 applies]` | Accurate | 30 min |

Phase 6 report: lexicon option chosen with sizes, per-session token cost from KV logs,
projected monthly cost at 3 sessions/day.

---

## Phase 7 — Stress feedback spike (optional, **[STOP — user decides first]**)

Only start if the owner asks. Tier (b) requires audio to leave the device and a server
doing real signal processing.

| ID | Task | Effort |
|---|---|---|
| P7.1 | Write a one-page feasibility note: forced alignment options (Whisper word timestamps + pitch/energy via librosa, vs. a wav2vec2 CTC aligner), where it would run (a Fly.io/Railway container, not a Worker), latency, and what "stress correct" would mean given 96.3% of forms have expected stress in `paradigm.accented`. | 1 day |
| P7.2 | If approved: offline prototype in `tools/stress_lab.py` on 20 recordings the owner makes. Report accuracy against his own judgment. | 1 week |
| P7.3 | If accuracy ≥ 80%: integrate as an extra field in the Say verdict. Otherwise close the spike and record why in CLAUDE.md. | 1–2 weeks |

---

## Phase 8 — Pre-dissemination (**[STOP — user decides first]**)

Only when the proof of concept is judged good. These are the things that go from
"harmless privately" to "a problem publicly."

| ID | Task | Effort |
|---|---|---|
| P8.1 | **Audio licensing audit.** For each source in the assessment table, determine redistribution rights. Core 5000 (10,314, 78%) and Languages on Fire (170) are the problem. Options: (a) keep only Tatoeba CC-BY/CC0 + Yandex/Google TTS regenerated under their commercial ToS, all labelled synthetic; (b) license Core 5000 audio; (c) record replacements. Write the options with cost. **STOP and report.** | 1 day audit |
| P8.2 | Execute the chosen audio option. Rebuild `audio.json`. Keep provenance labels honest. | 1–2 weeks |
| P8.3 | Remove the 26 Tatoeba NC/ND/unstated recordings or gate them behind a non-commercial flag. | 2 hr |
| P8.4 | Multi-user backend: replace `APP_TOKEN` with per-user tokens; per-user cost cap; a way to revoke. Still stateless for content. | 2–3 days |
| P8.5 | Fill missing stress for the 27,795 polysyllabic forms from a Wiktionary dump (`ru.wiktionary` has stressed headwords and many paradigms). Report the residual. | 2–3 days |
| P8.6 | Onboarding: a first-run flow that explains the two-press dictionary, the "device voice" label, and mic permission. | 2 days |
| P8.7 | Store listing prep (whichever platform): screenshots from Maestro, privacy disclosure (transcripts sent to backend; audio never sent unless cloud STT chosen). | 1 day |
| P8.8 | `data/transcripts.json` (YouTube-derived, 217k timed words): confirm it is used only for the Easy Russian episode links (27 videos) and that no transcript text is redistributed. If it is, strip to timings + your own corpus tokens. | half day |

---

## 9. Cost model (owner's estimates — verify current prices at the source before quoting)

| Item | Estimate | Notes |
|---|---|---|
| Cloudflare Worker + KV | $0 | Free tier: 100k req/day |
| EAS builds | $0 | Free tier, monthly build cap — check |
| Anthropic API, Say feedback | ~1k in / 200 out per call | Haiku-class; owner estimates ≈ $3/mo at 50 calls/day |
| Anthropic API, Talk mode | ~3–5k in / 400 out per turn (history grows) | Owner estimates ≈ $9/mo at 3 sessions × 12 turns/day |
| Apple Developer (iOS only) | $99/yr | Skip on Android |
| Stress spike container (Phase 7 only) | $5–10/mo | Optional |
| **Total, Android, Phases 0–6** | **~$12/mo** | Owner's figure; inside $30 |

The Worker's KV token log is the source of truth. Report actuals in every phase report
from Phase 4 on.

---

## 10. Acceptance checklist

Run this before declaring Phase 5 or 6 done.

- [ ] Every suite green, including native visual (P1.8)
- [ ] App works fully offline for reading/typing activities; Say degrades to (a)-tier silently; Hear works offline when audio is cached
- [ ] No spinner ever blocks the local verdict
- [ ] Every Russian token on every screen is a two-press dictionary link
- [ ] Device TTS is always labelled; no synthetic audio is presented as human
- [ ] Mic permission asked at first use, denial handled
- [ ] Learner state survives a data regeneration (keys are Russian strings)
- [ ] `git remote -v` shows origin and the last commit is pushed
- [ ] CLAUDE.md numbers match the verification script's output
- [ ] Cost cap enforced in Worker AND client
- [ ] No secret in any tracked file (`git grep -i "sk-ant"` returns nothing)

---

## 11. Known unknowns the agent should not guess

- On-device Russian STT accuracy on an accented learner — **measured in Phase 3, never assumed**
- Whether the Core 5000 audio is human or TTS — treat as unverified; label accordingly
- Whether Netlify credits actually refresh on the 7th — check, don't recite
- EAS free-tier build limits and current Anthropic model pricing — check the source at the time

---

## 12. Phase report template

End every phase (and every STOP gate) with exactly this:

```
## Phase N report — <date>
Commits: <first>..<last> (<n> commits), pushed: yes/no
Suites: smoke <n> / visual <n> / contrast <n> / core <n> / jest <n> / native-visual <n> — all green? yes/no
Done: P<N>.1 … (one line each, actual effort)
Not done / deferred: … (why)
Numbers verified this phase: … (command → value)
CLAUDE.md drift found: … (or none)
Cost this phase (API/KV log): …
Blocked on user: … (or nothing — proceeding to Phase N+1)
```
