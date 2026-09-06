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

export function config() {
  const url = process.env.EXPO_PUBLIC_FEEDBACK_URL || "";
  const token = process.env.EXPO_PUBLIC_APP_TOKEN || "";
  return url && token ? { url: url.replace(/\/+$/, "") + "/v1/feedback", token } : null;
}

export async function getFeedback({ transcript, target, unitId, topic, lemmas }, deps = {}) {
  const cfg = deps.config || config();
  if (!cfg) return { ok: false, reason: "unconfigured" };
  const fetchFn = deps.fetch || globalThis.fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs || TIMEOUT_MS);
  try {
    const r = await fetchFn(cfg.url, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ transcript, target, unitId, topic: topic || null,
                             lemmas: lemmas || [] }),
    });
    let body = null;
    try { body = await r.json(); } catch (e) { body = null; }
    if (!r.ok) return { ok: false, reason: "http", status: r.status, detail: body && body.reason };
    if (!body || typeof body !== "object") return { ok: false, reason: "parse" };
    if (body.ok !== true) return { ok: false, reason: body.reason || "parse" };
    return body;
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, reason: "timeout" };
    // React Native's fetch rejects with "Network request failed" when there is no
    // route to the host, which is the offline case without a connectivity module.
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
