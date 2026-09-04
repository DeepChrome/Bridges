/* Real-browser checks. jsdom proves the logic; this proves the layout.
 *
 * Renders the built page in Chromium at phone size, screenshots every screen in
 * both themes, and asserts the things only a layout engine can answer: nothing
 * overflows sideways, tap targets are big enough, text is legible, the bottom bar
 * does not cover content.
 *
 *   node tools/visual.js            headless, writes tools/shots/
 *   node tools/visual.js --headed   watch it run
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const FILE = "file://" + path.join(__dirname, "..", "site", "index.html").replace(/\\/g, "/");
const SHOTS = path.join(__dirname, "shots");
const PHONE = { width: 390, height: 844 };      // iPhone 12/13/14 logical size
const SMALL = { width: 320, height: 568 };      // smallest phone still worth supporting
/* Two tiers, both from WCAG 2.5.x:
   - Primary controls get 40px (2.5.5 AAA asks 44; 40 is our working floor).
   - Inline links inside running text are exempt from 2.5.5 and fall under 2.5.8's
     24px minimum. Making a word link inside a sentence 40px tall would destroy the
     typography it exists to serve, so the exemption is the correct rule, not a dodge. */
const MIN_TAP = 40;
const MIN_INLINE = 24;
const PRIMARY_SEL = "button:not(.pill), a.btn, input, .node, .opt, .chip, .row";
const INLINE_SEL = "a.tok, button.pill";

let failures = 0, checks = 0;
const ok = (cond, label, extra) => {
  checks++;
  console.log((cond ? "  pass  " : "  FAIL  ") + label +
              (cond || extra === undefined ? "" : "  → " + extra));
  if (!cond) failures++;
};
const group = (n) => console.log("\n" + n);

async function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
}

/* Visible interactive elements smaller than `min`, for the given selector. */
async function targets(page, sel, min) {
  return page.evaluate(([sel, min]) => {
    return Array.from(document.querySelectorAll(sel))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName.toLowerCase(),
          cls: e.className && e.className.baseVal === undefined ? String(e.className) : "",
          text: (e.textContent || "").trim().slice(0, 24),
          w: Math.round(r.width), h: Math.round(r.height),
        };
      })
      .filter((t) => t.h < min);
  }, [sel, min]);
}

const describe = (list) => list.slice(0, 3)
  .map((t) => `${t.tag}.${t.cls.split(" ")[0]}"${t.text}" ${t.w}x${t.h}`).join("; ");

