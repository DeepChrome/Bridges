/* Grammar drills.
 *
 * Everything here is generated from the paradigm data already in the payload — no
 * authored question bank to drift out of date. Distractors come from the *same word's*
 * other cells wherever possible, so the drill trains the distinction that actually
 * matters rather than testing whether you know an unrelated word.
 *
 * Each question can expose the table that answers it. Peeking is allowed and costs
 * something honest: the word is graded Hard rather than Good, and the run reports how
 * many answers were assisted.
 */

const DRILL_N = 10;

const DRILLS = [
  { id: "cases", name: "Cases", icon: "city",
    blurb: "Put a noun in the case a sentence needs" },
  { id: "aspect", name: "Aspect pairs", icon: "time",
    blurb: "Match imperfective and perfective partners" },
  { id: "agreement", name: "Agreement", icon: "family",
    blurb: "Make adjectives agree with their noun" },
  { id: "conjugation", name: "Conjugation", icon: "speech",
    blurb: "Put a verb with the right person" },
  { id: "stress", name: "Stress", icon: "art",
    blurb: "Hear where the emphasis falls" },
  { id: "grammar", name: "Grammar rules", icon: "school",
    blurb: "Spot the rule a sentence is showing" },
];

const VOWELS_RU = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
const realPartner = (p) => !!p && p.trim() && p.trim() !== "-" && /[а-яё]/i.test(p);
const tableTitled = (w, re) => (w.t || []).find((t) => re.test(t.title));
const cells = (row) => row.slice(1);

function pickWhere(fn, tries) {
  for (let n = 0; n < (tries || 300); n++) {
    const w = L[Math.floor(Math.random() * L.length)];
    if (fn(w)) return w;
  }
  return null;
}

/* --------------------------------------------------------- generators */

function qCases() {
  const w = pickWhere((x) => x.p === "noun" && tableTitled(x, /Declension/));
  if (!w) return null;
  const t = tableTitled(w, /Declension/);
  const opts = [];
  t.rows.forEach((r, ri) => cells(r).forEach((c, ci) => {
    if (c && c.length) opts.push({ label: c[0], ri: ri, ci: ci });
  }));
  if (opts.length < 4) return null;
  // Never ask for the form already on screen — the headword is usually the
  // nominative singular, and asking for it answers itself.
  const askable = opts.filter((o) => fold(o.label) !== fold(w.w));
  if (!askable.length) return null;
  const target = askable[Math.floor(Math.random() * askable.length)];
  const number = t.columns[target.ci + 1];
  const caseName = t.rows[target.ri][0];
  const wrong = shuffle(opts.filter((o) => o.label !== target.label)).slice(0, 3);
  return {
    kind: "cases", i: L.indexOf(w),
    ask: caseName.toLowerCase() + " " + number.toLowerCase(),
    prompt: w.w, sub: w.e || "",
    options: shuffle([target].concat(wrong)).map((o) => ({
      label: o.label, right: o.label === target.label })),
    table: t, cyr: true,
  };
}

function qAspect() {
  const w = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.a);
  if (!w) return null;
  const others = [];
  for (let n = 0; n < 60 && others.length < 3; n++) {
    const o = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.pt !== w.pt, 60);
    if (o && !others.includes(o.pt.trim())) others.push(o.pt.trim());
  }
  if (others.length < 3) return null;
  const want = w.a === "imperfective" ? "perfective" : "imperfective";
  return {
    kind: "aspect", i: L.indexOf(w),
    ask: "the " + want + " partner",
    prompt: w.w, sub: w.e || "",
    options: shuffle([w.pt.trim()].concat(others)).map((s) => ({
      label: s, right: s === w.pt.trim() })),
    note: (UN.find((u) => u.id === "core8") || {}).g, cyr: true,
  };
}

