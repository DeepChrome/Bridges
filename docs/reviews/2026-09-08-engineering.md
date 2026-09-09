# Bridges — engineering review, 2026-09-08

Scope: `native/` (the product), `core/`, `backend/`, the suites. Read-only; nothing in the repo was edited. Measurements were run with node against `native/assets/data.json` (built 2026-09-07 10:33) and `site/audio`.

## Verdict

1. Every suite is green (116 jest, 230 core, 36 Worker, 159 smoke), but the suites do not cover the two things most likely to lose a learner's month: a save that cannot be read back is silently replaced with a fresh profile at the next boot, and the only place FSRS history lives is one AsyncStorage row that an Anki import can push past Android's per-row limit.
2. The daily session has three real stall paths on a phone: a recording that fails to load is silence (no device-voice fallback, unlike the web app), a queued autoplay fires after the learner has left the flow, and a recogniser that never reports "end" leaves Say stuck on "Listening…".
3. Grading keys on `IX[fold(word)][0]`: 14.6 % of the speech-pool tokens can credit a different lemma than the one said («нет» grades «житься», «том» grades «том» the noun). The §23 trap is documented and still open in the grading path.
4. Startup does about 140 ms of avoidable work (node timing; Hermes is slower) and holds ~30 MB of rebuilt tables because every studied lemma is hydrated at import, which forces the 4.45 MB deep dictionary to be parsed before the first screen. 159 KB on the lemma rows would remove that dependency.
5. Maintenance drag is moderate and concrete: four copies of the bottom-sheet chrome, three chip-row components, the section-label style retyped 24 times, three trouble rules, unused imports/exports, and six stale comments that describe behaviour that no longer exists (including the claim that a boot failure shows a banner — nothing renders `error`).

## Suite results

| Suite | Command | Result |
|---|---|---|
| Native | `cd native; npx jest` | 19 suites, **116 passed**, 0 failed, 7.6 s. One warning verbatim: *"A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown."* `--detectOpenHandles` printed nothing further. |
| Core | `node tools/core.test.mjs` | **230 checks · all passed** |
| Worker | `cd backend; npm test` | **36 pass, 0 fail**, 117 ms |
| Smoke | `node tools/smoke.js` | **159 checks · all passed** — run against the existing `site/index.html` (10:33), which is newer than every file in `tools/app/` (latest 02:13) but 3 minutes older than `tools/build_site.py` (10:36). Not rebuilt, per the freshness rule and the no-edit rule; the 3-minute gap is noted honestly. |

CLAUDE.md §1 still says "108 native jest checks" and "34 Worker checks"; the numbers are now 116 and 36.

## Measurements

Payload (`native/assets/data.json`, 16,223,622 bytes; `JSON.parse` 45 ms in node):

| Section | MB | Share | Note |
|---|---|---|---|
| deep | 4.45 | 29.9 % | TSV, 45,987 entries, parsed at boot (see F13) |
| sent | 3.21 | 21.6 % | 23,930 rows |
| videos | 2.88 | 19.4 % | 321 videos, 6,323 word lists, 17,446 moments, 1.94 MB of which is caption text (`s`) |
| shapes | 1.50 | 10.1 % | |
| index | 1.03 | 6.9 % | 40,558 keys |
| audio | 0.95 | 6.4 % | 13,183 utterance → file |
| lemmas | 0.50 | 3.3 % | 4,006 |
| speech | 0.18 | 1.2 % | 1,912 rows |

Import-time work that `data.js:123` (`L.forEach(hydrate)`) forces, measured in node with `--expose-gc`: `parseDeep` 32 ms, deep index 6 ms, hydrate 4,006 lemmas 58 ms and **+30.4 MB heap** (5,023 tables, 26,088 rows, 14,674 example objects). A cold search costs 35 ms. Carrying each studied lemma's own stem/shape/stress/refs on its row would add **159 KB** and remove the boot-time dependency on `deep` entirely.

Assets in the APK: data.json 15.5 MB, 117 JPEGs 2.49 MB (`native/assets/img`, not ~700), 11 WAV cues 0.78 MB, 6 PNGs.

Learner state: `st.seen` for all 4,006 words ≈ 353 KB. `st.decks` with the owner's 20,004-card deck imported ≈ **2.4 MB** (128 B/card, measured on real ru/en pairs).

