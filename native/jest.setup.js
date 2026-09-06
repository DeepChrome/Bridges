/* Stubs for the native modules a test environment has no business running.
 *
 * Each one is replaced by the smallest thing that keeps the screen honest: storage
 * that really stores, audio that records what it was asked to play, a WebView that
 * renders as a plain view. Nothing here fakes app behaviour — only the platform. */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

/* Playback is asserted by what it was asked to play, not by any sound. Recorded on
   globals rather than exports: an `export` here would make this file an ES module,
   which changes how Babel hoists the jest.mock calls above it. */
jest.mock("expo-audio", () => ({
  createAudioPlayer: (src) => {
    global.__played = global.__played || [];
    global.__played.push(src && src.uri);
    return { play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
  },
  setAudioModeAsync: jest.fn(async () => {}),
}));

jest.mock("expo-speech", () => ({
  speak: (text) => {
    global.__spoke = global.__spoke || [];
    global.__spoke.push(text);
  },
  stop: jest.fn(),
}));

/* Speech recognition: the native module is replaced by one that records what it was
   asked to do and lets a test deliver a result. A test calls
   global.__stt.emit("result", { results: [{ transcript, confidence }], isFinal: true })
   to stand in for the recogniser; `calls` holds every start() options object. */
jest.mock("expo-speech-recognition", () => {
  const React = require("react");
  const listeners = {};
  const stt = {
    calls: [],
    emit: (name, payload) => (listeners[name] || []).forEach((h) => h(payload)),
    reset: () => { stt.calls.length = 0; for (const k in listeners) delete listeners[k]; },
  };
  global.__stt = stt;
  return {
    ExpoSpeechRecognitionModule: {
      start: (opts) => { stt.calls.push(opts); stt.emit("start", {}); },
      stop: jest.fn(() => stt.emit("end", {})),
      abort: jest.fn(() => stt.emit("end", {})),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
      getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
      isRecognitionAvailable: jest.fn(() => true),
      supportsOnDeviceRecognition: jest.fn(() => true),
      getSupportedLocales: jest.fn(async () => ({ locales: ["ru-RU"], installedLocales: ["ru-RU"] })),
    },
    useSpeechRecognitionEvent: (name, handler) => {
      React.useEffect(() => {
        (listeners[name] = listeners[name] || []).push(handler);
        return () => { listeners[name] = (listeners[name] || []).filter((h) => h !== handler); };
      }, [name, handler]);
    },
  };
});

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { WebView: (props) => React.createElement(View, { testID: "webview", ...props }) };
});

/* No animation mock: jest-expo already handles the driver, and the path that used
   to need stubbing no longer exists in React Native 0.86. */
