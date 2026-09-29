/* Profiles, avatars, and the two ways to skip ahead.
 *
 * Progress is per profile: `rb.accounts` holds the roster, `rb.state.<id>` holds one
 * profile's learning state. A pre-profile save is adopted as the first profile rather
 * than discarded.
 *
 * Two placement routes, both optional:
 *   placement   50 questions across the whole curriculum, offered at sign-up
 *   section     30 questions over one Core stage, offered on that unit's screen
 * Both work the same way: questions carry the unit and lesson they came from, and
 * anything answered well enough is marked complete instead of made compulsory.
 */

const ACC_KEY = "rb.accounts";
const PLACEMENT_N = 50;
const SECTION_N = 30;
const TEST_OUT = 0.8;      // share correct needed to skip a lesson or a stage

let ACCOUNTS = { list: [], active: null };

/* ------------------------------------------------------------- avatars */
/* Drawn inline so the app carries its own cast and works offline. */
/* AV and AV_IDS live in core/avatars.js, shared with the native app. */

function avatarEl(id, size) {
  const a = avatarOf(id);
  const d = el("div", "avatar");
  if (size) d.style.cssText = "width:" + size + "px;height:" + size + "px";
  d.style.background = a.bg;
  d.innerHTML = '<svg viewBox="' + a.vb + '" aria-hidden="true">' + a.svg + "</svg>";
  return d;
}

/* ------------------------------------------------------------- storage */

