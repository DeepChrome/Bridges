/* Lesson components.
 *
 * A lesson is three things, doable in any order:
 *
 *   vocab   the unit's grammar rule (first lesson only), then each new word
 *           presented with audio and a real sentence, with a couple of practice
 *           questions folded in after every pair. Nothing here is scored.
 *   quiz    8 mixed questions, no hints. Pass at 80% to tick the component.
 *   video   an Easy Russian episode on the unit's subject. Shared across the unit.
 *
 * Every answer in either phase grades the word through FSRS, so practice still
 * moves the scheduler even though it cannot fail you.
 */

const PASS = 80;
const QUIZ_N = 8;

let LS = null;

/* ---------------------------------------------------------- generation */

function distractors(correctIdx, pool, n, key) {
  const want = key(L[correctIdx]);
  const out = [];
  for (const i of shuffle(pool.slice())) {
    if (i === correctIdx) continue;
    const v = key(L[i]);
    if (!v || v === want || out.some((o) => key(L[o]) === v)) continue;
    out.push(i);
    if (out.length === n) break;
  }
  return out;
}

function clozeFor(idx) {
  const w = L[idx];
  if (!w.x || !w.x.length) return null;
  for (const ex of w.x) {
    const toks = ex.ru.match(TOKEN) || [];
    const hit = toks.find((t) => {
      const ids = IX[fold(t)];
      return ids && ids.includes(idx);
    });
    if (hit && toks.length >= 3) return { ex: ex, token: hit };
  }
  return null;
}

/* Candidates for one word, easiest first: recognition before production. */
function candidates(idx, pool) {
  const list = [{ t: "choose-en", i: idx }];
  if (voice) list.push({ t: "listen", i: idx });
  list.push({ t: "choose-ru", i: idx });
  const c = clozeFor(idx);
  if (c) list.push({ t: "cloze", i: idx, ex: c.ex, token: c.token });
  list.push({ t: "type", i: idx });
  return list.map((e) => Object.assign(e, { pool: pool }));
}

const poolFor = (u) => (u.w.length >= 8 ? u.w : UN.flatMap((x) => x.w).slice(0, 400));

/* ------------------------------------------------------------- entry */

function startComponent(unit, index, which) {
  const words = lessonWords(unit, index);
  if (!words.length) { location.hash = "#/unit/" + unit.id; return; }
  setScreen("lesson");
  if (which === "video" && unit.v) return startVideo(unit, index);
  if (which === "quiz") return startQuiz(unit, index, words);
  return startVocab(unit, index, words);
}

const backToHub = () =>
  { location.hash = "#/lesson/" + LS.unit.id + "/" + LS.index; };

/* ------------------------------------------------------------- vocab */

function startVocab(unit, index, words) {
  const pool = poolFor(unit);
  const steps = [];
  if (index === 0 && unit.g) steps.push({ t: "grammar" });
  words.forEach((w, n) => {
    steps.push({ t: "word", i: w });
    // After every second new word, retrieve the pair just seen.
    if (n % 2 === 1 || n === words.length - 1) {
      const recent = words.slice(Math.max(0, n - 1), n + 1);
      recent.forEach((r) => steps.push(candidates(r, pool)[0]));
    }
  });
  LS = {
    unit: unit, index: index, words: words, mode: "vocab",
    steps: steps, at: 0, right: 0, wrong: 0, log: [], cur: null, answered: false,
  };
  $("#title").textContent = unit.name + " · Vocabulary";
  drawStep();
}

function drawStep() {
  if (LS.at >= LS.steps.length) return finishVocab();
  const root = $("#s-lesson");
  root.textContent = "";
  LS.answered = false;
  const s = LS.steps[LS.at];
  header(root, s.t === "grammar" ? "Grammar" : s.t === "word" ? "New word" : "Practice",
         LS.at, LS.steps.length);
  if (s.t === "grammar") return drawGrammar(root);
  if (s.t === "word") return drawWord(root, s);
  return EXERCISES[s.t](root, s);
}

function finishVocab() {
  markComponent(LS.unit, LS.index, "vocab");
  ST.xp = (ST.xp || 0) + LS.right;
  save();
  done("Vocabulary done", LS.words.length + " words met · " +
       LS.right + "/" + (LS.right + LS.wrong) + " practice right", true);
}