Offline cache: no unit pair exceeds `CAP_BYTES` (15 MB); the largest is core7 + emotion at 8.1 MB. The cap is fine.

Lemma ambiguity: 1,441 of 40,558 index keys map to more than one lemma. Among the 9,294 curriculum-word tokens in the speech pools, **1,356 (14.6 %)** have owners with *different* bare strings, so `hit[0]` can schedule a different word than the sentence teaches. Top offenders: это→этот/это (176), том→том/тот (143), меня→я/меня (85), все→весь/всё/все (51), его→он/оно/его (44), **нет→житься/нет (42)**, есть→быть/есть (33). Seventy lemma rows share a bare string with another row (я pronoun / я other); none of those pairs are both taught, and since state keys on `b` they collide harmlessly.

## Findings (ranked: learner impact, then maintenance cost)

### F1. An unreadable save is overwritten with a fresh profile at the next boot — Critical
- **What:** `loadState` returns `{...DEFAULTS}` on any read/parse failure (`native/src/store.js:71-78`, `catch (e) { return { ...DEFAULTS }; }`), and the boot path immediately writes that back (`native/src/session.js:33-36`: `const loaded = touchStreak(await loadState(acc.active)); … saveState(acc.active, loaded)`). The corrupt-but-recoverable row is replaced by defaults 250 ms later. `session.error` exists for exactly this case but `loadState` never throws, so it is never set — and nothing renders it anyway (F7).
- **Evidence for the trigger:** all learner state is one AsyncStorage row per profile. `st.decks` stores every imported card inline (`Study.js:98-100`), so the owner's 20,004-card deck alone is ~2.4 MB in the row. Android's AsyncStorage reads rows through a SQLite cursor with a 2 MB window ("Row too big to fit into CursorWindow" — the well-known failure of this library for large values); the database itself defaults to 6 MB (`node_modules/@react-native-async-storage/async-storage/android/config.gradle:85`). The write succeeds; the next read fails; F1 fires.
- **Failure scenario:** import a large deck → study for a week → relaunch → gate shows the profile, the path shows a fresh learner, streak 0, every FSRS card gone. Rule 20.4's promise ("never silently destroy learning history") is broken in one step.
- **Fix:** (a) in `loadState`, distinguish "no row" from "row unreadable": on failure copy the raw value to `rb.state.<id>.bad-<ts>`, return `{ ...DEFAULTS, __unreadable: true }` and have the provider set `error` and *not* call `saveState` until the learner has chosen; (b) store decks under their own keys (`rb.deck.<id>`) and keep only `{id, name, n}` in state; (c) cap or chunk `seen`/`speech` if either ever approaches 1 MB. Add a test that seeds an unparsable row and asserts no write happens.
- **Effort:** half a day including the deck-key migration (v7).

### F2. Speech grading credits the wrong lemma for 14.6 % of pool tokens — High (data integrity)
- **What:** `gradeAlignment` (`core/speech.js:70-74`), Scene's row lemmas (`core/questions.js:208`, via `sentenceLemmas` `hit[0]`), Talk's `gradeTurn` (`Talk.js:54-57`) and `Hear`/`Say` all resolve a said word with `IX[fold(x)][0]`. §23 names this trap for the video index and says the apps have "the same shape and the same trap". Measured above: «нет» still grades «житься» (the STUBS change removed it from the spine, not from the index order); «том» grades the noun when the sentence says «в том»; «есть» grades «быть».
- **Failure scenario:** a learner who says «Нет, спасибо» perfectly earns an Easy on «житься», a verb they have never seen, which then appears in their drill pool (`drillPool` reads `st.seen`) and in "words seen".
- **Fix:** resolve the owner the way `drillPool.exact` already does — prefer the hit whose `b` equals the folded form, then the hit that is in the question's own `lemmas`/unit, then (for closed-class forms) the pronoun/other row; put that in one `core` function (`ownerOf(form, IX, L, prefer)`) and use it in `sentenceLemmas`, `gradeAlignment`, `gradeTurn`, `words.js lookup` and `heardIn`. Better still, have `build_site.py` order each `IX` list by the same rule so `[0]` is right by construction and add a core check that `IX["нет"][0]` is «нет».
- **Effort:** one day; the build-side ordering is the durable half.

