/* Bridges — app shell, screens and router.
 * DATA is injected by tools/build_site.py. */

const L = DATA.lemmas, IX = DATA.index, UN = DATA.units, PATH = DATA.path;

/* ---------------------------------------------------------------- utils */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const el = (t, c, x) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (x !== undefined) n.textContent = x;
  return n;
};
const frag = () => document.createDocumentFragment();
const nf = (n) => n.toLocaleString("en-US");
/* fold, bare, TOKEN, shuffle, sample, today, translit and friends now live in
 * core/util.js, shared verbatim with the native app and inlined above this file
 * by tools/build_site.py. */

/* ---------------------------------------------------------------- store */
/* Set to rb.state.<profileId> once a profile is chosen. The bare key is only read
   during adoption of a pre-profile save. */
let KEY = "rb.state";
const SCHEMA_VERSION = 4;
const LEGACY_KEYS = ["rb.v2", "rb.v1"];   // read once, then migrated forward

const DEFAULTS = {
  v: SCHEMA_VERSION,
  dev: true,            // ships on, as requested
  theme: "auto",
  dir: 0,               // 0 = RU->EN
  sets: [],
  seen: {},             // word -> FSRS card {s, d, due, last, reps, lapses}
  trouble: {},          // word -> times it tripped you up
  pinned: [],           // words starred by hand
  unit: {},             // unitId -> {best, done, lessons:{i:score}}
  recent: [],           // dictionary history, newest first; keyed on the word itself
  name: "",
  xp: 0,
  day: null,
  streak: 0,
};
/* Migrations are explicit and forward-only. Each step takes the previous shape and
   returns the next; unknown or corrupt state falls back to defaults rather than
   throwing away a partially-readable save. */
const MIGRATIONS = {
  // v1 (rb.v1) used Leitner counters: seen[word] = {n, due}. FSRS needs stability and
  // difficulty, which cannot be derived from a repetition count — so reps are kept as
  // history and the word re-enters scheduling as new rather than inventing a memory
  // state that was never measured.
  1: (s) => {
    const seen = {};
    for (const w in (s.seen || {})) {
      const old = s.seen[w] || {};
      seen[w] = { s: 0, d: 0, due: old.due || 0, last: 0, reps: old.n || 0, lapses: 0 };
    }
    return Object.assign({}, s, { seen: seen, trouble: {}, pinned: [], v: 2 });
  },
  // v2 -> v3 only adds fields that DEFAULTS already supplies.
  2: (s) => Object.assign({}, s, { v: 3 }),
  // v3 -> v4: a lesson stopped being a single score and became three components.
  // An existing score means the quiz was passed, which means the words were seen.
  3: (s) => {
    const unit = {};
    for (const id in (s.unit || {})) {
      const u = s.unit[id];
      const lessons = {};
      for (const k in (u.lessons || {})) {
        const old = u.lessons[k];
        lessons[k] = typeof old === "number" ? { v: true, q: old } : old;
      }
      unit[id] = Object.assign({}, u, { lessons: lessons });
    }
    return Object.assign({}, s, { unit: unit, v: 4 });
  },
};

function migrate(raw, from) {
  let s = raw, v = from;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v = s.v || v + 1;
  }
  return s;
}

function loadState() {
  let raw = null, version = SCHEMA_VERSION;
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) {
      raw = JSON.parse(cur);
      version = raw.v || 2;
    } else {
      for (let i = 0; i < LEGACY_KEYS.length; i++) {
        const old = localStorage.getItem(LEGACY_KEYS[i]);
        if (old) {
          raw = JSON.parse(old);
          version = raw.v || (LEGACY_KEYS[i] === "rb.v1" ? 1 : 2);
          break;
        }
      }
    }
  } catch (e) {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return Object.assign({}, DEFAULTS);
  return Object.assign({}, DEFAULTS, migrate(raw, version), { v: SCHEMA_VERSION });
}

let ST = Object.assign({}, DEFAULTS);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };

/* Point the store at one profile and load it, migrating on the way in. */
function useAccount(id) {
  KEY = "rb.state." + id;
  ST = loadState();
  save();
}

function touchStreak() {
  const t = today();
  if (ST.day === t) return;
  if (ST.day === null || ST.day === undefined) {
    // Migrated or imported state records a streak but not when it last advanced.
    // Adopt what was recorded rather than resetting it — we cannot prove it lapsed.
    ST.streak = ST.streak || 1;
  } else {
    ST.streak = ST.day === t - 1 ? (ST.streak || 0) + 1 : 1;
  }
  ST.day = t;
  save();
}

/* ---------------------------------------------------------------- speech */
let voice = null;
function pickVoice() {
  const v = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  voice = v.find((x) => x.lang && x.lang.toLowerCase().startsWith("ru")) || null;
  // A speak button stays live when a real recording exists, voice or no voice.
  $$(".speak[data-say]").forEach((b) => {
    b.disabled = !voice && !hasRealAudio(b.dataset.say);
  });
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();
/* Real recordings first; the device voice only covers what the collection lacks.
   AUDIO maps a folded utterance to a file exported by tools/build_audio.py. */
const AUDIO = (DATA.audio && DATA.audio.files) || {};
let player = null;

function speakTTS(text) {
  if (!voice) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(bare(text));
  u.voice = voice; u.lang = voice.lang; u.rate = 0.88;
  speechSynthesis.speak(u);
  return true;
}

function say(text) {
  const hit = AUDIO[fold(text)];
  if (!hit) { speakTTS(text); return; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (player) { player.pause(); player = null; }
  const a = new Audio("audio/" + hit);
  a.preload = "auto";
  // A missing or unplayable file must not leave the learner in silence.
  a.addEventListener("error", () => speakTTS(text), { once: true });
  player = a;
  const p = a.play();
  if (p && p.catch) p.catch(() => speakTTS(text));
}

/* True when this build ships recordings for a word — used to label the source. */
const hasRealAudio = (text) => !!AUDIO[fold(text)];
const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"></path>' +
  '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
function speakBtn(text) {
  const b = el("button", "speak");
  b.type = "button";
  b.innerHTML = SPK;
  b.dataset.say = text;
  const real = hasRealAudio(text);
  b.setAttribute("aria-label", real ? "Hear it" : "Hear it (device voice)");
  if (real) b.classList.add("real");
  b.disabled = !voice && !real;
  b.addEventListener("click", (e) => { e.stopPropagation(); say(text); });
  return b;
}

/* ---------------------------------------------------------------- popover */
const pop = $("#pop");
let popTimer = null;
/* Which word the popover is currently describing — the state that makes the second
   press mean "go there" rather than "show me again". */
let popFor = null;
const hidePop = () => {
  pop.style.display = "none";
  popFor = null;
  clearTimeout(popTimer);
};
/* Same summary the native sheet shows, from the same core function: the word, which
   form was actually tapped, its grammar, and the gloss. */
function showPop(target, i, surface) {
  const s = summarise(L[i], surface);
  pop.textContent = "";
  pop.append(el("div", "pw", s.word));
  if (s.form) {
    pop.append(el("div", "pf",
      s.surface ? s.surface + " · " + s.form.text : s.form.text));
  } else if (s.surface) {
    pop.append(el("div", "pf", s.surface + " · form not in the paradigm"));
  }
  pop.append(el("div", "pg",
    s.tags.join(" · ") + (s.gloss ? " — " + s.gloss : "")));
  pop.append(el("div", "ph", "Tap again for the full entry"));
  popFor = i;
  pop.style.display = "block";
  const r = target.getBoundingClientRect();
  const maxL = window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 10;
  pop.style.top = (r.bottom + window.scrollY + 6) + "px";
  pop.style.left = Math.max(6, Math.min(r.left + window.scrollX, maxL)) + "px";
}
document.addEventListener("scroll", hidePop, { passive: true });

function linkify(text) {
  const f = frag();
  let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) f.append(text.slice(last, m.index));
    const hits = IX[fold(m[0])];
    if (hits && hits.length) {
      const a = el("a", "tok", m[0]);
      a.href = "#/w/" + encodeURIComponent(fold(m[0]));
      const idx = hits[0];
      const surface = m[0];

      // Hovering is not pressing: on a pointer device the summary can just appear.
      a.addEventListener("mouseenter", () => {
        popTimer = setTimeout(() => showPop(a, idx, surface), 200);
      });
      a.addEventListener("mouseleave", hidePop);

      // Two presses, the same as the native sheet. The first answers "which word is
      // this, and which form?" without leaving the sentence; only the second commits
      // to the full entry. Applies to clicks as well as taps, so the behaviour does
      // not change depending on what you are holding.
      a.addEventListener("click", (e) => {
        if (popFor === idx) { hidePop(); return; }   // second press: follow the link
        e.preventDefault();
        showPop(a, idx, surface);
      });
      f.append(a);
    } else {
      f.append(el("span", "tok dead", m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) f.append(text.slice(last));
  return f;
}

/* ------------------------------------------------------------ curriculum */
/* Chapters come straight from the path layout: a spine unit, the title of the
   chapter it opens, and the themed branches that hang off it. */
const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) {
      out.push({ core: UN[p.u], branches: [],
                 n: p.cn || out.length + 1, title: p.ch || "" });
    } else out[out.length - 1].branches.push(UN[p.u]);
  });
  return out;
})();