function drawGrammar(root) {
  const g = LS.unit.g;
  const p = el("div", "panel");
  p.append(el("div", "q", LS.unit.name));
  p.append(el("h3", "gtitle", g.title));
  p.append(el("p", "gbody", g.body));
  (g.examples || []).forEach(([ru, en]) => {
    const row = el("div", "gex");
    const r = el("div", "ru");
    r.append(linkify(ru));
    r.append(speakBtn(ru));
    row.append(r);
    row.append(el("div", "en", en));
    p.append(row);
  });
  root.append(p);
  advance(root, "Start learning");
}

function drawWord(root, s) {
  const w = L[s.i];
  const p = el("div", "panel learn");
  p.append(el("div", "q", "New word"));
  const head = el("div", "learnword");
  head.append(el("span", "big", w.w));
  head.append(speakBtn(w.b));
  p.append(head);
  // OpenRussian glosses trail into archaic senses; the full list stays in the
  // dictionary where there is room for it.
  p.append(el("div", "learngloss", (w.e || "").split(/[,;]/).slice(0, 2).join(", ").trim()));
  const tags = el("div", "tagrow");
  [w.p, w.g, w.a].filter(Boolean).forEach((t) => tags.append(el("span", "pill", t)));
  p.append(tags);
  if (w.x && w.x[0]) {
    const ex = el("div", "gex");
    const r = el("div", "ru");
    r.append(linkify(w.x[0].ru));
    r.append(speakBtn(w.x[0].ru));
    ex.append(r);
    ex.append(el("div", "en", w.x[0].en));
    p.append(ex);
  }
  root.append(p);
  advance(root, "Continue");
}

function advance(root, label) {
  const b = el("button", "btn pri block", label);
  b.style.marginTop = "16px";
  b.addEventListener("click", () => { LS.at++; drawStep(); });
  root.append(b);
}

/* -------------------------------------------------------------- quiz */

function startQuiz(unit, index, words) {
  const pool = poolFor(unit);
  const bag = words.map((i) => {
    const c = candidates(i, pool);
    return c[Math.floor(Math.random() * c.length)];
  });
  const production = words
    .map((i) => candidates(i, pool).filter((e) => e.t === "type" || e.t === "cloze"))
    .filter((a) => a.length).map((a) => a[0]);
  shuffle(production).slice(0, 2).forEach((e) => bag.push(e));
  LS = {
    unit: unit, index: index, words: words, mode: "quiz",
    steps: shuffle(bag).slice(0, QUIZ_N), at: 0,
    right: 0, wrong: 0, log: [], cur: null, answered: false,
  };
  $("#title").textContent = unit.name + " · Quiz";
  drawQuizStep();
}

function drawQuizStep() {
  if (LS.at >= LS.steps.length) return finishQuiz();
  const root = $("#s-lesson");
  root.textContent = "";
  LS.answered = false;
  header(root, "Quiz", LS.at, LS.steps.length);
  const s = LS.steps[LS.at];
  EXERCISES[s.t](root, s);
}

function finishQuiz() {
  const total = LS.right + LS.wrong;
  const score = total ? Math.round(LS.right / total * 100) : 0;
  const passed = score >= PASS;
  markComponent(LS.unit, LS.index, "quiz", score);
  ST.xp = (ST.xp || 0) + LS.right * 2 + (passed ? 10 : 0);
  touchStreak();
  save();

  const root = $("#s-lesson");
  root.textContent = "";
  const p = el("div", "panel");
  p.style.cssText = "text-align:center;padding:30px 18px";
  const orb = el("div", "orb");
  orb.style.cssText = "width:76px;height:76px;margin:0 auto 14px;font-size:24px;" +
    (passed ? "background:var(--good-bg);color:var(--good)"
            : "background:var(--bad-bg);color:var(--bad)");
  orb.textContent = score + "%";
  p.append(orb);
  p.append(el("div", null, passed ? "Quiz passed" : "Not quite — " + PASS + "% to pass"));
  p.append(el("div", "gloss", LS.right + " of " + total + " right"));
  root.append(p);

  const acts = el("div", "sec");
  acts.style.marginTop = "16px";
  const again = el("button", (passed ? "btn ghost" : "btn pri") + " block",
                   passed ? "Try again" : "Retry quiz");
  again.addEventListener("click", () => startQuiz(LS.unit, LS.index, LS.words));
  const back = el("button", (passed ? "btn pri" : "btn ghost") + " block", "Back to lesson");
  back.style.marginTop = "8px";
  back.addEventListener("click", backToHub);
  acts.append(passed ? back : again, passed ? again : back);
  root.append(acts);
}