### F3. A recording that fails to load is silence; the web app falls back to the device voice, native does not — High
- **What:** `audio.js:169-184` only falls back to `speakTTS` when `createAudioPlayer` throws synchronously. A 404, a dropped connection or a truncated cached file arrives as `playbackStatusUpdate {error}`, which calls `end()` and nothing else. The header comment ("A failed load falls back rather than leaving the learner in silence") describes the web behaviour (`tools/app/app.js:132`, `a.addEventListener("error", () => speakTTS(text))`), not this file. `Speaker` still draws the brand ring and label "Hear it" because `hasRealAudio` only checks the manifest.
- **Failure scenario:** on the train with no signal and "Audio for offline" off: every Hear step autoplays nothing, the learner types blind and is graded Again on every word; every speaker press is dead with no message. Also: `cachedUri` (`cache.js:50-54`) trusts any file present, so a download cut mid-way is "cached" and fails the same way forever.
- **Fix:** in the status listener, on `error` before `didJustFinish`, delete a cached copy if that is what was played and call `speakTTS(text, …)`; if that also cannot (no Russian voice), surface a short "No audio right now" note through the existing `note`/verdict mechanism rather than silence. Validate a downloaded file's size against the server's `Content-Length` before adding it to `have`. Test: `speaker.test.js` with a mock player that emits `{error:true}` asserting `__spoke` grows.
- **Effort:** two hours.

### F4. A queued autoplay fires after the learner has left the runner — High
- **What:** `Run.js:296-301`: `whenIdle().then(() => { if (atRef.current === mine) say(q.autoplay …) })`. Leaving the flow calls `stopAudio()` (`useAudioStopOnLeave`), and `stop()` settles `current` (`audio.js:187-191`), which is precisely what releases the queued `.then`. `atRef.current === mine` is still true on an unmounted component, so the next Hear/listen sentence plays over whatever screen the learner navigated to.
- **Failure scenario:** answer a listen question, press Home while the answer is being read, and the next question's sentence starts on the path screen.
- **Fix:** an `alive` ref set false in the runner's cleanup and checked in the `.then`; or make `whenIdle()` reject when stopped. Add to `runner.test.js` with `__audioHold`: unmount during a hold, finish, assert `__played` did not grow.
- **Effort:** thirty minutes.

