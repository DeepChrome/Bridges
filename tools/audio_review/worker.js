/* The audio review site's server (tools/audio_review/index.html; build.mjs
 * makes the static part). The page, the catalogue and the sound packs are
 * static assets; this answers only /api/reviews:
 *
 *   GET   every reviewer's verdicts: { reviewers: { name: { key: verdict } } }
 *   POST  { code, who, verdicts: [{ key, id, verdict, reasons, note, at }] }
 *
 * One KV record per reviewer (`rv:<name>`), merged here by each verdict's
 * time, so a batch is one write — the free tier allows a thousand a day, and
 * a reviewer sends a batch every ten verdicts. Writing needs REVIEW_CODE (a
 * Worker secret, carried in the reviewer's link); reading does not, so a
 * view-only link still shows what others said. Nothing else is kept.
 */
const MAX_NOTE = 600;
const MAX_BATCH = 200;
const VERDICTS = new Set(["ok", "flag"]);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const slug = (s) => String(s || "").trim().slice(0, 40);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/reviews") return env.ASSETS.fetch(request);

    if (request.method === "GET") {
      const reviewers = {};
      let cursor;
      do {
        const page = await env.REVIEWS.list({ prefix: "rv:", cursor });
        for (const k of page.keys) {
          const doc = await env.REVIEWS.get(k.name, "json");
          if (doc) reviewers[k.name.slice(3)] = doc;
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return json({ reviewers });
    }

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, reason: "not json" }, 400); }
      const code = String(env.REVIEW_CODE || "").trim();
      if (!code || String(body.code || "").trim() !== code) return json({ ok: false, reason: "code" }, 401);
      const who = slug(body.who);
      if (!who) return json({ ok: false, reason: "who" }, 400);
      const list = Array.isArray(body.verdicts) ? body.verdicts.slice(0, MAX_BATCH) : [];
      const key = `rv:${who}`;
      const doc = (await env.REVIEWS.get(key, "json")) || {};
      for (const v of list) {
        if (!v || typeof v.key !== "string" || !VERDICTS.has(v.verdict)) continue;
        const at = Number(v.at) || Date.now();
        if (doc[v.key] && doc[v.key].at >= at) continue;
        doc[v.key] = {
          key: v.key.slice(0, 300), id: String(v.id || "").slice(0, 40), verdict: v.verdict, at,
          reasons: (Array.isArray(v.reasons) ? v.reasons : []).map((r) => String(r).slice(0, 60)).slice(0, 8),
          note: String(v.note || "").slice(0, MAX_NOTE),
        };
      }
      await env.REVIEWS.put(key, JSON.stringify(doc));
      return json({ ok: true, kept: Object.keys(doc).length });
    }
    return json({ ok: false }, 405);
  },
};
