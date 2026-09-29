/* The Bridges Worker (ROADMAP Phases 4 and 6).
 *
 * Model routes, one job each. POST /v1/feedback grades one spoken sentence;
 * POST /v1/talk takes the tutor's turn in a short conversation; POST /v1/translate reads a sentence back in the
 * other language; POST /v1/explain says why a wrong answer was wrong; POST
 * /v1/tutor is the free conversation with a tutor who knows the learner
 * (2026-09-26). All hold the Anthropic key so the app
 * never does, check the caller's bearer token, refuse past a daily cap of their
 * own, ask the model, validate the reply against a schema (retrying once), and
 * log token counts to KV. POST /v1/register is the one route without a token:
 * it is where an install gets one (ROADMAP 13.39). That is all this Worker does.
 *
 * What it never does: store audio (none is sent — the app sends a transcript),
 * store learner state or a conversation (the app sends the whole exchange each
 * turn), or keep anything beyond the day's counters, the token records and the
 * token log.
 *
 * `handle` takes its dependencies as arguments so the tests run it in plain Node
 * with a fake KV and a fake fetch; the default export is what Cloudflare calls.
 */

import { validate, extractJson } from "./schema.js";
import { SYSTEM, userMessage, RETRY_NUDGE } from "./prompt.js";
import { SYSTEM_TALK, talkMessage, validateTalk, SYSTEM_HINT, hintMessage, validateHint,
         SYSTEM_REVIEW, reviewMessage, validateReview } from "./talk.js";
import { SYSTEM_TRANSLATE, SYSTEM_TRANSLATE_EN, translateMessage, validateTranslate, direction } from "./translate.js";
import { SYSTEM_EXPLAIN, explainMessage, validateExplain } from "./explain.js";
import { SYSTEM_TUTOR, tutorMessage, validateTutor } from "./tutor.js";
import { capsFor, planOf, COUNTER_OF, PLANS, PLAN_NAMES } from "../../core/plans.js";

const API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const UPSTREAM_TIMEOUT_MS = 15000;
const DEFAULT_CAP = 300;
const DEFAULT_TALK_CAP = 240;         // a runaway backstop, not a budget (was 3 sessions of 12)
const DAY_TTL = 60 * 60 * 48;

/* Registration (ROADMAP 13.39). A public build carries no token at all: the
   first time it needs the Worker it asks here, and what it gets is an ordinary
   KV user record — the shape tools/user.mjs writes by hand — with the caps a
   stranger is given. Anyone can call it, by definition, so three limits stand
   where the bearer token would: registrations per address per day,
   registrations per day in all, and GLOBAL_DAILY_CAP (DEFAULT_GLOBAL_CAP here),
   which bounds what every registered install together can spend whatever
   the number of tokens. The
   owner's own token is outside that ceiling: it is his budget, not theirs.
   At Haiku's prices a model call is a fraction of a cent, so the default
   ceiling is a few dollars a day at the very worst. */
const REGISTER_IP_CAP = 5;
const REGISTER_DAILY_CAP = 100;
/* **A day's worth of real use, not a taste of it** (2026-09-26). These were
   100 and 60, set when a "turn" meant one scenario exchange somebody typed
   into. Conversation mode spends a talk turn every time the learner stops
   speaking, so the owner hit 60 inside one sitting and was told to come back
   tomorrow — on his own app, because a public build carries no owner token
   and registers as a stranger like anyone else (13.39). The per-user numbers
   are friction, not the budget: `GLOBAL_DAILY_CAP` below is what actually
   bounds the bill, and at Haiku's prices it is a few dollars a day at the
   very worst. */
/* **Since 2026-09-29 a registered install has a plan** (core/plans.js): Free
   is a taste of each AI feature a day, Premium a day's real use, priced off
   this Worker's own token log. A record's `plan` decides its caps whenever it
   is read — so a change to the plan table reaches every install at once, the
   lesson of the stale caps above — and a record with none is Free. */
export const REGISTERED_CAPS = capsFor("free");
const DEFAULT_GLOBAL_CAP = 1500;

/* A token minted by hand before plans kept caps under the two old names:
   `feedback` covered every short call and `talk` every conversational one.
   Read into the new counters rather than silently dropped to Free. */
function legacyCaps(caps) {
  if (!caps) return null;
  if (!("feedback" in caps || "talk" in caps) || "conversation" in caps) return caps;
  const short = caps.feedback, talk = caps.talk;
  return { conversation: talk, review: talk, explain: short, feedback: short, translate: short };
}

const envInt = (v, dflt) => parseInt(v, 10) || dflt;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

const dayKey = (now) => now.toISOString().slice(0, 10);