### F5. The recogniser can stick in "listening" with no way out — High
- **What:** `speech.js:97-104`: release calls `M.stop()` and then waits for `result`/`end`/`error`. If none arrives (Android's recogniser does this under memory pressure and when the mic is taken by a call), `phase` stays `listening`, the label reads "Listening…", `hold()` refuses (`phaseRef.current !== "idle"`), and Say's `enabled` gate and Talk's `pending` gate never open. No timeout exists on this path (the only timeouts in the tree are the Worker calls).
- **Fix:** a watchdog armed on release (8 s, above the measured p95 of 4.4 s): on expiry, `M.abort()`, go idle, `setNote("Nothing heard")`. Test in `say.test.js`: release, advance timers, assert the hold button is live again.
- **Effort:** one hour.

### F6. Talk and Say hide the reasons that will not fix themselves — Medium
- **What:** `Talk.js:334-339` maps every reason except `cap` and `offline` to "The tutor could not answer. Try again." — including `unconfigured` (no URL/token in this build, `feedback.js:49`) and `http 401` (revoked token). The picker (`Talk.js:389-392`) offers every scenario regardless, and `DrillList` shows Talk as open. Say's `askFeedback` (`Say.js:154`) shows nothing on any failure, which is by design — but with `unconfigured` it still spins first.
- **Failure scenario:** an EAS build made without the preview environment variables (the `.easignore` note explains how easily that happens): every conversation opens on a spinner, then "Try again", forever.
- **Fix:** export `configured()` from `feedback.js`; the picker says "Talk needs the tutor service, which this build does not have" and disables rows; map 401/403 to "This build's tutor key was refused" and 5xx/timeout to "The tutor is not answering right now"; never spin for `unconfigured`.
- **Effort:** one hour.

### F7. Boot failures are invisible; the comment says otherwise — Medium
- **What:** `session.js:39-45` says a caught boot error is "recorded and rendered … the banner says the save could not be read". `App.js` destructures `{ ready, account, st }` only; `error` is never read anywhere (grep `error` in `App.js`: no matches). With F1, no error is ever set either.
- **Fix:** render `error` in `Shell` as a plain line above the gate with "Keep going" (defaults, no overwrite until the next real change) and "Try again". Then the comment is true.
- **Effort:** one hour, with F1.

### F8. The quiz result screen contradicts the pass rule it just applied — Medium
- **What:** `Flows.js:158-161` computes `passed = result.score >= PASS_MARK` and titles the screen "Not quite. 80% to pass" in the fail tone, while `markComponent` has already recorded `tries` and `quizPassed` (`core/state.js:28-31`) accepts 70 % from the third attempt. Same on `CustomQuizFlow:419` for a different reason (no relief there is right; the mismatch is only in `QuizFlow`).
- **Failure scenario:** third attempt, 74 %: the Done card says failed; Back shows the lesson ticked done. The learner retakes a lesson that is finished, or distrusts the tick.
- **Fix:** derive `passed` from `quizPassed(next.unit[unit.id].lessons[index])` after the update, and let the title say "Passed on the third try" when relief applied. Test in a new `flows.test.js`.
- **Effort:** thirty minutes.

### F9. "Reset progress" is partial — Medium
- **What:** `You.js:173-176` clears `seen, trouble, pinned, unit, drills, xp, streak, day` and leaves `speech` (attempts and `tagCounts` — the Grammar section keeps showing old slips), `watched`, `decks`, `sets` (which may still name `__trouble__`), `recent`, `talkLevel`. The copy says "Erase all progress for this profile?"
- **Fix:** `{ ...DEFAULTS, dev: p.dev, theme, speed, cue, osk, offline, talkEn, talkSpeed }` — settings survive, everything else goes; say which in the dialog. Test: reset, assert `speech.attempts` empty and `watched` empty.
- **Effort:** twenty minutes.

### F10. Placement result is written into a live object and never saved — Medium-low
- **What:** `Flows.js:477` `if (account) account.placed = placed;` mutates the account object from context; nothing calls `saveAccounts` outside `session.js`. `Misc.js:405` and `You.js:218` read `placed` for "Placed at stage N" — after a relaunch it is `null` again.
- **Fix:** add `updateAccount(patch)` to the session (sets state and `saveAccounts`), use it here. Test in `gate.test.js`.
- **Effort:** thirty minutes.

### F11. Exporting the "Trouble words" set drops the trouble words — Medium-low
- **What:** `cardsOfSets` (`Study.js:77-79`) calls `buildQueue({ ...st, sets: ids, seen: {} })` so every card counts as due; but `troubleWords(st)` inside it iterates `st.seen`, now empty, so `__trouble__` yields only `pinned`. "Export selected as an Anki deck" with Trouble ticked exports the pins and none of the leeches.
- **Fix:** collect the pool without the due filter (a `pool` helper shared by `buildQueue` and `cardsOfSets`) instead of blanking `seen`. Test in `anki.test.js`: a state with one leech and one pin, export, expect both.
- **Effort:** twenty minutes.

### F12. The dark theme cannot render on the phone — Medium (visual contract)
- **What:** `native/app.json:8` `"userInterfaceStyle": "light"` locks the app to light, so `useColorScheme()` returns `"light"` on the device and `theme.js:50-52` never picks `dark`. `App.js`, `theme.js`, `contrast.js` (99 checks) and the doctrine all maintain a dark palette that no build shows. Either intent is defensible; the config and the code disagree.
- **Fix:** `"userInterfaceStyle": "automatic"` (and the Android `expo-system-ui` background) if dark is wanted — then look at every screen in dark on the emulator — or delete `dark` from native and the parity half of `contrast.js` if not.
- **Effort:** one line, plus a walkthrough in dark.

### F13. Startup parses the whole deep dictionary to hydrate 4,006 words — Medium (performance)
- **What:** `data.js:115-123`: `hydrate` needs each studied lemma's paradigm record, which lives only in `deep` (`core/entry.js:39`, `deepIndex().get(fold(entry.b))`), so `L.forEach(hydrate)` at import forces `parseDeep` of 4.45 MB and builds 5,023 tables eagerly (+30 MB heap in node; RN's Hermes will be slower and tighter). The 16 MB JSON is also inlined into the JS bundle, so the whole payload — captions included — is materialised before the splash ends.
- **Cheapest cut, in order:** (1) `build_site.py` writes stem/shape/stress/refs on the studied lemma rows (+159 KB) so hydration never touches `deep`; (2) make `t` and `x` lazy getters (`Object.defineProperty` with a memo) so call sites keep reading `w.t`/`w.x` and tables are built for words actually opened; (3) split `deep`, `videos` and `sent` (70 % of the bytes) into separate JSON modules required on first use by Search/Immerse/entries. The 1.94 MB of caption text under `videos` is the `--public` flag's concern anyway.
- **Effort:** (1) and (2) a day; (3) another.