const LESSON_SIZE = 7;
const PASS_MARK = 80;
const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / LESSON_SIZE));
const lessonWords = (u, i) => u.w.slice(i * LESSON_SIZE, (i + 1) * LESSON_SIZE);
const unitState = (id) => ST.unit[id] || { best: 0, done: false, lessons: {}, video: false };

/* A lesson is three things that can be done in any order. The video belongs to the
   unit, not the lesson — there is one video for a unit's worth of vocabulary — so
   watching it once counts for every lesson in that unit. */
function components(u, i) {
  const st = unitState(u.id);
  const l = (st.lessons || {})[i] || {};
  const out = [
    { id: "vocab", label: "Vocabulary", done: !!l.v },
    { id: "quiz", label: "Quiz", done: typeof l.q === "number" && l.q >= PASS_MARK,
      score: l.q },
  ];
  if (u.v) out.push({ id: "video", label: "Video", done: !!st.video, shared: true });
  return out;
}
const lessonDone = (u, i) => components(u, i).every((c) => c.done);

function markComponent(u, i, id, extra) {
  const st = Object.assign({ best: 0, done: false, lessons: {}, video: false },
                           ST.unit[u.id]);
  st.lessons = Object.assign({}, st.lessons);
  if (id === "video") {
    st.video = true;
  } else {
    const l = Object.assign({}, st.lessons[i]);
    if (id === "vocab") l.v = true;
    if (id === "quiz") {
      l.q = Math.max(l.q || 0, extra || 0);
      st.best = Math.max(st.best || 0, extra || 0);
    }
    st.lessons[i] = l;
  }
  ST.unit[u.id] = st;
  st.done = Array.from({ length: lessonCount(u) }, (_, k) => k).every((k) => lessonDone(u, k));
  save();
}

function unitProgress(u) {
  const n = lessonCount(u);
  let done = 0;
  for (let i = 0; i < n; i++) if (lessonDone(u, i)) done++;
  return Math.min(1, done / n);
}

/* Partial credit so the browser shows movement inside a lesson, not just after it. */
function unitFineProgress(u) {
  const n = lessonCount(u);
  let total = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const cs = components(u, i);
    total += cs.length;
    done += cs.filter((c) => c.done).length;
  }
  return total ? done / total : 0;
}

/* ICONS and iconFor live in core/icons.js, shared with the native app. */

function unitIcon(unitId, size) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (size) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", iconFor(unitId));
  svg.append(p);
  return svg;
}
function stageDone(s) { return unitProgress(s.core) >= 1; }
function stageUnlocked(i) {
  if (ST.dev) return true;
  if (i === 0) return true;
  return stageDone(STAGES[i - 1]);
}
function unitUnlocked(u) {
  if (ST.dev) return true;
  const i = STAGES.findIndex((s) => s.core.id === u.id || s.branches.includes(u));
  if (i < 0) return true;
  if (!stageUnlocked(i)) return false;
  // A branch opens once its stage's core lesson set is underway.
  if (STAGES[i].core.id === u.id) return true;
  return unitProgress(STAGES[i].core) > 0;
}

/* ------------------------------------------------------------ screens */
const SCREENS = ["path", "lesson", "practice", "drills", "immerse", "dict", "you"];
const TITLES = { path: "Learn", lesson: "Lesson", practice: "Study",
                 drills: "Practice", immerse: "Immerse", dict: "Search", you: "You" };

/* How deep we are below a root tab. Forward navigations compute it; the browser
   hands it back on a back/forward, so the arrow stays honest. */
let depth = 0;

function setScreen(name) {
  SCREENS.forEach((s) => { $("#s-" + s).hidden = s !== name; });
  $("#title").textContent = TITLES[name] || "Bridges";
  $("#back").hidden = depth === 0;
  $$("#tabs button").forEach((b) => {
    b.setAttribute("aria-current", b.dataset.go === name ? "true" : "false");
  });
  window.scrollTo(0, 0);
}

/* ---------- path ---------- */
function renderPath() {
  const root = $("#s-path");
  root.textContent = "";

  // A compact line, not two dashboard tiles.
  const head = el("div", "sec");
  const stats = el("div", "headline");
  stats.append(el("b", null, nf(ST.xp || 0)));
  stats.append(el("span", null, "XP"));
  stats.append(el("i", null, "·"));
  stats.append(el("b", null, String(ST.streak || 0)));
  stats.append(el("span", null, (ST.streak === 1 ? "day" : "days") + " in a row"));
  head.append(stats);
  root.append(head);

  const next = nextLesson();
  if (next) {
    const cta = el("button", "btn pri block",
      (unitProgress(next.unit) > 0 ? "Continue" : "Start") +
      " · " + next.unit.name + " · Lesson " + (next.index + 1));
    cta.style.marginTop = "12px";
    cta.addEventListener("click", () => {
      location.hash = "#/lesson/" + next.unit.id + "/" + next.index;
    });
    head.append(cta);
  }

  const track = el("div", "track");
  STAGES.forEach((s, i) => {
    const open = stageUnlocked(i);
    const h = el("div", "stage-h");
    const lab = el("div", "chap");
    lab.append(el("span", "ttl", "Chapter " + (s.n || i + 1)));
    if (s.title) lab.append(el("span", "name", s.title));
    h.append(lab);
    if (stageDone(s)) h.append(el("span", "pill good", "done"));
    else if (!open) h.append(el("span", "pill lock", "locked"));
    track.append(h);
    track.append(unitNode(s.core, open, false));
    s.branches.forEach((u) => track.append(unitNode(u, unitUnlocked(u), true)));
  });
  root.append(track);
}