async function shoot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });

  const errors = [];
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(FILE);
  await page.waitForSelector("#gate, #app");
  await page.waitForTimeout(400);

  group("profile gate");
  {
    // The splash deliberately sits above the gate for its first moment.
    const covered = await page.evaluate(() => {
      const s = document.querySelector("#splash"), g = document.querySelector("#gate");
      if (!s || !g) return false;
      return parseInt(getComputedStyle(s).zIndex, 10) >
             parseInt(getComputedStyle(g).zIndex, 10);
    });
    ok(covered, "splash covers the gate on first paint");
    const up = await page.evaluate(() =>
      !document.querySelector("#splash").classList.contains("gone"));
    ok(up, "splash is up on cold load");
    await shoot(page, "splash");
    await page.evaluate(() => document.querySelector("#splash").click());
    await page.waitForTimeout(150);
    const gone = await page.evaluate(() =>
      document.querySelector("#splash").classList.contains("gone"));
    ok(gone, "splash dismisses on tap");
    const onGate = await page.evaluate(() => !!document.querySelector("#gate"));
    ok(onGate, "a fresh install opens the profile gate");
    const o = await overflow(page);
    ok(o.scroll <= o.client + 1, "gate: no horizontal overflow");
    const avs = await page.evaluate(() => document.querySelectorAll("#gate .avpick").length);
    ok(avs >= 8, "avatar cast rendered", String(avs));
    const drawn = await page.evaluate(() => {
      const s = document.querySelector("#gate .avpick svg");
      const r = s && s.getBoundingClientRect();
      return r ? Math.round(r.width) : 0;
    });
    ok(drawn >= 40, "avatars actually draw at a usable size", drawn + "px");
    await shoot(page, "gate-create");
    // Make a profile so the rest of the run has an app to look at.
    await page.evaluate(() => {
      document.querySelector("#gate .namebox").value = "Jared";
      Array.from(document.querySelectorAll("#gate .btn"))
        .find((b) => b.textContent.trim() === "Continue").click();
    });
    await page.waitForTimeout(250);
    await shoot(page, "gate-placement");
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("#gate .row"))
        .find((r) => /Start from the beginning/.test(r.textContent)).click();
    });
    await page.waitForTimeout(300);
  }

  group("render");
  ok(errors.length === 0, "no console errors", errors[0]);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent", "body paints its own background", bg);
  const font = await page.evaluate(() =>
    getComputedStyle(document.querySelector("#title")).fontFamily);
  ok(/Golos/.test(font), "UI font loaded", font);

  group("screens at 390px");
  const screens = [
    ["path", "#/path", "#s-path .node"],
    ["drills", "#/drills", "#s-drills .row"],
    ["drill-cases", "#/drill/cases", "#s-lesson .opt"],
    ["practice", "#/practice", "#cardarea"],
    ["words", "#/w/%D0%BA%D0%BD%D0%B8%D0%B3%D1%83", "#s-dict .hw"],
    ["immerse", "#/immerse", "#s-immerse .row"],
    ["profile", "#/you", "#s-you .stat"],
    ["lesson", "#/lesson/core1/0", "#s-lesson"],
  ];
  for (const [name, hash, sel] of screens) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(250);
    await page.waitForSelector(sel, { timeout: 4000 }).catch(() => {});
    const o = await overflow(page);
    ok(o.scroll <= o.client + 1, name + ": no horizontal overflow",
       o.scroll + " > " + o.client);
    const small = await targets(page, PRIMARY_SEL, MIN_TAP);
    ok(small.length === 0, name + ": controls ≥ " + MIN_TAP + "px", describe(small));
    const tiny = await targets(page, INLINE_SEL, MIN_INLINE);
    ok(tiny.length === 0, name + ": inline targets ≥ " + MIN_INLINE + "px", describe(tiny));
    await shoot(page, "dark-" + name);
  }

  group("lesson hub");
  {
    await page.evaluate(() => { location.hash = "#/lesson/food/0"; });
    await page.waitForTimeout(350);
    const rows = await page.evaluate(() => document.querySelectorAll("#s-lesson .row").length);
    ok(rows === 3, "three components listed", String(rows));
    const o = await overflow(page);
    ok(o.scroll <= o.client + 1, "hub: no horizontal overflow");
    await shoot(page, "lesson-hub");
  }

  group("teaching phases");
  {
    // A unit with a grammar note, so the opening steps render.
    await page.evaluate(() => { location.hash = "#/lesson/food/0/vocab"; });
    await page.waitForTimeout(400);
    const hasGrammar = await page.evaluate(() => !!document.querySelector("#s-lesson .gtitle"));
    ok(hasGrammar, "lesson opens on a grammar card");
    let o = await overflow(page);
    ok(o.scroll <= o.client + 1, "grammar: no horizontal overflow");
    await shoot(page, "phase-grammar");

    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("#s-lesson .btn.pri"))
        .find((x) => /Start learning/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(350);
    const hasWord = await page.evaluate(() =>
      !!document.querySelector("#s-lesson .learnword .big"));
    ok(hasWord, "new-word card renders before any question");
    o = await overflow(page);
    ok(o.scroll <= o.client + 1, "learn card: no horizontal overflow");
    await shoot(page, "phase-learn");
  }

  group("chrome visibility");
  {
    // jsdom only sees the .hidden property; a class setting display:grid can still
    // paint a "hidden" control. Only a layout engine catches that.
    await page.evaluate(() => { location.hash = "#/path"; });
    await page.waitForTimeout(250);
    const rootBack = await page.evaluate(() =>
      document.querySelector("#back").getBoundingClientRect().height);
    ok(rootBack === 0, "back arrow is not painted on a root tab", rootBack + "px tall");
    await page.evaluate(() => { location.hash = "#/lesson/core1/0"; });
    await page.waitForTimeout(250);
    const lessonBack = await page.evaluate(() =>
      document.querySelector("#back").getBoundingClientRect().height);
    ok(lessonBack > 0, "back arrow is painted inside a lesson", lessonBack + "px tall");
    const badge = await page.evaluate(() => {
      const b = document.querySelector("#devbadge").getBoundingClientRect();
      const bar = document.querySelector(".tabbar").getBoundingClientRect();
      return { top: Math.round(b.top), h: Math.round(b.height), barTop: Math.round(bar.top) };
    });
    ok(badge.h > 0 && badge.top < 100, "dev badge sits in the top bar, not over content",
       JSON.stringify(badge));
  }

  group("tab bar");
  {
    // A wrapped tab bar pushes a row off-screen without any horizontal overflow,
    // so the overflow check cannot see it. Compare the buttons' vertical positions.
    const rows = await page.evaluate(() => {
      const tops = Array.from(document.querySelectorAll("#tabs button"))
        .map((b) => Math.round(b.getBoundingClientRect().top));
      return { distinct: Array.from(new Set(tops)).length, count: tops.length };
    });
    ok(rows.distinct === 1, "every tab sits on one row", JSON.stringify(rows));
    const inView = await page.evaluate(() => {
      const b = document.querySelector("#tabs button:last-child").getBoundingClientRect();
      return b.bottom <= window.innerHeight + 1;
    });
    ok(inView, "the last tab is fully on screen");
  }

  group("bottom bar clearance");
  await page.evaluate(() => { location.hash = "#/path"; });
  await page.waitForTimeout(250);
  const clear = await page.evaluate(() => {
    const bar = document.querySelector(".tabbar").getBoundingClientRect();
    const main = document.querySelector("#s-path");
    window.scrollTo(0, document.body.scrollHeight);
    const last = main.lastElementChild.lastElementChild;
    const r = last.getBoundingClientRect();
    return { barTop: Math.round(bar.top), lastBottom: Math.round(r.bottom) };
  });
  ok(clear.lastBottom <= clear.barTop, "last item is not hidden behind the tab bar",
     JSON.stringify(clear));

  group("smallest phone (320px)");
  await page.setViewportSize(SMALL);
  for (const [name, hash] of [["path", "#/path"], ["lesson", "#/lesson/core1/0"]]) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(250);
    const o = await overflow(page);
    ok(o.scroll <= o.client + 1, name + " @320: no horizontal overflow",
       o.scroll + " > " + o.client);
  }
  await page.setViewportSize(PHONE);

  group("light theme");
  const lightCtx = await browser.newContext({
    viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: "light",
  });
  const lp = await lightCtx.newPage();
  await lp.goto(FILE);
  await lp.waitForSelector("#app");
  await lp.waitForTimeout(400);
  const contrast = await lp.evaluate(() => {
    const s = getComputedStyle(document.body);
    const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (rgb) => {
      const a = rgb.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const l1 = lum(parse(s.color)), l2 = lum(parse(s.backgroundColor));
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
  });
  ok(contrast >= 4.5, "body text contrast ≥ 4.5:1 in light theme", contrast + ":1");
  for (const [name, hash] of [["path", "#/path"], ["words", "#/w/%D0%BA%D0%BD%D0%B8%D0%B3%D1%83"]]) {
    await lp.evaluate((h) => { location.hash = h; }, hash);
    await lp.waitForTimeout(250);
    await lp.screenshot({ path: path.join(SHOTS, "light-" + name + ".png") });
  }

  ok(errors.length === 0, "no console errors across the run", errors.join(" | ").slice(0, 200));

  await browser.close();
  console.log("\nscreenshots → tools/shots/");
  console.log(checks + " checks · " + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
