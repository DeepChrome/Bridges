/* The app's side of the feedback Worker (ROADMAP P4.7).
 *
 * getFeedback() sends a spoken attempt — transcript, target, unit, lemmas; never
 * audio — to backend/ and returns the validated feedback, or { ok: false, reason }
 * with one of: "unconfigured" (no Worker URL in the build), "offline" (the request
 * never reached a server), "timeout" (8 s), "http" (the Worker refused: bad token,
 * daily cap, upstream down), "parse" (the Worker could not get a well-formed reply).
 * It never throws: a Say step calls it after its local verdict and shows nothing
 * extra on any failure, so the worst case is the same screen as offline.
 *
 * The Worker's address is EXPO_PUBLIC_FEEDBACK_URL, inlined by Expo at bundle
 * time from native/.env (gitignored; see .env.example) or, for EAS builds, from
 * the profile's environment variables. A build with no address has no tutor.
 *
 * The token is this install's own (ROADMAP 13.39). A public build ships none:
 * the first request that needs one asks the Worker's /v1/register for it and
 * keeps it on this device, per install rather than per profile, since it is
 * the phone the Worker is admitting and not the learner. A build may instead
 * carry EXPO_PUBLIC_APP_TOKEN — the owner's, on his own phone — and then no
 * registration happens; that variable must never be set for a build that
 * leaves the machine, because it is compiled in as plain text.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const TIMEOUT_MS = 8000;
export const TALK_TIMEOUT_MS = 20000;   // a conversational turn is longer

const TOKEN_KEY = "rb.worker.token";
let installToken = null;      // this install's, once read or minted
let obtaining = null;         // the read-or-register in flight, shared by concurrent callers

/* Whether this build knows a Worker, and the token if one is already to hand.
   The screens read this synchronously to decide whether to offer the tutor at
   all, so it answers from the address alone: a token is a request-time detail
   and a failure to get one is reported by the request, as offline is. */
