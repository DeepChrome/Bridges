/* Per-user tokens for the Worker (ROADMAP P8.4).
 *
 *   node tools/user.mjs add <id> [--feedback 300] [--talk 36]   mint a token, store it
 *   node tools/user.mjs revoke <token>                            refuse it from now on
 *   node tools/user.mjs list                                      the stored records
 *
 * A record is `user:<token>` in the USAGE namespace: { id, caps, created, revoked }.
 * The token is printed once and never stored anywhere but KV. Needs wrangler
 * authenticated ($env:CLOUDFLARE_API_TOKEN, as for deploys); run from backend/.
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, dflt) => (rest.includes(name) ? parseInt(rest[rest.indexOf(name) + 1], 10) : dflt);

/* `--remote`, always: wrangler 4 points `kv key` at a local store by default,
   so without it a token is minted into a file on this machine and the Worker
   never hears of it — found 2026-09-19 reading back the first live registration. */
function wrangler(args, input) {
  const r = spawnSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "USAGE", "--remote"],
                      { encoding: "utf8", shell: true, input });
  if (r.status !== 0) { process.stderr.write(r.stderr || r.stdout); process.exit(1); }
  return r.stdout;
}

if (cmd === "add" && rest[0]) {
  const id = rest[0];
  const token = randomBytes(24).toString("base64url");
  const rec = { id, caps: { feedback: opt("--feedback", 300), talk: opt("--talk", 36) },
                created: new Date().toISOString().slice(0, 10) };
  wrangler(["put", `user:${token}`, JSON.stringify(rec)]);
  console.log(`user ${id} added. Their token (shown once):\n\n  ${token}\n\n` +
              "For a build made for them alone, as EXPO_PUBLIC_APP_TOKEN. A public build needs none: it registers itself.");
} else if (cmd === "revoke" && rest[0]) {
  const cur = JSON.parse(wrangler(["get", `user:${rest[0]}`, "--text"]) || "{}");
  wrangler(["put", `user:${rest[0]}`, JSON.stringify({ ...cur, revoked: true })]);
  console.log(`revoked ${cur.id || rest[0]}`);
} else if (cmd === "plan" && rest[0] && ["free", "premium"].includes(rest[1])) {
  /* Put an install on a plan (core/plans.js, 2026-09-29), found by its id —
     the `app-…` name in the logs — so nobody has to handle the token itself.
     Until the store sells Premium this is how it is granted. */
  const keys = JSON.parse(wrangler(["list", "--prefix", "user:"]) || "[]");
  let done = false;
  for (const k of keys) {
    const rec = JSON.parse(wrangler(["get", k.name, "--text"]) || "{}");
    if (rec.id !== rest[0]) continue;
    wrangler(["put", k.name, JSON.stringify({ ...rec, plan: rest[1] })]);
    console.log(`${rec.id} is on ${rest[1]}`);
    done = true;
  }
  if (!done) { console.error(`no install with id ${rest[0]}`); process.exit(1); }
} else if (cmd === "list") {
  const keys = JSON.parse(wrangler(["list", "--prefix", "user:"]) || "[]");
  for (const k of keys) {
    const rec = JSON.parse(wrangler(["get", k.name, "--text"]) || "{}");
    console.log(`${rec.id || "?"}\t${rec.revoked ? "revoked" : "active"}\t${rec.plan || (rec.via === "register" ? "free" : "custom")}\tcaps ${JSON.stringify(rec.caps || {})}\t${k.name.slice(5, 13)}…`);
  }
} else {
  console.log("usage: node tools/user.mjs add <id> [--feedback N] [--talk N] | plan <id> free|premium | revoke <token> | list");
  process.exit(2);
}