/* Constant-time-enough comparison for a bearer token: lengths differ → false
   without comparing; same length → every byte is compared. */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* Who is calling (ROADMAP P8.4). The owner's APP_TOKEN secret is one user; any
   other bearer token is looked up in KV under `user:<token>`, written there by
   backend/tools/user.mjs as { id, caps: { feedback, talk }, revoked }. A revoked
   record refuses like an unknown one; deleting the key does the same. Nothing
   else is stored about a user — the counters and the token log carry the id. */
const MIN_TOKEN = 16;
async function identify(given, env) {
  if (env.APP_TOKEN && tokenMatches(given, env.APP_TOKEN)) return { id: "owner", caps: null, plan: "owner" };
  if (!given || given.length < MIN_TOKEN) return null;
  let rec = null;
  try { rec = JSON.parse((await env.USAGE.get(`user:${given}`)) || "null"); } catch (e) { rec = null; }
  if (!rec || rec.revoked || !rec.id) return null;
  /* **A registered install follows the current policy, not the policy it was
     minted under.** The caps are written into the record at registration, so
     raising them only reached installs that registered afterwards — the
     owner's phone kept the 60 talk turns it was given in September and went
     on being refused after the limit was raised (2026-09-26). A token minted
     by hand (backend/tools/user.mjs) keeps the caps it was given, because
     those were chosen for that person. */
  if (rec.plan || rec.via === "register") {
    const plan = planOf(rec.plan);
    return { id: String(rec.id), caps: capsFor(plan), plan };
  }
  return { id: String(rec.id), caps: legacyCaps(rec.caps || null), plan: "custom" };
}

/* One daily counter: read, compare, write. Not atomic, which is fine for a
   phone or a few and wrong for a fleet; every cap here is a backstop against a
   bug in a loop or a scripted abuser, not a billing system. Returns whether
   the request is under the cap; over it, nothing is written. */
async function tick(env, key, cap) {
  const count = parseInt(await env.USAGE.get(key), 10) || 0;
  if (count >= cap) return false;
  await env.USAGE.put(key, String(count + 1), { expirationTtl: DAY_TTL });
  return true;
}

/* Web Crypto's randomness, base64url so the token is one bearer word. 24
   bytes → 32 characters, twice MIN_TOKEN; the same length user.mjs mints. */
function randomWord(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function register(request, env, now) {
  const day = dayKey(now);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await tick(env, `reg:${day}:${ip}`, envInt(env.REGISTER_IP_CAP, REGISTER_IP_CAP)))) {
    return json(429, { ok: false, reason: "cap", message: "Too many new installs from this address today." });
  }
  if (!(await tick(env, `reg:${day}`, envInt(env.REGISTER_DAILY_CAP, REGISTER_DAILY_CAP)))) {
    return json(429, { ok: false, reason: "cap", message: "No more new installs today." });
  }
  const token = randomWord(24);
  /* The id is its own random word, not a piece of the token: it rides in
     every log line for thirty days and the token must not. */
  const rec = { id: `app-${randomWord(6)}`, plan: "free", created: day, via: "register" };
  await env.USAGE.put(`user:${token}`, JSON.stringify(rec));
  await logUsage(env, day, now, { kind: "register", user: rec.id });
  return json(200, { ok: true, token });
}

async function askModel(fetchFn, env, system, messages, maxTokens) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetchFn(API, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        /* The system prompt is the same on every request of a route and is the
           larger half of the input, so it is marked cacheable: the model reads
           it once and reuses it for five minutes, which takes time off the front
           of every turn and cost off all of them. Below the provider's minimum
           length it simply does not cache — there is no error and nothing to
           handle. Sent as a block rather than a string only because that is
           where `cache_control` can be attached. */
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) return { error: `upstream ${r.status}`, status: r.status };
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    return { text, usage: body.usage || {}, stop: body.stop_reason || null };
  } catch (e) {
    return { error: e.name === "AbortError" ? "upstream timeout" : `upstream ${e.message || e}` };
  } finally {
    clearTimeout(timer);
  }
}

/* The two routes differ in prompt, reply shape, cap and token budget — nothing
   else. `validate` gets the parsed JSON and returns { ok, value | errors }. */
