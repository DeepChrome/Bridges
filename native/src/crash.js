/* What broke, kept on the phone (docs/PLAYBOOK.md Phase 6).
 *
 * **Why this is not Sentry.** The playbook asks for Sentry and PostHog, and
 * both are the right answer for an app with users. This one has one user, and
 * every other decision in it has gone the other way: the recogniser runs on
 * the device so audio never leaves it (§30c), the Worker holds no learner
 * state (§30d), and the store listing says "no accounts, no analytics, no
 * advertising". Adding two SDKs that post to third parties would buy, today,
 * telemetry about the owner reported back to the owner — at the cost of two
 * dependencies (rule 20.5), a privacy disclosure, and a Data Safety form that
 * has to stay true.
 *
 * What is actually missing is narrower and this supplies it: **a crash that
 * happens away from the desk is currently unrecoverable.** With the phone
 * plugged in, logcat says everything; on a train it says nothing, and the
 * report that reaches me is "it closed". So the crash is written down where
 * the learner can hand it over.
 *
 * If the app ever has real users, Sentry goes on top of this rather than
 * instead of it — the boundary and the screen stay either way.
 *
 * **AsyncStorage, deliberately, not the profile database.** The database is a
 * thing that can itself be what broke (§30v moves an unopenable file aside),
 * and a crash log that needs the broken subsystem to work is not a crash log.
 * This is also why nothing here throws: a failure to record a failure must
 * never become the failure.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rb.crashes";
/* Ten is enough to see a pattern and small enough that nobody scrolls. A crash
   loop writes the same entry repeatedly, and the newest ten of those still say
   what it is. */
export const KEEP = 10;
/* A stack is the useful part and also the long part. */
const MAX_STACK = 4000;

const text = (e) => {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  return String(e.message || e.name || e) || "unknown";
};

export function crashEntry(error, info, now = Date.now()) {
  const stack = String((error && error.stack) || "").slice(0, MAX_STACK);
  const where = String((info && info.componentStack) || "").slice(0, MAX_STACK);
  return {
    at: now,
    what: text(error).slice(0, 400),
    fatal: !!(info && info.fatal),
    stack: stack || undefined,
    where: where || undefined,
  };
}

/* Newest first, capped. Exported so it can be tested without storage. */
export function addCrash(list, entry) {
  return [entry].concat(Array.isArray(list) ? list : []).slice(0, KEEP);
}

export async function readCrashes() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export async function recordCrash(error, info) {
  try {
    const list = await readCrashes();
    await AsyncStorage.setItem(KEY, JSON.stringify(addCrash(list, crashEntry(error, info))));
    return true;
  } catch (e) {
    /* Nothing. A crash reporter that throws inside a crash turns a recoverable
       screen into an unrecoverable one. */
    return false;
  }
}

export async function clearCrashes() {
  try { await AsyncStorage.removeItem(KEY); return true; } catch (e) { return false; }
}

/* Errors that never reach a React boundary: a rejected promise, a callback
 * from a native module, anything thrown outside render. In a release build the
 * default handler ends the process, so the write is a race we can lose — it is
 * started before the default handler runs and usually wins, and losing it costs
 * a log entry rather than anything the learner had.
 *
 * `install` is idempotent and returns a function that puts the previous handler
 * back, which is what lets a test drive it.
 */
export function installCrashHandler(deps = {}) {
  const utils = deps.ErrorUtils || (typeof global !== "undefined" ? global.ErrorUtils : null);
  if (!utils || typeof utils.setGlobalHandler !== "function") return () => {};
  const previous = utils.getGlobalHandler ? utils.getGlobalHandler() : null;
  utils.setGlobalHandler((error, isFatal) => {
    recordCrash(error, { fatal: isFatal });
    if (previous) previous(error, isFatal);
  });
  return () => { if (previous) utils.setGlobalHandler(previous); };
}