function qAgreement() {
  const adj = pickWhere((x) => x.p === "adjective" && tableTitled(x, /Declension/));
  const noun = pickWhere((x) => x.p === "noun" && x.g && ["m", "f", "n"].includes(x.g));
  if (!adj || !noun) return null;
  const t = tableTitled(adj, /Declension/);
  const nom = t.rows.find((r) => /Nominative/i.test(r[0]));
  if (!nom) return null;
  const cols = t.columns.slice(1);          // Masculine, Feminine, Neuter, Plural
  const want = { m: 0, f: 1, n: 2 }[noun.g];
  const forms = cells(nom).map((c) => (c && c.length ? c[0] : null));
  if (!forms[want] || forms.filter(Boolean).length < 3) return null;
  return {
    kind: "agreement", i: L.indexOf(adj),
    ask: "the form that agrees",
    prompt: "___ " + noun.w,
    sub: (adj.e || "").split(/[,;]/)[0] + " " + (noun.e || "").split(/[,;]/)[0],
    options: shuffle(forms.filter(Boolean).map((f, k) => ({
      label: f, right: f === forms[want] }))),
    table: t, cyr: true,
  };
}

function qConjugation() {
  const w = pickWhere((x) => x.p === "verb" && tableTitled(x, /Present|Future/));
  if (!w) return null;
  const t = tableTitled(w, /Present|Future/);
  const rows = t.rows.filter((r) => r[1] && r[1].length);
  if (rows.length < 4) return null;
  const target = rows[Math.floor(Math.random() * rows.length)];
  const wrong = shuffle(rows.filter((r) => r[1][0] !== target[1][0])).slice(0, 3);
  if (wrong.length < 3) return null;
  return {
    kind: "conjugation", i: L.indexOf(w),
    ask: "the form for “" + target[0] + "”",
    prompt: w.w, sub: w.e || "",
    options: shuffle([target].concat(wrong)).map((r) => ({
      label: r[1][0], right: r[1][0] === target[1][0] })),
    table: t, cyr: true,
  };
}

/* Move the stress to each other vowel to build the wrong answers. */
function qStress() {
  const w = pickWhere((x) => /́/.test(x.w) && x.b.length > 3);
  if (!w) return null;
  const bareWord = w.b;
  const positions = [];
  for (let k = 0; k < bareWord.length; k++) {
    if (VOWELS_RU.indexOf(bareWord[k]) >= 0) positions.push(k);
  }
  if (positions.length < 2) return null;
  const correct = w.w;
  const variants = positions
    .map((k) => bareWord.slice(0, k + 1) + "́" + bareWord.slice(k + 1))
    .filter((v) => fold(v) === fold(correct) && v !== correct);
  if (!variants.length) return null;
  return {
    kind: "stress", i: L.indexOf(w),
    ask: "where the stress falls",
    prompt: bareWord, sub: w.e || "",
    options: shuffle([correct].concat(shuffle(variants).slice(0, 3)))
      .map((s) => ({ label: s, right: s === correct })),
    say: w.b, cyr: true,
  };
}

function qGrammar() {
  const withNotes = UN.filter((u) => u.g && u.g.examples && u.g.examples.length);
  if (withNotes.length < 4) return null;
  const pick = withNotes[Math.floor(Math.random() * withNotes.length)];
  const ex = pick.g.examples[Math.floor(Math.random() * pick.g.examples.length)];
  const others = shuffle(withNotes.filter((u) => u.id !== pick.id)).slice(0, 3);
  return {
    kind: "grammar",
    ask: "the rule this shows",
    prompt: ex[0], sub: ex[1],
    options: shuffle([pick].concat(others)).map((u) => ({
      label: u.g.title, right: u.id === pick.id })),
    note: pick.g, cyr: false,
  };
}

const GEN = {
  cases: qCases, aspect: qAspect, agreement: qAgreement,
  conjugation: qConjugation, stress: qStress, grammar: qGrammar,
};

