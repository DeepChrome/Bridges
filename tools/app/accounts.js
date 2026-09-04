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
const AV = {
  monkeynaut: { name: "Monkeynaut", bg: "#2E3A59", svg:
    '<circle cx="32" cy="35" r="19" fill="#A9744F"/>' +
    '<circle cx="13" cy="33" r="6" fill="#A9744F"/><circle cx="51" cy="33" r="6" fill="#A9744F"/>' +
    '<ellipse cx="32" cy="41" rx="11" ry="8.5" fill="#E8C39E"/>' +
    '<circle cx="27" cy="33" r="2.4" fill="#241a12"/><circle cx="37" cy="33" r="2.4" fill="#241a12"/>' +
    '<path d="M28 43q4 3 8 0" stroke="#8a5c3b" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="32" cy="34" r="23" fill="#BFE9FF" opacity=".22"/>' +
    '<circle cx="32" cy="34" r="23" fill="none" stroke="#DCF3FF" stroke-width="2.5"/>' +
    '<path d="M18 24q6-7 15-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>' },

  gymbun: { name: "Gym Bunny", bg: "#F6D3DF", svg:
    '<ellipse cx="24" cy="16" rx="5" ry="13" fill="#FFF6F0"/><ellipse cx="40" cy="16" rx="5" ry="13" fill="#FFF6F0"/>' +
    '<ellipse cx="24" cy="17" rx="2.2" ry="8" fill="#F5A9BE"/><ellipse cx="40" cy="17" rx="2.2" ry="8" fill="#F5A9BE"/>' +
    '<circle cx="32" cy="38" r="16" fill="#FFF6F0"/>' +
    '<circle cx="26" cy="36" r="2.4" fill="#3b2b2f"/><circle cx="38" cy="36" r="2.4" fill="#3b2b2f"/>' +
    '<path d="M32 41l-2.5 2.5h5z" fill="#F5A9BE"/>' +
    '<rect x="12" y="47" width="6" height="12" rx="2" fill="#4A4E57"/>' +
    '<rect x="46" y="47" width="6" height="12" rx="2" fill="#4A4E57"/>' +
    '<rect x="17" y="51" width="30" height="4" rx="2" fill="#6B7280"/>' },

  shadesduck: { name: "Cool Duck", bg: "#BFE3F5", svg:
    '<circle cx="32" cy="34" r="18" fill="#FFD34E"/>' +
    '<path d="M14 38q-6 2-6 5 0 3 7 3l8-4z" fill="#F08A2E"/>' +
    '<ellipse cx="30" cy="45" rx="12" ry="6" fill="#F5A623"/>' +
    '<rect x="19" y="27" width="27" height="9" rx="4.5" fill="#23252B"/>' +
    '<path d="M32 27v9" stroke="#BFE3F5" stroke-width="2"/>' +
    '<path d="M40 18q6-4 9 1" stroke="#F5A623" stroke-width="3" fill="none" stroke-linecap="round"/>' },

  djcat: { name: "DJ Cat", bg: "#2B2440", svg:
    '<path d="M18 24l2-12 11 7zM46 24l-2-12-11 7z" fill="#9AA3B0"/>' +
    '<circle cx="32" cy="36" r="17" fill="#9AA3B0"/>' +
    '<circle cx="26" cy="34" r="2.6" fill="#1f1b2b"/><circle cx="38" cy="34" r="2.6" fill="#1f1b2b"/>' +
    '<path d="M32 39l-2.5 2.5h5z" fill="#F79FB0"/>' +
    '<path d="M22 43q10 6 20 0" stroke="#5b6472" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M13 34a19 19 0 0 1 38 0" stroke="#F2545B" stroke-width="4" fill="none"/>' +
    '<rect x="7" y="30" width="9" height="14" rx="4.5" fill="#F2545B"/>' +
    '<rect x="48" y="30" width="9" height="14" rx="4.5" fill="#F2545B"/>' },

  scarfbear: { name: "Cosy Bear", bg: "#E8D6C0", svg:
    '<circle cx="17" cy="21" r="7" fill="#8B5E3C"/><circle cx="47" cy="21" r="7" fill="#8B5E3C"/>' +
    '<circle cx="17" cy="21" r="3.4" fill="#C89B78"/><circle cx="47" cy="21" r="3.4" fill="#C89B78"/>' +
    '<circle cx="32" cy="33" r="17" fill="#8B5E3C"/>' +
    '<ellipse cx="32" cy="39" rx="10" ry="7.5" fill="#D9B48F"/>' +
    '<circle cx="26" cy="31" r="2.4" fill="#2b1d13"/><circle cx="38" cy="31" r="2.4" fill="#2b1d13"/>' +
    '<ellipse cx="32" cy="36" rx="3" ry="2.2" fill="#2b1d13"/>' +
    '<path d="M12 50q20 8 40 0v8H12z" fill="#C0392B"/>' +
    '<rect x="10" y="46" width="44" height="7" rx="3.5" fill="#E0574A"/>' },

  profowl: { name: "Professor Owl", bg: "#C9E4C5", svg:
    '<path d="M16 18l5-8 6 7zM48 18l-5-8-6 7z" fill="#8D6E52"/>' +
    '<ellipse cx="32" cy="36" rx="19" ry="18" fill="#A67C52"/>' +
    '<ellipse cx="32" cy="41" rx="12" ry="12" fill="#D9BE9A"/>' +
    '<circle cx="24" cy="32" r="8" fill="#FFF9F0"/><circle cx="40" cy="32" r="8" fill="#FFF9F0"/>' +
    '<circle cx="24" cy="32" r="3.2" fill="#2c2a26"/><circle cx="40" cy="32" r="3.2" fill="#2c2a26"/>' +
    '<circle cx="24" cy="32" r="8" fill="none" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<circle cx="40" cy="32" r="8" fill="none" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<path d="M32 32h0M31 32h2" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<path d="M32 38l-3 4h6z" fill="#E8A33D"/>' },

  kingfrog: { name: "Frog King", bg: "#CDEBC0", svg:
    '<circle cx="22" cy="24" r="8" fill="#5FBF6A"/><circle cx="42" cy="24" r="8" fill="#5FBF6A"/>' +
    '<circle cx="22" cy="24" r="4" fill="#fff"/><circle cx="42" cy="24" r="4" fill="#fff"/>' +
    '<circle cx="22" cy="25" r="2.1" fill="#22331f"/><circle cx="42" cy="25" r="2.1" fill="#22331f"/>' +
    '<ellipse cx="32" cy="41" rx="19" ry="15" fill="#5FBF6A"/>' +
    '<path d="M20 44q12 9 24 0" stroke="#2F6B37" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<circle cx="21" cy="39" r="2.4" fill="#F29AA8" opacity=".8"/>' +
    '<circle cx="43" cy="39" r="2.4" fill="#F29AA8" opacity=".8"/>' +
    '<path d="M22 13l4 6 6-8 6 8 4-6 1 9H21z" fill="#F2C14E"/>' },

  bowtiepen: { name: "Penguin", bg: "#D6E9F5", svg:
    '<ellipse cx="32" cy="36" rx="18" ry="20" fill="#2B2F38"/>' +
    '<ellipse cx="32" cy="40" rx="11.5" ry="15" fill="#FFFDF7"/>' +
    '<circle cx="26" cy="30" r="2.5" fill="#2B2F38"/><circle cx="38" cy="30" r="2.5" fill="#2B2F38"/>' +
    '<path d="M32 33l-4 4 4 3 4-3z" fill="#F0932B"/>' +
    '<path d="M25 47l7 4 7-4-3-3h-8z" fill="#C0392B"/>' +
    '<circle cx="32" cy="47" r="2" fill="#8E2A20"/>' +
    '<path d="M12 42q4-8 6 0M52 42q-4-8-6 0" stroke="#2B2F38" stroke-width="3" fill="none" stroke-linecap="round"/>' },

  sneakfox: { name: "Sly Fox", bg: "#FFE0C2", svg:
    '<path d="M13 16l6 14 8-6zM51 16l-6 14-8-6z" fill="#E8743B"/>' +
    '<path d="M13 16l4 9 5-4zM51 16l-4 9-5-4z" fill="#FFF2E6"/>' +
    '<path d="M32 20c11 0 18 8 18 16s-8 14-18 14-18-6-18-14 7-16 18-16z" fill="#E8743B"/>' +
    '<path d="M32 34c6 0 10 4 10 8s-5 8-10 8-10-4-10-8 4-8 10-8z" fill="#FFF2E6"/>' +
    '<circle cx="25" cy="33" r="2.5" fill="#3a251b"/><circle cx="39" cy="33" r="2.5" fill="#3a251b"/>' +
    '<path d="M32 42l-3 2.5 3 2 3-2z" fill="#3a251b"/>' },

  spikelib: { name: "Hedgehog", bg: "#EADFD0", svg:
    '<path d="M32 12c12 0 20 9 20 19s-9 19-20 19-20-8-20-19S20 12 32 12z" fill="#7A6250"/>' +
    '<path d="M14 26l-6-4 7-1zM16 18l-4-6 7 2zM24 13l-1-7 5 5zM33 11l2-7 3 6zM43 14l5-5-1 7zM50 20l7-2-4 6zM53 29l7 1-6 4z" fill="#7A6250"/>' +
    '<ellipse cx="32" cy="42" rx="13" ry="11" fill="#E0C9AE"/>' +
    '<circle cx="27" cy="39" r="2.3" fill="#33281f"/><circle cx="37" cy="39" r="2.3" fill="#33281f"/>' +
    '<ellipse cx="32" cy="46" rx="3" ry="2.4" fill="#33281f"/>' },
};
const AV_IDS = Object.keys(AV);

function avatarEl(id, size) {
  const a = AV[id] || AV[AV_IDS[0]];
  const d = el("div", "avatar");
  if (size) d.style.cssText = "width:" + size + "px;height:" + size + "px";
  d.style.background = a.bg;
  d.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true">' + a.svg + "</svg>";
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
