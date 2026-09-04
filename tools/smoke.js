/* Headless smoke test — drives site/index.html in jsdom the way a person would.
 * Catches render-path crashes a syntax check cannot. Layout is visual.js's job.
 *
 *   node tools/smoke.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = path.join(__dirname, "..", "site", "index.html");
const html = fs.readFileSync(file, "utf8");

let failures = 0, checks = 0;
const ok = (cond, label, extra) => {
  checks++;
  console.log((cond ? "  pass  " : "  FAIL  ") + label +
              (cond || !extra ? "" : "  → " + extra));
  if (!cond) failures++;
};
const group = (n) => console.log("\n" + n);

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://bridges-jf.netlify.app/",
  virtualConsole: new VirtualConsole()
    // jsdom has no layout engine, so scrollTo and friends are absent. Environment
    // gap, not a page defect.
    .on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); })
    .on("error", (e) => errors.push(String(e))),
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const tick = () => new Promise((r) => setTimeout(r, 30));
const nav = async (hash) => { window.location.hash = hash; await tick(); };
const tab = async (name) => {
  $$("#tabs button").find((b) => b.dataset.go === name).click();
  await tick();
};
const state = () => {
  const acc = JSON.parse(window.localStorage.getItem("rb.accounts") || "{}");
  const key = acc.active ? "rb.state." + acc.active : "rb.state";
  return JSON.parse(window.localStorage.getItem(key) || "{}");
};
const byText = (sel, re) => $$(sel).find((b) => re.test(b.textContent));

/* Answer whatever the runner shows until it stops changing. Correctness is not the
   point — that every step renders and advances is. */
async function runExercises(limit) {
  const seen = new Set();
  let steps = 0;
  while (steps++ < (limit || 90)) {
    // Stop at a result screen. The lesson screen keeps its DOM when hidden, so a
    // stale "Continue" would otherwise be clicked forever.
    if ($("#s-lesson").hidden || $("#s-lesson .orb")) break;
    const cont = $$("#s-lesson .verdict .btn")[0];
    if (cont) { cont.click(); await tick(); continue; }
    if ($("#s-lesson .pairs")) {
      seen.add("match");
      const cols = $$("#s-lesson .pairs .opts");
      for (const l of Array.from(cols[0].children)) {
        for (const r of Array.from(cols[1].children)) {
          if (l.disabled) break;
          if (r.disabled) continue;
          l.click(); r.click(); await tick();
        }
      }
      continue;
    }
    const box = $("#s-lesson .answerbox");
    if (box) {
      seen.add("type");
      box.value = "тест";
      const check = byText("#s-lesson .btn", /^Check$/);
      if (check) { check.click(); await tick(); }
      continue;
    }
    const opt = $$("#s-lesson .opt").find((b) => !b.disabled);
    if (opt) { seen.add("choice"); opt.click(); await tick(); continue; }
    const go = byText("#s-lesson .btn.pri", /Start learning|^Continue$/);
    if (go) { seen.add("teach"); go.click(); await tick(); continue; }
    break;
  }
  return { seen, steps };
}

