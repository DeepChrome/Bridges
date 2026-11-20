// node tools/dl/test.mjs — the Worker on a fake KV: the latest record, the
// expired file, the download. No network.
import assert from "node:assert/strict";
import worker from "./worker.js";

const kv = new Map();
const env = { FILES: {
  async get(key, type) {
    const v = kv.get(key);
    if (v == null) return null;
    if (type === "json") return JSON.parse(v);
    if (type === "arrayBuffer") return v;
    return v;
  },
} };
const get = (path) => worker.fetch(new Request(`https://dl.test${path}`), env);

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

// No record yet: 404, and nothing else is served either.
ok((await get("/latest.json")).status === 404, "no latest record is a 404");
ok((await get("/short.apk")).status === 404, "a short name is refused");
ok((await get("/")).status === 404, "the root is nothing");

// A published build.
const file = "AbcdefghijklmnopQRST.apk";
kv.set(`dl:${file}:meta`, JSON.stringify({ parts: 2, size: 5 }));
kv.set(`dl:${file}:0`, new Uint8Array([1, 2, 3]).buffer);
kv.set(`dl:${file}:1`, new Uint8Array([4, 5]).buffer);
kv.set("dl:latest", JSON.stringify({ file, code: 29800000, name: "1.0.0-beta.10+abc1234", commit: "abc1234",
                                     sha256: "ff", at: 1700000000000, notes: "Update check" }));
const r = await get("/latest.json");
ok(r.status === 200, "latest answers");
ok(r.headers.get("cache-control") === "no-store", "never cached");
const body = await r.json();
assert.deepEqual(body, { code: 29800000, name: "1.0.0-beta.10+abc1234", url: `https://dl.test/${file}`,
                         size: 5, at: 1700000000000, notes: "Update check", commit: "abc1234", sha256: "ff", more: "" });
checks++;
ok((await get("/latest.json?x=1")).status === 200, "a query string does not matter");

// The changelog: none is a 404 and no `more`; one is served as text and named.
ok((await get("/changelog")).status === 404, "no changelog is a 404");
kv.set("dl:changelog", "## 1.0.0-beta.10+abc1234 · 2026-11-18\n- Update check\n\n");
const c = await get("/changelog");
ok(c.status === 200 && (c.headers.get("content-type") || "").startsWith("text/plain"), "the changelog is plain text");
ok((await c.text()).includes("- Update check"), "with the bullets");
ok((await (await get("/latest.json")).json()).more === "https://dl.test/changelog", "latest names it");

// The file itself streams whole.
const d = await get(`/${file}`);
ok(d.status === 200, "the file is served");
ok(d.headers.get("content-length") === "5", "with its length");
ok(d.headers.get("content-type") === "application/vnd.android.package-archive", "as an APK");
assert.deepEqual([...new Uint8Array(await d.arrayBuffer())], [1, 2, 3, 4, 5]); checks++;

// The file expired (its TTL ran out) but the record did not: no dead link.
kv.delete(`dl:${file}:meta`);
ok((await get("/latest.json")).status === 404, "an expired file is no update");
ok((await get(`/${file}`)).status === 404, "and the file is gone");

// A record without a file name is not an update either.
kv.set("dl:latest", JSON.stringify({ code: 1 }));
ok((await get("/latest.json")).status === 404, "a record naming no file is a 404");

// The privacy policy: a page once uploaded, nothing before.
ok((await get("/privacy")).status === 404, "no policy uploaded is a 404");
kv.set("dl:privacy", "<!doctype html><title>Privacy</title><h1>Ya</h1>");
const p = await get("/privacy");
ok(p.status === 200 && (p.headers.get("content-type") || "").startsWith("text/html"), "the policy is a page");
ok((await p.text()).includes("<h1>Ya</h1>"), "with its text");
ok((await get("/privacy.html")).status === 200, "and answers with the extension too");

// An audio pack: pieces streamed whole, cacheable, named by its contents.
ok((await get("/audio/ch3-0123456789.zip")).status === 404, "a pack not uploaded is a 404");
ok((await get("/audio/ch3.zip")).status === 404, "a pack name without its hash is nothing");
kv.set("audio:ch3-0123456789:meta", JSON.stringify({ parts: 2, size: 4 }));
kv.set("audio:ch3-0123456789:0", new Uint8Array([9, 8]).buffer);
kv.set("audio:ch3-0123456789:1", new Uint8Array([7, 6]).buffer);
const z = await get("/audio/ch3-0123456789.zip");
ok(z.status === 200 && z.headers.get("content-type") === "application/zip", "a pack is served as a zip");
ok(/max-age/.test(z.headers.get("cache-control")), "and may be cached");
assert.deepEqual([...new Uint8Array(await z.arrayBuffer())], [9, 8, 7, 6]); checks++;

console.log(`dl worker: ${checks} checks, all passed`);
