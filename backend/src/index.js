/* The Bridges feedback Worker (ROADMAP Phase 4).
 *
 * One route: POST /v1/feedback. It holds the Anthropic key so the app never does,
 * checks the app's bearer token, refuses past a daily request cap, asks the model
 * for structured feedback on a spoken sentence, validates the reply against
 * schema.js (retrying once), and logs token counts to KV. That is all it does.
 *
 * What it never does: store audio (none is sent — the app sends a transcript),
 * store learner state, or keep anything beyond the day's counters and token log.
 *
 * `handle` takes its dependencies as arguments so the tests run it in plain Node
 * with a fake KV and a fake fetch; the default export is what Cloudflare calls.
 */

import { validate, extractJson } from "./schema.js";
import { SYSTEM, userMessage, RETRY_NUDGE } from "./prompt.js";

const API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 400;
const UPSTREAM_TIMEOUT_MS = 15000;
const DEFAULT_CAP = 300;
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

async function askModel(fetchFn, env, messages) {
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
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages,
      }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) return { error: `upstream ${r.status}`, status: r.status };
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    return { text, usage: body.usage || {} };
  } catch (e) {
    return { error: e.name === "AbortError" ? "upstream timeout" : `upstream ${e.message || e}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function handle(request, env, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now ? deps.now() : new Date();
  const url = new URL(request.url);

  if (url.pathname !== "/v1/feedback") return json(404, { ok: false, reason: "not found" });
  if (request.method !== "POST") return json(405, { ok: false, reason: "method" });

  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!env.APP_TOKEN || !tokenMatches(given, env.APP_TOKEN)) {
    return json(401, { ok: false, reason: "unauthorised" });
  }
  if (!env.ANTHROPIC_API_KEY) return json(503, { ok: false, reason: "no upstream key" });

  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body.transcript !== "string" || typeof body.target !== "string"
      || !body.target.trim()) {
    return json(400, { ok: false, reason: "transcript and target are required" });
  }

  // Cost guard: one counter per UTC day. Read, compare, write — not atomic, which
  // is fine for a single learner's phone and wrong for a fleet; the cap is a
  // backstop against a bug in a loop, not a billing system.
  const cap = parseInt(env.DAILY_CAP, 10) || DEFAULT_CAP;
  const day = dayKey(now);
  const countKey = `count:${day}`;
  const count = parseInt(await env.USAGE.get(countKey), 10) || 0;
  if (count >= cap) {
    return json(429, { ok: false, reason: "cap",
                       message: `Daily feedback limit of ${cap} reached; resets at 00:00 UTC.` });
  }
  await env.USAGE.put(countKey, String(count + 1), { expirationTtl: DAY_TTL });

  const messages = [{ role: "user", content: userMessage(body) }];
  let tokensIn = 0, tokensOut = 0, result = null, lastErrors = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const reply = await askModel(fetchFn, env, messages);
    if (reply.error) {
      await logUsage(env, day, now, { error: reply.error, attempt });
      return json(502, { ok: false, reason: "upstream", detail: reply.error });
    }
    tokensIn += reply.usage.input_tokens || 0;
    tokensOut += reply.usage.output_tokens || 0;
    const parsed = extractJson(reply.text);
    const v = parsed ? validate(parsed) : { ok: false, errors: ["no JSON object in reply"] };
    if (v.ok) result = v.value;
    else {
      lastErrors = v.errors;
      messages.push({ role: "assistant", content: reply.text || "" });
      messages.push({ role: "user", content: RETRY_NUDGE });
    }
  }

  await logUsage(env, day, now, { in: tokensIn, out: tokensOut, model: env.MODEL,
                                  parsed: !!result });
  if (!result) return json(200, { ok: false, reason: "parse", errors: lastErrors });
  return json(200, { ok: true, ...result });
}

/* Per-request line plus a running daily total, so cost per request can be read
   off KV without a dashboard. */
async function logUsage(env, day, now, entry) {
  const line = { ts: now.toISOString(), ...entry };
  await env.USAGE.put(`log:${day}:${now.getTime()}`, JSON.stringify(line),
                      { expirationTtl: DAY_TTL * 15 });
  if (typeof entry.in === "number") {
    const key = `tokens:${day}`;
    const cur = JSON.parse((await env.USAGE.get(key)) || "{\"in\":0,\"out\":0,\"n\":0}");
    cur.in += entry.in; cur.out += entry.out; cur.n += 1;
    await env.USAGE.put(key, JSON.stringify(cur), { expirationTtl: DAY_TTL * 15 });
  }
}

export default {
  fetch: (request, env) => handle(request, env),
};
