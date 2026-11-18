/* Does the player's subtitle switch actually switch YouTube's captions?
 *
 * The app's jest suite mocks the player, so it can prove the cog calls
 * `captions(false)` and nothing about whether YouTube obeys (CLAUDE.md §23: a
 * mocked navigator proves the call, not the destination). The IFrame API's
 * caption calls — `loadModule`, `unloadModule`, `setOption("captions", …)` —
 * are undocumented and have changed under us before, so this drives the real
 * player: it serves the app's own host page (read out of native/src/youtube.js,
 * never a copy) from localhost, plays a video in Chromium, and reads the
 * caption window inside YouTube's iframe before and after each switch.
 *
 *   node tools/yt_captions.mjs                 # the default video
 *   node tools/yt_captions.mjs <videoId> …     # these
 *   node tools/yt_captions.mjs --headed        # watch it
 *
 * Desktop Chromium is not the Android WebView, but both run the same player
 * script, and a call the player ignores here it ignores there too.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "native/src/youtube.js");
// Easy Russian 125, speech from the first seconds and YouTube's own Russian track.
const DEFAULT_VIDEO = "38dpdR7Nq-0";
const SEEK_S = 45;          // into the speech, past any silent title card
const SETTLE_MS = 7000;     // how long a caption gets to appear or disappear

const args = process.argv.slice(2);
const headed = args.includes("--headed");
const videos = args.filter((a) => !a.startsWith("--"));
if (!videos.length) videos.push(DEFAULT_VIDEO);

/* The host page as the app builds it. `page` is a template function in the
   module; the module imports react-native, so the template is lifted out of
   the source text and rebuilt with the probe's own origin. */
function pageBuilder() {
  const src = readFileSync(SRC, "utf8");
  const m = src.match(/const page = \(videoId, captions\) => `([\s\S]*?)`;\n\nexport const YouTube/);
  if (!m) throw new Error("could not find the page template in " + SRC);
  // eslint-disable-next-line no-new-func
  return new Function("videoId", "captions", "ORIGIN", "return `" + m[1] + "`;");
}

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "pass" : "FAIL"}  ${label}${detail !== undefined ? `  ${detail}` : ""}`);
  cond ? pass++ : fail++;
};

/* What the player's own DOM says: how many caption windows are drawn, and the
   track the API reports. */
async function captionState(page) {
  const frame = page.frames().find((f) => /youtube\.com\/embed/.test(f.url()));
  if (!frame) return { windows: -1, track: "no player frame" };
  /* The windows and what each says: switching on twice must not draw the
     track twice, which would read as the same line printed over itself. */
  const seen = await frame.evaluate(() => {
    const w = Array.from(document.querySelectorAll(".caption-window"));
    return { windows: document.querySelectorAll(".caption-window, .ytp-caption-segment").length,
             texts: w.map((e) => (e.textContent || "").trim()).filter(Boolean) };
  }).catch(() => ({ windows: -1, texts: [] }));
  const { windows, texts } = seen;
  const dupes = texts.filter((t, i) => texts.indexOf(t) !== i);
  const track = await page.evaluate(() => {
    try { return JSON.stringify(window.player.getOption("captions", "track")); }
    catch (e) { return "error: " + e.message; }
  });
  return { windows, texts, dupes, track };
}

/* Captions drawn at any point in the window, or never. */
async function sees(page, want, ms = SETTLE_MS) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    last = await captionState(page);
    if (want && last.windows > 0) return { yes: true, last };
    await page.waitForTimeout(500);
  }
  return { yes: last && last.windows > 0, last };
}

async function waitMsg(page, type, ms = 20000) {
  await page.waitForFunction((t) => window.__msgs.some((m) => m.type === t), type, { timeout: ms });
}

async function open(browser, build, origin, videoId, captions) {
  const page = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await page.addInitScript((o) => {
    if (location.origin !== o) return;
    window.__msgs = [];
    window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) };
  }, origin);
  await page.route(`${origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: build(videoId, captions, origin) }));
  await page.goto(`${origin}/player`);
  await waitMsg(page, "ready");
  await page.evaluate((s) => window.brSeek(s, 0), SEEK_S);
  await waitMsg(page, "state");
  return page;
}

async function main() {
  const build = pageBuilder();
  // The server answers nothing itself — the route handler does — but the port
  // has to be a real one for the origin to be real.
  const server = createServer((req, res) => { res.statusCode = 404; res.end(); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    for (const id of videos) {
      console.log(`\n${id}`);
      // Built with captions on: they show, go when switched off, return when switched on.
      let page = await open(browser, build, origin, id, true);
      let r = await sees(page, true);
      ok(r.yes, "captions on at the start", JSON.stringify(r.last));
      await page.evaluate(() => window.brCaptions(false));
      await page.waitForTimeout(1500);
      r = await sees(page, false);
      ok(!r.yes, "switched off: no caption drawn", JSON.stringify(r.last));
      await page.evaluate(() => window.brCaptions(true));
      r = await sees(page, true);
      ok(r.yes, "switched on again: captions back", JSON.stringify(r.last));
      ok(r.last && r.last.dupes.length === 0, "…and no line drawn twice", JSON.stringify(r.last && r.last.texts));
      await page.close();

      // Built with captions off, as a learner who turned them off last time gets it.
      page = await open(browser, build, origin, id, false);
      r = await sees(page, false);
      ok(!r.yes, "built with captions off: none drawn", JSON.stringify(r.last));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
