/* The Bridges Worker (ROADMAP Phases 4 and 6).
 *
 * Two routes, one job each. POST /v1/feedback grades one spoken sentence;
 * POST /v1/talk takes the tutor's turn in a short conversation. Both hold the
 * Anthropic key so the app never does, check the app's bearer token, refuse past a
 * daily cap of their own, ask the model, validate the reply against a schema
 * (retrying once), and log token counts to KV. That is all this Worker does.
 *
 * What it never does: store audio (none is sent — the app sends a transcript),
 * store learner state or a conversation (the app sends the whole exchange each
 * turn), or keep anything beyond the day's counters and token log.
 *
 * `handle` takes its dependencies as arguments so the tests run it in plain Node
 * with a fake KV and a fake fetch; the default export is what Cloudflare calls.
 */

import { validate, extractJson } from "./schema.js";
import { SYSTEM, userMessage, RETRY_NUDGE } from "./prompt.js";
import { SYSTEM_TALK, talkMessage, validateTalk, SYSTEM_HINT, hintMessage, validateHint } from "./talk.js";
import { SYSTEM_TASK, taskMessage, validateTask } from "./task.js";

const API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const UPSTREAM_TIMEOUT_MS = 15000;
const DEFAULT_CAP = 300;
const DEFAULT_TALK_CAP = 240;         // a runaway backstop, not a budget (was 3 sessions of 12)
const DAY_TTL = 60 * 60 * 48;

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
  if (env.APP_TOKEN && tokenMatches(given, env.APP_TOKEN)) return { id: "owner", caps: null };
  if (!given || given.length < MIN_TOKEN) return null;
  let rec = null;
  try { rec = JSON.parse((await env.USAGE.get(`user:${given}`)) || "null"); } catch (e) { rec = null; }
  if (!rec || rec.revoked || !rec.id) return null;
  return { id: String(rec.id), caps: rec.caps || null };
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
        system,
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
    // A turn is ~700 output tokens with its word-by-word grading; at 600 the
    // JSON was cut short and read as "no JSON" (found on the first live turn).
    maxTokens: 1000, system: SYSTEM_TALK,
    check: (b) => typeof b.scenario === "string" && b.scenario.trim() ? null : "scenario is required",
    message: (b) => talkMessage(b),
    validate: (parsed, b) => validateTalk(parsed, b.studied, b.level),
    capMessage: (cap) => `Daily conversation limit of ${cap} turns reached; resets at 00:00 UTC.`,
    // `hint: true` asks for one thing the learner could say next instead of a
    // turn; same route, same counter, a smaller prompt and reply.
    variant: (b) => (b.hint ? {
      kind: "hint", maxTokens: 200, system: SYSTEM_HINT,
      message: (x) => hintMessage(x), validate: (parsed) => validateHint(parsed),
    } : null),
  },
  /* The task at the end of a chapter (ROADMAP P10.5). It shares the feedback
     counter and cap rather than taking one of its own: a learner does ten of
     these in the life of the whole course, so a separate budget would be a
     knob with nothing on the other end of it. */
  "/v1/task": {
    kind: "task", counter: "count", cap: (env) => parseInt(env.DAILY_CAP, 10) || DEFAULT_CAP,
    maxTokens: 700, system: SYSTEM_TASK,
    check: (b) => (typeof b.goal === "string" && b.goal.trim()
                   && Array.isArray(b.must) && b.must.length
                   && typeof b.attempt === "string" && b.attempt.trim()
      ? null : "goal, must and attempt are required"),
    message: (b) => taskMessage(b),
    validate: (parsed, b) => validateTask(parsed, b.must),
    capMessage: (cap) => `Daily limit of ${cap} reached; resets at 00:00 UTC.`,
  },
};

export async function handle(request, env, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now ? deps.now() : new Date();
  const url = new URL(request.url);

  let route = ROUTES[url.pathname];
  if (!route) return json(404, { ok: false, reason: "not found" });
  if (request.method !== "POST") return json(405, { ok: false, reason: "method" });

  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const user = await identify(given, env);
  if (!user) return json(401, { ok: false, reason: "unauthorised" });
  if (!env.ANTHROPIC_API_KEY) return json(503, { ok: false, reason: "no upstream key" });

  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  const problem = body && typeof body === "object" ? route.check(body) : "a JSON body is required";
  if (problem) return json(400, { ok: false, reason: problem });
  if (route.variant) route = { ...route, ...(route.variant(body) || {}) };

  // Cost guard: one counter per route per user per UTC day. Read, compare, write
  // — not atomic, which is fine for a phone or a few and wrong for a fleet; the
  // cap is a backstop against a bug in a loop, not a billing system.
  const cap = (user.caps && user.caps[route.kind]) || route.cap(env);
  const day = dayKey(now);
  const countKey = `${route.counter}:${day}:${user.id}`;
  const count = parseInt(await env.USAGE.get(countKey), 10) || 0;
  if (count >= cap) return json(429, { ok: false, reason: "cap", message: route.capMessage(cap) });
  await env.USAGE.put(countKey, String(count + 1), { expirationTtl: DAY_TTL });

  const messages = [{ role: "user", content: route.message(body) }];
  let tokensIn = 0, tokensOut = 0, result = null, lastErrors = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
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
