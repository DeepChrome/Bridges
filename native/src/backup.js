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
import { normalise } from "./store";

const defaultDeps = {
  pick: () => Picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false,
                                        type: ["application/json", "text/*", "*/*"] }),
  readText: async (uri) => new File(uri).text(),
  writeShare: async (name, text) => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: name });
  },
};

export const BACKUP_KIND = "bridges-profile";

/* What goes in the file: the state as saved, with a header naming the app and
   the profile so a restore can tell it from any other JSON. */
export function backupText(state, account, now = Date.now()) {
  return JSON.stringify({ kind: BACKUP_KIND, made: now,
                          name: account ? account.name : "", state }, null, 1);
}

export async function backupProfile(state, account, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const stamp = new Date().toISOString().slice(0, 10);
  const who = (account && account.name ? account.name : "profile").replace(/[^\wЀ-ӿ -]+/g, "").trim();
  const file = `bridges-${who}-${stamp}.json`;
  await d.writeShare(file, backupText(state, account));
  return { file };
}

/* -> { state } or { cancelled: true } or { error } */
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
  return { state: normalise(state), made: raw.made, name: raw.name };
}