/* ------------------------------------------------------------- video */

function startVideo(unit, index) {
  LS = { unit: unit, index: index, words: lessonWords(unit, index), mode: "video" };
  $("#title").textContent = unit.name + " · Video";
  const root = $("#s-lesson");
  root.textContent = "";
  const v = unit.v;

  const p = el("div", "panel");
  p.append(el("div", "q", "Easy Russian"));
  p.append(el("h3", "gtitle", v.title));
  if (v.dur) p.append(el("div", "en", Math.round(v.dur / 60) + " min"));

  const frame = el("div", "vframe");
  const play = el("button", "btn pri", "Play here");
  play.addEventListener("click", () => {
    frame.textContent = "";
    const f = el("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + v.id;
    f.title = v.title;
    f.allow = "accelerometer; encrypted-media; picture-in-picture";
    f.allowFullscreen = true;
    f.loading = "lazy";
    frame.append(f);
  });
  frame.append(play);
  p.append(frame);

  const open = el("a", "btn ghost block", "Open on YouTube");
  open.href = "https://www.youtube.com/watch?v=" + v.id;
  open.target = "_blank";
  open.rel = "noopener";
  open.style.cssText = "margin-top:8px;text-align:center";
  p.append(open);

  const listen = el("div", "listenfor");
  listen.append(el("div", "q", "Listen for"));
  const chips = el("div", "chips");
  LS.words.forEach((i) => {
    const c = el("button", "chip", L[i].b);
    c.addEventListener("click", () => {
      location.hash = "#/w/" + encodeURIComponent(L[i].b);
    });
    chips.append(c);
  });
  listen.append(chips);
  p.append(listen);
  root.append(p);

  const fin = el("button", "btn pri block", "Mark as watched");
  fin.style.marginTop = "16px";
  fin.addEventListener("click", () => {
    markComponent(unit, index, "video");
    done("Video watched", "Counts for every lesson in " + unit.name, true);
  });
  root.append(fin);
}

/* ------------------------------------------------------------ shared */

function done(title, detail, ok_) {
  const root = $("#s-lesson");
  root.textContent = "";
  const p = el("div", "panel");
  p.style.cssText = "text-align:center;padding:30px 18px";
  const orb = el("div", "orb");
  orb.style.cssText = "width:70px;height:70px;margin:0 auto 14px;font-size:26px;" +
    "background:var(--good-bg);color:var(--good)";
  orb.textContent = "✓";
  p.append(orb);
  p.append(el("div", null, title));
  if (detail) p.append(el("div", "gloss", detail));
  root.append(p);
  const b = el("button", "btn pri block", "Back to lesson");
  b.style.marginTop = "16px";
  b.addEventListener("click", backToHub);
  root.append(b);
}

function header(root, label, at, total) {
  const top = el("div", "lesson-top");
  if (at > 0 && LS.log[at - 1]) {
    const prev = el("button", "speak");
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15 5l-7 7 7 7"></path></svg>';
    prev.setAttribute("aria-label", "See the previous question");
    prev.addEventListener("click", () => drawReview(at - 1));
    top.append(prev);
  }
  const bar = el("div", "pbar");
  const fill = el("i");
  fill.style.width = (total ? at / total * 100 : 0) + "%";
  bar.append(fill);
  top.append(bar);
  top.append(el("span", "pill" + (LS.mode === "quiz" ? " brand" : ""),
                label + " " + Math.min(at + 1, total) + "/" + total));
  root.append(top);
}

const redraw = () => (LS.mode === "quiz" ? drawQuizStep()
                    : LS.mode === "test" ? drawTestStep()
                    : LS.mode === "drill" ? drawDrillStep() : drawStep());

/* ------------------------------------------------------- placement runner */
/* Shared by the 50-question placement and the 30-question section test. Each
   question keeps the tag it arrived with, so the result can unlock precisely. */
function runTest(spec) {
  LS = {
    unit: null, index: 0, words: [], mode: "test",
    steps: spec.questions, at: 0, right: 0, wrong: 0,
    results: [], log: [], cur: null, answered: false,
    title: spec.title, onDone: spec.onDone,
  };
  setScreen("lesson");
  $("#title").textContent = spec.title;
  drawTestStep();
}

function drawTestStep() {
  if (LS.at >= LS.steps.length) return LS.onDone(LS.results);
  const root = $("#s-lesson");
  root.textContent = "";
  LS.answered = false;
  header(root, "Question", LS.at, LS.steps.length);
  const s = LS.steps[LS.at];
  EXERCISES[s.t](root, s);
}

function drawReview(i) {
  const rec = LS.log[i];
  if (!rec) return;
  const root = $("#s-lesson");
  root.textContent = "";
  const head = el("div", "lesson-top");
  head.append(el("span", "pill", "Question " + (i + 1)));
  head.append(el("span", rec.right ? "pill good" : "pill", rec.right ? "correct" : "missed"));
  root.append(head);
  const p = el("div", "panel");
  p.append(el("div", "q", rec.q || ""));
  if (rec.p) {
    const m = el("div", "ru");
    m.style.marginTop = "6px";
    m.textContent = rec.p;
    p.append(m);
  }
  if (rec.a) {
    p.append(el("div", "q", "Answer"));
    const av = el("div", "ru", rec.a);
    av.style.color = "var(--good)";
    p.append(av);
  }
  root.append(p);
  const resume = el("button", "btn pri block", "Back to question " + (LS.at + 1));
  resume.style.marginTop = "14px";
  resume.addEventListener("click", redraw);
  root.append(resume);
}

/* An answer reached with the table open is Hard, not Good — it was recognised, not
   recalled, and the schedule should reflect that. */
function gradeWord(idx, correct, hinted) {
  const word = L[idx].b;
  const grade = correct ? (hinted ? 2 : 3) : 1;
  const card = fsrsReview(ST.seen[word], grade, today());
  ST.seen[word] = card;
  if (!correct && isTrouble(card)) ST.trouble[word] = (ST.trouble[word] || 0) + 1;
  else if (correct && ST.trouble[word] && !isTrouble(card)) delete ST.trouble[word];
  save();
}

/* ------------------------------------------------------------- exercises */

function prompt(root, kicker, main, cyrillic) {
  const p = el("div", "prompt");
  p.append(el("div", "q", kicker));
  const m = el("div", cyrillic ? "ru" : "en");
  if (main instanceof Node) m.append(main); else m.textContent = main;
  p.append(m);
  root.append(p);
  LS.cur = { q: kicker, p: main instanceof Node ? "" : String(main), a: "" };
  return p;
}

function options(root, items, isRight, cyrillic) {
  const box = el("div", "opts");
  const correct = items.find(isRight);
  if (LS.cur && correct) LS.cur.a = correct.label;
  items.forEach((it) => {
    const b = el("button", "opt");
    b.append(el("span", cyrillic ? "cyr" : null, it.label));
    b.addEventListener("click", () => {
      if (LS.answered) return;
      const right = isRight(it);
      Array.from(box.children).forEach((c) => { c.disabled = true; });
      b.classList.add(right ? "right" : "wrong");
      if (!right) {
        const good = items.findIndex(isRight);
        if (good >= 0) box.children[good].classList.add("right");
      }
      judge(root, right);
    });
    box.append(b);
  });
  root.append(box);
}

function judge(root, right, wordIdx) {
  LS.answered = true;
  right ? LS.right++ : LS.wrong++;
  LS.log[LS.at] = Object.assign({ q: "", p: "", a: "" }, LS.cur, { right: right });
  if (LS.mode === "test") {
    // Carry the question's origin through to the result, or nothing can be unlocked.
    const s = LS.steps[LS.at] || {};
    LS.results.push({ right: right, stage: s.stage, lesson: s.lesson, i: s.i });
  }
  if (LS.mode === "drill" && LS.usedHint) LS.helped++;
  // Match grades its own pairs and passes nothing; everything else grades its word.
  const idx = typeof wordIdx === "number" ? wordIdx : (LS.steps[LS.at] || {}).i;
  if (typeof idx === "number" && L[idx]) gradeWord(idx, right, LS.usedHint);

  const v = el("div", "verdict " + (right ? "right" : "wrong"));
  v.append(el("div", "vh", right ? "Correct" : "Not quite"));
  if (!right && LS.cur && LS.cur.a) v.append(el("div", "vb", "Answer: " + LS.cur.a));
  const b = el("button", (right ? "btn go" : "btn no") + " block", "Continue");
  b.addEventListener("click", () => { LS.at++; redraw(); });
  v.append(b);
  root.append(v);
  b.focus();
}

function exChooseEn(root, e) {
  const w = L[e.i];
  const p = prompt(root, "What does this mean?", w.w, true);
  p.append(speakBtn(w.b));
  const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => firstSense(x))))
    .map((i) => ({ i: i, label: firstSense(L[i]) }));
  options(root, opts, (o) => o.i === e.i, false);
}

