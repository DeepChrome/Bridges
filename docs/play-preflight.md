# Play pre-flight — audited 2026-09-17

What stands between the app as it is today and a Play submission. Audited
against the built artifacts rather than against the playbook's checklist, so
where the two disagree the measurement is what is written down.

Three of these are **blockers with no code fix** — they need a decision or an
account only the owner can open. They are first, because the rest is ready.

---

## 1. The shipped build carries the owner's Worker token — BLOCKER

`EXPO_PUBLIC_APP_TOKEN` is compiled into the APK in plaintext. Today that is
fine, because the only install is his. A public listing means **anyone who
downloads the app can spend his Anthropic budget** through the feedback and
Talk routes, and the Worker's per-day cap is the only thing between them and
the bill.

`docs/store-listing.md` already flagged this and proposed per-install tokens.
That cannot be done by baking a different token into one binary, so it needs a
real choice. Three, in increasing order of work:

1. **Ship without the AI features.** `feedback.js` already answers
   `{ ok: false, reason: "unconfigured" }` with no URL or token, and every call
   site already handles it (§30d). Say keeps its local alignment and its native
   recording; the chapter task and Talk disappear. **Nothing needs writing** —
   it is an EAS environment with the two variables absent — and everything else
   in the app is untouched.
2. **The Worker issues a token on first run.** An unauthenticated `/v1/hello`
   that mints a KV record and returns it, rate-limited by IP. Modest work in
   `backend/`, and it makes the per-user caps in §30h′ actually reachable. It
   is still abusable by anyone who scripts the endpoint, so it needs a global
   ceiling as well as a per-user one.
3. **Play Integrity or a paid tier.** Out of proportion to the app.

**Recommendation: (1) for the first public release, (2) afterwards if the
conversation tutor turns out to be what people come back for.** It is
reversible either way and costs nothing to try.

## 2. Google Play developer account — BLOCKER, $25, his to open

New personal accounts also carry a **closed-testing requirement** before
production access: a minimum number of testers opted in for a continuous
period. Verify the current rule in Play Console — it has changed twice — and
**start it on day one**, because it is the long pole and everything else here
can be finished while it runs.

## 3. An upload key that is not the debug key — BLOCKER, 5 minutes, his to hold

The local AAB is signed with `native/android/app/debug.keystore`. Play will not
take a debug-signed upload. He needs a real upload keystore (`keytool -genkey`,
or let EAS manage it), and it must be backed up off the machine the way
`debug.keystore` now is (BACKUP.md). **Losing the upload key locks him out of
updating his own listing** — Play can reset it, but only through a support
request.

---

## Fixed in this pass

- **Size.** A plain APK is **102 MB**, over the 100 MB limit for that format.
  The **app bundle is 106.9 MB** and delivers about **66 MB** to an arm64
  phone: the base is 86 MB of which 27 MB is the four architectures' native
  libraries, and 20.4 MB of the bundle is debug symbols that are never
  delivered. **Ship the AAB** (`gradlew bundleRelease`); ROADMAP 13.8 closed.
- **`SYSTEM_ALERT_WINDOW`** — "Display over other apps" — was in the merged
  manifest, from React Native's dev menu. It is a sensitive permission that
  users see and reviewers ask about, and release builds do not use it. Removed
  via `android.blockedPermissions` in `app.json`, verified gone from the merged
  manifest.
- **Attribution.** OpenRussian, Tatoeba and Wiktionary each require the credit
  to travel with the material (rule 20.10). The web page carried it; the native
  app, which is the product, carried none of it. Settings → Credits now does,
  built from the payload's own `meta` rows and from
  `tools/build_notices.mjs`, so neither list can drift from what shipped.
- **Privacy policy** written: `docs/privacy.md`. It needs a public URL — the
  existing Worker is the shortest path.

## Permissions, as Play will see them

| Permission | Why | Keep? |
|---|---|---|
| `RECORD_AUDIO` | Say, Talk, the pronunciation drills | yes, asked at first use |
| `MODIFY_AUDIO_SETTINGS` | audio session handling | yes |
| `INTERNET`, `ACCESS_NETWORK_STATE` | streamed recordings, the Worker | yes |
| `VIBRATE` | answer feedback (§30ab) | yes |
| `WAKE_LOCK` | playback | yes |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | expo-audio's media session | **decide** — the app has no background playback. If it can be dropped, it removes a Play policy declaration. Not attempted here because it means changing what expo-audio installs. |
| `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) | legacy file access for Anki import | **decide** — blocking them is one line, but it may break importing a deck on Android 12 and older. His own phone is unaffected. |

## Data Safety form, as it would be filled in

- Data collected: **none**.
- Data shared: **"Other user-generated content"** — the transcript of what the
  learner said, for the two speaking activities. Shared with a service
  provider, not stored, optional, user-initiated.
- Voice or sound recordings: **no**. Audio never leaves the device.
- Encryption in transit: **yes**. Deletion: nothing to delete server-side.
- Crash data: **not shared**. It is written to the device and sent only if the
  learner chooses to share it (§30ad).

Content rating: Everyone. No ads, no purchases, no user-to-user communication.

## Still to do, none of it blocking

- Eight device screenshots. The six in `docs/store/` are from the emulator and
  show its status bar; they should be retaken on his phone.
- Feature graphic, 1024×500.
- `build_site.py --public` for the shipped payload, so no YouTube caption text
  is redistributed (P8.8).
- `build_audio.py --commercial` to leave out the 31 Tatoeba recordings that are
  NC, ND or unlicensed (P8.3, §27a).
- A daily reminder notification. The playbook wants one; it is a new dependency
  (`expo-notifications`) and a new permission, and it should be weighed against
  §30t's finding that bingeing rather than boredom is how people leave.
- **Licence exposure (ROADMAP 13.11), his call.** The app ships adaptations of
  CC BY-SA data. Share-alike binds the *data*, not the app's own code, so the
  ordinary reading is that the app may be proprietary while the dictionary data
  it carries stays BY-SA and is credited — which it now is. If he wants to be
  certain, this is the one item worth a lawyer's hour rather than mine.
