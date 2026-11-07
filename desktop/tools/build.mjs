/* The desktop build: three esbuild bundles and the static files.
 *
 *   node tools/build.mjs            once
 *   node tools/build.mjs --watch    and again on every change
 *
 * - main      src/main/main.js      → build/main.cjs      (Node, for Electron's main process)
 * - preload   src/preload.js        → build/preload.cjs
 * - renderer  src/renderer/index.jsx → build/renderer.js  (the browser window)
 *
 * The renderer bundles the shared logic straight from `core/` and the pure
 * modules of `native/src` (data.js, questions.js, studycards.js — no React
 * Native in them), so the desktop asks the same questions and deals the same
 * cards as the phone. Metro inlines the payload JSON those modules `require`;
 * esbuild does the same. An asset they `require` — a word's clip, a font —
 * becomes a `ya://assets/…` URL (ASSET_PLUGIN), which the main process serves
 * from native/assets in development and from the installer's resources once
 * packaged, so twenty thousand clips are never copied into the bundle.
 */

import { build, context } from "esbuild";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(HERE, "..");
const ROOT = resolve(DESKTOP, "..");
const ASSETS = join(ROOT, "native", "assets");
const OUT = join(DESKTOP, "build");
const watch = process.argv.includes("--watch");

mkdirSync(OUT, { recursive: true });

/* A `require("../assets/words/x.mp3")` becomes the URL the ya:// protocol
   serves it at. Only files under native/assets; anything else resolves as
   usual. */
const ASSET_PLUGIN = {
  name: "ya-assets",
  setup(b) {
    b.onResolve({ filter: /\.(mp3|m4a|png|jpg|jpeg|ttf|otf|svg)$/ }, (args) => {
      const abs = resolve(args.resolveDir, args.path);
      if (!abs.startsWith(ASSETS)) return null;
      return { path: abs, namespace: "ya-asset" };
    });
    b.onLoad({ filter: /.*/, namespace: "ya-asset" }, (args) => {
      const rel = relative(ASSETS, args.path).split("\\").join("/");
      return { contents: `export default ${JSON.stringify("ya://assets/" + rel)};`, loader: "js" };
    });
    /* The payload JSON is not inlined — 29 MB of it became a 50 MB script
       the window parsed before its first frame. It is fetched by the page
       before the app's modules evaluate (index.jsx preloads the parts the
       first screen needs, and anything required later is read on demand),
       and each `import`/`require` of a part becomes a lookup in that cache. */
    b.onResolve({ filter: /\.json$/ }, (args) => {
      const abs = resolve(args.resolveDir, args.path);
      if (!abs.startsWith(ASSETS)) return null;
      return { path: abs, namespace: "ya-json" };
    });
    b.onLoad({ filter: /.*/, namespace: "ya-json" }, (args) => {
      const rel = relative(ASSETS, args.path).split("\\").join("/");
      return { contents: `module.exports = globalThis.__yaJson(${JSON.stringify(rel)});`, loader: "js" };
    });
  },
};

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  alias: { "@core": join(ROOT, "core") },
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};

const targets = [
  { ...common, entryPoints: [join(DESKTOP, "src", "main", "main.js")], outfile: join(OUT, "main.cjs"),
    platform: "node", format: "cjs", target: "node24", external: ["electron"] },
  { ...common, entryPoints: [join(DESKTOP, "src", "preload.js")], outfile: join(OUT, "preload.cjs"),
    platform: "node", format: "cjs", target: "node24", external: ["electron"] },
  { ...common, entryPoints: [join(DESKTOP, "src", "renderer", "index.jsx")], outfile: join(OUT, "renderer.js"),
    platform: "browser", format: "iife", target: "chrome140", jsx: "automatic",
    loader: { ".json": "json", ".js": "jsx" }, plugins: [ASSET_PLUGIN],
    define: { ...common.define, global: "window" } },
];

function copyStatic() {
  for (const f of ["index.html", "styles.css"]) {
    copyFileSync(join(DESKTOP, "src", "renderer", f), join(OUT, f));
  }
}

copyStatic();
if (watch) {
  const ctxs = await Promise.all(targets.map((t) => context(t)));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  for (const t of targets) await build(t);
  writeFileSync(join(OUT, "BUILD"), new Date().toISOString());
  console.log("built → desktop/build");
}
