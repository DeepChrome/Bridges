/* The device's half of sync (core/sync.js), with the platform handed in.
 *
 * Both the phone and the desktop run exactly this: read the outbox, push it
 * in chunks, pull what other devices changed, apply it where newer, move the
 * cursor. What differs — how a request is sent, where the repository's file
 * is, when to run — is given as arguments, so the two cannot drift
 * (§20a: when logic belongs to both, it goes in core/).
 *
 *   call(route, body, token) -> the Worker's JSON reply, or { ok: false,
 *                               reason } the way native/src/lib/feedback.js
 *                               `send` answers; never throws.
 *   repo                     the repository (core/repo.js contract, with
 *                               the sync methods core/sqlrepo.js adds).
 *
 * The profile's link to its account is one meta row, `sync`, holding
 * { account, device, token, cursor, lastAt, name }. No row: the profile does
 * not sync. The token is the device's own (s1.<account>.<secret>) and is
 * kept in the profile's database rather than beside the install token,
 * because it is the *profile* that is synced: two profiles on one phone are
 * two accounts.
 */

import { PROTOCOL } from "./sync.js";

export const META_KEY = "sync";
/* Ops a push carries at most (the Worker's PUSH_MAX is 2000). */
export const CHUNK = 1000;

export async function readLink(repo) {
  try {
    const raw = await repo.getMeta(META_KEY);
    const link = raw ? JSON.parse(raw) : null;
    return link && link.token ? link : null;
  } catch (e) {
    return null;
  }
}

export const writeLink = (repo, link) => repo.setMeta(META_KEY, JSON.stringify(link));

/* Open an account for this profile and make this device its first. `token`
   is the install's (the Worker admits it as any registered install); the
   reply's token is the device's, and is what the link keeps. The whole store
   is then queued for the first push: every row it holds, stamped as the row
   clock knows it or `now` where it never recorded one. Returns the link, or
   { error }. */
export async function linkNew({ repo, call, token, name, now = Date.now() }) {
  const r = await call("/v1/sync/account", { name }, token);
  if (r.ok !== true || typeof r.token !== "string") return { error: r.ok === true ? { ok: false, reason: "parse" } : r };
  const link = { account: r.account, device: r.device, token: r.token, cursor: 0, lastAt: null, name };
  await writeLink(repo, link);
  await queueAll(repo, now);
  return { link };
}

/* Join an account another device already holds, with a token handed over by
   pairing. Nothing of this device's is pushed first: the account is the
   truth and the first sync pulls it. What this device held before is kept
   only where the account has no row for it (its rows are stamped and
   queued, so a word met only here still arrives). */
export async function linkExisting({ repo, token, name, now = Date.now() }) {
  const link = { account: null, device: null, token, cursor: 0, lastAt: null, name };
  await writeLink(repo, link);
  await queueAll(repo, now);
  return { link };
}

export async function unlink(repo) {
  await repo.delMeta(META_KEY);
  await repo.clearOutbox();
}

/* Every row the store holds, into the outbox: `allOps` is the whole store,
   each row stamped with the clock it last changed at, or `now` where the
   store never recorded one (a profile from before sync). */
async function queueAll(repo, now) {
  const ops = await repo.allOps(now);
  if (ops.length) await repo.queueOutbox(ops);
}

/* One round: push the outbox, pull the rest, apply, advance. Returns
   { ok, pushed, taken, link } or { ok: false, reason, status } with the
   Worker's words. `taken` are the ops applied here — what the caller folds
   into its memory with core/sync.js `applyOps`. */
export async function syncOnce({ repo, call, now = Date.now() }) {
  const link = await readLink(repo);
  if (!link) return { ok: false, reason: "unlinked" };
  let pushed = 0;
  const taken = [];
  let cursor = link.cursor || 0;
  // Push, a chunk at a time, clearing exactly what each chunk carried.
  for (;;) {
    const ops = await repo.readOutbox(CHUNK);
    if (!ops.length) break;
    const r = await call("/v1/sync", { protocol: PROTOCOL, cursor, ops }, link.token);
    if (r.ok !== true) return failed(r);
    await repo.clearOutbox(ops);
    pushed += ops.length;
    const got = await repo.applyOps(r.ops || []);
    taken.push(...got);
    cursor = r.cursor;
    if (r.more) {
      // A page of the others' changes came back with the push; drain it.
      const rest = await pullAll({ repo, call, link, cursor });
      if (!rest.ok) return rest;
      taken.push(...rest.taken);
      cursor = rest.cursor;
    }
    if (ops.length < CHUNK) break;
  }
  // Nothing to push, or the push has moved the cursor: pull what is left.
  const pulled = await pullAll({ repo, call, link, cursor });
  if (!pulled.ok) return pulled;
  taken.push(...pulled.taken);
  cursor = pulled.cursor;
  const next = { ...link, cursor, lastAt: now };
  await writeLink(repo, next);
  return { ok: true, pushed, taken, link: next };
}

/* Pages until the server says there is no more (and never past a bound no
   real account reaches, so a server that always says `more` cannot hold a
   device for ever). */
async function pullAll({ repo, call, link, cursor }) {
  const taken = [];
  let c = cursor, pages = 0;
  for (;;) {
    const r = await call("/v1/sync", { protocol: PROTOCOL, cursor: c, ops: [] }, link.token);
    if (r.ok !== true) return failed(r);
    taken.push(...(await repo.applyOps(r.ops || [])));
    c = r.cursor;
    pages++;
    if (!r.more || pages > 200) break;
  }
  return { ok: true, taken, cursor: c };
}

const failed = (r) => ({ ok: false, reason: r.reason || "http", status: r.status, message: r.message, detail: r.detail });

/* Pairing, from the phone's side: claim the code the computer shows. */
export async function claimCode({ repo, call, code, name }) {
  const link = await readLink(repo);
  if (!link) return { ok: false, reason: "unlinked" };
  return call("/v1/pair/claim", { code: String(code || "").trim(), name: name || "Computer" }, link.token);
}

export async function listDevices({ repo, call }) {
  const link = await readLink(repo);
  if (!link) return { ok: false, reason: "unlinked" };
  return call("/v1/sync/devices", {}, link.token);
}

export async function revokeDevice({ repo, call, device }) {
  const link = await readLink(repo);
  if (!link) return { ok: false, reason: "unlinked" };
  return call("/v1/sync/devices", { revoke: device }, link.token);
}

/* Pairing, from the computer's side: ask for a code, then collect the token
   once the phone has claimed it. `wait` resolves to { status: "waiting" } or
   { status: "claimed", token } or { ok: false }. */
export const startPairing = ({ call }) => call("/v1/pair/start", {}, null);
export const waitPairing = ({ call, code, secret }) => call("/v1/pair/wait", { code, secret }, null);