/* The first unfinished lesson in path order — what "Continue" resumes. */
function nextLesson() {
  for (let i = 0; i < STAGES.length; i++) {
    if (!stageUnlocked(i)) break;
    const units = [STAGES[i].core].concat(STAGES[i].branches);
    for (const u of units) {
      if (!unitUnlocked(u)) continue;
      for (let k = 0; k < lessonCount(u); k++) {
        if (!lessonDone(u, k)) return { unit: u, index: k };
      }
    }
  }
  return null;
}

function unitNode(u, open, isBranch) {
  const pr = unitFineProgress(u);
  const complete = unitProgress(u) >= 1;
  const n = el("button", "node" + (isBranch ? " branch" : "") +
                          (complete ? " done" : open ? " open" : " locked"));
  n.disabled = !open;

  const thumb = el("div", "thumb" + (complete ? " done" : ""));
  if (open) {
    thumb.append(unitIcon(u.id));
  } else {
    thumb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" ' +
      'rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
  }
  n.append(thumb);

  const body = el("div", "body");
  body.append(el("div", "nm", u.name));
  let lessonsDone = 0;
  for (let i = 0; i < lessonCount(u); i++) if (lessonDone(u, i)) lessonsDone++;
  // An untouched unit says what it holds, not three different zeros. The bar and the
  // percentage are progress, and there is no progress yet to draw — an empty track
  // under every row is weight without information.
  body.append(el("div", "sub", !open ? "Locked"
    : lessonsDone === 0 ? lessonCount(u) + " lessons"
    : lessonsDone + "/" + lessonCount(u) + " lessons · " + Math.round(pr * 100) + "%"));
  if (open && lessonsDone > 0) {
    const bar = el("div", "pbar");
    const fill = el("i");
    fill.style.width = (pr * 100).toFixed(0) + "%";
    bar.append(fill);
    body.append(bar);
  }
  n.append(body);
  if (open) n.addEventListener("click", () => { location.hash = "#/unit/" + u.id; });
  return n;
}

/* ---------- unit detail (lesson list) ---------- */
function lessonThumb(u, i, done) {
  const t = el("div", "thumb" + (done ? " done" : ""));
  t.append(unitIcon(u.id));
  t.append(el("span", "tnum", String(i + 1)));
  return t;
}

function renderUnit(u) {
  const root = $("#s-lesson");
  root.textContent = "";
  setScreen("lesson");
  $("#title").textContent = u.name;

  const head = el("div", "sec");
  const pr = unitFineProgress(u);
  const line = el("div", "headline");
  line.append(el("b", null, Math.round(pr * 100) + "%"));
  line.append(el("span", null, "complete"));
  head.append(line);
  const bar = el("div", "pbar");
  bar.style.marginTop = "8px";
  const fill = el("i");
  fill.style.width = (pr * 100).toFixed(0) + "%";
  bar.append(fill);
  head.append(bar);
  root.append(head);

  const list = el("div", "list");
  for (let i = 0; i < lessonCount(u); i++) {
    const cs = components(u, i);
    const done = lessonDone(u, i);
    const r = el("button", "row");
    r.append(lessonThumb(u, i, done));
    const lbl = el("div", "lbl");
    lbl.append(el("div", null, "Lesson " + (i + 1)));
    const ws = lessonWords(u, i).map((x) => L[x].b).slice(0, 3).join(", ");
    lbl.append(el("div", "val", ws + (lessonWords(u, i).length > 3 ? "…" : "")));
    r.append(lbl);
    const dots = el("div", "dots");
    cs.forEach((c) => {
      const d = el("span", "dot" + (c.done ? " on" : ""));
      d.title = c.label + (c.done ? " — done" : " — not started");
      dots.append(d);
    });
    r.append(dots);
    r.addEventListener("click", () => { location.hash = "#/lesson/" + u.id + "/" + i; });
    list.append(r);
  }
  root.append(list);

  // Core stages carry a test-out, so someone who already knows this material can
  // skip the lessons instead of grinding them.
  if (u.kind === "spine" && unitProgress(u) < 1) {
    const t = el("div", "sec");
    t.style.marginTop = "16px";
    const b = el("button", "btn block", "Test out of this section");
    b.title = "30 questions — clear the lessons you already know";
    b.addEventListener("click", () => { location.hash = "#/testout/" + u.id; });
    t.append(b);
    root.append(t);
  }

  const wrap = el("div", "sec");
  wrap.style.marginTop = "18px";
  const b = el("button", "btn block", "Browse the words");
  b.addEventListener("click", () => { ST.sets = [u.id]; save(); location.hash = "#/practice"; });
  wrap.append(b);
  root.append(wrap);

  if (u.v) {
    const vs = el("div", "sec");
    vs.append(el("h2", null, "Watch"));
    const card = el("div", "panel");
    card.append(el("div", "q", "Easy Russian"));
    card.append(el("h3", "gtitle", u.v.title));
    const open = el("a", "btn block", "Open on YouTube" +
                    (u.v.dur ? " · " + Math.round(u.v.dur / 60) + " min" : ""));
    open.href = "https://www.youtube.com/watch?v=" + u.v.id;
    open.target = "_blank";
    open.rel = "noopener";
    open.style.marginTop = "12px";
    open.style.textAlign = "center";
    card.append(open);
    vs.append(card);
    root.append(vs);
  }
}

/* ---------- lesson hub: the three components ---------- */
function renderLessonHub(u, i) {
  const root = $("#s-lesson");
  root.textContent = "";
  setScreen("lesson");
  $("#title").textContent = u.name + " · " + (i + 1);

  const cs = components(u, i);
  const head = el("div", "sec");
  const line = el("div", "headline");
  line.append(el("b", null, cs.filter((c) => c.done).length + "/" + cs.length));
  line.append(el("span", null, "steps done"));
  head.append(line);
  root.append(head);

  const list = el("div", "list");
  const COPY = {
    vocab: "Meet the new words",
    quiz: "Show you know them",
    video: "Hear them in the wild",
  };
  cs.forEach((c) => {
    const r = el("button", "row");
    const mark = el("span", "check" + (c.done ? " on" : ""));
    if (c.done) {
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="m5 13 4 4 10-10"></path></svg>';
    }
    r.append(mark);
    const lbl = el("div", "lbl");
    lbl.append(el("div", null, c.label));
    lbl.append(el("div", "val", COPY[c.id] +
      (c.id === "video" ? " · shared across this unit" : "")));
    r.append(lbl);
    if (c.id === "quiz" && typeof c.score === "number") {
      r.append(el("span", "pill" + (c.done ? " good" : ""), c.score + "%"));
    }
    r.addEventListener("click", () => {
      location.hash = "#/lesson/" + u.id + "/" + i + "/" + c.id;
    });
    list.append(r);
  });
  root.append(list);

  if (lessonDone(u, i)) {
    const next = el("div", "sec");
    next.style.marginTop = "16px";
    const b = el("button", "btn pri block",
      i + 1 < lessonCount(u) ? "Next lesson" : "Back to path");
    b.addEventListener("click", () => {
      location.hash = i + 1 < lessonCount(u)
        ? "#/lesson/" + u.id + "/" + (i + 1) : "#/path";
    });
    next.append(b);
    root.append(next);
  }
}