const ROUTES = {
  "/v1/feedback": {
    kind: "feedback", counter: "count", cap: (env) => parseInt(env.DAILY_CAP, 10) || DEFAULT_CAP,
    maxTokens: 400, system: SYSTEM,
    check: (b) => typeof b.transcript === "string" && typeof b.target === "string" && b.target.trim()
      ? null : "transcript and target are required",
    message: (b) => userMessage(b),
    validate: (parsed) => validate(parsed),
    capMessage: (cap) => `Daily feedback limit of ${cap} reached; resets at 00:00 UTC.`,
  },
  "/v1/talk": {
    kind: "talk", counter: "talk", cap: (env) => parseInt(env.TALK_DAILY_CAP, 10) || DEFAULT_TALK_CAP,
    /* The reply alone: no grading, no marking. ~200 output tokens where the
       combined turn was ~700, and output tokens are the whole of the wait. */
    maxTokens: 500, system: SYSTEM_TALK,
    check: (b) => typeof b.scenario === "string" && b.scenario.trim() ? null : "scenario is required",
    message: (b) => talkMessage(b),
    validate: (parsed, b) => validateTalk(parsed, b.studied, b.level),
    capMessage: (cap) => `Daily conversation limit of ${cap} turns reached; resets at 00:00 UTC.`,
    /* Two variants of the same turn, same route, same counter.
       `hint: true` — one thing the learner could say next.
       `review: true` — the learner's own turn graded, which the app asks for at
       the same time as the reply rather than after it (talk.js). */
    variant: (b) => (b.hint ? {
      kind: "hint", maxTokens: 200, system: SYSTEM_HINT,
      message: (x) => hintMessage(x), validate: (parsed) => validateHint(parsed),
    } : b.review ? {
      kind: "review", maxTokens: 700, system: SYSTEM_REVIEW,
      message: (x) => reviewMessage(x), validate: (parsed) => validateReview(parsed),
    } : null),
  },
  /* Speak Russian, read it back in English (2026-09-22). It shares the feedback
     counter and cap rather than taking one of its own — one more budget to
     reason about buys nothing — and it is the cheapest route here: one short
     sentence in, one short sentence out. (POST /v1/task, the chapter task,
     stood above this until 2026-09-28, when the task left the app.) */
  "/v1/translate": {
    kind: "translate", counter: "count", cap: (env) => parseInt(env.DAILY_CAP, 10) || DEFAULT_CAP,
    maxTokens: 300, system: SYSTEM_TRANSLATE,
    check: (b) => ((typeof b.ru === "string" && b.ru.trim()) || (typeof b.en === "string" && b.en.trim())
      ? null : "ru or en is required"),
    message: (b) => translateMessage(b),
    validate: (parsed) => validateTranslate(parsed, "en"),
    capMessage: (cap) => `Daily limit of ${cap} reached; resets at 00:00 UTC.`,
    /* The other way round (2026-09-23): English in, Russian out, for the
       Russian speaker on the other side of the phone. Same counter. */
    variant: (b) => (direction(b) === "en" ? {
      system: SYSTEM_TRANSLATE_EN, validate: (parsed) => validateTranslate(parsed, "ru"),
    } : null),
  },
  /* Why a wrong answer was wrong (2026-09-26, explain.js). The feedback
     counter again: a learner misses a dozen questions in a sitting, not a
     hundred, and the cap is a backstop, not a budget. */
  "/v1/explain": {
    kind: "explain", counter: "count", cap: (env) => parseInt(env.DAILY_CAP, 10) || DEFAULT_CAP,
    maxTokens: 250, system: SYSTEM_EXPLAIN,
    check: (b) => (typeof b.answer === "string" && b.answer.trim() && typeof b.ask === "string"
      ? null : "ask and answer are required"),
    message: (b) => explainMessage(b),
    validate: (parsed) => validateExplain(parsed),
    capMessage: (cap) => `Daily limit of ${cap} reached; resets at 00:00 UTC.`,
  },
  /* The free conversation with a tutor who is handed the learner's standing
     (tutor.js). It counts as talk: a turn of it is a turn of the tutor's time,
     whichever screen asked. */
  "/v1/tutor": {
    kind: "tutor", counter: "talk", cap: (env) => parseInt(env.TALK_DAILY_CAP, 10) || DEFAULT_TALK_CAP,
    maxTokens: 700, system: SYSTEM_TUTOR,
    check: (b) => (typeof b.text === "string" && Array.isArray(b.history) ? null : "text and history are required"),
    message: (b) => tutorMessage(b),
    validate: (parsed) => validateTutor(parsed),
    capMessage: (cap) => `Daily conversation limit of ${cap} turns reached; resets at 00:00 UTC.`,
  },
};

