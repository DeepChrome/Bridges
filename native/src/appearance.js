/* Light or dark (the owner, 2026-10-01: "Let's add light mode and dark mode. I
 * like the new UI and it can serve as the dark mode… scrap the old UI and just
 * turn that switch into the light dark mode switch").
 *
 * The exercise-book look that was "UI test" (§30bj) is the app's only look
 * now; what is left to choose is light or dark. Until the learner flips the
 * switch it is dark (2026-10-02); once flipped, the choice holds. It is the phone's (AsyncStorage, `rb.appearance`), not a
 * profile's: a display preference, not learning history.
 *
 * Read before the first frame (App.js waits), so a dark choice never flashes
 * light. A choice changes every colour, so App keys the navigator on it. */

import { useEffect, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rb.appearance";
const CHOICES = ["light", "dark"];

let chosen = null;                 // null: the default (dark)
const listeners = new Set();

/* The platform's own dialogs — Alert, the file picker the restore opens — are
   drawn by Android in the phone's theme, not the app's, so with the app dark
   and the phone light (or the other way) a confirm box came out in colours the
   app never chose, hard to read (the owner, 2026-10-02, of the restore
   screen). Telling the platform the app's scheme puts them on the same side. */
function applyNative() {
  try { Appearance.setColorScheme(chosen || DEFAULT_SCHEME); } catch (e) { /* older platform: phone's own */ }
}

function announce() { applyNative(); listeners.forEach((f) => f(chosen)); }

export async function loadAppearance() {
  let v = null;
  try {
    v = await Promise.race([AsyncStorage.getItem(KEY), new Promise((r) => setTimeout(() => r(null), 1000))]);
  } catch { /* unreadable: the default */ }
  chosen = CHOICES.includes(v) ? v : null;
  announce();
  return chosen;
}

export function setAppearance(scheme) {
  chosen = CHOICES.includes(scheme) ? scheme : null;
  announce();
  if (chosen) AsyncStorage.setItem(KEY, chosen).catch(() => {});
  else AsyncStorage.removeItem(KEY).catch(() => {});
}

/* "light" or "dark": the learner's choice, else dark (the owner, 2026-10-02:
   "Ensure dark mode is default. App looks way better that way"). The phone's
   own setting no longer decides; Settings → Dark mode is the one switch. */
export const DEFAULT_SCHEME = "dark";
export function useScheme() {
  const [c, set] = useState(chosen);
  useEffect(() => { listeners.add(set); set(chosen); return () => { listeners.delete(set); }; }, []);
  return c || DEFAULT_SCHEME;
}

/* Tests start each case on the default. */
export function resetAppearance() { chosen = null; announce(); }

/* A Russian teacher's mark out of five, in red pen at the end of a scored
   run. No 2: a mark that marks somebody down for trying is not one to show. */
export const markOutOfFive = (score) => (score >= 0.9 ? 5 : score >= 0.75 ? 4 : 3);