/* ---------- practice (flashcards) ---------- */
let queue = [], qi = 0, shown = false;

function selectedUnits() {
  return ST.sets.filter((id) => id === "__trouble__" || UN.some((u) => u.id === id));
}

function poolSize() {
  const seen = new Set();
  selectedUnits().forEach((id) => {
    if (id === "__trouble__") {
      troubleWords().forEach((w) => { const i = idxOfWord(w); if (i >= 0) seen.add(i); });
      return;
    }
    const u = UN.find((x) => x.id === id);
    if (u) u.w.forEach((i) => seen.add(i));
  });
  return seen.size;
}

function renderPractice() {
  const root = $("#s-practice");
  root.textContent = "";

  // One line instead of a wall of chips: what is selected, and a way in.
  const picker = el("button", "row picker");
  const lbl = el("div", "lbl");
  const ids = selectedUnits();
  const names = ids.map((id) => id === "__trouble__" ? "Trouble words"
                                : (UN.find((u) => u.id === id) || {}).name)
                   .filter(Boolean);
  lbl.append(el("div", null, names.length
    ? (names.length === 1 ? names[0] : names.length + " sets")
    : "Choose what to practise"));
  lbl.append(el("div", "val", names.length ? poolSize() + " words" : "Nothing selected"));
  picker.append(lbl);
  picker.append(el("span", "pill brand", "Change"));
  picker.addEventListener("click", openSetPicker);
  const wrap = el("div", "list");
  wrap.append(picker);
  root.append(wrap);

  const bar = el("div", "bar");
  const shuffleBtn = el("button", "btn", "Shuffle");
  shuffleBtn.addEventListener("click", () => {
    shuffle(queue); qi = 0; shown = false; drawCard();
  });
  const fast = el("button", "btn", "Fast 20");
  fast.title = "20 cards from your selection, hardest and most overdue first";
  fast.addEventListener("click", () => buildQueue(20));
  bar.append(shuffleBtn, fast);
  root.append(bar);

  const area = el("div");
  area.id = "cardarea";
  root.append(area);
  buildQueue();
}

/* Grouped by stage so a whole stage can be taken in one tap. */
function openSetPicker() {
  const bg = el("div", "sheet-bg");
  const sheet = el("div", "sheet");
  sheet.append(el("div", "grab"));
  const head = el("div", "sheethead");
  head.append(el("h2", null, "Practise"));
  const all = el("button", "btn ghost", "Select all");
  const none = el("button", "btn ghost", "Clear");
  head.append(all, none);
  sheet.append(head);

  const body = el("div");
  sheet.append(body);

  function paint() {
    body.textContent = "";
    const unlocked = UN.filter(unitUnlocked);

    if (troubleWords().length) {
      const list = el("div", "list");
      list.append(setRow({ id: "__trouble__", name: "Trouble words" },
                         troubleWords().length, paint));
      body.append(list);
    }

    STAGES.forEach((s, i) => {
      const units = [s.core].concat(s.branches).filter((u) => unlocked.includes(u));
      if (!units.length) return;
      const on = units.every((u) => ST.sets.includes(u.id));
      const sec = el("div", "sec");
      const h = el("div", "stagepick");
      h.append(el("span", "ttl", s.title || "Chapter " + (s.n || i + 1)));
      const toggle = el("button", "btn ghost", on ? "Deselect stage" : "Select stage");
      toggle.addEventListener("click", () => {
        const ids = units.map((u) => u.id);
        ST.sets = on ? ST.sets.filter((x) => !ids.includes(x))
                     : ST.sets.concat(ids.filter((x) => !ST.sets.includes(x)));
        save(); paint();
      });
      h.append(toggle);
      sec.append(h);
      const list = el("div", "list");
      units.forEach((u) => list.append(setRow(u, u.w.length, paint)));
      sec.append(list);
      body.append(sec);
    });
  }

  all.addEventListener("click", () => {
    ST.sets = UN.filter(unitUnlocked).map((u) => u.id);
    save(); paint();
  });
  none.addEventListener("click", () => { ST.sets = []; save(); paint(); });
  paint();

  const doneBtn = el("button", "btn pri block", "Done");
  doneBtn.style.marginTop = "14px";
  doneBtn.addEventListener("click", () => { bg.remove(); renderPractice(); });
  sheet.append(doneBtn);

  bg.append(sheet);
  document.body.append(bg);
  bg.addEventListener("click", (e) => {
    if (e.target === bg) { bg.remove(); renderPractice(); }
  });
}

function setRow(u, count, paint) {
  const on = ST.sets.includes(u.id);
  const r = el("button", "row");
  const box = el("span", "tick" + (on ? " on" : ""));
  if (on) {
    box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="m5 13 4 4 10-10"></path></svg>';
  }
  r.append(box);
  const lbl = el("div", "lbl");
  lbl.append(el("div", null, u.name));
  lbl.append(el("div", "val", count + " words"));
  r.append(lbl);
  r.addEventListener("click", () => {
    ST.sets = on ? ST.sets.filter((x) => x !== u.id) : ST.sets.concat(u.id);
    save(); paint();
  });
  return r;
}

function buildQueue(limit) {
  const ids = ST.sets.length ? ST.sets : [UN[0].id];
  const pool = [];
  ids.forEach((id) => {
    if (id === "__trouble__") {
      troubleWords().forEach((w) => {
        const i = idxOfWord(w);
        if (i >= 0 && !pool.includes(i)) pool.push(i);
      });
      return;
    }
    const u = UN.find((x) => x.id === id);
    if (u) u.w.forEach((i) => { if (!pool.includes(i)) pool.push(i); });
  });
  const t = today();
  queue = pool.filter((i) => { const s = ST.seen[L[i].b]; return !s || s.due <= t; });
  if (!queue.length) queue = pool.slice();

  if (limit) {
    // Fast 20: the words most worth the next five minutes — banked trouble first,
    // then the most overdue, then unseen.
    queue.sort((a, b) => cardWeight(b) - cardWeight(a));
    queue = queue.slice(0, limit);
  }
  qi = 0; shown = false;
  drawCard();
}

/* Higher is more urgent. */
function cardWeight(i) {
  const w = L[i].b;
  const c = ST.seen[w];
  let score = 0;
  if (ST.trouble[w] || (c && isTrouble(c))) score += 1000;
  if (!c) return score + 50;                      // unseen: worth showing, not urgent
  score += Math.max(0, today() - c.due) * 10;     // days overdue
  score += (c.lapses || 0) * 20;
  score += (c.d || 0);                            // FSRS difficulty
  return score;
}