function loadAccounts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACC_KEY) || "null");
    if (raw && Array.isArray(raw.list)) ACCOUNTS = raw;
  } catch (e) { /* fall through to an empty roster */ }
  return ACCOUNTS;
}
function saveAccounts() {
  try { localStorage.setItem(ACC_KEY, JSON.stringify(ACCOUNTS)); } catch (e) {}
}
function newId() {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

/* A save from before profiles existed becomes the first profile — never dropped.
   Every pre-profile key is considered, oldest schema last, and the state is migrated
   on the way in so the profile starts at the current shape. */
function adoptLegacyState() {
  if (ACCOUNTS.list.length) return;
  const sources = [["rb.state", null], ["rb.v2", 2], ["rb.v1", 1]];
  let raw = null, assumed = null;
  for (const [key, version] of sources) {
    try {
      const s = localStorage.getItem(key);
      if (s) { raw = JSON.parse(s); assumed = version; break; }
    } catch (e) { /* try the next key */ }
  }
  if (!raw || typeof raw !== "object") return;

  const migrated = Object.assign({}, DEFAULTS,
                                 migrate(raw, raw.v || assumed || 2),
                                 { v: SCHEMA_VERSION });
  const id = newId();
  try { localStorage.setItem("rb.state." + id, JSON.stringify(migrated)); }
  catch (e) { return; }
  ACCOUNTS.list.push({ id: id, name: migrated.name || "You", avatar: AV_IDS[0],
                       created: today(), placed: null });
  ACCOUNTS.active = id;
  saveAccounts();
}

const account = () => ACCOUNTS.list.find((a) => a.id === ACCOUNTS.active) || null;

/* ---------------------------------------------------------------- gate */

function initAccounts(onReady) {
  loadAccounts();
  adoptLegacyState();
  window.__onReady = onReady;
  if (ACCOUNTS.active && account()) return onReady(ACCOUNTS.active);
  openGate();
}

function gateShell(title, sub) {
  let gate = $("#gate");
  if (!gate) {
    gate = el("div");
    gate.id = "gate";
    document.body.append(gate);
  }
  gate.textContent = "";
  gate.hidden = false;
  const head = el("div", "gatehead");
  head.append(el("div", "gatetitle", title));
  if (sub) head.append(el("div", "gatesub", sub));
  gate.append(head);
  return gate;
}

function closeGate(id) {
  const gate = $("#gate");
  if (gate) gate.remove();
  ACCOUNTS.active = id;
  saveAccounts();
  window.__onReady(id);
}

function openGate() {
  if (!ACCOUNTS.list.length) return openCreate(true);
  const gate = gateShell("Who's studying?", null);
  const list = el("div", "list");
  ACCOUNTS.list.forEach((a) => {
    const r = el("button", "row");
    r.append(avatarEl(a.avatar, 44));
    const lbl = el("div", "lbl");
    lbl.append(el("div", null, a.name));
    let xp = 0;
    try { xp = (JSON.parse(localStorage.getItem("rb.state." + a.id) || "{}").xp) || 0; }
    catch (e) {}
    lbl.append(el("div", "val", a.placed ? "Placed at stage " + a.placed + " · " + xp + " XP"
                                          : xp + " XP"));
    r.append(lbl);
    r.addEventListener("click", () => closeGate(a.id));
    list.append(r);
  });
  gate.append(list);

  const add = el("button", "btn block", "New profile");
  add.style.marginTop = "14px";
  add.addEventListener("click", () => openCreate(false));
  gate.append(add);
}

function openCreate(first) {
  const gate = gateShell(first ? "Welcome to Bridges" : "New profile",
                         first ? "Pick a character and a name." : null);
  let chosen = AV_IDS[Math.floor(Math.random() * AV_IDS.length)];

  const grid = el("div", "avgrid");
  AV_IDS.forEach((id) => {
    const b = el("button", "avpick" + (id === chosen ? " on" : ""));
    b.type = "button";
    b.title = AV[id].name;
    b.setAttribute("aria-label", AV[id].name);
    b.append(avatarEl(id, 54));
    b.addEventListener("click", () => {
      chosen = id;
      Array.from(grid.children).forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      caption.textContent = AV[id].name;
    });
    grid.append(b);
  });
  gate.append(grid);
  const caption = el("div", "avname", AV[chosen].name);
  gate.append(caption);

  const input = el("input", "namebox");
  input.type = "text";
  input.placeholder = "Your name";
  input.maxLength = 20;
  input.autocomplete = "off";
  gate.append(input);

  const go = el("button", "btn pri block", "Continue");
  go.style.marginTop = "14px";
  go.addEventListener("click", () => {
    const a = { id: newId(), name: (input.value || "").trim().slice(0, 20) || "Learner",
                avatar: chosen, created: today(), placed: null };
    ACCOUNTS.list.push(a);
    ACCOUNTS.active = a.id;
    saveAccounts();
    offerPlacement(a);
  });
  gate.append(go);

  if (!first) {
    const cancel = el("button", "btn ghost block", "Back");
    cancel.style.marginTop = "8px";
    cancel.addEventListener("click", openGate);
    gate.append(cancel);
  }
  input.focus();
}

function offerPlacement(a) {
  const gate = gateShell("Where should we start?",
                         "A short test can skip what you already know.");
  const wrap = el("div", "list");

  const test = el("button", "row");
  test.append(avatarEl(a.avatar, 44));
  const l1 = el("div", "lbl");
  l1.append(el("div", null, "Take the placement test"));
  l1.append(el("div", "val", PLACEMENT_N + " questions · about 10 minutes"));
  test.append(l1);
  test.addEventListener("click", () => {
    closeGate(a.id);
    location.hash = "#/placement";
  });
  wrap.append(test);

  const scratch = el("button", "row");
  const l2 = el("div", "lbl");
  l2.append(el("div", null, "Start from the beginning"));
  l2.append(el("div", "val", "You can test out of a section later"));
  scratch.append(l2);
  scratch.addEventListener("click", () => { closeGate(a.id); location.hash = "#/path"; });
  wrap.append(scratch);

  gate.append(wrap);
}

function switchProfile() {
  ACCOUNTS.active = null;
  saveAccounts();
  location.hash = "#/path";
  location.reload();
}

/* ------------------------------------------------------- placement tests */

/* Questions carry where they came from, so a result can unlock precisely. */
/* A unit can hold fewer words than the test wants questions, so top up by asking
   some words a second time in a different form rather than shipping a short test. */
function topUp(out, target, make) {
  let guard = 0;
  while (out.length < target && guard++ < target * 6) {
    const seed = out[Math.floor(Math.random() * out.length)];
    if (!seed) break;
    const extra = make(seed);
    if (extra) out.push(extra);
  }
  return out;
}

function placementQuestions() {
  const out = [];
  const perStage = Math.ceil(PLACEMENT_N / STAGES.length);
  STAGES.forEach((s, si) => {
    sample(s.core.w.slice(), Math.min(perStage, s.core.w.length)).forEach((i) => {
      const q = pickQuestion(i, s.core);
      if (q) { q.stage = si; out.push(q); }
    });
  });
  topUp(out, PLACEMENT_N, (seed) => {
    const stage = STAGES[seed.stage];
    if (!stage) return null;
    const q = pickQuestion(seed.i, stage.core);
    if (q) q.stage = seed.stage;
    return q;
  });
  return shuffle(out).slice(0, PLACEMENT_N);
}

function sectionQuestions(unit) {
  const out = [];
  const n = lessonCount(unit);
  const per = Math.ceil(SECTION_N / n);
  for (let li = 0; li < n; li++) {
    sample(lessonWords(unit, li), per).forEach((i) => {
      const q = pickQuestion(i, unit);
      if (q) { q.lesson = li; out.push(q); }
    });
  }
  topUp(out, SECTION_N, (seed) => {
    const q = pickQuestion(seed.i, unit);
    if (q) q.lesson = seed.lesson;
    return q;
  });
  return shuffle(out).slice(0, SECTION_N);
}

/* Mixed types, weighted to recognition so a real beginner is not simply stonewalled. */
function pickQuestion(idx, unit) {
  const pool = unit.w.length >= 8 ? unit.w : UN.flatMap((u) => u.w).slice(0, 400);
  const kinds = ["choose-en", "choose-ru", "cloze", "type"];
  if (voice) kinds.push("listen");
  const t = kinds[Math.floor(Math.random() * kinds.length)];
  if (t === "cloze") {
    const c = clozeFor(idx);
    if (!c) return { t: "choose-en", i: idx, pool: pool };
    return { t: "cloze", i: idx, ex: c.ex, token: c.token, pool: pool };
  }
  return { t: t, i: idx, pool: pool };
}

function startPlacement() {
  runTest({
    title: "Placement test",
    questions: placementQuestions(),
    onDone: finishPlacement,
  });
}

function startSectionTest(unit) {
  runTest({
    title: unit.name + " · test out",
    questions: sectionQuestions(unit),
    onDone: (results) => finishSection(unit, results),
  });
}

function finishPlacement(results) {
  // A stage is cleared when its questions were answered well enough. Stop at the
  // first stage that is not — placement should not leave holes behind the learner.
  let placed = 0;
  for (let si = 0; si < STAGES.length; si++) {
    const qs = results.filter((r) => r.stage === si);
    if (!qs.length) break;
    const rate = qs.filter((r) => r.right).length / qs.length;
    if (rate < TEST_OUT) break;
    placed = si + 1;
    completeUnit(STAGES[si].core);
  }
  const a = account();
  if (a) { a.placed = placed; saveAccounts(); }

  const right = results.filter((r) => r.right).length;
  testResult("Placement complete",
    right + " of " + results.length + " correct",
    placed ? "Stages 1–" + placed + " are marked done. You start at stage " + (placed + 1) + "."
           : "Starting from stage 1 — nothing to skip yet.",
    "#/path");
}

function finishSection(unit, results) {
  let cleared = 0;
  for (let li = 0; li < lessonCount(unit); li++) {
    const qs = results.filter((r) => r.lesson === li);
    if (!qs.length) continue;
    const rate = qs.filter((r) => r.right).length / qs.length;
    if (rate >= TEST_OUT) {
      markComponent(unit, li, "vocab");
      markComponent(unit, li, "quiz", Math.round(rate * 100));
      cleared++;
    }
  }
  const right = results.filter((r) => r.right).length;
  testResult(unit.name + " test",
    right + " of " + results.length + " correct",
    cleared ? cleared + " of " + lessonCount(unit) + " lessons marked done."
            : "No lessons skipped — worth working through this one.",
    "#/unit/" + unit.id);
}

function completeUnit(unit) {
  for (let li = 0; li < lessonCount(unit); li++) {
    markComponent(unit, li, "vocab");
    markComponent(unit, li, "quiz", 100);
  }
  if (unit.v) markComponent(unit, 0, "video");
}

function testResult(title, score, detail, backHash) {
  const root = $("#s-lesson");
  root.textContent = "";
  setScreen("lesson");
  $("#title").textContent = title;
  const p = el("div", "panel");
  p.style.cssText = "text-align:center;padding:30px 18px";
  const orb = el("div", "orb");
  orb.style.cssText = "width:76px;height:76px;margin:0 auto 14px;font-size:22px;" +
    "background:var(--brand-bg);color:var(--brand-ink)";
  orb.textContent = "✓";
  p.append(orb);
  p.append(el("div", null, score));
  p.append(el("div", "gloss", detail));
  root.append(p);
  const b = el("button", "btn pri block", "Continue");
  b.style.marginTop = "16px";
  b.addEventListener("click", () => { location.hash = backHash; });
  root.append(b);
}
