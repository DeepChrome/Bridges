/* A profile off the phone and back (ROADMAP P9.10).
 *
 * The FSRS history is the one thing a rebuild cannot regenerate, and until now
 * it lived only in one AsyncStorage row on one phone. "Back up progress" hands
 * the whole state to the share sheet as a JSON file; "Restore" reads one back
 * through the same migrations a saved profile goes through (store.js
 * normalise), so a backup from an older version imports like an older save.
 * The web app's export/import writes the same shape.
 *
 * `deps` lets tests substitute the picker, the file and the share sheet, as
 * anki.js does.
 */

import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { normalise, readLog } from "./store";
import { validLog } from "@core/repo";

const defaultDeps = {
  pick: () => Picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false,
                                        type: ["application/json", "text/*", "*/*"] }),
  readText: async (uri) => new File(uri).text(),
  readLog: () => readLog(),
  writeShare: async (name, text, mimeType = "application/json") => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  },
};

export const BACKUP_KIND = "bridges-profile";

/* What goes in the file: the state as saved, with a header naming the app and
   the profile so a restore can tell it from any other JSON, and the review
   log since 2026-09-15 — the one record a card cannot give back. A file from
   before then has no `log` and restores with an empty one. */
export function backupText(state, account, now = Date.now(), log = []) {
  return JSON.stringify({ kind: BACKUP_KIND, made: now,
                          name: account ? account.name : "", state, log }, null, 1);
}

export async function backupProfile(state, account, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const stamp = new Date().toISOString().slice(0, 10);
  const who = (account && account.name ? account.name : "profile").replace(/[^\wЀ-ӿ -]+/g, "").trim();
  const file = `bridges-${who}-${stamp}.json`;
  const log = await d.readLog();
  await d.writeShare(file, backupText(state, account, Date.now(), log));
  return { file, log: log.length };
}

/* The crash log out through the same share sheet (src/crash.js).
 *
 * Plain text rather than JSON: nothing reads this back, a person does, and a
 * stack trace wrapped in JSON escapes is a stack trace nobody can read. It
 * carries no learner state and no profile name — what broke, when, and where
 * in the component tree, which is all a fix needs. */
export function crashText(list, now = Date.now()) {
  const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  const head = `Bridges problem report, ${when(now)} UTC\n${(list || []).length} recorded\n`;
  return head + (list || []).map((c, k) =>
    `\n--- ${k + 1} --- ${when(c.at)} UTC${c.fatal ? " (fatal)" : ""}\n${c.what}\n`
    + (c.stack ? `\n${c.stack}\n` : "")
    + (c.where ? `\ncomponents:${c.where}\n` : "")).join("");
}

export async function shareCrashes(list, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `bridges-problems-${stamp}.txt`;
  await d.writeShare(file, crashText(list), "text/plain");
  return { file, n: (list || []).length };
}

/* -> { state, log } or { cancelled: true } or { error } */
export async function restoreProfile(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  let res;
  try { res = await d.pick(); } catch (e) { return { error: "The file could not be opened." }; }
  if (!res || res.canceled || !res.assets || !res.assets[0]) return { cancelled: true };
  let text;
  try { text = await d.readText(res.assets[0].uri); } catch (e) { return { error: "The file could not be read." }; }
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { error: "This is not a Bridges backup." }; }
  // A backup file, or a bare state the web app exported.
  const state = raw && raw.kind === BACKUP_KIND ? raw.state : raw;
  if (!state || typeof state !== "object" || !("seen" in state)) {
    return { error: "This is not a Bridges backup." };
  }
  return { state: normalise(state), log: validLog(raw.log), made: raw.made, name: raw.name };
}