function drawCard() {
  const area = $("#cardarea");
  if (!area) return;
  area.textContent = "";
  if (!queue.length) { area.append(el("div", "empty", "Choose a set to practise.")); return; }
  if (qi >= queue.length) {
    const p = el("div", "panel");
    p.style.textAlign = "center";
    p.append(el("div", null, "Set finished."));
    const again = el("button", "btn pri block", "Go again");
    again.style.marginTop = "14px";
    again.addEventListener("click", buildQueue);
    p.append(again);
    area.append(p);
    return;
  }

  const w = L[queue[qi]];
  const top = el("div", "lesson-top");
  const bar = el("div", "pbar");
  const fill = el("i");
  fill.style.width = (qi / queue.length * 100) + "%";
  bar.append(fill);
  top.append(bar);
  top.append(el("span", "pill", (qi + 1) + "/" + queue.length));
  area.append(top);

  const card = el("div", "panel");
  card.style.cssText = "text-align:center;padding:28px 16px";
  if (!shown) {
    if (!ST.dir) {
      const r = el("div", "prompt");
      const ru = el("div", "ru", w.w);
      r.append(ru);
      card.append(r);
      card.append(speakBtn(w.b));
    } else {
      const p = el("div", "prompt");
      p.append(el("div", "en", w.e || "—"));
      card.append(p);
    }
  } else {
    const r = el("div", "prompt");
    r.append(el("div", "ru", w.w));
    r.append(el("div", "en", w.e || ""));
    card.append(r);
    card.append(speakBtn(w.b));
    if (w.x && w.x[0]) {
      const ex = el("div", "ex");
      ex.style.marginTop = "16px";
      const ru = el("div", "ru");
      ru.append(linkify(w.x[0].ru));
      ex.append(ru);
      ex.append(el("div", "en", w.x[0].en));
      card.append(ex);
    }
  }
  area.append(card);

  const acts = el("div", "sec");
  acts.style.marginTop = "14px";
  if (!shown) {
    const b = el("button", "btn pri block", "Show");
    b.addEventListener("click", () => { shown = true; drawCard(); });
    acts.append(b);
  } else {
    acts.append(gradeRow(L[queue[qi]].b, rateCard));
    const open = el("button", "btn ghost block", "Open word");
    open.style.marginTop = "8px";
    open.addEventListener("click", () => { location.hash = "#/w/" + encodeURIComponent(w.b); });
    acts.append(open);
  }
  area.append(acts);

  const navRow = el("div");
  navRow.style.cssText = "display:flex;gap:8px;margin-top:8px";
  const prev = el("button", "btn ghost", "◀ Previous");
  prev.style.flex = "1";
  prev.disabled = qi === 0;
  prev.addEventListener("click", () => { qi--; shown = true; drawCard(); });
  navRow.append(prev);
  const skip = el("button", "btn ghost", "Skip ▶");
  skip.style.flex = "1";
  skip.addEventListener("click", () => { qi++; shown = false; drawCard(); });
  navRow.append(skip);
  area.append(navRow);
}

/* The four Anki buttons, labelled with the interval FSRS would schedule. */
function gradeRow(word, onGrade) {
  const iv = fsrsPreview(ST.seen[word], today());
  const row = el("div");
  row.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:6px";
  [[1, "Again", "btn no"], [2, "Hard", "btn"], [3, "Good", "btn go"],
   [4, "Easy", "btn pri"]].forEach(([g, label, cls]) => {
    const b = el("button", cls);
    b.style.cssText = "padding:11px 4px;font-size:13px";
    b.append(el("div", null, label));
    const t = el("div", null, iv[g]);
    t.style.cssText = "font-size:10px;opacity:.75;font-weight:500";
    b.append(t);
    b.addEventListener("click", () => onGrade(g));
    row.append(b);
  });
  return row;
}

function rateCard(g) {
  const word = L[queue[qi]].b;
  const card = fsrsReview(ST.seen[word], g, today());
  ST.seen[word] = card;
  if (isTrouble(card)) ST.trouble[word] = (ST.trouble[word] || 0) + (g === 1 ? 1 : 0);
  else if (g > 2 && ST.trouble[word]) delete ST.trouble[word];
  ST.xp = (ST.xp || 0) + (g === 1 ? 0 : 1);
  save();
  if (g === 1) queue.push(queue[qi]);      // Again: show it again this session
  qi++; shown = false;
  drawCard();
}

/* ---------- dictionary ---------- */
function renderDict() {
  const root = $("#s-dict");
  if (root.dataset.built) return;
  root.dataset.built = "1";
  const wrap = el("div", "searchwrap");
  const q = el("input");
  q.type = "search"; q.id = "q";
  q.placeholder = "Russian, English or Latin";
  q.autocomplete = "off"; q.spellcheck = false;
  wrap.append(q);
  // Results as you type; choosing one opens the entry.
  q.addEventListener("input", (e) => runSearch(e.target.value));
  root.append(wrap);

  const recent = el("div");
  recent.id = "recent";
  root.append(recent);

  const res = el("div");
  res.id = "results";
  res.style.marginTop = "14px";
  root.append(res);

  drawRecent();
}

/* What has actually been looked up, rather than a fixed list of examples. Empty
   until the learner searches something, at which point it earns its space. */
function drawRecent() {
  const host = $("#recent");
  if (!host) return;
  host.textContent = "";
  const words = ST.recent || [];
  if (!words.length) return;

  const h = el("h2", "", "Recent");
  h.className = "reclbl";
  host.append(h);
  const chips = el("div", "chips");
  words.forEach((w) => {
    const c = el("button", "chip", w);
    c.type = "button";
    c.addEventListener("click", () => {
      const box = $("#q");
      if (box) box.value = w;
      runSearch(w);
    });
    chips.append(c);
  });
  host.append(chips);
}

/* Opening an entry is what counts as looking a word up — typing on the way to it is
   not a search worth remembering. Stores the Russian, so searching "war" leaves
   война on the shelf rather than the English. */
function rememberSearch(word) {
  ST.recent = [word].concat((ST.recent || []).filter((w) => w !== word)).slice(0, 6);
  save();
  drawRecent();
}

/* Lookup lives in core/search.js so both apps rank results identically — this file
   used to carry its own near-copy, which is exactly how the two drift apart. */
let deepCache = null;
const deepList = () => {
  if (deepCache === null) deepCache = parseDeep(DATA.deep || "");
  return deepCache;
};
let deepMap = null;
const deepIndex = () => {
  if (deepMap === null) {
    deepMap = new Map();
    for (const d of deepList()) if (!deepMap.has(d.b)) deepMap.set(d.b, d);
  }
  return deepMap;
};

/* Tables and sentences are stored once and rebuilt per entry — see core/entry.js.
   Done eagerly for the curriculum's words so lessons and drills keep reading `w.t`
   and `w.x` off the lemma exactly as before. */
const hydrate = makeHydrator({
  deepIndex: deepIndex, shapes: DATA.shapes, slots: DATA.slots, sent: DATA.sent,
});
L.forEach(hydrate);

