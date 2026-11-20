// node tools/dl/upload_privacy.mjs [--print]
//
// Puts docs/privacy.md on the bridges-dl Worker as a page, at
// https://bridges-dl.bridges-feedback.workers.dev/privacy — the public URL
// Google Play asks for in the store listing. The Markdown is turned into a
// small self-contained page here (headings, paragraphs, lists, bold, links;
// nothing else is in the file) and stored under `dl:privacy`, which the
// Worker serves as text/html. `--print` writes the HTML to stdout instead.
//
// Re-run after editing docs/privacy.md. CLOUDFLARE_API_TOKEN comes from the
// environment and is never printed. The Worker's `/privacy` route has to be
// deployed once for the address to answer.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, "..", "..", "docs", "privacy.md"), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/\*(.+?)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/`([^`]+)`/g, "<code>$1</code>");

/* Markdown to HTML, for exactly the constructs the policy uses. A paragraph
   runs until a blank line; a list item may wrap onto indented lines. The
   hosting note at the foot (after the rule) is not part of the policy. */
export function render(source) {
  const body = source.split(/\n---\n/)[0];
  const out = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
    if (list) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = null; }
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (!line.trim()) { flush(); continue; }
    const li = /^- (.+)$/.exec(line);
    if (li) { if (para.length) flush(); list = list || []; list.push(li[1]); continue; }
    if (list && /^\s{2,}\S/.test(raw)) { list[list.length - 1] += " " + line.trim(); continue; }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  const title = (/^# (.+)$/m.exec(body) || [, "Privacy Policy"])[1];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; font: 17px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1b1a; background: #fff; }
  h1 { font-size: 1.7rem; } h2 { font-size: 1.2rem; margin-top: 2rem; }
  a { color: #3b3a8f; } li { margin: .3rem 0; }
  @media (prefers-color-scheme: dark) { body { color: #e8e6e3; background: #15161c; } a { color: #a7a6ff; } }
</style></head>
<body>${out.join("\n")}</body></html>
`;
}

const html = render(md);
if (process.argv.includes("--print")) { process.stdout.write(html); process.exit(0); }

const work = join(here, "parts");
mkdirSync(work, { recursive: true });
const file = join(work, "privacy.html");
writeFileSync(file, html);
const r = spawnSync("npx", ["wrangler", "kv", "key", "put", "dl:privacy", "--path", file, "--binding", "FILES",
                            "--remote", "--config", join(here, "wrangler.toml")], { encoding: "utf8", shell: true });
rmSync(work, { recursive: true, force: true });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
console.log(`privacy page: ${html.length} bytes stored; served at https://bridges-dl.bridges-feedback.workers.dev/privacy once the Worker is deployed`);