export function config(route = "/v1/feedback") {
  const base = (process.env.EXPO_PUBLIC_FEEDBACK_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const token = process.env.EXPO_PUBLIC_APP_TOKEN || installToken || null;
  return { url: base + route, base, token };
}

/* Fetch the token before the first Say asks for it, so that step waits on one
   round trip rather than two. Nothing to do without an address, and nothing
   is reported: a failure here is retried by the first request that needs it. */
export function warmToken(deps = {}) {
  const cfg = config();
  if (cfg && !cfg.token) ensureToken(cfg.base, deps);
}

/* Drop the install's token, on device and in memory. Used when the Worker no
   longer knows it — a wiped namespace, a revoked record — so the next request
   registers afresh instead of failing for ever; and by the tests. */
export async function forgetToken() {
  installToken = null;
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch (e) { /* nothing to keep anyway */ }
}

/* The stored token, or a newly minted one. Resolves to { token } or to
   { error } in the shape post() returns, never rejects. Concurrent callers —
   a Say step and a warm-up — share one attempt. */
export function ensureToken(base, deps = {}) {
  if (installToken) return Promise.resolve({ token: installToken });
  if (!obtaining) obtaining = obtain(base, deps).finally(() => { obtaining = null; });
  return obtaining;
}

async function obtain(base, deps) {
  /* Storage is a cache of what the Worker issued: unreadable, the token is
     minted again and the old record simply goes unused. */
  let saved = null;
  try { saved = await AsyncStorage.getItem(TOKEN_KEY); } catch (e) { saved = null; }
  if (saved) { installToken = saved; return { token: saved }; }

  const r = await send(base + "/v1/register", {}, null, deps, TIMEOUT_MS);
  /* One line in logcat either way, like [store]'s: a registration that fails
     is otherwise invisible until a Say step has nothing to show. */
  if (r.ok !== true) {
    console.log(`[worker] registration failed: ${r.reason}${r.status ? " " + r.status : ""}`);
    return { error: r };
  }
  if (typeof r.token !== "string" || !r.token) return { error: { ok: false, reason: "parse" } };
  console.log("[worker] registered");
  installToken = r.token;
  try { await AsyncStorage.setItem(TOKEN_KEY, r.token); } catch (e) { /* re-minted next launch */ }
  return { token: r.token };
}

export async function getFeedback({ transcript, target, unitId, topic, lemmas }, deps = {}) {
  return post({ transcript, target, unitId, topic: topic || null, lemmas: lemmas || [] },
              deps, "/v1/feedback", TIMEOUT_MS);
}

/* The tutor's turn (ROADMAP P6.2). The whole exchange goes every time; the Worker
   keeps nothing. Same failure reasons as getFeedback. */
/* One thing the learner could say next. Same route as a turn, `hint: true`. */
export async function hint({ scenario, studied, history, level }, deps = {}) {
  return post({ scenario, studied: studied || [], history: history || [],
                level: level || "intermediate", hint: true },
              deps, "/v1/talk", TALK_TIMEOUT_MS);
}

/* The marking half of a turn, asked at the same time as the reply (§30f). It
   carries no studied list and no grammar topic: those pitch the tutor's Russian,
   not its marking, and every token left out is time the learner does not wait. */
export async function review({ scenario, history, transcript, level }, deps = {}) {
  return post({ scenario, history: history || [], transcript: transcript || "",
                level: level || "intermediate", review: true },
              deps, "/v1/talk", TALK_TIMEOUT_MS);
}

export async function talk({ scenario, topic, studied, history, transcript, level }, deps = {}) {
  return post({ scenario, topic: topic || null, studied: studied || [], history: history || [],
                transcript: transcript || "", level: level || "intermediate" },
              deps, "/v1/talk", TALK_TIMEOUT_MS);
}

/* The chapter-end task (ROADMAP P10.5). Marked against the requirements the
   task itself sets and the words this learner has actually been taught, so a
   chapter-2 attempt is never faulted for the vocabulary of chapter 7. Given the
   same budget as a conversational turn: the model is reading a paragraph and
   judging two or three things about it, not one sentence. */
export async function markTask({ goal, must, attempt, studied, chapter }, deps = {}) {
  return post({ goal, must: must || [], attempt, studied: (studied || []).slice(0, 300),
                chapter: chapter || null },
              deps, "/v1/task", TALK_TIMEOUT_MS);
}

/* One spoken sentence, read back in English (2026-09-22). The phone does the
   hearing on-device and sends text, as everything else here does; the answer
   is { en, note }. Short in and short out, so the ordinary timeout is right —
   a conversational turn's twenty seconds would only make a failure slower. */
export async function translate({ ru, en }, deps = {}) {
  /* One field or the other: Russian in for `{ en }` back, English in for
     `{ ru }` back (the interpreter, 2026-09-23). */
  return post(ru ? { ru } : { en }, deps, "/v1/translate", TIMEOUT_MS);
}

async function post(body, deps, route, timeoutMs, retried = false) {
  const cfg = deps.config || config(route);
  if (!cfg) return { ok: false, reason: "unconfigured" };
  let token = cfg.token;
  if (!token) {
    const got = await ensureToken(cfg.base, deps);
    if (got.error) return got.error;
    token = got.token;
  }
  const r = await send(cfg.url, body, token, deps, deps.timeoutMs || timeoutMs);
  /* The Worker does not know this install's token any more. Once: forget it,
     register again and resend, so a wiped namespace costs nobody a turn. A
     build's own token is not ours to replace. */
  if (r.reason === "http" && r.status === 401 && token === installToken && !retried) {
    await forgetToken();
    return post(body, deps, route, timeoutMs, true);
  }
  return r;
}

async function send(url, body, token, deps, timeoutMs) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetchFn(url, { method: "POST", signal: ctl.signal, headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) return { ok: false, reason: "http", status: r.status, detail: data && data.reason };
    if (!data || typeof data !== "object") return { ok: false, reason: "parse" };
    if (data.ok !== true) return { ok: false, reason: data.reason || "parse" };
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, reason: "timeout" };
    // React Native's fetch rejects with "Network request failed" when there is no
    // route to the host, which is the offline case without a connectivity module.
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
