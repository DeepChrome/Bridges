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
 * Configuration comes from EXPO_PUBLIC_FEEDBACK_URL and EXPO_PUBLIC_APP_TOKEN,
 * inlined by Expo at bundle time from native/.env (gitignored; see .env.example)
 * or, for EAS builds, from the profile's environment variables. The app token is
 * not the Anthropic key — that never leaves the Worker — but it is still not
 * committed anywhere.
 */

export const TIMEOUT_MS = 8000;
export const TALK_TIMEOUT_MS = 20000;   // a conversational turn is longer

export function config(route = "/v1/feedback") {
  const url = process.env.EXPO_PUBLIC_FEEDBACK_URL || "";
  const token = process.env.EXPO_PUBLIC_APP_TOKEN || "";
  return url && token ? { url: url.replace(/\/+$/, "") + route, token } : null;
}

export async function getFeedback({ transcript, target, unitId, topic, lemmas }, deps = {}) {
  return post({ transcript, target, unitId, topic: topic || null, lemmas: lemmas || [] },
              deps, "/v1/feedback", TIMEOUT_MS);
}

/* The tutor's turn (ROADMAP P6.2). The whole exchange goes every time; the Worker
   keeps nothing. Same failure reasons as getFeedback. */
export async function talk({ scenario, topic, studied, history, transcript, level }, deps = {}) {
  return post({ scenario, topic: topic || null, studied: studied || [], history: history || [],
                transcript: transcript || "", level: level || "intermediate" },
              deps, "/v1/talk", TALK_TIMEOUT_MS);
}

async function post(body, deps, route, timeoutMs) {
  const cfg = deps.config || config(route);
  if (!cfg) return { ok: false, reason: "unconfigured" };
  const fetchFn = deps.fetch || globalThis.fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs || timeoutMs);
  try {
    const r = await fetchFn(cfg.url, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
    });
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