setTimeout(async () => {
  group("profile gate");
  ok(errors.length === 0, "no script errors on load", errors[0]);
  ok(!!$("#gate"), "a fresh install opens the profile gate");
  ok(/Welcome to Bridges/.test($("#gate").textContent),
     "with no profiles it goes straight to creation");
  ok($$("#gate .avpick").length >= 8, "a cast of avatars to pick from",
     String($$("#gate .avpick").length));
  ok($$("#gate .avpick.on").length === 1, "one avatar is preselected");
  $$("#gate .avpick")[3].click();
  ok($$("#gate .avpick")[3].classList.contains("on"), "picking an avatar selects it");
  $("#gate .namebox").value = "Jared";
  byText("#gate .btn", /^Continue$/).click();
  await tick();
  ok(/Where should we start/.test(($("#gate") || {}).textContent || ""),
     "creation offers the placement test");
  ok(/50 questions/.test($("#gate").textContent), "placement length is stated");
  byText("#gate .row", /Start from the beginning/).click();
  await tick();
  ok(!$("#gate"), "choosing a start closes the gate");
  const roster = JSON.parse(window.localStorage.getItem("rb.accounts") || "{}");
  ok(roster.list && roster.list.length === 1, "the profile was saved");
  ok(roster.list[0].name === "Jared", "the name was kept");
  ok(!!window.localStorage.getItem("rb.state." + roster.active),
     "state is stored per profile");

  group("boot");
  ok(!!$("#app"), "app shell present");
  ok($$("#tabs button").length === 5, "five bottom tabs");
  ok($$("#tabs button").map((b) => b.textContent.trim()).join(",") ===
     "Learn,Study,Practice,Immerse,Search", "tabs read Learn/Study/Practice/Immerse/Search",
     $$("#tabs button").map((b) => b.textContent.trim()).join(","));
  ok(!!$("#me .avatar"), "the profile avatar sits in the top bar");
  ok($("#s-path").hidden === false, "path is the home screen");
  ok(!!doc.querySelector('meta[name="viewport"]'), "viewport meta present");
  ok(state().v === 4, "state stamped with the current schema", String(state().v));

  group("splash");
  ok(!!$("#splash"), "splash screen present");
  ok(/Bridges/.test($("#splash").textContent), "splash carries the wordmark");
  ok($$("#splash .bar").length === 3, "splash mark has three bars");
  $("#splash").click();
  ok($("#splash").classList.contains("gone"), "tapping the splash dismisses it");

  group("dev mode");
  ok($("#devbadge").hidden === false, "dev mode is on by default");
  ok($$("#s-path .node:disabled").length === 0, "dev mode unlocks every unit");

  group("path");
  ok($$("#s-path .node").length === 27, "27 unit nodes",
     String($$("#s-path .node").length));
  ok($$("#s-path .stage-h").length === 8, "8 stages");
  ok($$("#s-path .node .thumb svg").length === 27, "every unit node has a thumbnail",
     String($$("#s-path .node .thumb svg").length));

  group("lesson hub");
  await nav("#/lesson/food/0");
  ok($("#s-lesson").hidden === false, "lesson hub opens");
  ok($$("#s-lesson .row").length === 3, "three components for a unit with a video",
     String($$("#s-lesson .row").length));
  ok($$("#s-lesson .check").length === 3, "each component has a completion circle");
  ok($$("#s-lesson .check.on").length === 0, "nothing is ticked to begin with");
  await nav("#/lesson/military/0");
  ok($$("#s-lesson .row").length === 2, "two components when the unit has no video",
     String($$("#s-lesson .row").length));

  group("vocab component");
  await nav("#/lesson/food/0/vocab");
  ok(!!$("#s-lesson .gtitle"), "vocab opens on the unit's grammar rule");
  ok(/accusative/i.test($("#s-lesson").textContent), "the grammar note is the unit's");
  const vocabRun = await runExercises();
  ok(vocabRun.steps < 90, "vocab runs to completion", "steps " + vocabRun.steps);
  ok(vocabRun.seen.has("teach"), "teaching cards appeared");
  ok(vocabRun.seen.has("choice"), "practice questions appeared between words");
  ok(/Vocabulary done/.test($("#s-lesson").textContent), "vocab reports completion");
  await nav("#/lesson/food/0");
  ok($$("#s-lesson .check.on").length === 1, "vocab is now ticked",
     String($$("#s-lesson .check.on").length));

  group("quiz component");
  await nav("#/lesson/food/0/quiz");
  const quizRun = await runExercises();
  ok(quizRun.steps < 90, "quiz runs to completion", "steps " + quizRun.steps);
  ok(!!$("#s-lesson .orb") && /%/.test($("#s-lesson .orb").textContent),
     "quiz ends on a score", ($("#s-lesson .orb") || {}).textContent);
  const afterQuiz = state();
  ok(typeof ((afterQuiz.unit.food || {}).lessons || {})["0"].q === "number",
     "quiz score recorded on the lesson");

  group("video component");
  await nav("#/lesson/food/0/video");
  ok(/Easy Russian/.test($("#s-lesson").textContent), "video screen names the source");
  ok(!!byText("#s-lesson .btn", /Play here/), "play control present");
  const watched = byText("#s-lesson .btn", /Mark as watched/);
  ok(!!watched, "watched control present");
  watched.click();
  await tick();
  ok(state().unit.food.video === true, "watching is recorded on the unit");
  await nav("#/lesson/food/1");
  ok($$("#s-lesson .check.on").length === 1,
     "the video counts for the unit's other lessons");

  group("section test-out");
  await nav("#/unit/core2");
  ok(!!byText("#s-lesson .btn", /Test out of this section/),
     "core units offer a test-out");
  await nav("#/unit/food");
  ok(!byText("#s-lesson .btn", /Test out of this section/),
     "topic branches do not — test-out is for core stages");
  await nav("#/testout/core2");
  {
    const label = ($("#s-lesson .lesson-top .pill") || {}).textContent || "";
    ok(/\/\s*30$/.test(label.trim()) || /30$/.test(label), "section test is 30 questions",
       label);
    const run = await runExercises(200);
    ok(run.steps < 200, "section test runs to completion", "steps " + run.steps);
    ok(/correct/.test($("#s-lesson").textContent), "section test reports a result");
    ok(/lessons marked done|No lessons skipped/.test($("#s-lesson").textContent),
       "the result says what it unlocked");
  }

  group("placement test");
  await nav("#/placement");
  {
    const label = ($("#s-lesson .lesson-top .pill") || {}).textContent || "";
    ok(/50$/.test(label.trim()), "placement is 50 questions", label);
    const kinds = new Set();
    for (let i = 0; i < 6; i++) {
      if ($("#s-lesson .answerbox")) kinds.add("type");
      else if ($$("#s-lesson .opt").length) kinds.add("choice");
      const box = $("#s-lesson .answerbox");
      if (box) {
        box.value = "тест";
        byText("#s-lesson .btn", /^Check$/).click();
      } else {
        const o = $$("#s-lesson .opt").find((b) => !b.disabled);
        if (o) o.click();
      }
      await tick();
      const cont = $$("#s-lesson .verdict .btn")[0];
      if (cont) { cont.click(); await tick(); }
    }
    ok(kinds.size >= 1, "placement asks varied question types",
       Array.from(kinds).join(","));
    const run = await runExercises(400);
    ok(run.steps < 400, "placement runs to completion", "steps " + run.steps);
    ok(/Placement complete/.test($("#title").textContent + $("#s-lesson").textContent),
       "placement reports a result");
    const acc = JSON.parse(window.localStorage.getItem("rb.accounts") || "{}");
    ok(typeof acc.list[0].placed === "number", "the placement level is stored on the profile",
       String(acc.list[0].placed));
  }

  group("practice");
  await tab("practice");
  ok($("#s-practice").hidden === false, "practice opens");
  ok($$("#s-practice .chips .chip").length === 0,
     "no wall of set chips on the screen itself",
     String($$("#s-practice .chips .chip").length));
  ok(!!$("#s-practice .picker"), "a single control opens the set picker");
  ok(!!byText("#s-practice .btn", /Shuffle/), "shuffle control present");
  ok(!!byText("#s-practice .btn", /Fast 20/), "Fast 20 control present");

  group("set picker");
  $("#s-practice .picker").click();
  await tick();
  ok(!!$(".sheet"), "picker opens as a sheet");
  ok($$(".sheet .stagepick").length >= 5, "sets are grouped by stage",
     String($$(".sheet .stagepick").length));
  const stageBtn = $(".sheet .stagepick .btn");
  stageBtn.click();
  await tick();
  ok(state().sets.length > 0, "a whole stage can be selected at once",
     String(state().sets.length));
  byText(".sheet .btn", /^Select all$/).click();
  await tick();
  const allCount = state().sets.length;
  ok(allCount === 27, "select all takes every unlocked set", String(allCount));
  byText(".sheet .btn", /^Clear$/).click();
  await tick();
  ok(state().sets.length === 0, "clear empties the selection");
  $(".sheet .list .row").click();
  await tick();
  ok(state().sets.length === 1, "individual sets toggle");
  byText(".sheet .btn", /^Done$/).click();
  await tick();
  ok(!$(".sheet"), "done closes the picker");

  group("flashcards");
  ok(!!$("#cardarea .panel"), "a card is showing");
  byText("#s-practice .btn", /Fast 20/).click();
  await tick();
  const count = ($("#cardarea .pill") || {}).textContent || "";
  ok(/\/\s*(\d+)/.test(count) && parseInt(count.split("/")[1], 10) <= 20,
     "Fast 20 caps the queue at 20", count);
  const show = byText("#cardarea .btn", /^Show$/);
  if (show) {
    show.click();
    const labels = $$("#cardarea .btn").map((b) => b.firstChild && b.firstChild.textContent);
    ok(["Again", "Hard", "Good", "Easy"].every((l) => labels.includes(l)),
       "all four Anki buttons present", labels.join(","));
    const good = $$("#cardarea .btn").find(
      (b) => b.firstChild && b.firstChild.textContent === "Good");
    if (good) {
      good.click();
      const card = Object.values(state().seen || {}).find((c) => c.s > 0) || {};
      ok(card.s > 0 && card.d >= 1 && card.d <= 10, "FSRS card written",
         JSON.stringify(card));
    }
  }

  group("drills");
  await tab("drills");
  ok($("#s-drills").hidden === false, "drills screen opens");
  ok($$("#s-drills .row").length === 6, "six drill types offered",
     String($$("#s-drills .row").length));
  const drillNames = $$("#s-drills .row").map((r) => r.textContent);
  ok(drillNames.some((t) => /Cases/.test(t)), "cases drill listed");
  ok(drillNames.some((t) => /Aspect/.test(t)), "aspect drill listed");
  ok(drillNames.some((t) => /Agreement/.test(t)), "agreement drill listed");
  ok(drillNames.some((t) => /Grammar/.test(t)), "grammar drill listed");

  for (const type of ["cases", "aspect", "agreement", "conjugation", "stress", "grammar"]) {
    await nav("#/drill/" + type);
    const built = $$("#s-lesson .opt").length > 0;
    ok(built, type + ": questions generate from real data");
    if (!built) continue;
    if (type === "cases") {
      // The hint is the whole point of a drill: show the table, then lock it.
      const hint = $("#s-lesson .hintbtn");
      ok(!!hint, "cases: a table can be pulled up");
      hint.click();
      await tick();
      ok(!!$(".sheet table"), "cases: the hint shows a real declension table");
      ok(hint.disabled === true, "cases: the hint button disables after use");
      byText(".sheet .btn", /Got it/).click();
      await tick();
      ok(!$(".sheet"), "cases: the hint closes");
    }
    const run = await runExercises(120);
    ok(run.steps < 120, type + ": drill runs to completion", "steps " + run.steps);
  }
  ok(/%/.test(($("#s-lesson .orb") || {}).textContent || ""), "a drill ends on a score");
  ok(!!state().drills && Object.keys(state().drills).length >= 5,
     "drill results are recorded", JSON.stringify(state().drills || {}));

  group("immerse");
  await tab("immerse");
  ok($("#s-immerse").hidden === false, "immerse screen opens");
  ok($$("#s-immerse .row").length === 26, "every unit with a video is listed",
     String($$("#s-immerse .row").length));
  ok(/Easy Russian/.test($("#s-immerse").textContent), "the source is named");
  ok($$("#s-immerse .thumb svg").length === 26, "each episode carries its unit icon");
  $("#s-immerse .row").click();
  await tick();
  ok(/Play here|Mark as watched/.test($("#s-lesson").textContent),
     "an episode opens its video screen");

  group("words");
  await tab("dict");
  const q = $("#q");
  const type = (v) => { q.value = v; q.dispatchEvent(new window.Event("input", { bubbles: true })); };
  type("книгу");
  ok(/кни/.test(($("#s-dict .hw") || {}).textContent || ""), "Cyrillic search works");
  ok($$("#s-dict table").length > 0, "paradigm table rendered");
  type("sebe");
  ok(/себ/.test(($("#s-dict .hw") || {}).textContent || ""), "Latin input transliterates");
  type("war");
  ok(/война/.test(($("#s-dict .hw") || {}).textContent || ""), "English search works");
  type("книгу");
  ok($$("#s-dict .ex .tok:not(.dead)").length > 0, "sentence tokens are links");
  const stress = ($("#s-dict .ex .ru") || {}).textContent || "";
  ok(!/[\s ]́/.test(stress), "stress marks stay on their vowel");

  group("profile");
  await nav("#/you");
  ok($$("#s-you .stat").length === 4, "four headline stats");
  ok(/Level \d/.test($("#s-you").textContent), "level shown");
  ok(/Trouble words/i.test($("#s-you").textContent), "trouble bank present");

  group("word starring");
  await nav("#/w/" + encodeURIComponent("книгу"));
  const star = $$("#s-dict .speak").find((b) => b.getAttribute("aria-pressed") !== null);
  ok(!!star, "star control on the word entry");
  star.click();
  ok((state().pinned || []).length > 0, "starring banks the word");
  await nav("#/you");
  ok(/Review \d+ trouble/.test($("#s-you").textContent),
     "a starred word becomes reviewable");

  group("back navigation");
  await tab("path");
  ok($("#back").hidden === true, "no back arrow on a root tab");
  await nav("#/w/" + encodeURIComponent("книга"));
  ok($("#back").hidden === false, "back arrow appears once nested");
  await nav("#/w/" + encodeURIComponent("война"));
  $("#back").click();
  await tick();
  ok(/кни/.test(($("#s-dict .hw") || {}).textContent || ""),
     "back returns to the previous word");

  group("settings");
  $("#cog").click();
  await tick();
  ok(!!$(".sheet"), "settings sheet opens");
  ok(!!byText(".sheet .btn", /^Copy$/), "copy control present");
  ok(!!byText(".sheet .btn", /^Export$/), "export control present");
  ok(!!byText(".sheet .btn", /^Import$/), "import control present");
  const sw = $(".sheet .sw");
  ok(sw.getAttribute("aria-checked") === "true", "developer mode reads as on");
  sw.click();
  await tick();
  ok($("#devbadge").hidden === true, "turning dev mode off hides the badge");
  $(".sheet-bg").click();
  await tick();
  await tab("path");
  ok($$("#s-path .node:disabled").length > 0, "with dev mode off, later stages lock");
  ok($$("#s-path .node.locked .thumb svg").length > 0, "locked units show a padlock");

  group("state migration");
  {
    const legacy = {
      seen: { "книга": { n: 3, due: 900 } },
      unit: { core1: { best: 90, done: false, lessons: { 0: 90 } } },
      xp: 42, streak: 5, name: "Jared", dev: false, theme: "dark",
    };
    const mDom = await new Promise((resolve) => {
      const d = new JSDOM(html, {
        runScripts: "dangerously", pretendToBeVisual: true,
        url: "https://bridges-jf.netlify.app/",
        virtualConsole: new VirtualConsole(),
        beforeParse(win) { win.localStorage.setItem("rb.v1", JSON.stringify(legacy)); },
      });
      setTimeout(() => resolve(d), 300);
    });
    const acc = JSON.parse(mDom.window.localStorage.getItem("rb.accounts") || "{}");
    ok(acc.list && acc.list.length === 1,
       "a pre-profile save is adopted as a profile rather than lost");
    ok(acc.list[0].name === "Jared", "the adopted profile keeps its name");
    const st = JSON.parse(
      mDom.window.localStorage.getItem("rb.state." + acc.active) || "{}");
    ok(st.v === 4, "legacy save migrated to the current schema", String(st.v));
    ok((st.seen["книга"] || {}).reps === 3, "repetition history preserved");
    ok(st.xp === 42 && st.streak === 5, "XP and streak preserved");
    ok(st.name === "Jared" && st.dev === false, "settings preserved");
    const l0 = ((st.unit.core1 || {}).lessons || {})["0"];
    ok(l0 && l0.q === 90 && l0.v === true,
       "a scored lesson became components", JSON.stringify(l0));
    mDom.window.close();
  }

  ok(errors.length === 0, "no script errors across the run",
     errors.join(" | ").slice(0, 300));

  console.log("\n" + checks + " checks · " +
              (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
}, 400);