const rawSearch = makeSearch({ L: L, IX: IX, deep: deepList });
const rawResolve = makeResolve({ L: L, IX: IX, deep: deepList });
const search = (q, limit) => rawSearch(q, limit).map(hydrate);
const resolveWord = (w) => { const h = rawResolve(w); return h ? hydrate(h) : null; };

/* The full entry — everything the summary withholds. This is what #/w/ renders, so
   following a word link lands on the write-up rather than on a list. */
function showEntry(raw) {
  const res = $("#results");
  res.textContent = "";
  // An entry is not a result list, so the shelf comes back.
  const shelf = $("#recent");
  if (shelf) shelf.hidden = false;

  const w = resolveWord(raw);
  if (!w) {
    res.append(el("div", "empty", "Nothing for “" + raw + "”."));
    return;
  }
  rememberSearch(w.b);
  // One kind of entry. A word from the wider lexicon has the same paradigm, the
  // same grammar and the same sentences as one from the curriculum — there is
  // nothing to explain away.
  res.append(entryCard(w));
}

/* Results are summaries — the word and what it means, which is what a search is
   usually asking. The full entry is one press further, the same two steps the word
   links in sentences use. */
function runSearch(raw) {
  const res = $("#results");
  res.textContent = "";
  // The shelf is for when you have nothing else to look at.
  const shelf = $("#recent");
  if (shelf) shelf.hidden = !!raw.trim();
  if (!raw.trim()) return;
  const hits = search(raw);
  if (!hits.length) {
    res.append(el("div", "empty", "Nothing for “" + raw + "”."));
    return;
  }
  const list = el("div", "list");
  hits.forEach((w) => {
    const r = el("button", "row");
    r.type = "button";
    const lbl = el("span", "lbl");
    lbl.append(el("span", "rw", w.w));
    lbl.append(el("span", "rg", firstSense(w)));
    r.append(lbl);
    if (w.p) r.append(el("span", "pill", w.p));
    r.append(speakBtn(w.b));
    r.addEventListener("click", () => {
      location.hash = "#/w/" + encodeURIComponent(fold(w.b));
    });
    list.append(r);
  });
  res.append(list);
}

function renderTable(t) {
  const b = frag();
  b.append(el("div", "tb-t", t.title));
  const sc = el("div", "scroll"), tab = el("table");
  const thead = el("thead"), hr = el("tr");
  t.columns.forEach((c) => hr.append(el("th", null, c)));
  thead.append(hr); tab.append(thead);
  const tb = el("tbody");
  t.rows.forEach((r) => {
    const tr = el("tr");
    r.forEach((c, i) => tr.append(el("td", i === 0 ? "s" : "f",
                                    Array.isArray(c) ? c.join(" / ") : c)));
    tb.append(tr);
  });
  tab.append(tb); sc.append(tab); b.append(sc);
  return b;
}

/* Takes the entry itself, not a lemma index — the dictionary reaches words that
   have no index into L. */
function entryCard(w) {
  const c = el("div", "panel");
  const head = el("div");
  head.style.cssText = "display:flex;align-items:center;gap:10px";
  head.append(el("div", "hw", w.w));
  head.append(speakBtn(w.b));
  const star = el("button", "speak");
  star.style.marginLeft = "auto";
  const paint = () => {
    const on = ST.pinned.includes(w.b);
    star.innerHTML = '<svg viewBox="0 0 24 24" fill="' + (on ? "currentColor" : "none") +
      '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
      '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z"/></svg>';
    star.style.color = on ? "var(--brand)" : "var(--ink-3)";
    star.setAttribute("aria-pressed", on ? "true" : "false");
  };
  star.setAttribute("aria-label", "Star this word for review");
  star.addEventListener("click", () => {
    const at = ST.pinned.indexOf(w.b);
    if (at >= 0) ST.pinned.splice(at, 1); else ST.pinned.push(w.b);
    save(); paint();
  });
  paint();
  head.append(star);
  c.append(head);
  if (w.e) c.append(el("p", "gloss", w.e));
  const tags = el("div", "tagrow");
  [w.p, w.g, w.a].filter(Boolean).forEach((t) => tags.append(el("span", "pill", t)));
  if (w.fr) tags.append(el("span", "pill", "#" + w.fr));
  if (w.u) {
    const u = UN.find((x) => x.id === w.u);
    if (u) {
      const p = el("button", "pill brand", u.name);
      p.addEventListener("click", () => { location.hash = "#/unit/" + u.id; });
      tags.append(p);
    }
  }
  c.append(tags);
  (w.t || []).forEach((t) => c.append(renderTable(t)));
  if (w.x && w.x.length) {
    const ex = el("div");
    ex.style.marginTop = "14px";
    w.x.forEach((e) => {
      const r = el("div", "ex");
      const ru = el("div", "ru");
      ru.append(linkify(e.ru));
      r.append(ru);
      r.append(el("div", "en", e.en));
      // Sentences from his own decks say nothing; one from outside names its source,
      // so material he has studied is never confused with material he has not.
      if (e.src) r.append(el("div", "exsrc", e.src));
      ex.append(r);
    });
    c.append(ex);
  }
  return c;
}

/* ---------- immerse ---------- */
/* Passive exposure is a different act from retrieval practice, so the videos get
   their own room rather than a shelf inside Drills. */
function renderImmerse() {
  const root = $("#s-immerse");
  root.textContent = "";
  const withVideo = UN.filter((u) => u.v);

  const head = el("div", "sec");
  const line = el("div", "headline");
  line.append(el("b", null, String(withVideo.filter((u) => unitState(u.id).video).length)));
  line.append(el("span", null, "of " + withVideo.length + " watched"));
  head.append(line);
  root.append(head);

  const list = el("div", "list");
  withVideo.forEach((u) => {
    const open = unitUnlocked(u);
    const watched = unitState(u.id).video;
    const r = el("button", "row");
    r.disabled = !open;
    const th = el("div", "thumb" + (watched ? " done" : ""));
    th.append(unitIcon(u.id));
    r.append(th);
    const lbl = el("div", "lbl");
    // Every title ends "| Easy Russian NN" — repeating the channel on 26 rows is
    // noise, and it wraps each one to three lines.
    const short = u.v.title.split(" | ")[0];
    const t = el("div", null, short);
    t.title = u.v.title;
    lbl.append(t);
    lbl.append(el("div", "val", u.name +
      (u.v.dur ? " · " + Math.round(u.v.dur / 60) + " min" : "") +
      (open ? "" : " · locked")));
    r.append(lbl);
    if (watched) r.append(el("span", "pill good", "seen"));
    if (open) {
      r.addEventListener("click", () => {
        location.hash = "#/lesson/" + u.id + "/" + (lessonCount(u) - 1) + "/video";
      });
    }
    list.append(r);
  });
  root.append(list);

  const note = el("div", "empty",
    "Episodes from Easy Russian, matched to the words in each unit.");
  root.append(note);
}

/* ---------- you ---------- */
function troubleWords() {
  const out = [];
  for (const w in ST.seen) {
    if (isTrouble(ST.seen[w])) out.push(w);
  }
  ST.pinned.forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out.sort((a, b) => (ST.seen[b] ? ST.seen[b].lapses || 0 : 0) -
                            (ST.seen[a] ? ST.seen[a].lapses || 0 : 0));
}
const idxOfWord = (w) => { const h = IX[fold(w)]; return h && h.length ? h[0] : -1; };

