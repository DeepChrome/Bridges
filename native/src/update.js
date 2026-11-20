/* A newer build, noticed at launch (the owner, 2026-11-12: "a feature that just
 * detects the latest upgrade each time it's launched. My other apps do that").
 *
 * The app is side-loaded while it is in beta, so there is no store to do this.
 * The download host (tools/dl, the bridges-dl Worker) keeps one `latest`
 * record beside the files it serves; the app asks for it once a launch,
 * compares the record's version code with its own, and offers the download on
 * the path when the host's is higher. Everything about it is quiet: a build
 * with no number (a development build), no connection, a slow host, a host
 * that has let the file expire, a malformed record — all of them mean "nothing
 * to say", never an error on screen.
 *
 * **The number is Android's own.** `versionCode` is what the package installer
 * compares when one APK is installed over another, and it is the one fact
 * about a build the phone itself holds, so it is what the check compares too
 * (expo-application reads it off the installed package). Until this change
 * every local build carried the same code, 27, which is also why the phone
 * could never have told two builds apart: native/tools/build.ps1 stamps each
 * build with the minute it was made, and plugins/withBuildStamp.js is what lets
 * Gradle take it.
 *
 * Not a setting and nothing is remembered: the owner asked for the check at
 * every launch, and "Later" is for this launch.
 *
 * **The install happens in the app** (the owner, 2026-11-17: "why can't the
 * update self take place in the app rather than making it download the link
 * externally?"). Download fetches the file into the app's own cache with a
 * progress bar, and hands it to Android's package installer through a content
 * URI from expo-file-system's own file provider — the installer then asks the
 * one question it always asks and replaces the app. The first time, Android
 * also asks to allow this app to install unknown apps; it remembers the
 * answer. The browser route stays as the fallback where either step fails. It
 * needs `REQUEST_INSTALL_PACKAGES` in the manifest (app.json), which **a Play
 * Store build must drop along with LATEST_URL**: Play's policy reserves that
 * permission for app stores. A file already downloaded for the offered code is
 * reused rather than fetched again (an install the learner backed out of), and
 * what is left in the cache from older codes is deleted at launch.
 *
 * **Nothing piles up** (the owner, 2026-11-18: "make sure that the downloader
 * isn't leaving the stale installer every single time… I don't want a new
 * version to drop a 200 MB bomb on their phone"). The file lives in the app's
 * own cache, never in Downloads; at launch every file for a build no newer than
 * the one running is deleted (so the build just installed clears its own
 * installer on first open), a new download first deletes every other build's
 * file, and anything older than STALE_DAYS goes whatever its code — the
 * leftover of an install that never finished. At most one installer, briefly.
 * The notes are a few bullets (NOTE_LINES), with Read more opening the host's
 * changelog. */

import React, { useState, useRef, useEffect } from "react";
import { View, Linking } from "react-native";
import * as Application from "expo-application";
import * as FS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Sheet, Btn, Muted, Text, Bar } from "./ui";
import { useTheme, radius, type as T } from "./theme";

/* Where the record lives. The host is public and the record carries nothing
   private: a version, a size, a one-line note and the file's own address.

   A store build has no address at all: Google Play carries its updates, and a
   store build may neither offer a side-loaded APK nor hold the permission to
   install one. `native/tools/build.ps1 -Store` sets EXPO_PUBLIC_STORE_BUILD
   for Metro (babel inlines it) and `-PyaStore=true` for Gradle, which drops
   the permission (plugins/withStoreBuild.js). An empty address asks nothing. */
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === "1";
export const LATEST_URL = STORE_BUILD ? "" : "https://bridges-dl.bridges-feedback.workers.dev/latest.json";
/* A launch should never wait on this. The record is a few hundred bytes; a host
   that has not answered in five seconds is a host that is not going to. */
export const CHECK_TIMEOUT_MS = 5000;

/* The build this is, as the phone sees it: `code` is versionCode, `name` is
   versionName ("1.0.0-beta.10+8ec6c68" from build.ps1). A code of 0 means the
   package carries no usable number — a development build — and the check
   stays silent, since it has nothing to compare. */
