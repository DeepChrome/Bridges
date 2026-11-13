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
 * every launch, and "Later" is for this launch. */

import React from "react";
import { View, Linking } from "react-native";
import * as Application from "expo-application";
import { Sheet, Btn, Muted, Text } from "./ui";
import { useTheme, radius, type as T } from "./theme";

/* Where the record lives. The host is public and the record carries nothing
   private: a version, a size, a one-line note and the file's own address. */
export const LATEST_URL = "https://bridges-dl.bridges-feedback.workers.dev/latest.json";
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
  };
}

/* Ask the host. Resolves to the update or null, and never rejects. */
export async function checkForUpdate({ fetch: fetchFn = globalThis.fetch, url = LATEST_URL,
                                      installed = installedBuild(), timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  if (!(installed.code > 0) || typeof fetchFn !== "function") return null;
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
  if (!launched) launched = checkForUpdate(deps);
  const update = await launched;
  if (!update || offered) return null;
  offered = true;
  return update;
}
/* The path left before the answer came back: the update was handed to a
   screen that is gone, so it is on offer again for the next mount. */
export function putBackUpdate() { offered = false; }
/* Tests start each case as a fresh launch. */
export function resetUpdate() { launched = null; offered = false; }

/* The browser fetches the file and Android offers to install it, as the
   testers already install. A failure to open is nothing to report: the sheet
   is closing anyway and the next launch offers it again. */
export function openUpdate(update) {
  return Promise.resolve().then(() => Linking.openURL(update.url)).catch(() => {});
}

const mb = (bytes) => (bytes > 0 ? `${Math.max(1, Math.round(bytes / 1048576))} MB` : "");
const dayOf = (at) => {
  if (!(at > 0)) return "";
  try { return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch (e) { return ""; }
};

/* What is on offer, as a card (resumesheet.js RunCard's shape): the build's
   name large, size and date under it, the note in its own line. */
export function UpdateCard({ update }) {
  const t = useTheme();
  const meta = [mb(update.size), dayOf(update.at)].filter(Boolean).join(" · ");
  return (
    <View testID="update-card"
          style={{ padding: 14, borderRadius: radius.lg, backgroundColor: t.surface,
                   borderWidth: 1, borderColor: t.line, gap: 2 }}>
      <Text testID="update-name" numberOfLines={1}
            style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>
        {update.name || "A newer build"}
      </Text>
      {meta ? <Muted testID="update-meta" numberOfLines={1}>{meta}</Muted> : null}
      {update.notes ? (
        <Text testID="update-notes" style={{ color: t.ink2, fontSize: T.body, marginTop: 8 }}>
          {update.notes}
        </Text>
      ) : null}
    </View>
  );
}

export function UpdateSheet({ update, onClose }) {
  return (
    <Sheet testID="update-sheet" title="Update available" onClose={onClose}
           footer={(
             <View style={{ flexDirection: "row", gap: 10 }}>
               <Btn kind="ghost" testID="update-later" label="Later" style={{ flex: 1 }} onPress={onClose} />
               <Btn kind="pri" testID="update-download" label="Download" style={{ flex: 1 }}
                    onPress={() => { openUpdate(update); onClose(); }} />
             </View>
           )}>
      <UpdateCard update={update} />
    </Sheet>
  );
}