function renderYou() {
  const root = $("#s-you");
  root.textContent = "";

  const me = typeof account === "function" ? account() : null;
  const card = el("div", "panel");
  card.style.cssText = "display:flex;align-items:center;gap:14px";
  if (me && typeof avatarEl === "function") {
    card.append(avatarEl(me.avatar, 52));
  } else {
    const av = el("div", "orb");
    av.style.cssText = "width:52px;height:52px;font-size:20px;" +
                       "background:var(--brand-bg);color:var(--brand-ink)";
    av.textContent = (ST.name || "?").trim().charAt(0).toUpperCase() || "?";
    card.append(av);
  }
  const who = el("div");
  who.style.flex = "1";
  const nm = el("div", null, (me && me.name) || ST.name || "Set your name");
  nm.style.cssText = "font-weight:600;font-size:17px";
  who.append(nm);
  const lvl = Math.floor((ST.xp || 0) / 100) + 1;
  who.append(el("div", "val", "Level " + lvl + " · " + nf(ST.xp || 0) + " XP" +
    (me && me.placed ? " · placed at stage " + me.placed : "")));
  card.append(who);
  const swap = el("button", "btn ghost", "Switch");
  swap.addEventListener("click", () => {
    if (typeof switchProfile === "function") switchProfile();
  });
  card.append(swap);
  root.append(card);

  const lvlBar = el("div", "pbar");
  lvlBar.style.margin = "10px 0 18px";
  const f = el("i");
  f.style.width = ((ST.xp || 0) % 100) + "%";
  lvlBar.append(f);
  root.append(lvlBar);

  const learned = Object.values(ST.seen).filter((s) => (s.reps || 0) > 0).length;
  const lessons = Object.values(ST.unit).reduce(
    (a, u) => a + Object.keys(u.lessons || {}).length, 0);
  const due = Object.keys(ST.seen).filter((w) => ST.seen[w].due <= today()).length;
  const grid = el("div", "stat-grid");
  [[String(ST.streak || 0), "day streak"], [nf(learned), "words seen"],
   [String(lessons), "lessons cleared"], [nf(due), "due now"]]
    .forEach(([v, l]) => {
      const s = el("div", "stat");
      s.append(el("b", null, v));
      s.append(el("span", null, l));
      grid.append(s);
    });
  root.append(grid);

  /* --- trouble bank --- */
  const tw = troubleWords();
  const tsec = el("div", "sec");
  tsec.style.marginTop = "20px";
  tsec.append(el("h2", null, "Trouble words"));
  if (!tw.length) {
    const p = el("div", "panel");
    p.append(el("div", "empty",
      "Words you keep forgetting collect here, plus anything you star."));
    tsec.append(p);
  } else {
    const go = el("button", "btn pri block", "Review " + tw.length + " trouble " +
                 (tw.length === 1 ? "word" : "words"));
    go.addEventListener("click", () => {
      ST.sets = ["__trouble__"]; save(); location.hash = "#/practice";
    });
    tsec.append(go);
    const list = el("div", "list");
    list.style.marginTop = "10px";
    tw.slice(0, 12).forEach((w) => {
      const i = idxOfWord(w);
      const r = el("button", "row");
      const lbl = el("div", "lbl");
      const ru = el("div", null, i >= 0 ? L[i].w : w);
      ru.style.fontFamily = "var(--f-ru)";
      lbl.append(ru);
      if (i >= 0) lbl.append(el("div", "val", L[i].e || ""));
      r.append(lbl);
      const c = ST.seen[w] || {};
      r.append(el("span", "pill", (c.lapses || 0) + "×"));
      r.addEventListener("click", () => {
        location.hash = "#/w/" + encodeURIComponent(w);
      });
      list.append(r);
    });
    tsec.append(list);
  }
  root.append(tsec);

  const sec = el("div", "sec");
  sec.style.marginTop = "20px";
  sec.append(el("h2", null, "Collection"));
  const list = el("div", "list");
  const S = DATA.stats;
  [["Sentences", nf(S.sentences)], ["Vocabulary", nf(S.vocab)],
   ["Lexicon lemmas", nf(S.lemmas)], ["Inflected forms", nf(S.forms)],
   ["Lexicon coverage", Math.round(S.cov_tokens / S.tokens * 100) + "%"],
   ["Study sets", String(UN.length)]].forEach(([k, v]) => {
    const r = el("div", "row static");
    r.append(el("span", "lbl", k));
    r.append(el("span", "val", v));
    list.append(r);
  });
  sec.append(list);
  root.append(sec);
}

/* ---------- settings ---------- */
// Chrome fires this instead of showing its own banner; hold it for the sheet.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});

function openSettings() {
  const bg = el("div", "sheet-bg");
  const sheet = el("div", "sheet");
  sheet.append(el("div", "grab"));
  sheet.append(el("h2", null, "Settings"));

  const list = el("div", "list");
  list.append(toggleRow("Developer mode", "All lessons unlocked", ST.dev, (v) => {
    ST.dev = v; save(); renderPath(); renderDevBadge();
  }));
  list.append(pickRow("Theme", ["auto", "light", "dark"], ST.theme, (v) => {
    ST.theme = v; save(); applyTheme();
  }));
  list.append(pickRow("Card side", ["RU → EN", "EN → RU"], ST.dir ? "EN → RU" : "RU → EN",
    (v) => { ST.dir = v === "EN → RU" ? 1 : 0; save(); }));
  sheet.append(list);

  if (installPrompt) {
    const inst = el("div", "sec");
    inst.style.marginTop = "16px";
    const b = el("button", "btn pri block", "Install on this device");
    b.addEventListener("click", async () => {
      const p = installPrompt;
      installPrompt = null;
      b.disabled = true;
      p.prompt();
      await p.userChoice;
      close();
    });
    inst.append(b);
    sheet.append(inst);
  }

  const move = el("div", "sec");
  move.style.marginTop = "16px";
  const row = el("div");
  row.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px";

  // Downloads are blocked in some embedded viewers and webviews, and the failure is
  // silent, so copying is offered alongside rather than as a hidden fallback.
  const copy = el("button", "btn", "Copy");
  copy.title = "Copy your study history to the clipboard";
  copy.addEventListener("click", async () => {
    const text = JSON.stringify(ST);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
    } catch (e) {
      const ta = el("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-1000px";
      document.body.append(ta);
      ta.select();
      copy.textContent = document.execCommand("copy") ? "Copied" : "Press ⌘/Ctrl+C";
      ta.remove();
    }
    setTimeout(() => { copy.textContent = "Copy"; }, 2000);
  });
  row.append(copy);

  const exp = el("button", "btn", "Export");
  exp.title = "Save your study history to a file";
  exp.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(ST, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "bridges-progress.json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  row.append(exp);

  const imp = el("button", "btn", "Import");
  imp.title = "Restore study history from a file";
  const file = el("input");
  file.type = "file";
  file.accept = "application/json,.json";
  file.hidden = true;
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let incoming;
      try {
        incoming = JSON.parse(String(rd.result));
      } catch (e) {
        window.alert("That file isn't valid Bridges progress.");
        return;
      }
      if (!incoming || typeof incoming !== "object" || !incoming.seen) {
        window.alert("That file isn't valid Bridges progress.");
        return;
      }
      const words = Object.keys(incoming.seen).length;
      if (!window.confirm("Replace this device's progress with " + words +
                          " word" + (words === 1 ? "" : "s") + " of history?")) return;
      ST = Object.assign({}, DEFAULTS,
                         migrate(incoming, incoming.v || 2), { v: SCHEMA_VERSION });
      save();
      close();
      renderPath();
      renderYou();
      renderDevBadge();
    };
    rd.readAsText(f);
  });
  imp.addEventListener("click", () => file.click());
  row.append(imp);
  move.append(row, file);
  sheet.append(move);

  const danger = el("div", "sec");
  danger.style.marginTop = "10px";
  const reset = el("button", "btn block", "Reset progress");
  reset.addEventListener("click", () => {
    if (!window.confirm("Erase all progress on this device?")) return;
    const dev = ST.dev, theme = ST.theme;
    ST = Object.assign({}, DEFAULTS, { dev: dev, theme: theme });
    save(); close(); renderPath(); renderYou();
  });
  danger.append(reset);
  sheet.append(danger);

  const ver = el("div", "empty", "Built " + DATA.stats.built);
  ver.style.paddingBottom = "0";
  sheet.append(ver);

  // Both corpora are licensed on condition of attribution, so this credit is an
  // obligation rather than a nicety. Rendered from stats.credits, which the build
  // reads out of the databases themselves.
  (DATA.stats.credits || []).forEach((c) => {
    const line = el("div", "empty", c.l ? c.n + " · " + c.l : c.n);
    line.style.cssText = "padding-top:2px;padding-bottom:0;font-size:11px";
    sheet.append(line);
  });

  bg.append(sheet);
  document.body.append(bg);
  function close() { bg.remove(); }
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
}

