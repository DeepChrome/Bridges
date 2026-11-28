/* A newer build offered at launch (src/update.js; the owner, 2026-11-12: "a
   feature that just detects the latest upgrade each time it's launched").

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Learn from "../src/screens/Learn";
import { RefreshControl } from "react-native";
import { installedBuild, newerBuild, checkForUpdate, launchUpdate, resetUpdate, pruneDownloads, startInstall,
         downloadedUpdate, apkPath, APK_TYPE, INSTALL_ACTION, CHECK_TIMEOUT_MS, LATEST_URL } from "../src/update";
import { feedbackFacts } from "../src/screens/Feedback";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: () => () => {} };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {} };
const INSTALLED = { code: 29800000, name: "1.0.0-beta.10+abc1234" };
const LATEST = { code: 29800500, name: "1.0.0-beta.10+def5678", url: "https://dl.test/Abcdefghijklmnop1234.apk",
                 size: 288 * 1048576, at: 1762900000000, notes: "Form cards and the update check" };

const okJson = (body) => async () => ({ ok: true, json: async () => body });

async function path(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Learn navigation={nav} /></SessionProvider>);
}

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  resetUpdate();
  global.__build = { code: INSTALLED.code, name: INSTALLED.name };
  global.fetch = jest.fn(okJson(LATEST));
  global.__fs.files.clear(); global.__downloads = []; global.__intents = [];
  global.__downloadSize = LATEST.size; global.__downloadFail = null; global.__downloadHold = null; global.__intentFail = false;
});
afterEach(async () => {
  await flushState(); global.__build = { code: null, name: null }; delete global.fetch;
  global.__downloadSize = 0;
});

describe("which build this is", () => {
  it("is the installed package's own code and name", () => {
    expect(installedBuild()).toEqual(INSTALLED);
  });
  it("a development build has no number", () => {
    global.__build = { code: null, name: null };
    expect(installedBuild()).toEqual({ code: 0, name: "" });
    global.__build = { code: "x", name: "dev" };
    expect(installedBuild().code).toBe(0);
  });
  it("is what a feedback report and Settings carry", () => {
    const f = feedbackFacts({ seen: {}, unit: {}, drills: {} });
    expect(f.version).toBe("1.0.0-beta.10+abc1234 (29800000)");
  });
});

describe("what counts as newer", () => {
  it("a higher code with an https address", () => {
    expect(newerBuild(LATEST, INSTALLED)).toEqual(LATEST);
  });
  it("the same or a lower code is not", () => {
    expect(newerBuild({ ...LATEST, code: INSTALLED.code }, INSTALLED)).toBeNull();
    expect(newerBuild({ ...LATEST, code: INSTALLED.code - 1 }, INSTALLED)).toBeNull();
  });
  it("nothing is newer than a build with no number", () => {
    expect(newerBuild(LATEST, { code: 0, name: "" })).toBeNull();
  });
  it("a record with no usable address, or no code, or not a record, is nothing", () => {
    expect(newerBuild({ ...LATEST, url: "http://dl.test/x.apk" }, INSTALLED)).toBeNull();
    expect(newerBuild({ ...LATEST, url: undefined }, INSTALLED)).toBeNull();
    expect(newerBuild({ ...LATEST, code: "soon" }, INSTALLED)).toBeNull();
    expect(newerBuild(null, INSTALLED)).toBeNull();
    expect(newerBuild("1.0.1", INSTALLED)).toBeNull();
  });
  it("tidies what it keeps", () => {
    const u = newerBuild({ code: String(LATEST.code), url: LATEST.url, size: "n/a", notes: 7, name: null }, INSTALLED);
    expect(u).toEqual({ code: LATEST.code, name: "", url: LATEST.url, size: 0, at: 0, notes: "" });
  });
});

describe("asking the host", () => {
  it("fetches the record once and returns the update", async () => {
    const fetchFn = jest.fn(okJson(LATEST));
    expect(await checkForUpdate({ fetch: fetchFn })).toEqual(LATEST);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(LATEST_URL);
    expect(fetchFn.mock.calls[0][1].signal).toBeTruthy();                // the timeout is wired
  });
  /* A store build (build.ps1 -Store) has no host address: Play carries its
     updates and the side-load permission is gone from its manifest. */
  it("does not ask at all from a store build, which has no address", async () => {
    const fetchFn = jest.fn(okJson(LATEST));
    expect(await checkForUpdate({ fetch: fetchFn, url: "" })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("does not ask at all from a development build", async () => {
    global.__build = { code: null, name: null };
    const fetchFn = jest.fn(okJson(LATEST));
    expect(await checkForUpdate({ fetch: fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("is silent when the host is down, slow, has nothing, or talks nonsense", async () => {
    expect(await checkForUpdate({ fetch: async () => { throw new Error("Network request failed"); } })).toBeNull();
    expect(await checkForUpdate({ fetch: async () => ({ ok: false, status: 404 }) })).toBeNull();
    expect(await checkForUpdate({ fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) })).toBeNull();
    expect(await checkForUpdate({ fetch: async () => ({ ok: true, json: async () => ({ code: 1 }) }) })).toBeNull();
    // A host that never answers: the abort fires at the timeout.
    const hang = (url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    expect(await checkForUpdate({ fetch: hang, timeoutMs: 20 })).toBeNull();
    expect(CHECK_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
  it("asks once a launch, and hands the update out once", async () => {
    const fetchFn = jest.fn(okJson(LATEST));
    const a = launchUpdate({ fetch: fetchFn });
    const b = launchUpdate({ fetch: fetchFn });
    expect(await a).toEqual(LATEST);
    expect(await b).toBeNull();                 // the path mounting again, or Later pressed
    expect(await launchUpdate({ fetch: fetchFn })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

/* The install happens in the app (the owner, 2026-11-17: "why can't the update
   self take place in the app rather than making it download the link
   externally?"): the file is fetched into the cache and handed to the package
   installer; the browser is only the fallback. */
describe("installing in the app", () => {
  const cached = apkPath(LATEST.code);

  it("offers the newer build; Download fetches the file and opens the installer on it", async () => {
    await path();
    expect(await screen.findByTestId("update-sheet")).toBeTruthy();
    expect(screen.getByTestId("update-name")).toHaveTextContent("1.0.0-beta.10+def5678");
    expect(screen.getByTestId("update-meta")).toHaveTextContent(/288 MB/);
    expect(screen.getByTestId("update-notes")).toHaveTextContent(/Form cards and the update check/);
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    expect(global.__downloads).toEqual([LATEST.url]);
    expect(global.__fs.files.get(cached)).toBe(LATEST.size);
    expect(global.__intents).toEqual([{ action: INSTALL_ACTION, data: expect.stringMatching(/^content:\/\/.*update-29800500\.apk$/),
                                        type: APK_TYPE, flags: 1 }]);
    expect(Linking.openURL).not.toHaveBeenCalled();
    /* A real install ends the app. The mock installer returns, which on a
       phone means it was closed without installing — the first-time detour to
       "Install unknown apps" lands here — so the sheet waits with Install,
       and Install opens the installer again on the same file. */
    expect(screen.getByTestId("update-progress-text")).toHaveTextContent(/ready to install/);
    await act(async () => { fireEvent.press(screen.getByTestId("update-install")); });
    expect(global.__downloads).toHaveLength(1);                    // not fetched twice
    expect(global.__intents).toHaveLength(2);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("shows the download's progress, and Cancel stops it", async () => {
    let release;
    global.__downloadHold = new Promise((res) => { release = res; });
    await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    expect(screen.getByTestId("update-progress-text")).toHaveTextContent("50 of 288 MB");
    expect(screen.queryByTestId("update-download")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("update-cancel")); });
    expect(screen.queryByTestId("update-sheet")).toBeNull();
    await act(async () => { release(); });
    expect(global.__intents).toEqual([]);                          // a cancelled fetch installs nothing
  });

  it("a file already whole in the cache is installed without fetching again", async () => {
    global.__fs.files.set(cached, LATEST.size);
    expect(await downloadedUpdate(LATEST)).toBe(cached);
    await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    expect(global.__downloads).toEqual([]);
    expect(global.__intents).toHaveLength(1);
  });

  it("a part of a file is not whole", async () => {
    global.__fs.files.set(cached, LATEST.size - 1);
    expect(await downloadedUpdate(LATEST)).toBeNull();
    expect(await downloadedUpdate({ ...LATEST, size: 0 })).toBeNull();   // no promised size: nothing to compare
  });

  /* Never the browser (the owner, 2026-11-27: "I want to always download via
     app"): a failure says what broke and tries again in the app. */
  it("a fetch that fails, or an installer that will not open, says why and tries again in the app", async () => {
    global.__downloadFail = () => true;
    await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    expect(await screen.findByTestId("update-failed")).toBeTruthy();
    expect(screen.getByTestId("update-error")).toBeTruthy();
    expect(global.__intents).toEqual([]);
    global.__downloadFail = null;
    await act(async () => { fireEvent.press(screen.getByTestId("update-retry")); });
    expect(global.__intents).toHaveLength(1);
    expect(Linking.openURL).not.toHaveBeenCalled();

    resetUpdate(); jest.clearAllMocks();
    global.__downloadFail = null; global.__intentFail = true; global.__intents = [];
    await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    expect(await screen.findByTestId("update-failed")).toBeTruthy();
    expect(global.__intents).toHaveLength(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  /* The install lives outside the sheet (the owner, 2026-11-18: "if you
     navigate away, the update will stop… I was unsure if it was updating at
     all"): closing the sheet leaves it running, the banner on the path shows
     it, and it still opens the installer when the file is whole. */
  it("goes on when the sheet is closed, shown by the banner, and installs", async () => {
    let release;
    global.__downloadHold = new Promise((res) => { release = res; });
    await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-download")); });
    await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });   // close, not Cancel
    expect(screen.queryByTestId("update-sheet")).toBeNull();
    expect(screen.getByTestId("update-banner-text")).toHaveTextContent(/Updating/);
    // The banner reopens the sheet on the running download.
    await act(async () => { fireEvent.press(screen.getByTestId("update-banner-text")); });
    expect(screen.getByTestId("update-progress")).toBeTruthy();
    await act(async () => { release(); });
    expect(global.__intents).toHaveLength(1);
    // The installer came back without installing: the banner offers it again.
    await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });
    expect(screen.getByTestId("update-banner-text")).toHaveTextContent("Update ready");
    await act(async () => { fireEvent.press(screen.getByTestId("update-banner-retry")); });
    expect(global.__intents).toHaveLength(2);
  });

  /* An install that failed while the learner was elsewhere waits on the
     banner with Retry; closing the sheet on a failure dismisses it instead. */
  it("a failed install stays on the banner with Retry, until dismissed", async () => {
    global.__downloadFail = () => true;
    global.fetch = jest.fn(okJson({ ...LATEST, code: INSTALLED.code }));     // no sheet in the way
    await path();
    await screen.findByTestId("screen-root");
    await act(async () => { await startInstall(LATEST); });
    expect(screen.getByTestId("update-banner-text")).toHaveTextContent(/failed/);
    global.__downloadFail = null;
    await act(async () => { fireEvent.press(screen.getByTestId("update-banner-retry")); });
    expect(global.__intents).toHaveLength(1);                                // the retry went through
    expect(screen.getByTestId("update-banner-text")).toHaveTextContent("Update ready");
    global.__downloadFail = () => true;
    global.__fs.files.clear();                                                 // or the whole file installs again
    await act(async () => { await startInstall(LATEST); });
    await act(async () => { fireEvent.press(screen.getByTestId("update-banner-dismiss")); });
    expect(screen.queryByTestId("update-banner")).toBeNull();
  });

  /* A pull down the path asks the host again; nothing newer says so briefly. */
  it("a pull asks the host again", async () => {
    global.fetch = jest.fn(okJson({ ...LATEST, code: INSTALLED.code }));     // nothing newer
    const r = await path();
    await screen.findByTestId("screen-root");
    expect(screen.queryByTestId("update-sheet")).toBeNull();
    global.fetch = jest.fn(okJson(LATEST));
    const pull = () => act(async () => { await screen.getByTestId("screen-body").props.refreshControl.props.onRefresh(); });
    await pull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("update-sheet")).toBeTruthy();
    expect(screen.queryByTestId("update-none")).toBeNull();
    // And with nothing new, the line that says so.
    await act(async () => { fireEvent.press(screen.getByTestId("update-later")); });
    global.fetch = jest.fn(okJson({ ...LATEST, code: INSTALLED.code }));
    await pull();
    expect(screen.getByTestId("update-none")).toBeTruthy();
    expect(r).toBeTruthy();
  });

  /* The notes are bullets, three at most, and Read more opens the changelog
     (the owner, 2026-11-18: "be less verbose. Just a few bullets and maybe an
     option to read more in the changelog"). */
  it("shows the notes as a few bullets, with Read more when the host has a changelog", async () => {
    const latest = { ...LATEST, notes: "One | Two | - Three | Four", more: "https://dl.test/changelog" };
    global.fetch = jest.fn(okJson(latest));
    await path();
    await screen.findByTestId("update-sheet");
    const notes = screen.getByTestId("update-notes");
    // A string match is the whole text; a regex is a part of it (whitespace normalised).
    expect(notes).toHaveTextContent(/• One/);
    expect(notes).toHaveTextContent(/• Three/);
    expect(notes).not.toHaveTextContent(/Four/);
    await act(async () => { fireEvent.press(screen.getByTestId("update-more")); });
    expect(Linking.openURL).toHaveBeenCalledWith("https://dl.test/changelog");
    expect(newerBuild({ ...latest, more: "http://x" }, INSTALLED).more).toBeUndefined();   // https or nothing
  });

  /* One installer at a time: a new download deletes every other build's
     file first, and a file nobody installed in three days goes too. */
  it("a download clears every other build's file first; a stale one goes at launch", async () => {
    const other = apkPath(LATEST.code + 7);
    global.__fs.files.set(other, 9);
    await pruneDownloads({ keep: LATEST.code });
    expect(global.__fs.files.has(other)).toBe(false);
    global.__fs.files.set(other, 9);
    const old = { getInfoAsync: async (uri) => ({ exists: true, uri, size: 9, modificationTime: 1 }) };
    await pruneDownloads({ fs: { ...jest.requireMock("expo-file-system/legacy"), ...old }, now: 10 * 86400000 });
    expect(global.__fs.files.has(other)).toBe(false);
  });

  it("at launch, files from builds no newer than this one are deleted; the offered one stays", async () => {
    const stale = apkPath(INSTALLED.code - 100), own = apkPath(INSTALLED.code);
    global.__fs.files.set(stale, 5); global.__fs.files.set(own, 5); global.__fs.files.set(cached, LATEST.size);
    global.__fs.files.set("file:///cache/word.mp3", 7);
    await pruneDownloads();
    expect([...global.__fs.files.keys()].sort()).toEqual([cached, "file:///cache/word.mp3"].sort());
    // launchUpdate runs it: the next launch after installing this build clears its file.
    global.__fs.files.set(stale, 5);
    await launchUpdate({ fetch: jest.fn(okJson(LATEST)) });
    expect(global.__fs.files.has(stale)).toBe(false);
  });
});

describe("on the path", () => {

  it("Later closes it for this launch, and the next mount does not ask again", async () => {
    const view = await path();
    await screen.findByTestId("update-sheet");
    await act(async () => { fireEvent.press(screen.getByTestId("update-later")); });
    expect(screen.queryByTestId("update-sheet")).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
    await act(async () => { view.unmount(); });
    await path();
    await screen.findByTestId("next-step");
    // The record was fetched once; the sheet is not back until the next launch.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("update-sheet")).toBeNull();
  });

  it("says nothing when this is the latest build, or there is no host", async () => {
    global.fetch = jest.fn(okJson({ ...LATEST, code: INSTALLED.code }));
    const view = await path();
    await screen.findByTestId("next-step");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("update-sheet")).toBeNull();
    await act(async () => { view.unmount(); });

    resetUpdate();
    global.fetch = jest.fn(async () => { throw new Error("Network request failed"); });
    await path();
    await screen.findByTestId("next-step");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("update-sheet")).toBeNull();
  });

  it("a path left before the host answered does not swallow the offer", async () => {
    let answer;
    global.fetch = jest.fn(() => new Promise((res) => { answer = () => res({ ok: true, json: async () => LATEST }); }));
    const view = await path();
    await screen.findByTestId("next-step");
    await act(async () => { view.unmount(); });          // off to another tab before five seconds
    await act(async () => { answer(); });
    await path();
    expect(await screen.findByTestId("update-sheet")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("a development build never asks", async () => {
    global.__build = { code: null, name: null };
    await path();
    await screen.findByTestId("next-step");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("update-sheet")).toBeNull();
  });
});
