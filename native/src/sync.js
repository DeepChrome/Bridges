/* Sync on the phone: when to run core/syncclient.js, and what happens to the
 * ops it brings back (2026-11-07).
 *
 * A profile that is linked (Settings → Sync) is pushed a few seconds after
 * every save, pulled when the app comes to the front, and both on demand.
 * What comes back is written to the database by the client (never into the
 * outbox) and folded into memory here: `cur.saved` in store.js, so the next
 * save is not diffed against a stale copy, and `st` in session.js, which
 * subscribes to `onPulled`. One run at a time per profile; a nudge during a
 * run queues one more.
 *
 * Nothing here holds learner state and nothing runs for an unlinked
 * profile: an app whose owner never turned sync on makes no requests.
 */

import { AppState } from "react-native";
import { applyOps } from "@core/sync";
import { syncOnce, readLink, linkNew, unlink, claimCode, listDevices, revokeDevice } from "@core/syncclient";
import { config, ensureToken, send, TIMEOUT_MS } from "./lib/feedback";
import { profileRepo, absorbOps, onWrote } from "./store";

/* How long after a save the push goes. Short enough that a card graded on
   the phone is on the computer before the learner has walked over to it;
   long enough that a sitting's grades ride together. */
export const PUSH_DELAY_MS = 2500;
/* A pull on its own when the app comes forward, at most this often. */
const FOREGROUND_PULL_MS = 30 * 1000;

const pulled = new Set();      // (accountId, ops) => void
const changed = new Set();     // (status) => void
export const onPulled = (fn) => { pulled.add(fn); return () => pulled.delete(fn); };
export const onSyncChange = (fn) => { changed.add(fn); return () => changed.delete(fn); };

/* The request, through the feedback client's one fetch wrapper. */
const call = async (route, body, token) => {
  const cfg = config(route);
  if (!cfg) return { ok: false, reason: "unconfigured" };
  return send(cfg.url, body, token, {}, TIMEOUT_MS);
};

/* Per profile: the run in flight, whether another was asked for, the timer,
   and the last status shown. */
const runs = new Map();
const slot = (id) => {
  if (!runs.has(id)) runs.set(id, { busy: null, again: false, timer: null, status: { state: "idle" }, lastPull: 0 });
  return runs.get(id);
};
const tell = (id, status) => {
  const s = slot(id);
  s.status = { ...s.status, ...status, at: Date.now() };
  changed.forEach((fn) => fn(id, s.status));
};

export const syncStatus = (id) => (id ? slot(id).status : { state: "idle" });

/* Whether this profile syncs: its link, or null. */
export async function syncLink(id) {
  if (!id) return null;
  const repo = await profileRepo(id);
  return readLink(repo);
}

/* One round now (push and pull); another queued if one is running. */
export async function syncNow(id) {
  if (!id || !config()) return { ok: false, reason: "unconfigured" };
  const s = slot(id);
  if (s.busy) { s.again = true; return s.busy; }
  s.busy = (async () => {
    let result;
    try {
      const repo = await profileRepo(id);
      if (!(await readLink(repo))) { result = { ok: false, reason: "unlinked" }; return result; }
      tell(id, { state: "syncing" });
      result = await syncOnce({ repo, call });
      if (result.ok) {
        if (result.taken.length) {
          absorbOps(id, result.taken);
          pulled.forEach((fn) => fn(id, result.taken));
        }
        s.lastPull = Date.now();
        tell(id, { state: "ok", lastAt: result.link.lastAt, error: null });
      } else {
        tell(id, { state: result.reason === "unlinked" ? "idle" : "error", error: result });
      }
      return result;
    } catch (e) {
      result = { ok: false, reason: "error", message: String(e && e.message) };
      tell(id, { state: "error", error: result });
      return result;
    } finally {
      s.busy = null;
      if (s.again) { s.again = false; nudge(id, 300); }
    }
  })();
  return s.busy;
}

/* A push soon. Called after every save of a linked profile. */
export function nudge(id, delay = PUSH_DELAY_MS) {
  const s = slot(id);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => { s.timer = null; syncNow(id); }, delay);
}

/* Settings → Sync on: open an account for this profile and push everything. */
export async function enableSync(id, name) {
  const cfg = config();
  if (!cfg) return { ok: false, reason: "unconfigured" };
  const got = await ensureToken(cfg.base);
  if (got.error) return got.error;
  const repo = await profileRepo(id);
  const r = await linkNew({ repo, call, token: got.token, name });
  if (r.error) return r.error;
  tell(id, { state: "syncing" });
  return syncNow(id);
}

export async function disableSync(id) {
  const s = slot(id);
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  const repo = await profileRepo(id);
  await unlink(repo);
  tell(id, { state: "idle", error: null, lastAt: null });
}

export async function pairComputer(id, code, name) {
  const repo = await profileRepo(id);
  return claimCode({ repo, call, code, name });
}
export async function devicesOf(id) {
  const repo = await profileRepo(id);
  return listDevices({ repo, call });
}
export async function removeDevice(id, device) {
  const repo = await profileRepo(id);
  return revokeDevice({ repo, call, device });
}

/* The profile on screen, told by session.js, so a pull on coming forward
   knows whose link to read. */
let activeId = null;
export const setActiveProfile = (id) => { activeId = id || null; };

/* Wire the triggers once, from App.js: a push after a save, a pull on
   coming forward. Returns the undo, for the tests. */
let wired = null;
export function startSync() {
  if (wired) return wired;
  const offWrote = onWrote(async (id) => {
    if (await syncLink(id)) nudge(id);
  });
  const sub = AppState.addEventListener("change", async (state) => {
    if (state !== "active") return;
    const id = activeId;
    if (!id) return;
    const s = slot(id);
    if (Date.now() - s.lastPull < FOREGROUND_PULL_MS) return;
    if (await syncLink(id)) syncNow(id);
  });
  wired = () => { offWrote(); sub.remove(); wired = null; };
  return wired;
}

/* When a profile is opened: pull once if it is linked. */
export async function syncOnOpen(id) {
  if (id && (await syncLink(id))) return syncNow(id);
  return null;
}

export { applyOps };