function toggleRow(label, sub, val, onChange) {
  const r = el("div", "row static");
  const lbl = el("div", "lbl");
  lbl.append(el("div", null, label));
  if (sub) lbl.append(el("div", "val", sub));
  r.append(lbl);
  const sw = el("button", "sw");
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", val ? "true" : "false");
  sw.setAttribute("aria-label", label);
  sw.addEventListener("click", () => {
    const nv = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", nv ? "true" : "false");
    onChange(nv);
  });
  r.append(sw);
  return r;
}

function pickRow(label, opts, val, onChange) {
  const r = el("div", "row static");
  r.append(el("span", "lbl", label));
  const wrap = el("div", "chips");
  opts.forEach((o) => {
    const c = el("button", "chip", o);
    c.style.fontFamily = "var(--f-ui)";
    c.style.fontSize = "13px";
    c.setAttribute("aria-pressed", o === val ? "true" : "false");
    c.addEventListener("click", () => {
      Array.from(wrap.children).forEach((x) => x.setAttribute("aria-pressed", "false"));
      c.setAttribute("aria-pressed", "true");
      onChange(o);
    });
    wrap.append(c);
  });
  r.append(wrap);
  return r;
}

function applyTheme() {
  const r = document.documentElement;
  if (ST.theme === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", ST.theme);
}

function renderDevBadge() {
  $("#devbadge").hidden = !ST.dev;
}

/* ---------------------------------------------------------------- router */
const ROOTS = ["path", "practice", "drills", "immerse", "dict", "you"];

function route() {
  hidePop();
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);

  // Depth bookkeeping: a root tab resets it, anything else nests one level.
  // history.state survives back/forward, so returning restores the real depth.
  const st = history.state;
  if (st && typeof st.d === "number") {
    depth = st.d;
  } else {
    depth = (!parts.length || ROOTS.includes(parts[0])) ? 0 : depth + 1;
    try { history.replaceState({ d: depth }, ""); } catch (e) {}
  }

  if (parts[0] === "w") {
    renderDict();
    setScreen("dict");
    const w = decodeURIComponent(parts[1] || "");
    $("#q").value = w;
    showEntry(w);
    return;
  }
  if (parts[0] === "placement" && typeof startPlacement === "function") {
    startPlacement();
    return;
  }
  if (parts[0] === "testout") {
    const u = UN.find((x) => x.id === parts[1]);
    if (u && typeof startSectionTest === "function") { startSectionTest(u); return; }
  }
  if (parts[0] === "unit") {
    const u = UN.find((x) => x.id === parts[1]);
    if (u) { renderUnit(u); return; }
  }
  if (parts[0] === "lesson") {
    const u = UN.find((x) => x.id === parts[1]);
    if (u) {
      const i = parseInt(parts[2] || "0", 10);
      if (parts[3] && typeof startComponent === "function") startComponent(u, i, parts[3]);
      else renderLessonHub(u, i);
      return;
    }
  }
  if (parts[0] === "drill" && typeof startDrill === "function") {
    startDrill(parts[1]);
    return;
  }
  const name = ROOTS.includes(parts[0]) ? parts[0] : "path";
  if (name === "path") renderPath();
  if (name === "practice") renderPractice();
  if (name === "drills" && typeof renderDrills === "function") renderDrills();
  if (name === "immerse") renderImmerse();
  if (name === "dict") renderDict();
  if (name === "you") renderYou();
  setScreen(name);
}

/* ---------------------------------------------------------------- boot */
(function boot() {
  // The artifact host supplies its own <head>, so make sure the phone viewport
  // exists either way.
  if (!document.querySelector('meta[name="viewport"]')) {
    const m = document.createElement("meta");
    m.name = "viewport";
    m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    document.head.appendChild(m);
  }
  applyTheme();

  // The splash is a cold-start moment only; a tap skips it.
  const splash = $("#splash");
  const dropSplash = () => splash.classList.add("gone");
  splash.addEventListener("click", dropSplash);
  setTimeout(dropSplash, 1500);

  // Nothing is loaded until a profile is chosen — progress belongs to a person.
  if (typeof initAccounts === "function") initAccounts(startApp);
  else startApp(null);
})();

function startApp(accountId) {
  if (accountId) useAccount(accountId);
  touchStreak();
  renderDevBadge();

  $("#cog").addEventListener("click", openSettings);

  // The profile left the tab bar to make room; its avatar in the top bar is the
  // way in, which is also where people look for it.
  const meBtn = $("#me");
  meBtn.addEventListener("click", () => { location.hash = "#/you"; });
  const me = typeof account === "function" ? account() : null;
  if (me && typeof avatarEl === "function") meBtn.append(avatarEl(me.avatar, 30));
  else meBtn.hidden = true;

  // Back retraces the trail — word to word, lesson to unit, unit to path.
  $("#back").addEventListener("click", () => {
    if (depth > 0) history.back();
    else location.hash = "#/path";
  });
  $$("#tabs button").forEach((b) => {
    b.addEventListener("click", () => { location.hash = "#/" + b.dataset.go; });
  });
  window.addEventListener("hashchange", route);
  route();

  // Only the standalone build ships a service worker; the artifact host has no
  // sw.js to register.
  if (window.RB_SW && "serviceWorker" in navigator &&
      location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}