function buildDrill(type) {
  const out = [];
  const seen = new Set();
  for (let n = 0; n < DRILL_N * 25 && out.length < DRILL_N; n++) {
    const q = GEN[type]();
    if (!q) continue;
    const key = q.kind + "|" + q.prompt + "|" + q.ask;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/* ------------------------------------------------------------- screens */

function renderDrills() {
  const root = $("#s-drills");
  root.textContent = "";
  const list = el("div", "list");
  DRILLS.forEach((d) => {
    const st = (ST.drills || {})[d.id] || {};
    const r = el("button", "row");
    const th = el("div", "thumb");
    th.append(unitIcon(d.icon));
    r.append(th);
    const lbl = el("div", "lbl");
    lbl.append(el("div", null, d.name));
    lbl.append(el("div", "val", d.blurb));
    r.append(lbl);
    if (st.best) r.append(el("span", "pill good", st.best + "%"));
    r.addEventListener("click", () => { location.hash = "#/drill/" + d.id; });
    list.append(r);
  });
  root.append(list);
}

function startDrill(type) {
  const spec = DRILLS.find((d) => d.id === type);
  const qs = buildDrill(type);
  if (!spec || !qs.length) { location.hash = "#/drills"; return; }
  LS = {
    mode: "drill", type: type, name: spec.name,
    steps: qs, at: 0, right: 0, wrong: 0, helped: 0,
    usedHint: false, log: [], cur: null, answered: false,
  };
  setScreen("lesson");
  $("#title").textContent = spec.name;
  drawDrillStep();
}

function drawDrillStep() {
  if (LS.at >= LS.steps.length) return finishDrill();
  const root = $("#s-lesson");
  root.textContent = "";
  LS.answered = false;
  LS.usedHint = false;
  const q = LS.steps[LS.at];

  const top = el("div", "lesson-top");
  const bar = el("div", "pbar");
  const fill = el("i");
  fill.style.width = (LS.at / LS.steps.length * 100) + "%";
  bar.append(fill);
  top.append(bar);
  top.append(el("span", "pill brand", (LS.at + 1) + "/" + LS.steps.length));
  root.append(top);

  const p = prompt(root, "Choose " + q.ask, q.prompt, q.cyr);
  if (q.say) p.append(speakBtn(q.say));
  if (q.sub) p.append(el("div", "en", q.sub));

  // Only offered when there is something real to show.
  if (q.table || q.note) {
    const hint = el("button", "btn block hintbtn", "Show the table");
    hint.style.cssText = "margin-bottom:12px;font-size:14px;padding:10px 14px";
    hint.addEventListener("click", () => {
      LS.usedHint = true;
      hint.disabled = true;
      hint.textContent = "Table used";
      openHint(q);
    });
    root.append(hint);
  }

  options(root, q.options, (o) => o.right, q.cyr);
}

function openHint(q) {
  const bg = el("div", "sheet-bg");
  const sheet = el("div", "sheet");
  sheet.append(el("div", "grab"));
  if (q.table) {
    sheet.append(el("h2", null, q.table.title));
    sheet.append(renderTable(q.table));
  }
  if (q.note) {
    sheet.append(el("h2", null, q.note.title));
    sheet.append(el("p", "gbody", q.note.body));
    (q.note.examples || []).forEach(([ru, en]) => {
      const row = el("div", "gex");
      const r = el("div", "ru");
      r.append(linkify(ru));
      row.append(r);
      row.append(el("div", "en", en));
      sheet.append(row);
    });
  }
  const close = el("button", "btn pri block", "Got it");
  close.style.marginTop = "14px";
  close.addEventListener("click", () => bg.remove());
  sheet.append(close);
  bg.append(sheet);
  document.body.append(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
}

function finishDrill() {
  const total = LS.right + LS.wrong;
  const score = total ? Math.round(LS.right / total * 100) : 0;
  ST.drills = ST.drills || {};
  const st = ST.drills[LS.type] || { best: 0, runs: 0 };
  st.best = Math.max(st.best || 0, score);
  st.runs = (st.runs || 0) + 1;
  ST.drills[LS.type] = st;
  ST.xp = (ST.xp || 0) + LS.right;
  touchStreak();
  save();

  const root = $("#s-lesson");
  root.textContent = "";
  const p = el("div", "panel");
  p.style.cssText = "text-align:center;padding:30px 18px";
  const orb = el("div", "orb");
  orb.style.cssText = "width:76px;height:76px;margin:0 auto 14px;font-size:24px;" +
    (score >= 80 ? "background:var(--good-bg);color:var(--good)"
                 : "background:var(--brand-bg);color:var(--brand-ink)");
  orb.textContent = score + "%";
  p.append(orb);
  p.append(el("div", null, LS.name));
  p.append(el("div", "gloss", LS.right + " of " + total + " right" +
    (LS.helped ? " · " + LS.helped + " with the table" : "")));
  root.append(p);

  const acts = el("div", "sec");
  acts.style.marginTop = "16px";
  const again = el("button", "btn pri block", "Again");
  again.addEventListener("click", () => startDrill(LS.type));
  acts.append(again);
  const back = el("button", "btn ghost block", "All drills");
  back.style.marginTop = "8px";
  back.addEventListener("click", () => { location.hash = "#/drills"; });
  acts.append(back);
  root.append(acts);
}