function exChooseRu(root, e) {
  prompt(root, "Choose the Russian", firstSense(L[e.i]), false);
  const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => x.b)))
    .map((i) => ({ i: i, label: L[i].w }));
  options(root, opts, (o) => o.i === e.i, true);
}

function exListen(root, e) {
  const w = L[e.i];
  const p = prompt(root, "What did you hear?", "", true);
  const big = el("button", "btn pri", "▶ Play again");
  big.style.cssText = "margin:0 auto;display:block";
  big.addEventListener("click", () => say(w.b));
  p.append(big);
  say(w.b);
  const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => x.b)))
    .map((i) => ({ i: i, label: L[i].w }));
  options(root, opts, (o) => o.i === e.i, true);
}

function exType(root, e) {
  const w = L[e.i];
  prompt(root, "Write it in Russian", firstSense(w), false);
  LS.cur.a = w.w;
  const input = el("input", "answerbox");
  input.type = "text";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Cyrillic or Latin";
  root.append(input);
  root.append(el("div", "hint", "Latin spelling works — “" + translitBack(w.b) + "”."));
  const go = el("button", "btn pri block", "Check");
  go.style.marginTop = "12px";
  const check = () => {
    if (LS.answered) return;
    const given = fold(input.value);
    const right = given === fold(w.b) || translit(given) === fold(w.b);
    input.disabled = true;
    go.disabled = true;
    judge(root, right, e.i);
  };
  go.addEventListener("click", check);
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") check(); });
  root.append(go);
  input.focus();
}

