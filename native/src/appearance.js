/* Light or dark (the owner, 2026-10-01: "Let's add light mode and dark mode. I
 * like the new UI and it can serve as the dark mode… scrap the old UI and just
 * turn that switch into the light dark mode switch").
 *
 * The exercise-book look that was "UI test" (§30bj) is the app's only look
 * now; what is left to choose is light or dark. Until the learner flips the
 * switch the phone's own setting decides, as it always did; once flipped, the
 * choice holds. It is the phone's (AsyncStorage, `rb.appearance`), not a
 * profile's: a display preference, not learning history.
 *
 * Read before the first frame (App.js waits), so a dark choice never flashes
 * light. A choice changes every colour, so App keys the navigator on it. */

import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rb.appearance";
const CHOICES = ["light", "dark"];

let chosen = null;                 // null: follow the phone
const listeners = new Set();

function announce() { listeners.forEach((f) => f(chosen)); }

export async function loadAppearance() {
  let v = null;
  try {
    v = await Promise.race([AsyncStorage.getItem(KEY), new Promise((r) => setTimeout(() => r(null), 1000))]);
  } catch { /* unreadable: follow the phone */ }
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

/* "light" or "dark": the learner's choice, else the phone's. */
export function useScheme() {
  const system = useColorScheme();
  const [c, set] = useState(chosen);
  useEffect(() => { listeners.add(set); set(chosen); return () => { listeners.delete(set); }; }, []);
  return c || (system === "dark" ? "dark" : "light");
}

/* Tests start each case following the phone. */
export function resetAppearance() { chosen = null; announce(); }

/* A Russian teacher's mark out of five, in red pen at the end of a scored
   run. No 2: a mark that marks somebody down for trying is not one to show. */
export const markOutOfFive = (score) => (score >= 0.9 ? 5 : score >= 0.75 ? 4 : 3);
