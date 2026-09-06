# Bridges — native app

Expo managed workflow, React Native 0.86, Android first. The data payload
(`assets/data.json`) is written by `python tools/build_site.py` at the repo root;
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

## Emulator and screenshots

Not set up yet — see ROADMAP.md P1.6–P1.8. Until then there is no way to see the
native UI from this machine: `tools/visual.js` at the repo root renders the *web*
build, and jest asserts structure, not pixels. `__tests__/path.test.js` shows the
substitute: assert the visual contract in the render tree.