export async function handle(request, env, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now ? deps.now() : new Date();
  const url = new URL(request.url);

  let route = ROUTES[url.pathname];
  const special = url.pathname === "/v1/register" || url.pathname === "/v1/plan";
  if (!route && !special) return json(404, { ok: false, reason: "not found" });
  if (request.method !== "POST") return json(405, { ok: false, reason: "method" });
  if (url.pathname === "/v1/register") return register(request, env, now);

  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const user = await identify(given, env);
  if (!user) return json(401, { ok: false, reason: "unauthorised" });
  /* What this install may do today and what it has done: the plan's caps and
     today's counters, read and never ticked, and no model call. The app
     shows it in Settings (2026-09-29). */
  if (url.pathname === "/v1/plan") {
    const day = dayKey(now);
    const used = {};
    for (const counter of Object.keys(PLANS.free)) {
      used[counter] = parseInt(await env.USAGE.get(`${counter}:${day}:${user.id}`), 10) || 0;
    }
    return json(200, { ok: true, plan: user.plan, caps: user.caps, used });
  }
  if (!env.ANTHROPIC_API_KEY) return json(503, { ok: false, reason: "no upstream key" });

  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  const problem = body && typeof body === "object" ? route.check(body) : "a JSON body is required";
  if (problem) return json(400, { ok: false, reason: problem });
  if (route.variant) route = { ...route, ...(route.variant(body) || {}) };

  // Cost guard: one counter per route per user per UTC day, and over every
  // user but the owner one more — the ceiling on what strangers can spend.
  // The user's own cap is checked first so a learner past it never consumes
  // the shared allowance.
  /* `||` here read a cap of **0** as "not set" and handed out the default,
     so the one way to say "this token may do nothing" quietly said the
     opposite (found 2026-09-26 by the test for stale caps). A number is a
     number, including zero. */
  /* The counter a route spends is the plan's (core/plans.js COUNTER_OF): a
     Talk turn, a hint and a tutor turn are all conversation. */
  const counter = COUNTER_OF[route.kind] || route.kind;
  const own = user.caps ? user.caps[counter] : undefined;
  const cap = Number.isFinite(own) ? own : route.cap(env);
  const day = dayKey(now);
  if (!(await tick(env, `${counter}:${day}:${user.id}`, cap))) {
    /* On a plan, the refusal says which plan and how much it allows, so the
       app can say it plainly and offer what comes next. */
    const onPlan = user.plan === "free" || user.plan === "premium";
    return json(429, { ok: false, reason: "cap", plan: user.plan, counter, cap,
                       message: onPlan
                         ? `${PLAN_NAMES[user.plan]} plan: ${cap} a day. Resets at 00:00 UTC.`
                         : route.capMessage(cap) });
  }
  if (user.id !== "owner" && !(await tick(env, `all:${day}`, envInt(env.GLOBAL_DAILY_CAP, DEFAULT_GLOBAL_CAP)))) {
    return json(429, { ok: false, reason: "cap", message: "The tutor has had a busy day; resets at 00:00 UTC." });
  }

  const messages = [{ role: "user", content: route.message(body) }];
  let tokensIn = 0, tokensOut = 0, result = null, lastErrors = null;
  /* Three tries, not two (2026-09-24). A conversational turn came back
     "malformed" often enough for the owner to see it: the reply's tokens not
     matching the reply word for word, mostly. A nudge fixes it more often than
     not, and a third try costs a fraction of a cent against a dead turn. */
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    const reply = await askModel(fetchFn, env, route.system, messages, route.maxTokens);
    if (reply.error) {
      await logUsage(env, day, now, { kind: route.kind, user: user.id, error: reply.error, attempt });
      return json(502, { ok: false, reason: "upstream", detail: reply.error });
    }
    tokensIn += reply.usage.input_tokens || 0;
    tokensOut += reply.usage.output_tokens || 0;
    const parsed = extractJson(reply.text);
    // A reply cut at the token limit is a length problem, and the nudge should
    // say so; it must not be filed under "no JSON" where it looks like a format slip.
    const v = reply.stop === "max_tokens"
      ? { ok: false, errors: [`reply cut off at ${route.maxTokens} tokens; answer more briefly`] }
      : parsed ? route.validate(parsed, body) : { ok: false, errors: ["no JSON object in reply"] };
    if (v.ok) result = v.value;
    else {
      lastErrors = v.errors;
      messages.push({ role: "assistant", content: reply.text || "" });
      messages.push({ role: "user", content: RETRY_NUDGE + " Problems: " + v.errors.slice(0, 4).join("; ") });
    }
  }

  await logUsage(env, day, now, { kind: route.kind, user: user.id, in: tokensIn, out: tokensOut,
                                  model: env.MODEL, parsed: !!result });
  if (!result) return json(200, { ok: false, reason: "parse", errors: lastErrors });
  return json(200, { ok: true, ...result });
}

/* Per-request line plus a running daily total per route, so cost per request can
   be read off KV without a dashboard. */
async function logUsage(env, day, now, entry) {
  const line = { ts: now.toISOString(), ...entry };
  await env.USAGE.put(`log:${day}:${now.getTime()}`, JSON.stringify(line),
                      { expirationTtl: DAY_TTL * 15 });
  if (typeof entry.in === "number") {
    const key = `tokens:${day}:${entry.kind}`;
    const cur = JSON.parse((await env.USAGE.get(key)) || "{\"in\":0,\"out\":0,\"n\":0}");
    cur.in += entry.in; cur.out += entry.out; cur.n += 1;
    await env.USAGE.put(key, JSON.stringify(cur), { expirationTtl: DAY_TTL * 15 });
  }
}

export default {
  fetch: (request, env) => handle(request, env),
};
