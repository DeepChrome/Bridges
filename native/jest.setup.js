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
/* A player finishes on the tick after play() unless a test holds it: set
   global.__audioHold = true and later call global.__audioFinish() to end every
   playback started meanwhile — that is how "the next question waits for the
   recording" is exercised. */
jest.mock("expo-audio", () => ({
  createAudioPlayer: (src) => {
    global.__played = global.__played || [];
    global.__played.push(src && src.uri);
    const listeners = [];
    const finish = () => listeners.forEach((fn) => fn({ didJustFinish: true, playing: false }));
    global.__audioPending = global.__audioPending || [];
    // A test makes the most recent stream fail the way a 404 or a dropped
    // connection does: an error status after play() started.
    global.__audioError = () => listeners.forEach((fn) => fn({ error: "failed", playing: false }));
    return {
      play: jest.fn(() => {
        if (global.__audioHold) global.__audioPending.push(finish);
        else if (!global.__audioNeverFinish) setTimeout(finish, 0);
      }),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: (name, fn) => { listeners.push(fn); return { remove: () => {} }; },
    };
  },
  setAudioModeAsync: jest.fn(async () => {}),
}));
global.__audioFinish = () => {
  const p = global.__audioPending || [];
  global.__audioPending = [];
  p.forEach((f) => f());
};

/* A device with a Russian voice, by default. `global.__voices` lets a test take it
   away — the case that matters, since without one the platform substitutes another
   language rather than failing. */
jest.mock("expo-speech", () => ({
  speak: (text, opts) => {
    global.__spoke = global.__spoke || [];
    global.__spoke.push(text);
    global.__spokeOpts = global.__spokeOpts || [];
    global.__spokeOpts.push(opts);
  },
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () =>
    global.__voices !== undefined ? global.__voices : [
      { identifier: "ru-RU-x-ruf-local", name: "Russian", quality: "Default", language: "ru-RU" },
      { identifier: "en-US-x-sfg-local", name: "English", quality: "Default", language: "en-US" },
    ]),
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
      // stop() does not emit "end" here: on the device the final result arrives
      // first and "end" after it, so a test emits them in that order itself.
      stop: jest.fn(),
      abort: jest.fn(() => stt.emit("end", {})),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
      getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
      isRecognitionAvailable: jest.fn(() => true),
      supportsOnDeviceRecognition: jest.fn(() => true),
      getSupportedLocales: jest.fn(async () => ({ locales: ["ru-RU"], installedLocales: ["ru-RU"] })),
      androidTriggerOfflineModelDownload: jest.fn(async () => ({ status: "opened_dialog" })),
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

/* The Anki import/export modules: files, the picker, SQLite and the share sheet
   are all injected by anki.js, so the packages only need to load. */
jest.mock("expo-sqlite", () => ({ deserializeDatabaseAsync: jest.fn(), openDatabaseAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true) }));
/* A file system in memory, enough for the audio cache: directories that list,
   files that exist, download and delete. global.__fs is the store; a test seeds
   it or reads it back. File.downloadFileAsync records the URL on __downloads. */
jest.mock("expo-file-system", () => {
  const fs = { dirs: new Set(), files: new Map() };   // uri -> size
  global.__fs = fs;
  global.__downloads = [];
  const join = (...parts) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/").replace(/([^:/])\/{2,}/g, "$1/");
  class Directory {
    constructor(...uris) { this.uri = join(...uris); }
    get exists() { return fs.dirs.has(this.uri); }
    create() { fs.dirs.add(this.uri); }
    list() {
      return [...fs.files.keys()].filter((u) => u.startsWith(this.uri + "/"))
        .map((u) => new File(u));
    }
  }
  class File {
    constructor(...uris) { this.uri = join(...uris); }
    get name() { return this.uri.split("/").pop(); }
    get exists() { return fs.files.has(this.uri); }
    get size() { return fs.files.get(this.uri) || 0; }
    create() { fs.files.set(this.uri, 0); }
    delete() { fs.files.delete(this.uri); }
    write(bytes) { fs.files.set(this.uri, bytes.length || 0); }
    async bytes() { return new Uint8Array(0); }
    static async downloadFileAsync(url, dest) {
      global.__downloads.push(url);
      if (global.__downloadFail && global.__downloadFail(url)) throw new Error("offline");
      const f = new File(dest, url.split("/").pop());
      fs.files.set(f.uri, 40000);
      return f;
    }
  }
  return { File, Directory, Paths: { cache: new Directory("file:///cache") } };
});

/* Animations land on their final value at once.
 *
 * jest-expo handles the driver, but not the clock: a 240 ms fade runs on real
 * timers inside RNTL, so a `render()` returns a tree at opacity 0 and the frames
 * that follow update state outside `act()` — a warning per frame and an assertion
 * racing the animation. The suites assert structure, never motion (§20a: native
 * has no visual suite), so the end state is the only frame that carries meaning.
 *
 * This is the same end state the reduced-motion path in `src/guide.js` produces,
 * which means the default test run also exercises what a learner with motion
 * turned off sees. `Animated.Value` and `interpolate` are untouched, so anything
 * derived from an animated value still reads correctly. */
{
  const { Animated } = require("react-native");
  const settle = (value, config) => ({
    start: (cb) => {
      if (config && config.toValue !== undefined) {
        if (typeof config.toValue === "object" && config.toValue !== null) {
          value.setValue(config.toValue.__getValue ? config.toValue.__getValue() : 0);
        } else {
          value.setValue(config.toValue);
        }
      }
      if (cb) cb({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  });
  Animated.timing = settle;
  Animated.spring = settle;
  Animated.decay = settle;
}
