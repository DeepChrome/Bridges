/* Sync on the desktop: core/syncclient.js run from the main process.
 *
 * The desktop joins a profile by **pairing**: it asks the Worker for a code,
 * shows it, and polls until the phone has claimed it (Settings → Sync → Pair
 * a computer on the phone); the token that comes back is a device of the
 * phone's account, and the first round pulls the whole profile. A computer
 * with no phone can also start a profile of its own and link it the way the
 * phone does (`linkFresh`).
 *
 * Triggers, as on the phone: a push a few seconds after a save, a pull when
 * the window regains focus, and a slow pull while it has it. Pulled ops are
 * written by the client and sent to the renderer (`sync:pulled`), which folds
 * them into the state on screen.
 */

import { hostname } from "node:os";
import { syncOnce, readLink, linkExisting, linkNew, unlink, startPairing, waitPairing,
         listDevices, revokeDevice, claimCode } from "@core/syncclient";
import { PAIR_TTL_MS } from "@core/sync";
import { repoFor, loadSettings, saveSettings } from "./profiles.js";

const DEFAULT_WORKER = "https://bridges-feedback.bridges-feedback.workers.dev";
export const PUSH_DELAY_MS = 2500;
export const IDLE_PULL_MS = 60 * 1000;
const TIMEOUT_MS = 35000;

export const workerBase = () => (loadSettings().worker || process.env.YA_WORKER_URL || DEFAULT_WORKER).replace(/\/+$/, "");

/* The one request wrapper, in the shape the phone's `send` answers. */
export async function call(route, body, token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(workerBase() + route, { method: "POST", signal: ctl.signal, headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      return { ok: false, reason: "http", status: r.status, detail: data && data.reason, message: data && data.message,
               resetsAt: data && data.resetsAt };
    }
    if (!data || typeof data !== "object") return { ok: false, reason: "parse" };
    if (data.ok !== true) return { ok: false, reason: data.reason || "parse" };
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/* This computer's install token, for opening an account of its own. */
async function installToken() {
  const s = loadSettings();
  if (s.installToken) return { token: s.installToken };
  const r = await call("/v1/register", {}, null);
  if (r.ok !== true || typeof r.token !== "string") return { error: r };
  saveSettings({ installToken: r.token });
  return { token: r.token };
}

const deviceName = () => `${hostname()} (Windows)`;

/* Per profile: the run in flight, a queued one, the push timer, status. */
const slots = new Map();
const slot = (id) => {
  if (!slots.has(id)) slots.set(id, { busy: null, again: false, timer: null, status: { state: "idle" } });
  return slots.get(id);
};
let notify = () => {};
export const onEvent = (fn) => { notify = fn; };
const tell = (id, status) => {
  const s = slot(id);
  s.status = { ...s.status, ...status, at: Date.now() };
  notify("sync:status", id, s.status);
};
export const status = (id) => slot(id).status;
export const link = async (id) => readLink(await repoFor(id));

export async function syncNow(id) {
  const s = slot(id);
  if (s.busy) { s.again = true; return s.busy; }
  s.busy = (async () => {
    try {
      const repo = await repoFor(id);
      if (!(await readLink(repo))) return { ok: false, reason: "unlinked" };
      tell(id, { state: "syncing" });
      const r = await syncOnce({ repo, call });
      if (r.ok) {
        if (r.taken.length) notify("sync:pulled", id, r.taken);
        tell(id, { state: "ok", lastAt: r.link.lastAt, error: null });
      } else {
        tell(id, { state: "error", error: r });
      }
      return r;
    } catch (e) {
      const r = { ok: false, reason: "error", message: String(e && e.message) };
      tell(id, { state: "error", error: r });
      return r;
    } finally {
      s.busy = null;
      if (s.again) { s.again = false; nudge(id, 300); }
    }
  })();
  return s.busy;
}

export function nudge(id, delay = PUSH_DELAY_MS) {
  const s = slot(id);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    s.timer = null;
    if (await link(id)) syncNow(id);
  }, delay);
}

/* Pairing: a code for the phone, polled until it is claimed or expires.
   `onCode` shows it; resolves { token } or { error }. `cancel()` stops. */
export function pair(onCode) {
  let stopped = false;
  const done = (async () => {
    const start = await startPairing({ call });
    if (start.ok !== true) return { error: start };
    onCode(start.code, start.expiresAt || Date.now() + PAIR_TTL_MS);
    const until = Date.now() + PAIR_TTL_MS;
    while (!stopped && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000));
      if (stopped) break;
      const w = await waitPairing({ call, code: start.code, secret: start.secret });
      if (w.ok === true && w.status === "claimed") return { token: w.token };
      if (w.ok !== true && w.reason !== "offline" && w.reason !== "timeout") return { error: w };
    }
    return { error: { ok: false, reason: stopped ? "cancelled" : "expired" } };
  })();
  return { done, cancel: () => { stopped = true; } };
}

/* A paired token into a profile's database, then the first round. */
export async function joinWithToken(id, token) {
  const repo = await repoFor(id);
  await linkExisting({ repo, token, name: deviceName() });
  return syncNow(id);
}

/* A profile started here, given an account of its own, as the phone does. */
export async function linkFresh(id) {
  const got = await installToken();
  if (got.error) return got.error;
  const repo = await repoFor(id);
  const r = await linkNew({ repo, call, token: got.token, name: deviceName() });
  if (r.error) return r.error;
  return syncNow(id);
}

export async function unlinkProfile(id) {
  const s = slot(id);
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  await unlink(await repoFor(id));
  tell(id, { state: "idle", error: null, lastAt: null });
}

export const devices = async (id) => listDevices({ repo: await repoFor(id), call });
export const revoke = async (id, device) => revokeDevice({ repo: await repoFor(id), call, device });
/* The desktop can pair a *second* computer too, as the phone does. */
export const claim = async (id, code, name) => claimCode({ repo: await repoFor(id), call, code, name });