export function installedBuild() {
  const code = parseInt(Application.nativeBuildVersion, 10);
  return { code: Number.isFinite(code) && code > 0 ? code : 0,
           name: Application.nativeApplicationVersion || "" };
}

/* The host's record read against this build: the update to offer, or null.
   A record is only an update when its code is a number higher than ours and
   it names an https address to fetch; anything else is not one, however it
   came to be. */
export function newerBuild(latest, installed) {
  if (!latest || typeof latest !== "object" || !installed || !(installed.code > 0)) return null;
  const code = Number(latest.code);
  if (!Number.isFinite(code) || code <= installed.code) return null;
  if (typeof latest.url !== "string" || !/^https:\/\/\S+$/.test(latest.url)) return null;
  return {
    code,
    name: typeof latest.name === "string" ? latest.name : "",
    url: latest.url,
    size: Number(latest.size) > 0 ? Number(latest.size) : 0,
    at: Number(latest.at) > 0 ? Number(latest.at) : 0,
    notes: typeof latest.notes === "string" ? latest.notes.trim() : "",
    // The changelog, when the host has one: an https address, else absent.
    ...(typeof latest.more === "string" && /^https:\/\/\S+$/.test(latest.more) ? { more: latest.more } : null),
  };
}

/* The notes as bullets: one a line, or `|`-separated on one line (what
   tools/dl/upload.mjs is given); a leading dash or bullet is dropped. */
export const NOTE_LINES = 3;
export function notesList(notes) {
  return String(notes || "").split(/\r?\n|\s*\|\s*/)
    .map((s) => s.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}

/* Ask the host. Resolves to the update or null, and never rejects. */
export async function checkForUpdate({ fetch: fetchFn = globalThis.fetch, url = LATEST_URL,
                                      installed = installedBuild(), timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  if (!url || !(installed.code > 0) || typeof fetchFn !== "function") return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r || !r.ok) return null;
    return newerBuild(await r.json(), installed);
  } catch (e) {
    return null;                  // offline, timed out, or not JSON: nothing to say
  } finally {
    clearTimeout(timer);
  }
}

/* Once a launch: the host is asked once, and the update is handed out once.
   The path asks every time it mounts, and a learner who said Later is not
   asked again until the app is next opened (resume.js's `offered` is the same
   rule for a half-done run). */
let launched = null;
let offered = false;
export async function launchUpdate(deps) {
  if (!launched) {
    launched = checkForUpdate(deps);
    pruneDownloads(deps).catch(() => {});
  }
  const update = await launched;
  if (!update || offered) return null;
  offered = true;
  return update;
}
/* The path left before the answer came back: the update was handed to a
   screen that is gone, so it is on offer again for the next mount. */
export function putBackUpdate() { offered = false; }
/* Tests start each case as a fresh launch. */
export function resetUpdate() { launched = null; offered = false; cancelInstall(); }

/* The fallback: the browser fetches the file and Android offers to install it,
   as the testers first installed. A failure to open is nothing to report: the
   sheet is closing anyway and the next launch offers it again. */
export function openUpdate(update) {
  return Promise.resolve().then(() => Linking.openURL(update.url)).catch(() => {});
}

/* The package installer's MIME type, and Intent.FLAG_GRANT_READ_URI_PERMISSION:
   the installer is another app, and the content URI is what lets it read a
   file in this app's private cache. */
export const APK_TYPE = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
export const INSTALL_ACTION = "android.intent.action.VIEW";

const APK_NAME = /^update-(\d+)\.apk$/;
export const apkPath = (code, fs = FS) => `${fs.cacheDirectory || ""}update-${code}.apk`;

/* Files left from earlier offers — a build since installed, or one that was
   downloaded and never installed — go at launch; the one for the code still on
   offer is kept so a second Download costs nothing. 229 MB is not something to
   leave lying about. `keep` (a code) deletes every *other* build's file too,
   which is what a new download does first; and a file older than STALE_DAYS
   goes whatever its code, since an installer nobody ran in three days is
   not going to be run. */
