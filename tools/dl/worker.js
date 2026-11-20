// bridges-dl: the download point for side-loaded builds, and the record of
// the latest one (native/src/update.js reads it at every launch).
//
//   GET /<name>.apk      streams the file from KV, where upload.mjs stored it in
//                        20 MiB pieces (a KV value stops at 25 MiB); seven-day TTL
//   GET /latest.json     the newest published build: { code, name, url, size, at,
//                        notes, commit, sha256, more } — or 404 when there is
//                        none, or when the file it names has expired, so the app
//                        says nothing rather than offer a dead link. `notes` is a
//                        few lines, one bullet each; `more` is the changelog's
//                        address when there is one
//   GET /changelog       every build's bullets, newest first (plain text), kept
//                        in `dl:changelog` by upload.mjs
//   GET /privacy         the privacy policy as a page (docs/privacy.md, put in
//                        `dl:privacy` by upload_privacy.mjs) — the public URL
//                        Google Play asks for
//   GET /audio/<pack>.zip   an audio pack (below)
//
// Nothing else is served. The name of a file is random (upload.mjs), which is
// the only thing standing between a URL and the file, so a name under sixteen
// characters is refused. The KV namespace is the main Worker's USAGE one, so
// anything that clears old builds must delete only `dl:*` keys.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);

    if (name === "latest.json") {
      if (request.method !== "GET") return new Response("method", { status: 405 });
      const latest = await env.FILES.get("dl:latest", "json");
      const file = latest && typeof latest.file === "string" ? latest.file : null;
      const meta = file ? await env.FILES.get(`dl:${file}:meta`, "json") : null;
      if (!latest || !meta) return new Response("not found", { status: 404 });
      const changelog = await env.FILES.get("dl:changelog");
      const body = {
        code: latest.code, name: latest.name, url: `${url.origin}/${file}`,
        size: meta.size, at: latest.at, notes: latest.notes || "",
        commit: latest.commit || "", sha256: latest.sha256 || "",
        more: changelog ? `${url.origin}/changelog` : "",
      };
      return new Response(JSON.stringify(body), { headers: {
        "content-type": "application/json", "cache-control": "no-store" } });
    }

    if (name === "changelog") {
      if (request.method !== "GET") return new Response("method", { status: 405 });
      const text = await env.FILES.get("dl:changelog");
      if (!text) return new Response("not found", { status: 404 });
      return new Response(text, { headers: {
        "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }

    if (name === "privacy" || name === "privacy.html") {
      if (request.method !== "GET") return new Response("method", { status: 405 });
      const html = await env.FILES.get("dl:privacy");
      if (!html) return new Response("not found", { status: 404 });
      return new Response(html, { headers: {
        "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

    /* The audio packs (2026-11-19, tools/build_word_assets.mjs): a zip a
       chapter, stored by upload_audio.mjs in pieces like a build but with no
       expiry — a pack is named by its contents, so an old build's pack stays
       good for as long as that build is installed anywhere. Cacheable for a
       day at the edge: the content behind a name never changes. */
    const pack = /^audio\/([a-z]+\d*-[0-9a-f]{10})\.zip$/.exec(name);
    if (pack) {
      if (request.method !== "GET") return new Response("method", { status: 405 });
      const meta = await env.FILES.get(`audio:${pack[1]}:meta`, "json");
      if (!meta) return new Response("not found", { status: 404 });
      const { readable, writable } = new TransformStream();
      (async () => {
        const w = writable.getWriter();
        for (let i = 0; i < meta.parts; i++) {
          const part = await env.FILES.get(`audio:${pack[1]}:${i}`, "arrayBuffer");
          await w.write(new Uint8Array(part));
        }
        await w.close();
      })();
      return new Response(readable, { headers: {
        "content-type": "application/zip", "content-length": String(meta.size),
        "cache-control": "public, max-age=86400" } });
    }

    // ?dl=1 saves the file instead of playing it in the tab.
    const save = url.searchParams.has("dl");
    if (!/^[A-Za-z0-9_-]{16,}\.(apk|aab|mp4)$/.test(name)) return new Response("not found", { status: 404 });
    const meta = await env.FILES.get(`dl:${name}:meta`, "json");
    if (!meta) return new Response("not found", { status: 404 });
    const { readable, writable } = new TransformStream();
    (async () => {
      const w = writable.getWriter();
      for (let i = 0; i < meta.parts; i++) {
        const part = await env.FILES.get(`dl:${name}:${i}`, "arrayBuffer");
        await w.write(new Uint8Array(part));
      }
      await w.close();
    })();
    // A video plays in the browser (inline) and saves under a readable name.
    const mp4 = name.endsWith(".mp4");
    return new Response(readable, { headers: {
      "content-type": mp4 ? "video/mp4" : name.endsWith(".aab") ? "application/octet-stream" : "application/vnd.android.package-archive",
      "content-length": String(meta.size),
      "content-disposition": mp4 ? `${save ? "attachment" : "inline"}; filename="Siete-anos-casados.mp4"`
        : `attachment; filename="${name.endsWith(".aab") ? "ya-beta.aab" : "ya.apk"}"`,
    } });
  },
};
