# Bridges — native app

Expo managed workflow, React Native 0.86, Android first. The data payload
(`assets/data.json`, with `deep.json`, `sent.json` and `videos.json` beside it, required on first use) is written by `python tools/build_site.py` at the repo root;
recordings stream from the deployed web site rather than shipping in the binary.

## Build and install (Android)

```
eas login                                              # once, in a browser
eas build --profile development --platform android     # dev client APK, install it
npx expo start --dev-client                            # then open the app on the phone
eas build --profile preview --platform android         # standalone APK for sideloading
npm test                                               # jest, 29 tests
```

Profiles are in `eas.json`. EAS's free tier has a monthly build cap — check
expo.dev before assuming a build is free. If it is exhausted, `npm run android`
builds locally, which needs Android Studio's SDK and a JDK on this machine.

## Emulator

```
.\tools\emulator.ps1                          boot and wait
.\tools\emulator.ps1 -Apk build.apk           boot, install, launch
.\tools\emulator.ps1 -Shot path               boot, then screenshot
```

Boots a Pixel 6 / API 34 AVD headless in about 45 seconds and leaves it running;
re-running attaches to it rather than starting a second one.

The SDK is at `C:\Android\sdk` and a JDK 17 at `C:\Android\jdk`, both **outside the
repo** so they survive a clone, and both installed from **archives rather than
installers**. That matters: an MSI wants UAC elevation, which a non-interactive shell
cannot answer, so it hangs forever instead of failing. Same trap with `sdkmanager
--licenses` — piping `y` into the batch file silently accepts nothing; redirect stdin
from a file instead.

To rebuild the environment from scratch, see the commit for P1.6.

## Screenshots

`screenshots/` holds captures from the emulator. Note what they are and are not:
they prove the app **runs and draws** on a real Android device, which nothing else
here does — `tools/visual.js` at the repo root renders the *web* build, and jest
asserts structure, not pixels. They are not yet a regression suite; the pixel-diff
comparison is ROADMAP P1.8. Until that exists, `__tests__/path.test.js` remains the
substitute: assert the visual contract in the render tree.