export const STALE_DAYS = 3;
export async function pruneDownloads({ fs = FS, installed = installedBuild(), keep, now = Date.now() } = {}) {
  if (!fs.cacheDirectory) return;
  const names = await fs.readDirectoryAsync(fs.cacheDirectory);
  for (const name of names) {
    const m = APK_NAME.exec(name);
    if (!m) continue;
    const code = Number(m[1]);
    const uri = fs.cacheDirectory + name;
    let gone = code <= installed.code || (keep !== undefined && code !== keep);
    if (!gone) {
      try {
        const info = await fs.getInfoAsync(uri);
        const t = info && info.modificationTime;                  // seconds, where the platform says
        gone = typeof t === "number" && now - t * 1000 > STALE_DAYS * 86400000;
      } catch (e) { gone = false; }
    }
    if (gone) await fs.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

/* The file for this update, already whole in the cache, or null. "Whole" is
   the size the record promised; a cancelled download leaves a shorter file. */
export async function downloadedUpdate(update, fs = FS) {
  try {
    const info = await fs.getInfoAsync(apkPath(update.code, fs), { size: true });
    return info && info.exists && update.size > 0 && info.size === update.size ? apkPath(update.code, fs) : null;
  } catch (e) {
    return null;
  }
}

/* Fetch the file into the cache. `onProgress(written, total)` as it goes;
   `cancel()` stops it, after which the promise rejects. The promise resolves
   to the file's uri. */
export function downloadUpdate(update, { onProgress, fs = FS } = {}) {
  const task = fs.createDownloadResumable(update.url, apkPath(update.code, fs), {}, (p) => {
    if (onProgress) onProgress(p.totalBytesWritten, p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : update.size);
  });
  const promise = task.downloadAsync().then((r) => {
    if (!r || !r.uri) throw new Error("cancelled");
    if (r.status && r.status !== 200) throw new Error(`status ${r.status}`);
    return r.uri;
  });
  return { promise, cancel: () => task.cancelAsync().catch(() => {}) };
}

/* Hand the file to Android's package installer. Rejects when the phone will
   not — no installer answers, or the permission is missing — so the caller
   can offer the browser instead. */
export async function installUpdate(fileUri, { fs = FS, intents = IntentLauncher } = {}) {
  const data = await fs.getContentUriAsync(fileUri);
  await intents.startActivityAsync(INSTALL_ACTION, { data, type: APK_TYPE, flags: FLAG_GRANT_READ_URI_PERMISSION });
}

const mb = (bytes) => (bytes > 0 ? `${Math.max(1, Math.round(bytes / 1048576))} MB` : "");
const dayOf = (at) => {
  if (!(at > 0)) return "";
  try { return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch (e) { return ""; }
};

/* What is on offer, as a card (resumesheet.js RunCard's shape): the build's
   name, size and date under it, a few bullets, and Read more where the host
   keeps a changelog (the owner, 2026-11-18: "be less verbose. Just a few
   bullets and maybe an option to read more"). */
export function UpdateCard({ update }) {
  const t = useTheme();
  const meta = [mb(update.size), dayOf(update.at)].filter(Boolean).join(" · ");
  const lines = notesList(update.notes).slice(0, NOTE_LINES);
  return (
    <View testID="update-card"
          style={{ padding: 16, borderRadius: radius.lg, backgroundColor: t.surface,
                   borderWidth: 1, borderColor: t.lineSoft, gap: 2 }}>
      <Text testID="update-name" numberOfLines={1}
            style={{ color: t.ink, fontSize: T.head, fontWeight: "600" }}>
        {update.name || "A newer build"}
      </Text>
      {meta ? <Muted testID="update-meta" numberOfLines={1}>{meta}</Muted> : null}
      {lines.length ? (
        <Text testID="update-notes" style={{ color: t.ink2, fontSize: T.body, lineHeight: 23, marginTop: 10 }}>
          {lines.map((line) => `•  ${line}`).join("\n")}
        </Text>
      ) : null}
      {update.more ? (
        <Text testID="update-more" accessibilityRole="link" suppressHighlighting
              onPress={() => Promise.resolve().then(() => Linking.openURL(update.more)).catch(() => {})}
              style={{ color: t.brandInk, fontSize: T.body, fontWeight: "600", marginTop: 10, paddingVertical: 4 }}>
          Read more
        </Text>
      ) : null}
    </View>
  );
}

/* The install, outside any screen (the owner, 2026-11-18: "if you navigate
   away, the update will stop. Or at least hide… I was unsure if it was
   updating at all"). One job at a time, held here: Download starts it, the
   sheet and the banner on the path read it, leaving a screen does not touch
   it, and only Cancel stops it. `phase` is downloading · installing · failed;
   a finished job is gone, since the installer has the screen by then. */
let job = null;                       // { update, phase, written, total, task }
const watchers = new Set();
const tell = () => { const s = installState(); for (const fn of watchers) fn(s); };
export function installState() {
  return job ? { update: job.update, phase: job.phase, written: job.written, total: job.total } : null;
}
export function onInstall(fn) { watchers.add(fn); return () => watchers.delete(fn); }
export function useInstall() {
  const [s, setS] = useState(installState);
  useEffect(() => onInstall(setS), []);
  return s;
}
export async function startInstall(update, deps = {}) {
  if (job && job.phase !== "failed" && job.update.code === update.code) return;   // already on its way
  const mine = { update, phase: "downloading", written: 0, total: update.size, task: null };
  job = mine;
  tell();
  try {
    // Every other build's file goes before this one is fetched: one at a time.
    await pruneDownloads({ keep: update.code, ...deps }).catch(() => {});
    let uri = await downloadedUpdate(update, deps.fs);
    if (!uri) {
      let shown = -1;
      mine.task = downloadUpdate(update, {
        fs: deps.fs,
        /* The native task reports many times a second; the screens redraw
           once a megabyte. */
        onProgress: (written, total) => {
          const mb = Math.floor(written / 1048576);
          if (job !== mine || mb === shown) return;
          shown = mb; mine.written = mb; mine.total = total;
          tell();
        },
      });
      uri = await mine.task.promise;
      if (job !== mine) return;                                   // cancelled meanwhile
      mine.task = null;
    }
    mine.phase = "installing"; tell();
    await installUpdate(uri, deps);
    if (job === mine) { job = null; tell(); }
  } catch (e) {
    if (job === mine) { mine.phase = "failed"; mine.task = null; tell(); }
  }
}
export function cancelInstall() {
  const j = job;
  job = null;
  if (j && j.task) j.task.cancel();
  tell();
}
/* A failed job is kept so the banner can say so; this is the dismissal. */
export function clearInstall() { if (job && job.phase === "failed") { job = null; tell(); } }

/* A second look at the host, on a pull down the path (the owner, 2026-11-18:
   "rather than restarting the app, I can just drag up on the home screen and
   it will refresh and check for an update"). The once-a-launch memory is
   reset, so the update is handed out again. */
export async function recheckUpdate(deps) {
  launched = null; offered = false;
  return launchUpdate(deps);
}

/* Where an install stands, on the path (and anywhere else that shows it):
   the percentage while it downloads, a word while the installer opens, and a
   failure with Retry and a dismissal. Pressing it reopens the sheet. */
export function UpdateBanner({ onPress }) {
  const t = useTheme();
  const s = useInstall();
  if (!s) return null;
  const totalMb = Math.round((s.total || s.update.size) / 1048576);
  const frac = totalMb > 0 ? Math.min(1, s.written / totalMb) : 0;
  const text = s.phase === "failed" ? "Update failed"
    : s.phase === "installing" ? "Opening the installer"
    : `Updating · ${Math.round(frac * 100)}%`;
  return (
    <View testID="update-banner"
          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12,
                   paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md,
                   backgroundColor: s.phase === "failed" ? t.badBg : t.brandBg }}>
      <Text testID="update-banner-text" onPress={onPress} accessibilityRole="button"
            style={{ flex: 1, color: t.ink, fontSize: T.body, fontWeight: "600" }}>{text}</Text>
      {s.phase === "downloading" ? (
        <View style={{ width: 90 }}><Bar value={frac} /></View>
      ) : s.phase === "failed" ? (
        <>
          <Text testID="update-banner-retry" accessibilityRole="button" onPress={() => startInstall(s.update)}
                style={{ color: t.brandInk, fontSize: T.body, fontWeight: "600", paddingHorizontal: 6 }}>Retry</Text>
          <Text testID="update-banner-dismiss" accessibilityRole="button" accessibilityLabel="Dismiss"
                onPress={clearInstall} style={{ color: t.ink3, fontSize: T.body, paddingHorizontal: 6 }}>✕</Text>
        </>
      ) : null}
    </View>
  );
}

/* The sheet offers the build and starts the install; it shows the install's
   progress while it is open and closes when the installer takes the screen.
   Closing it mid-download leaves the download running — the banner on the
   path carries it from there — and Cancel is the one thing that stops it.
   Where the fetch or the installer fails, it says so and offers the browser,
   the one route that cannot fail for the app's own reasons. */
export function UpdateSheet({ update, onClose }) {
  const t = useTheme();
  const s = useInstall();
  const mine = s && s.update.code === update.code ? s : null;
  const phase = mine ? mine.phase : "offer";                // offer · downloading · installing · failed
  const gone = useRef(false);
  useEffect(() => () => { gone.current = true; }, []);
  const install = async () => {
    await startInstall(update);
    // Finished and handed over: the installer has the screen, the sheet goes.
    if (!gone.current && !installState()) onClose();
  };
  const cancel = () => { cancelInstall(); onClose(); };
  const later = () => { clearInstall(); onClose(); };

  const footer = phase === "downloading" || phase === "installing" ? (
    <Btn kind="ghost" testID="update-cancel" label="Cancel" block onPress={cancel} />
  ) : (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Btn kind="ghost" testID="update-later" label="Later" style={{ flex: 1 }} onPress={later} />
      {phase === "failed"
        ? <Btn kind="pri" testID="update-browser" label="Open in browser" style={{ flex: 1 }}
               onPress={() => { openUpdate(update); later(); }} />
        : <Btn kind="pri" testID="update-download" label="Download" style={{ flex: 1 }} onPress={install} />}
    </View>
  );
  const progress = mine || { written: 0, total: update.size };
  const totalMb = Math.round((progress.total || update.size) / 1048576);
  const frac = totalMb > 0 ? Math.min(1, progress.written / totalMb) : 0;
  return (
    <Sheet testID="update-sheet" title="Update available" onClose={phase === "failed" ? later : onClose}
           footer={footer}>
      <UpdateCard update={update} />
      {phase === "downloading" || phase === "installing" ? (
        /* The percentage is the thing: large, the bar under it, the megabytes
           quiet beneath (the owner, 2026-11-18: "make the downloader look a
           little more modern as it's happening"). */
        <View testID="update-progress" style={{ marginTop: 20, alignItems: "center", gap: 10 }}>
          <Text testID="update-percent" style={{ color: t.ink, fontSize: T.display, fontWeight: "700" }}>
            {phase === "installing" ? "100%" : `${Math.round(frac * 100)}%`}
          </Text>
          <View style={{ alignSelf: "stretch" }}><Bar value={phase === "installing" ? 1 : frac} /></View>
          <Muted testID="update-progress-text">
            {phase === "installing" ? "Opening the installer"
              : totalMb > 0 ? `${progress.written} of ${totalMb} MB` : `${progress.written} MB`}
          </Muted>
        </View>
      ) : phase === "failed" ? (
        <Muted testID="update-failed" style={{ marginTop: 14, textAlign: "center" }}>
          The download could not be installed
        </Muted>
      ) : null}
    </Sheet>
  );
}