function exCloze(root, e) {
  const p = prompt(root, "Fill the gap", e.ex.ru.replace(e.token, "_____"), true);
  p.append(el("div", "en", e.ex.en));
  const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => x.b)))
    .map((i) => ({ i: i, label: L[i].b }));
  options(root, opts, (o) => o.i === e.i, true);
}

function exMatch(root, e) {
  prompt(root, "Match the pairs", "", false);
  LS.cur.a = e.pairs.map((i) => L[i].b + " = " + firstSense(L[i])).join(" · ");
  let picked = null, cleared = 0, missed = 0;
  const mk = (i, label, side, cyr) => {
    const b = el("button", "opt");
    b.append(el("span", cyr ? "cyr" : null, label));
    b.dataset.i = i;
    b.dataset.side = side;
    b.addEventListener("click", () => {
      if (b.disabled) return;
      if (!picked) { picked = b; b.classList.add("pick"); return; }
      if (picked === b) { picked.classList.remove("pick"); picked = null; return; }
      if (picked.dataset.side === side) {
        picked.classList.remove("pick"); picked = b; b.classList.add("pick"); return;
      }
      if (picked.dataset.i === b.dataset.i) {
        [picked, b].forEach((x) => {
          x.classList.remove("pick"); x.classList.add("right"); x.disabled = true;
        });
        gradeWord(parseInt(b.dataset.i, 10), missed === 0);
        if (++cleared === e.pairs.length) judge(root, missed === 0);
      } else {
        missed++;
        b.classList.add("wrong");
        const p2 = picked;
        setTimeout(() => { b.classList.remove("wrong"); p2.classList.remove("pick"); }, 450);
      }
      picked = null;
    });
    return b;
  };
  const grid = el("div", "pairs");
  const col1 = el("div", "opts"), col2 = el("div", "opts");
  shuffle(e.pairs.slice()).forEach((i) => col1.append(mk(i, L[i].w, "l", true)));
  shuffle(e.pairs.slice()).forEach((i) => col2.append(mk(i, firstSense(L[i]), "r", false)));
  grid.append(col1, col2);
  root.append(grid);
}

const EXERCISES = {
  "choose-en": exChooseEn, "choose-ru": exChooseRu, "listen": exListen,
  "type": exType, "cloze": exCloze, "match": exMatch,
};

/* ---------------------------------------------------------------- helpers */

/* firstSense and translitBack live in core/util.js, shared with the native app. */