### F14. FSRS history has no way off the phone — Medium
- **What:** native has no profile export or import (grep for `Clipboard`, `Share.share` outside `SttLab.js`, `exportProfile`: none). CLAUDE.md §30b and `core/state.js` describe moving a profile between apps by the settings sheet; that sheet exists only on the web (`tools/app/app.js:1461`). Combined with F1, a lost phone or an unreadable row is the end of the learner's record. Decks can be exported; the schedule cannot.
- **Fix:** "Back up profile" and "Restore" in Settings — `JSON.stringify(st)` to the share sheet via `expo-sharing`, import through the document picker and `normalise`. The migrations already exist for exactly this.
- **Effort:** half a day, with a round-trip test (export → import → deep-equal after `normalise`).

### F15. Failed writes are swallowed and the app never flushes on background — Medium-low
- **What:** `store.js:90-92` and `:102-104` `catch (e) {}` — a write that fails (disk full, F1's oversized row) is silent; the in-memory state diverges from disk until the process dies. `saveState` runs inside the `setSt` updater (`session.js:60-64`), a side effect React may invoke lazily or twice. There is no `AppState` listener, so a backgrounded app relies on the 250 ms timer having fired before Android reclaims it.
- **Fix:** move the save into a `useEffect` on `st` (pure updater), flush on `AppState` change to `background`, and surface a persistent write failure through `error` (F7).
- **Effort:** one hour.

### F16. Store-facing metadata is stale or over-broad — Medium-low (ship)
- `app.json:12` iOS microphone text: "unless you turn on cloud recognition in Settings" — no such setting exists (grep `cloud`: only this line). App Review compares the string to behaviour. `NSSpeechRecognitionUsageDescription` is the template boilerplate.
- `app.json:18-24`: `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` are declared while `audio.js:20` sets `shouldPlayInBackground: false` and nothing starts a service; Play Console requires a declaration form for the media-playback FGS type and will ask why. `RECORD_AUDIO` is listed twice.
- **Fix:** rewrite both iOS strings to what the app does; drop the two FGS permissions unless background playback is planned; one `RECORD_AUDIO`.
- **Effort:** fifteen minutes.

### F17. The owner's Worker token is baked into every APK — Medium-low (ship)
- **What:** `EXPO_PUBLIC_APP_TOKEN` is inlined by Expo into the JS bundle (`feedback.js:22-25`); `backend/src/index.js:50` treats it as `{ id: "owner" }`. Anyone with the APK can extract it and spend the owner's caps (300 feedback, 240 talk turns a day). P8.4's per-user tokens exist (`backend/tools/user.mjs`); nothing forces a build to use one.
- **Fix:** build shared APKs with a minted user token in the EAS environment, keep the owner token for the owner's own device; a Worker-side rotate.
- **Effort:** process, not code.

### F18. Four bottom sheets, three chip rows, two ticks, one style retyped 24 times — Maintenance
- Sheet chrome (backdrop, grabber, `maxHeight`, radius, Done button): `words.js:114-183`, `Run.js:158-217`, `Study.js:129-241`, `You.js:69-186`.
- Chip row: `Talk.js:282-300 Choice`, `You.js:40-58 Choice`, `Flows.js:354-362 Chip` — same props, same colours.
- `Tick`: `Study.js:245-255` and `Unit.js:14-29`.
- Section label (`fontSize 11, letterSpacing 1, uppercase`): 24 occurrences across 10 files; `ui.js:314-317 styles.sectionLabel` exists and is used once (`Learn.js:275`).
- `Flows.js:281-286` is an inline copy of `bestOf` defined eight lines later (`:294-299`).
- **Fix:** `Sheet`, `Choice`, `Tick`, `SectionLabel` in `ui.js`; `DrillFlow` uses `bestOf`. Behaviour-preserving; jest is the proof.
- **Effort:** half a day.

### F19. Three trouble rules — Maintenance
- `core/fsrs.js:111-119 applyGrade` (runners, Talk, Hear, Say, Scene), `Study.js:282-295 grade` (flashcards: increments only on Again, clears only above Hard), and the web flashcards. `core.test.mjs` records the divergence rather than resolving it. A word can be trouble on the path and not on the cards.
- **Fix:** Study calls `applyGrade` and adds its XP on top. Then delete the note in the core test.
- **Effort:** thirty minutes.

### F20. Constants the web app must mirror by hand — Maintenance
- `tools/app/app.js:258 LESSON_RAMP = [5, 6]` duplicates `core/questions.js:50`; a profile moved between apps keys on lesson indices, so drift corrupts progress. `core/search.js:34 POS_LETTER` mirrors `build_site.py:29` (fine, two languages) but is unused in JS.
- **Fix:** inline `core/questions.js` into the web bundle or lift `LESSON_RAMP` into `core/state.js` (already inlined). A core check that both agree would do until then.

### F21. Comments describing behaviour that no longer exists — Maintenance
- `session.js:39-45` the banner (F7). `audio.js:155-157` the fallback (F3). `Search.js:7-9` "the rest of the lexicon is headword and meaning only, and says so" — contradicted by §30 and by the screen, which marks nothing. `data.js:51` "The unit's own episode first" — the sort is by count only (`:52-54`). `screens.test.js:18-20` "Not covered here: … Study, Search, Immerse and You" — Study (`anki.test.js`, `settings.test.js`), Search (`search.test.js`), You (`you.test.js`), VocabFlow (`photos.test.js`) are covered now. CLAUDE.md §1 counts (108 → 116, 34 → 36).

### F22. Test infrastructure debt — Maintenance
- The jest worker leak: a real timer survives teardown. Candidates by inspection: `Learn.js:186` `Animated.timing` 650 ms (rendered by `path.test.js`), `Run.js:123` 400 ms, `Run.js:328` 420 ms (cleared on unmount), `store.js:86` (flushed in `afterEach`). Unproven; `--detectOpenHandles` printed nothing.
- `screens.test.js:5-9`: "past roughly the sixth test in a file every matcher begins timing out" — the suite is 19 files partly because of a cause that was never isolated. It caps how much any one flow can be tested. Worth an afternoon with `jest --runInBand --testTimeout` and RNTL's `asyncUtilTimeout`.

## Deletion candidates

Each verified with a repo-wide grep over `native/src`, `native/App.js`, `native/__tests__`, `core`, `tools`, `backend/src`; "0 refs" means no use outside the defining file.

| Item | Location | Proof |
|---|---|---|
| `Ru` component | `native/src/ui.js:248-251` | `grep -w Ru native/{src,App.js,__tests__}` → 0 refs |
| `WordLink` | `native/src/words.js:84-101` | `grep WordLink native` → 0 refs |
| `RU_FONT = undefined` | `native/src/theme.js:45` | `grep RU_FONT native` → 0 refs; a placeholder for a font that was never bundled |
| `scenarioById` | `core/scenarios.js:29` | `grep scenarioById` (core, native, tools, backend) → 0 refs |
| `POS_LETTER` | `core/search.js:34-35` | only the Python copy in `build_site.py:29` is used |
| `import * as Speech` | `native/src/questions.js:3` | `Speech` never referenced in the file |
| `useMemo`, `TextInput`, `List`, `Row` imports | `native/src/screens/Run.js:9-13` | grep in file: only the import lines match |
| `SttLab` route and `sttset.js` in production builds | `App.js:31,305`, `native/src/screens/SttLab.js`, `native/src/sttset.js` (14.5 KB) | dev-only by the settings gate; ship behind `__DEV__` or drop after the P3 gate, which is decided |
| Needless `export` keywords (internal-only) | `Say.js ATTEMPTS`, `cache.js CAP_BYTES`, `data.js spineLessonsDone`, `feedback.js TIMEOUT_MS/TALK_TIMEOUT_MS`, `Flows.js LISTENING_N`, `Misc.js thumbUrl`, `Study.js newDeckId`, `store.js normalise`, `ui.js senseGroups`, `words.js useWords`, `core/anki.js cleanField/splitFields`, `core/questions.js SCENE_ROWS/SCENE_SKIP_TOP/PRACTICE_N`, `core/util.js ACC` | unused-export scan (scratchpad `unused.mjs`); `Talk.js conversationWords/TALK_LEVELS/talkLevelFor` are exported and untested — keep the export, add the test |

## Missing tests

1. **A lesson end to end in the native runner** — `VocabFlow` → `QuizFlow` on a real unit, through `SessionProvider`; assert `st.unit[id].lessons[0]` has `v`, `q`, `tries`, that `lessonDone` flips, that `nextLesson` advances, and that the Done title agrees with `quizPassed` (F8). Nothing today drives `QuizFlow`, `DrillFlow`, `PlacementFlow` or `SectionFlow` (grep: only `VocabFlow` in `photos.test.js`).
2. **State survives a bad row** — seed `rb.state.p1` with `"{not json"` and a 3 MB string; assert the provider sets `error` and performs no write (F1, F7).
3. **Migration from fixtures** — a v1 save (Leitner counters), v3 (numeric lesson scores), v4 (no `speech`) run through `normalise` and asserted field by field; `core.test.mjs:188-222` covers single steps but no whole-profile fixture and nothing on the native `normalise`.
4. **Profile round trip** — once F14 exists: export → import → `normalise` deep-equals, including `speech.talk`, `decks`, `watched`.
5. **Anki round trip** — `apkgBytes` output fed back through `importDeck` with a real in-memory SQLite (`expo-sqlite` is mocked to `jest.fn()`; use `sql.js` or `better-sqlite3` as a dev dependency for this one test) asserting the cards come back; today export asserts SQL strings.
6. **Audio failure paths** — stream error → device voice (F3); cached file error → cache entry removed and stream retried; autoplay never fires after unmount (F4); `Speaker` shows the silent state when offline with no voice.
7. **Recogniser watchdog** — release with no `end` → idle within the timeout (F5).
8. **Talk unconfigured / 401** — picker disabled with the reason; no spinner (F6).
9. **Grading owner** — `gradeAlignment` on «Нет, спасибо» grades «нет», not «житься»; `sentenceLemmas("в том доме")` does not return «том» the noun (F2). Pin `IX` ordering in `core.test.mjs`.
10. **Reset progress** clears `speech`, `watched`, `sets` (F9); **placement** `placed` persists across a reload (F10); **export of Trouble words** includes leeches (F11).
11. **Store coalescing** — three `update()` calls in one tick produce one write with the last state; `flushState` on `AppState` background (F15).
12. **Study grading persistence** — grade Again/Good on a card, `saved()` shows the FSRS card and `xp`; Again re-queues (no test renders the grade buttons; `settings.test.js:112` and `anki.test.js:174` only render the picker).
13. **Offline audio in play** — `say()` prefers `cachedUri` when the file is present (`cache.test.js:66` checks the URI, not playback), and a failed download never blocks the unit screen.
14. **Dark theme render** — with `userInterfaceStyle: automatic`, at least the path and the runner in dark (`useColorScheme` mocked), so `contrast.js`'s numbers describe something that renders (F12).

## Build and ship notes (beyond F12, F16, F17)

- `.easignore` is correct and well-explained; `native/.env` is gitignored (`.gitignore:24`) and excluded from uploads (`.env`, `.env.*`). No secret is tracked (`git ls-files native/.env` → nothing).
- `slug: "native"` is deliberate (ROADMAP A17). `version 1.0.0` with `appVersionSource: remote` and `autoIncrement` on production is fine.
- APK size is driven by the 15.5 MB JSON in the bundle (F13's third step also halves the download), then 2.5 MB of photographs. The 11 WAV cues (0.78 MB) could be OGG at a tenth of that.
- `backend/wrangler.toml` holds the KV namespace id and the model name; secrets are on the Worker. `TALK_DAILY_CAP` 240 is the backstop the doctrine describes.
