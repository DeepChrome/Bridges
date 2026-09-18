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

function wrangler(args, input) {
  const r = spawnSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "USAGE"],
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
} else if (cmd === "list") {
  const keys = JSON.parse(wrangler(["list", "--prefix", "user:"]) || "[]");
  for (const k of keys) {
    const rec = JSON.parse(wrangler(["get", k.name, "--text"]) || "{}");
    console.log(`${rec.id || "?"}\t${rec.revoked ? "revoked" : "active"}\tcaps ${JSON.stringify(rec.caps || {})}\t${k.name.slice(5, 13)}…`);
  }
} else {
  console.log("usage: node tools/user.mjs add <id> [--feedback N] [--talk N] | revoke <token> | list");
  process.exit(2);
}
