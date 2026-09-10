/* Question generation, shared by both platforms.
 *
 * Everything here is pure: it reads the generated payload and returns plain objects
 * describing what to ask. Rendering, grading and scheduling live with the platform.
 *
 * Built as a factory because the environment differs — the web reads globals, native
 * imports modules, and whether a speech voice exists is a runtime fact on each. Rather
 * than let both sides keep their own copy of the rules, they hand the rules their world.
 */

// Explicit extension: Node's ESM resolver requires it, Metro tolerates either.
import { fold, shuffle, sample, firstSense, TOKEN } from "./util.js";
import { sentenceLemmas, pickPrompt } from "./speech.js";
import { describeForm, GENERIC_COLUMN } from "./forms.js";

export const QUIZ_N = 8;

/* How the speech activities join a lesson quiz, on top of QUIZ_N: from which chapter
   (0-based stage index) — and, within that chapter, from which lesson — and how
   many per quiz. Hearing a sentence starts in chapter 1 from its third lesson
   (the first chapter used to be reading-only across 22 lessons); speaking waits
   for chapter 3. The numbers live here, in one place, rather than in each
   generator. */
export const SPEECH_MIX = {
  hear: { fromStage: 0, fromLesson: 2, perQuiz: 1 },
  scene: { fromStage: 1, perQuiz: 1 },
  say: { fromStage: 2, perQuiz: 1 },
};
export const speechFrom = (kind, stage, lesson) => {
  const mix = SPEECH_MIX[kind];
  return stage > mix.fromStage || (stage === mix.fromStage && lesson >= (mix.fromLesson || 0));
};

/* The form question (P9.20): one per quiz, asking for the form the chapter's
   grammar card teaches — the plural of a chapter-4 noun, the prepositional of a
   chapter-5 noun, the past of a chapter-7 verb — chosen from the word's own
   paradigm early and typed from `typedFromStage` on. Which form is the card's
   business (`form` in grammar_notes.json); a branch card without one inherits
   its chapter's. Chapter 1's card ("no is") teaches nothing a table can ask, so
   the question starts with chapter 2. */
export const FORM_MIX = { fromStage: 1, typedFromStage: 5, perQuiz: 1 };
/* The columns of a noun's declension table, for a spec that names rows only. */
const NOUN_COLUMNS = ["Singular", "Plural"];

/* A listening scene: two or three sentences from the listening pool, played in
   a row, with a question per sentence and one about a word heard — the questions
   readable before the audio starts (the owner, 2026-09-07). */
export const SCENE_ROWS = [2, 3];
/* Below this frequency rank a lemma is a function word, not a word to listen for. */
export const SCENE_SKIP_TOP = 100;

/* What a learner may put in a quiz of their own (Practice → Quiz). */
export const QUIZ_KINDS = [
  { id: "choose-en", name: "Meaning", blurb: "Pick the English" },
  { id: "choose-ru", name: "Russian", blurb: "Pick the Russian" },
  { id: "listen", name: "Hear a word", blurb: "Pick the word you hear" },
  { id: "cloze", name: "Fill the gap", blurb: "A sentence with a word missing" },
  { id: "type", name: "Type it", blurb: "Write the Russian" },
  { id: "form", name: "Forms", blurb: "A word in the form its chapter teaches" },
  { id: "hear", name: "Hear a sentence", blurb: "Type what is said" },
  { id: "say", name: "Say it", blurb: "Read a sentence aloud" },
  { id: "scene", name: "Listening scene", blurb: "A few sentences, then questions" },
];
export const QUIZ_LENGTHS = [10, 20, 30];
/* New words per lesson, by chapter: a ramp, not a flat seven from lesson one. The
   first chapter's lessons carry five, the second's six, then seven. Both apps and
   the simulator size lessons through this, so the lesson a state key names is the
   same lesson everywhere. */
export const LESSON_RAMP = [5, 6];
export const LESSON_SIZE = 7;
export const lessonSize = (stageIndex) =>
  (stageIndex >= 0 && stageIndex < LESSON_RAMP.length ? LESSON_RAMP[stageIndex] : LESSON_SIZE);

export const PRACTICE_N = 8;
export const DRILL_N = 10;
export const PLACEMENT_N = 50;
export const SECTION_N = 30;
export const TEST_OUT = 0.8;

const VOWELS_RU = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
const realPartner = (p) => !!p && p.trim() && p.trim() !== "-" && /[а-яё]/i.test(p);
const tableTitled = (w, re) => (w.t || []).find((t) => re.test(t.title));
const cellsOf = (row) => row.slice(1);

export const DRILL_TYPES = [
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

export function makeQuestions(env) {
  const { L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice, SPEECH } = env;
  const voice = () => (typeof hasVoice === "function" ? hasVoice() : !!hasVoice);
  const stageOf = (u) =>
    STAGES.findIndex((s) => s.core === u || (s.branches || []).includes(u));

  /* ------------------------------------------------------------ helpers */

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

  /* A gap-fill needs an example whose blanked token really is this lemma. Of the
     examples that qualify, the one a learner can read: every word resolvable in
     the index, then the shortest. Without that rule the first example won — and
     lesson 1 asked for a gap in «Это явление продолжает оставаться в фокусе
     внимания экспертов». */
  function clozeFor(idx) {
    const w = L[idx];
    if (!w.x || !w.x.length) return null;
    let best = null;
    for (const ex of w.x) {
      const toks = ex.ru.match(TOKEN) || [];
      if (toks.length < 3) continue;
      const hit = toks.find((t) => {
        const ids = IX[fold(t)];
        return ids && ids.includes(idx);
      });
      if (!hit) continue;
      const unknown = toks.filter((t) => !IX[fold(t)]).length;
      const score = unknown * 100 + toks.length;
      if (!best || score < best.score) best = { ex, token: hit, score };
    }
    return best ? { ex: best.ex, token: best.token } : null;
  }

  /* The gap replaces the token as a whole word, never a substring: «в» must not
     open a hole inside «явление». */
  function gapped(ru, token) {
    // Letters only, not the hyphen: «SMS-сообщение» and «Радио-2» hold the token
    // against a hyphen and must still get their gap.
    const letter = "а-яёА-ЯЁ̀́";
    const re = new RegExp(`(^|[^${letter}])${token}(?![${letter}])`);
    return ru.replace(re, "$1_____");
  }

  const poolFor = (u) =>
    (u.w.length >= 8 ? u.w : UN.flatMap((x) => x.w).slice(0, 400));

  /* Options for a word, easiest first: recognition before production. */
  function candidates(idx, pool) {
    const list = [{ t: "choose-en", i: idx }];
    if (voice()) list.push({ t: "listen", i: idx });
    list.push({ t: "choose-ru", i: idx });
    const c = clozeFor(idx);
    if (c) list.push({ t: "cloze", i: idx, ex: c.ex, token: c.token });
    list.push({ t: "type", i: idx });
    return list.map((e) => Object.assign(e, { pool }));
  }

  /* Every form in a word's paradigm tables, as written (with stress). */
  function paradigmForms(w) {
    const out = [];
    for (const table of w.t || []) {
      for (const row of table.rows || []) {
        for (let ci = 1; ci < row.length; ci++) {
          const cell = row[ci];
          for (const f of Array.isArray(cell) ? cell : [cell]) if (f) out.push(f);
        }
      }
    }
    return out;
  }

  /* A wrong option must be wrong. A unit that teaches «кот» and «кошка» has two
     words whose first sense is "cat", and 202 unit words share a first sense
     with another in their unit (the content review, 2026-09-08): a distractor
     with the same meaning as the answer is a question with two right answers.
     The key a distractor is chosen by is therefore the meaning, whichever way
     round the question is asked. */
  const bySense = (x) => fold(firstSense(x));
  /* And when the learner types, any word of the pool with that meaning is right:
     "jacket" → «пиджак» or «куртка». */
  const sameSense = (e, w) =>
    (e.pool || []).filter((i) => i !== e.i && bySense(L[i]) === bySense(w)).map((i) => fold(L[i].b));

  /* Turns a generated exercise into what a runner needs to show: a prompt, options
     and which one is right. Keeping this here means the web and native runners
     cannot disagree about what a question *is*. */
  function present(e) {
    const w = L[e.i];
    switch (e.t) {
      case "choose-en": {
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, bySense)));
        return {
          kind: e.t, i: e.i, ask: "What does this mean?",
          prompt: w.w, cyr: true, say: w.b,
          options: opts.map((i) => ({ label: firstSense(L[i]), right: i === e.i })),
        };
      }
      case "choose-ru": {
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, bySense)));
        return {
          kind: e.t, i: e.i, ask: "Choose the Russian",
          prompt: firstSense(w), cyr: false,
          options: opts.map((i) => ({ label: L[i].w, right: i === e.i, cyr: true })),
        };
      }
      case "listen": {
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => x.b)));
        return {
          kind: e.t, i: e.i, ask: "What did you hear?", prompt: "", cyr: true,
          autoplay: w.b, say: w.b, hint: firstSense(w),
          options: opts.map((i) => ({ label: L[i].w, right: i === e.i, cyr: true })),
        };
      }
      /* The gap held an inflected form, and the answer is that form: the
         options are the word's other forms first («пива», «пиво», «пивом»),
         topped up with other words when the paradigm is short. The whole
         sentence comes back in the verdict with the form named — until now the
         options were bare lemmas, «Я не хочу _____» was answered «пиво», and
         the restored sentence was never shown (the pedagogy review). */
      case "cloze": {
        const token = e.token;
        const own = unique(paradigmForms(w).filter((f) => fold(f) !== fold(token)));
        const wrong = shuffle(own).slice(0, 3).map((f) => ({ label: f, right: false, cyr: true }));
        if (wrong.length < 3) {
          for (const i of distractors(e.i, e.pool, 3 - wrong.length, bySense)) {
            wrong.push({ label: L[i].b, right: false, cyr: true });
          }
        }
        const form = describeForm(w, token);
        return {
          kind: e.t, i: e.i, ask: "Fill the gap",
          prompt: gapped(e.ex.ru, token), sub: e.ex.en, cyr: true,
          options: shuffle([{ label: token, right: true, cyr: true }].concat(wrong)),
          reveal: e.ex.ru, formNote: form ? `«${token}» is ${form.text.toLowerCase()}` : null,
        };
      }
      case "type":
        return {
          kind: e.t, i: e.i, ask: "Write it in Russian",
          prompt: firstSense(w), cyr: false, typed: true, answer: w.w, target: w.b,
          alts: sameSense(e, w),
        };
      case "match":
        return {
          kind: e.t, ask: "Match the pairs", prompt: "", cyr: false,
          pairs: e.pairs.map((i) => ({ i, ru: L[i].w, en: firstSense(L[i]) })),
        };
      /* A sentence from the listening pool, played rather than shown. The English
         is carried as `en`, not `sub`: the runner draws `sub` under the prompt, and
         the meaning is revealed only after the answer — or on request, as the hint,
         at the cost of the grade. No `say` either — the activity owns replay. */
      case "hear": {
        const [ru, en] = e.row;
        return {
          kind: e.t, ask: "Type what you hear", prompt: "", cyr: true,
          autoplay: ru, target: ru, en, unit: e.unit, hint: en,
          lemmas: sentenceLemmas(ru, IX),
        };
      }
      /* The English is the prompt; the Russian is what the learner produces, so it
         is neither shown nor played until an attempt has been made. */
      case "say": {
        const [ru, en] = e.row;
        return {
          kind: e.t, ask: "Say it in Russian", prompt: en, cyr: false,
          target: ru, en, unit: e.unit, lemmas: sentenceLemmas(ru, IX),
        };
      }
      /* Already in its final shape: sceneFor builds the questions with the rows,
         formPrompt the form question with the cell. */
      case "scene":
        return e.scene;
      case "form":
        return e.q;
      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- scenes */

  const unique = (a) => a.filter((x, k) => a.indexOf(x) === k);
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

  /* A listening scene from the listening pool of these units (ids): SCENE_ROWS
     sentences, one meaning question each with three other sentences' meanings as
     the wrong answers, and one "which word did you hear?" with three words from
     sentences that were not played. `want` (a Set of lemma indices) prefers a
     first sentence that uses a lesson word. Null when the pool is too small to
     make wrong answers from — never a scene with two options. */
  function sceneFor(unitIds, want) {
    if (!SPEECH || !SPEECH.listen || !SPEECH.rows) return null;
    const rows = SPEECH.rows;
    const idxs = unique(unitIds.flatMap((id) => SPEECH.listen[id] || []));
    if (idxs.length < 5) return null;
    const preferred = want && want.size
      ? idxs.filter((i) => sentenceLemmas(rows[i][0], IX).some((l) => want.has(l)))
      : [];
    const first = preferred.length ? pickOne(preferred) : pickOne(idxs);
    const rest = shuffle(idxs.filter((i) => i !== first));
    const count = Math.min(pickOne(SCENE_ROWS), rest.length + 1);
    const chosen = [first].concat(rest.slice(0, count - 1));
    const others = rest.slice(count - 1);
    const meaningOf = (i) => rows[i][1];
    const questions = chosen.map((ri, k) => {
      const en = meaningOf(ri);
      // Each question draws its own wrong answers, so two questions in one
      // scene do not offer the same three (seen on the emulator walkthrough).
      const wrong = unique(shuffle(others.slice()).map(meaningOf).filter((m) => m && m !== en)).slice(0, 3);
      if (wrong.length < 3) return null;
      return {
        ask: `Sentence ${k + 1}: what does it mean?`, row: k,
        options: shuffle([{ label: en, right: true }]
          .concat(wrong.map((m) => ({ label: m, right: false })))),
      };
    });
    if (questions.some((q) => !q)) return null;
    const heardAll = unique(chosen.flatMap((ri) => sentenceLemmas(rows[ri][0], IX)));
    const heard = heardAll.filter((i) => i >= SCENE_SKIP_TOP);
    const absent = unique(others.flatMap((ri) => sentenceLemmas(rows[ri][0], IX)))
      .filter((i) => i >= SCENE_SKIP_TOP && !heardAll.includes(i));
    if (heard.length && absent.length >= 3) {
      const h = pickOne(heard);
      const wrong = shuffle(absent).slice(0, 3);
      questions.push({
        ask: "Which word did you hear?", i: h, cyr: true,
        options: shuffle([{ label: L[h].w, right: true, i: h }]
          .concat(wrong.map((i) => ({ label: L[i].w, right: false, i })))),
      });
    }
    return {
      kind: "scene", ask: "Listen, then answer", prompt: "", cyr: true, unit: unitIds[0],
      rows: chosen.map((ri) => ({ ru: rows[ri][0], en: rows[ri][1],
                                  lemmas: sentenceLemmas(rows[ri][0], IX) })),
      lemmas: heardAll, questions,
    };
  }

  /* A run of scenes for the listening drill, no two opening on the same
     sentence; `want` (a Set of lemma indices — the trouble bank, say) prefers
     scenes that open on one of those words. */
  function listeningDrill(units, n, want) {
    const ids = units.map((u) => u.id);
    const out = [], seen = new Set();
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      const s = sceneFor(ids, want && want.size ? want : null);
      if (!s || seen.has(s.rows[0].ru)) continue;
      seen.add(s.rows[0].ru);
      out.push(s);
    }
    return out;
  }

  /* ------------------------------------------------------------------ forms */

  /* What a unit's card teaches, as something the tables can answer:
       { pos, table, rows?, cols?, aspect? }  a cell of a paradigm table — rows and
                                              columns by their labels, any when absent
       { drill }                              a rule the drills already ask (agreement,
                                              aspect), on the route's words
     A branch card without a spec inherits its chapter's. */
  function formSpec(unit) {
    if (unit.g && unit.g.form) return unit.g.form;
    const s = STAGES[stageOf(unit)];
    return (s && s.core.g && s.core.g.form) || null;
  }

  /* The cells of a word's table the spec allows, each { table, ri, ci, forms }.
     The headword itself is never a cell: it is on screen, and asking for it
     answers itself (masculine inanimate accusatives, the nominative singular). */
  function formCells(w, spec) {
    if (!w || w.p !== spec.pos || (spec.aspect && w.a !== spec.aspect)) return [];
    if (w.p === "noun" && w.pl) return [];
    const t = (w.t || []).find((x) => x.title === spec.table);
    if (!t) return [];
    const out = [];
    t.rows.forEach((row, ri) => {
      if (spec.rows && !spec.rows.includes(row[0])) return;
      for (let ci = 1; ci < row.length; ci++) {
        if (spec.cols && !spec.cols.includes(t.columns[ci] || "")) continue;
        const forms = (Array.isArray(row[ci]) ? row[ci] : [row[ci]]).filter(Boolean);
        if (!forms.length || forms.some((f) => fold(f) === fold(w.w))) continue;
        out.push({ table: t, ri, ci, forms });
      }
    });
    return out;
  }

  /* "the nominative plural" · "the present for “ты”" · "the past for “она”". */
  function formName(t, ri, ci, w) {
    const row = t.rows[ri][0], col = t.columns[ci] || "";
    if (!GENERIC_COLUMN.test(col)) return `the ${row.toLowerCase()} ${col.toLowerCase()}`;
    const what = t.title === "Present / Future"
      ? (w.a === "perfective" ? "future" : "present") : t.title.toLowerCase();
    return `the ${what} for “${row}”`;
  }

  /* One question for a word and a cell: chosen from the word's own paradigm —
     the rest of the table first, then its other tables — or typed. Null when
     the paradigm cannot supply three wrong forms. */
  function formQuestion(i, cell, typed) {
    const w = L[i];
    const { table: t, ri, ci, forms } = cell;
    const target = forms[0];
    const what = formName(t, ri, ci, w);
    const base = { kind: "form", i, cyr: true, prompt: w.w, sub: firstSense(w), table: t };
    if (typed) {
      return { ...base, ask: `Write ${what}`, typed: true, answer: target, target,
               alts: forms.slice(1).map(fold) };
    }
    // Each cell's first form only — the wrong answers should be forms the learner
    // will meet, not «машиною» from the back of the cell. The headword is barred
    // too: it is the prompt, printed at the top of the screen, and offering it as
    // an option is a free elimination (seen on the emulator — «рука́» stood above
    // its own four choices).
    const own = t.rows.flatMap((row) => cellsOf(row).map((c) => (Array.isArray(c) ? c[0] : c)));
    const seen = new Set([fold(target), fold(w.w)]);
    const wrong = [];
    for (const f of shuffle(own.filter(Boolean)).concat(shuffle(paradigmForms(w)))) {
      if (seen.has(fold(f))) continue;
      seen.add(fold(f));
      wrong.push(f);
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) return null;
    return {
      ...base, ask: `Choose ${what}`,
      options: shuffle([{ label: target, right: true, cyr: true }]
        .concat(wrong.map((f) => ({ label: f, right: false, cyr: true })))),
    };
  }

  /* The form question for a lesson: this lesson's words first, then the unit's,
     then anything on the route so far — the first tier with a word that has
     the form. `only` (a lemma index) asks about that word or nothing. Null when
     the chapter's card teaches nothing a table can ask. */
  function formPrompt(unit, index, only) {
    const spec = formSpec(unit);
    if (!spec) return null;
    if (spec.drill) {
      return withPool(unitsUpTo(unit).flatMap((u) => u.w), () => (GEN[spec.drill] ? GEN[spec.drill]() : null));
    }
    const typed = stageOf(unit) >= FORM_MIX.typedFromStage;
    const tiers = only !== undefined ? [[only]]
      : [lessonWords(unit, index), unit.w, unitsUpTo(unit).flatMap((u) => u.w)];
    for (const tier of tiers) {
      const able = shuffle(unique(tier).filter((i) => formCells(L[i], spec).length));
      for (const i of able.slice(0, 6)) {
        const q = formQuestion(i, pickOne(formCells(L[i], spec)), typed);
        if (q) return q;
      }
    }
    return null;
  }

  /* Which practice drills the route so far has taught, read off the same grammar
     cards that drive the form question. A learner three lessons in was being
     offered the Aspect drill, which chapter 8 teaches — and the pool of aspect
     questions their words could fill was fifteen, so it asked the same handful
     over and over. Stress and Grammar are open from the start: both are about
     words in general rather than a rule the path introduces. */
  function drillsIntroduced(units) {
    const out = new Set(["stress", "grammar"]);
    for (const u of units) {
      const spec = formSpec(u);
      if (!spec) continue;
      if (spec.drill) out.add(spec.drill);
      else if (spec.pos === "noun" && spec.table === "Declension") out.add("cases");
      else if (spec.pos === "verb") out.add("conjugation");
    }
    return out;
  }

  /* The first chapter (0-based) that opens a drill, for "Opens in chapter N";
     -1 when it is open from the start or never. */
  function drillOpensAt(drill) {
    if (drill === "stress" || drill === "grammar") return -1;
    for (let s = 0; s < STAGES.length; s++) {
      const units = [STAGES[s].core].concat(STAGES[s].branches || []);
      if (drillsIntroduced(units).has(drill)) return s;
    }
    return -1;
  }

  /* The cells of a noun's declension the route so far has introduced, as
     { row, col } pairs — what the Cases drill may ask for. A chapter-3 learner
     is not asked the instrumental plural; before the first case chapter the
     list is empty and the drill says so. */
  function formsIntroduced(units) {
    const out = [];
    for (const u of units) {
      const spec = u.g && u.g.form;
      if (!spec || spec.pos !== "noun" || spec.table !== "Declension" || !spec.rows) continue;
      for (const row of spec.rows) {
        for (const col of spec.cols || NOUN_COLUMNS) {
          if (!out.some((c) => c.row === row && c.col === col)) out.push({ row, col });
        }
      }
    }
    return out;
  }

  /* ----------------------------------------------------------- custom quiz */

  /* A hear or say step from the pools of these units, any sentence. */
  function sentencePrompt(kind, unitIds) {
    const poolName = { hear: "listen", say: "speak" }[kind];
    if (!SPEECH || !SPEECH[poolName]) return null;
    const pool = SPEECH[poolName];
    const idxs = unique(unitIds.flatMap((id) => pool[id] || []));
    const row = pickPrompt(SPEECH.rows, idxs, null, IX);
    return row ? present({ t: kind, row, unit: unitIds[0] }) : null;
  }

  /* The learner's own quiz (Practice → Quiz): `units` to draw words and sentences
     from, `kinds` from QUIZ_KINDS, `n` questions. Word questions share the words
     out round-robin so a short list is not asked about the same word five times;
     sentence kinds take about a third of the quiz between them when chosen. */
  function customQuiz({ units, kinds, n }) {
    const wordKinds = kinds.filter((k) => ["choose-en", "choose-ru", "listen", "cloze", "type", "form"].includes(k));
    const sentenceKinds = kinds.filter((k) => ["hear", "say", "scene"].includes(k));
    if (!units.length || (!wordKinds.length && !sentenceKinds.length)) return [];
    const words = unique(units.flatMap((u) => u.w));
    const pool = words.length >= 8 ? words : poolFor(units[0]);
    const unitIds = units.map((u) => u.id);
    const out = [];
    const sentenceShare = sentenceKinds.length
      ? (wordKinds.length ? Math.max(sentenceKinds.length, Math.round(n / 3)) : n) : 0;
    const wordShare = wordKinds.length ? n - sentenceShare : 0;
    const bag = shuffle(words.slice());
    for (let k = 0; out.length < wordShare && bag.length && k < wordShare * 4; k++) {
      const i = bag[k % bag.length];
      const kind = pickOne(wordKinds);
      let e = { t: kind, i, pool };
      if (kind === "cloze") {
        const c = clozeFor(i);
        e = c ? { t: "cloze", i, ex: c.ex, token: c.token, pool } : { t: "choose-en", i, pool };
      } else if (kind === "form") {
        // A word's own unit decides the form. Not every word has one — a verb
        // in a chapter teaching the plural — so the bag is walked from here for
        // one that does; when no chosen unit teaches a form at all, the meaning
        // is asked instead of nothing.
        let f = null;
        for (let j = 0; j < bag.length && !f; j++) {
          const cand = bag[(k + j) % bag.length];
          f = formPrompt(units.find((u) => u.w.includes(cand)) || units[0], 0, cand);
        }
        e = f ? { t: "form", q: f } : { t: "choose-en", i, pool };
      }
      const q = present(e);
      if (q) out.push(q);
    }
    const seen = new Set();
    for (let k = 0, made = 0; made < sentenceShare && k < sentenceShare * 5; k++) {
      const kind = sentenceKinds[k % sentenceKinds.length];
      const q = kind === "scene" ? sceneFor(unitIds, null) : sentencePrompt(kind, unitIds);
      if (!q) continue;
      const key = q.kind + "|" + (q.target || (q.rows ? q.rows[0].ru : ""));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      made++;
    }
    return spread(shuffle(out)).slice(0, n);
  }

  /* --------------------------------------------------------- lesson sets */

  /* Vocabulary: see the whole list, then meet each word, then retrieve the pair
     just seen.

     The list first (the owner, 2026-09-10): a lesson used to open straight onto
     card one of seven with no sense of what was coming, which is a worse way to
     meet a set of words than reading them together. `t: "list"` carries the
     lesson's words for the screen to lay out; the cards follow unchanged. */
  function vocabSteps(unit, index) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    const steps = [];
    if (index === 0 && unit.g) steps.push({ t: "grammar", note: unit.g });
    if (words.length) steps.push({ t: "list", words });
    words.forEach((w, n) => {
      steps.push({ t: "word", i: w });
      if (n % 2 === 1 || n === words.length - 1) {
        words.slice(Math.max(0, n - 1), n + 1)
          .forEach((r) => steps.push(present(candidates(r, pool)[0])));
      }
    });
    return steps;
  }

  /* Every unit on the route up to and including this one: the spine and branches
     of earlier chapters, and this chapter's up to the unit itself. What a learner
     here has been through, in order. */
  function unitsUpTo(unit) {
    const out = [];
    for (const s of STAGES) {
      const here = [s.core].concat(s.branches || []);
      const at = here.indexOf(unit);
      if (at < 0) { out.push(...here); continue; }
      out.push(...here.slice(0, at + 1));
      return out;
    }
    return out;
  }

  /* One speech prompt for a lesson, or null when this platform carries no pools or
     nothing sayable has been unlocked yet — the quiz then simply has no such step,
     never a blank one and never a sentence from further along the route.

     A unit's own list is what it added to the pool; the sentences a learner here
     can say are everything added up to this point. Preference in order: a sentence
     from this unit using a word of this lesson, one from anywhere unlocked using a
     word of this lesson, one from this unit, one from anywhere unlocked. */
  function speechPrompt(kind, unit, index) {
    if (kind === "scene") {
      // The unit's own listening pool when it can carry a scene, else everything
      // unlocked so far; a lesson word in the first sentence when there is one.
      const want = new Set(lessonWords(unit, index));
      const scene = sceneFor([unit.id], want)
        || sceneFor(unitsUpTo(unit).map((u) => u.id), want);
      return scene ? { t: "scene", scene } : null;
    }
    const poolName = { hear: "listen", say: "speak" }[kind];
    if (!SPEECH || !SPEECH[poolName]) return null;
    const pool = SPEECH[poolName];
    // Hearing in chapter 1 draws on the speak pool when the listen pool has
    // nothing yet: its short sentences are the right first thing to hear.
    const fallback = kind === "hear" && SPEECH.speak ? SPEECH.speak : null;
    const own = (pool[unit.id] || []).concat(fallback && !(pool[unit.id] || []).length ? (fallback[unit.id] || []) : []);
    const all = unitsUpTo(unit).flatMap((u) => pool[u.id] || []);
    const want = new Set(lessonWords(unit, index));
    const row = pickPrompt(SPEECH.rows, own, want, IX, null, true)
      || pickPrompt(SPEECH.rows, all, want, IX, null, true)
      || pickPrompt(SPEECH.rows, own, null, IX)
      || pickPrompt(SPEECH.rows, all, null, IX)
      || (fallback ? pickPrompt(SPEECH.rows, unitsUpTo(unit).flatMap((u) => fallback[u.id] || []), null, IX) : null);
    return row ? { t: kind, row, unit: unit.id } : null;
  }

  /* No two consecutive questions about the same word: a repeat straight after
     is not retrieval, it is the answer still on screen. Rebuilds the (already
     shuffled) list greedily, taking the first question that is not about the word
     just asked; only when nothing else is left does a repeat follow itself. */
  function spread(list) {
    const same = (a, b) => a && b && typeof a.i === "number" && a.i === b.i;
    const rest = list.slice(), out = [];
    while (rest.length) {
      const k = rest.findIndex((e) => !same(e, out[out.length - 1]));
      if (k >= 0) { out.push(rest.splice(k, 1)[0]); continue; }
      // Only questions about the word just asked are left: slot one in earlier,
      // between two questions about other words. With fewer than three distinct
      // words in a quiz there may be no such gap, and then it follows itself.
      const e = rest.shift();
      let j = out.findIndex((x, n) => n > 0 && !same(out[n - 1], e) && !same(x, e));
      out.splice(j > 0 ? j : out.length, 0, e);
    }
    return out;
  }

  /* The quiz is mixed and unordered, and asks for production at least twice —
     typed, since typing is recall and a gap-fill is recognition; the gap-fill
     stands in only for a word with nothing to type. A short last lesson tops
     up with review: `prefer` (lemma indices — what is due or in trouble, the
     app decides) first, then words from the unit's earlier lessons, so a
     three-word lesson is not a five-question quiz. */
  function quizSteps(unit, index, prefer) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    const bag = words.map((i) => {
      const c = candidates(i, pool);
      return c[Math.floor(Math.random() * c.length)];
    });
    const production = words
      .map((i) => {
        const c = candidates(i, pool);
        return c.find((e) => e.t === "type") || c.find((e) => e.t === "cloze");
      })
      .filter(Boolean);
    shuffle(production).slice(0, 2).forEach((e) => bag.push(e));
    const review = shuffle((prefer || []).filter((i) => L[i] && !words.includes(i)));
    const earlier = shuffle(unit.w.slice(0, index * lessonWords(unit, 0).length)
      .filter((i) => !words.includes(i) && !review.includes(i)));
    while (bag.length < QUIZ_N && (review.length || earlier.length)) {
      const c = candidates(review.length ? review.pop() : earlier.pop(), pool);
      bag.push(c[Math.floor(Math.random() * c.length)]);
    }
    const out = spread(shuffle(bag).slice(0, QUIZ_N)).map(present).filter(Boolean);
    // Speech steps ride on top of the QUIZ_N vocabulary questions, at a random
    // position each — never first, so the quiz opens on a word rather than audio.
    const stage = stageOf(unit);
    for (const kind of Object.keys(SPEECH_MIX)) {
      const mix = SPEECH_MIX[kind];
      if (!speechFrom(kind, stage, index)) continue;
      for (let k = 0; k < mix.perQuiz; k++) {
        const e = speechPrompt(kind, unit, index);
        if (e) out.splice(1 + Math.floor(Math.random() * out.length), 0, present(e));
      }
    }
    // And the chapter's form, the same way: on top, never first — and not
    // beside another question about its word, since it has one.
    if (stage >= FORM_MIX.fromStage) {
      for (let k = 0; k < FORM_MIX.perQuiz; k++) {
        const q = formPrompt(unit, index);
        if (q) out.splice(slotApart(out, q), 0, q);
      }
    }
    return out;
  }

  /* A position after the first question whose neighbours are not about q's
     word; any position after the first when there is none. */
  function slotApart(out, q) {
    const clash = (x) => x && typeof x.i === "number" && x.i === q.i;
    const free = [];
    for (let p = 1; p <= out.length; p++) if (!clash(out[p - 1]) && !clash(out[p])) free.push(p);
    return free.length ? pickOne(free) : 1 + Math.floor(Math.random() * out.length);
  }

  /* ------------------------------------------------------- placement sets */

  /* A unit can hold fewer words than the test wants questions, so top up by asking
     some words again in a different form rather than shipping a short test. */
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

  function oneQuestion(idx, unit) {
    const pool = poolFor(unit);
    const kinds = ["choose-en", "choose-ru", "cloze", "type"];
    if (voice()) kinds.push("listen");
    const t = kinds[Math.floor(Math.random() * kinds.length)];
    if (t === "cloze") {
      const c = clozeFor(idx);
      if (!c) return present({ t: "choose-en", i: idx, pool });
      return present({ t: "cloze", i: idx, ex: c.ex, token: c.token, pool });
    }
    return present({ t, i: idx, pool });
  }

  function placementQuestions() {
    const out = [];
    const per = Math.ceil(PLACEMENT_N / STAGES.length);
    STAGES.forEach((s, si) => {
      sample(s.core.w.slice(), Math.min(per, s.core.w.length)).forEach((i) => {
        const q = oneQuestion(i, s.core);
        if (q) { q.stage = si; out.push(q); }
      });
    });
    topUp(out, PLACEMENT_N, (seed) => {
      const stage = STAGES[seed.stage];
      if (!stage) return null;
      const q = oneQuestion(seed.i, stage.core);
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
        const q = oneQuestion(i, unit);
        if (q) { q.lesson = li; out.push(q); }
      });
    }
    topUp(out, SECTION_N, (seed) => {
      const q = oneQuestion(seed.i, unit);
      if (q) q.lesson = seed.lesson;
      return q;
    });
    return shuffle(out).slice(0, SECTION_N);
  }

  /* ------------------------------------------------------------- drills */

  /* The words a drill may ask about. Set per call by drillQuestions(): the
     learner's own words, so "genitive plural of рис" never lands on someone who
     knows six words. Distractors still come from anywhere — a wrong option needs
     no acquaintance. */
  let drillPool = null;

  /* Run a generator against a pool (lemma indices) and put the pool back. */
  function withPool(pool, fn) {
    const before = drillPool;
    drillPool = pool && pool.length ? pool.map((i) => L[i]).filter(Boolean) : null;
    try { return fn(); } finally { drillPool = before; }
  }

  function pickWhere(fn, tries, anywhere) {
    const from = !anywhere && drillPool && drillPool.length ? drillPool : L;
    for (let n = 0; n < (tries || 300); n++) {
      const w = from[Math.floor(Math.random() * from.length)];
      if (w && fn(w)) return w;
    }
    return null;
  }

  /* `cells` ({ row, col } pairs, from formsIntroduced) limits what may be asked
     for to the cases the route has taught; the wrong answers still come from
     the whole table. */
  function qCases(cells) {
    const w = pickWhere((x) => x.p === "noun" && tableTitled(x, /Declension/));
    if (!w) return null;
    const t = tableTitled(w, /Declension/);
    const opts = [];
    t.rows.forEach((r, ri) => cellsOf(r).forEach((c, ci) => {
      if (c && c.length) opts.push({ label: c[0], ri, ci });
    }));
    if (opts.length < 4) return null;
    // Never ask for the form already on screen: the headword is usually the
    // nominative singular, and asking for it answers itself.
    const askable = opts.filter((o) => fold(o.label) !== fold(w.w)
      && (!cells || cells.some((c) => c.row === t.rows[o.ri][0] && c.col === t.columns[o.ci + 1])));
    if (!askable.length) return null;
    const target = askable[Math.floor(Math.random() * askable.length)];
    const wrong = shuffle(opts.filter((o) => o.label !== target.label)).slice(0, 3);
    if (wrong.length < 3) return null;
    return {
      kind: "cases", i: L.indexOf(w), cyr: true,
      ask: `Choose ${t.rows[target.ri][0].toLowerCase()} ${t.columns[target.ci + 1].toLowerCase()}`,
      prompt: w.w, sub: w.e || "", table: t,
      options: shuffle([target].concat(wrong))
        .map((o) => ({ label: o.label, right: o.label === target.label, cyr: true })),
    };
  }

  /* Three wrong labels for a drill: `from` first (the word's own paradigm, which
     is what a learner confuses), topped up by `more()` (other words), never
     equal to the answer or to each other. Null when three cannot be found —
     two options is a coin flip, not a drill. */
  function threeWrong(right, from, more) {
    const seen = new Set([fold(right)]);
    const out = [];
    const take = (f) => {
      if (!f || seen.has(fold(f))) return;
      seen.add(fold(f));
      out.push(f);
    };
    shuffle(from.slice()).forEach(take);
    for (let n = 0; n < 80 && out.length < 3 && more; n++) take(more());
    return out.length >= 3 ? out.slice(0, 3) : null;
  }

  const optionsOf = (right, wrong) =>
    shuffle([right].concat(wrong)).map((s) => ({ label: s, right: s === right, cyr: true }));

  /* Aspect, two ways round: name a verb's partner, or pick the verb of an aspect
     out of four. The partner question is limited by how many verbs in the pool
     have one — seven after the first chapter — so the second shape carries the
     drill early on, where any verb marked for aspect qualifies. */
  function qAspectPartner() {
    const w = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.a);
    if (!w) return null;
    const want = w.a === "imperfective" ? "perfective" : "imperfective";
    const wrong = threeWrong(w.pt.trim(), [], () => {
      const o = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.pt !== w.pt, 60, true);
      return o ? o.pt.trim() : null;
    });
    if (!wrong) return null;
    return {
      kind: "aspect", i: L.indexOf(w), cyr: true,
      ask: `Choose the ${want} partner`, prompt: w.w, sub: w.e || "",
      note: (UN.find((u) => u.id === "core8") || {}).g,
      options: optionsOf(w.pt.trim(), wrong),
    };
  }

  function qAspectWhich() {
    const want = Math.random() < 0.5 ? "perfective" : "imperfective";
    const other = want === "perfective" ? "imperfective" : "perfective";
    const w = pickWhere((x) => x.p === "verb" && x.a === want);
    if (!w) return null;
    const wrong = threeWrong(w.w, [], () => {
      const o = pickWhere((x) => x.p === "verb" && x.a === other, 60, true);
      return o ? o.w : null;
    });
    if (!wrong) return null;
    return {
      kind: "aspect", i: L.indexOf(w), cyr: true,
      ask: `Which of these is ${want}?`, prompt: "", sub: "",
      note: (UN.find((u) => u.id === "core8") || {}).g,
      options: optionsOf(w.w, wrong),
    };
  }

  const qAspect = () => oneOf([qAspectWhich, qAspectPartner]);

  /* Agreement in any case the adjective declines for, not the nominative alone.
     The noun is shown in that case too — «___ кни́ге» wants «но́вой» — so the
     question is read rather than pattern-matched off a familiar ending. The
     wrong answers come from the adjective's own table, which is where the
     confusion lives; taking them from the same case's other genders alone
     failed whenever two genders share a form, which in the oblique cases they
     usually do. */
  const GENDER_COL = { m: "Masculine", f: "Feminine", n: "Neuter" };
  function qAgreement() {
    const adj = pickWhere((x) => x.p === "adjective" && tableTitled(x, /Declension/));
    // …but not a plural-only noun: «часы» is plural, and «но́вый часы» is not
    // agreement.
    const noun = pickWhere((x) => x.p === "noun" && ["m", "f", "n"].includes(x.g) && !x.pl
                                  && tableTitled(x, /Declension/));
    if (!adj || !noun) return null;
    const t = tableTitled(adj, /Declension/);
    const nt = tableTitled(noun, /Declension/);
    const col = t.columns.indexOf(GENDER_COL[noun.g]);
    if (col < 1) return null;
    // A case both tables fill: the adjective's form is the answer, the noun's is
    // the prompt.
    const rows = shuffle(t.rows.filter((r) => {
      const nr = nt.rows.find((x) => x[0] === r[0]);
      return r[col] && r[col].length && nr && nr[1] && nr[1].length;
    }));
    if (!rows.length) return null;
    const row = rows[0];
    const right = row[col][0];
    const nounForm = nt.rows.find((x) => x[0] === row[0])[1][0];
    const own = t.rows.flatMap((r) => cellsOf(r).map((c) => (Array.isArray(c) ? c[0] : c)));
    const wrong = threeWrong(right, own.filter(Boolean));
    if (!wrong) return null;
    return {
      kind: "agreement", i: L.indexOf(adj), cyr: true,
      ask: "Choose the form that agrees", prompt: `___ ${nounForm}`,
      sub: `${firstSense(adj)} ${firstSense(noun)} · ${row[0].toLowerCase()}`, table: t,
      options: optionsOf(right, wrong),
    };
  }

  /* Conjugation across all three of a verb's tables — present or future, past,
     imperative — and both directions. Asking only the present, as this did,
     left a chapter-7 learner drilling a tense they had moved past. */
  const VERB_TABLES = [/^Present/, /^Past/, /^Imperative/];
  function verbTable() {
    const re = VERB_TABLES[Math.floor(Math.random() * VERB_TABLES.length)];
    const w = pickWhere((x) => x.p === "verb" && tableTitled(x, re));
    return w ? { w, t: tableTitled(w, re) } : null;
  }

  function qConjugationForm() {
    const pick = verbTable();
    if (!pick) return null;
    const { w, t } = pick;
    const rows = t.rows.filter((r) => r[1] && r[1].length);
    if (!rows.length) return null;
    const target = rows[Math.floor(Math.random() * rows.length)];
    const right = target[1][0];
    // The verb's own other persons first — the imperative has only two rows, so
    // the same cell from other verbs fills the rest.
    const own = rows.filter((r) => r !== target).map((r) => r[1][0]);
    const wrong = threeWrong(right, own, () => {
      const o = pickWhere((x) => x.p === "verb" && x !== w && tableTitled(x, new RegExp("^" + t.title.split(" ")[0])), 40, true);
      if (!o) return null;
      const ot = tableTitled(o, new RegExp("^" + t.title.split(" ")[0]));
      const or = ot && ot.rows.find((r) => r[0] === target[0]);
      return or && or[1] && or[1].length ? or[1][0] : null;
    });
    if (!wrong) return null;
    const what = t.title === "Imperative" ? "imperative"
      : t.title === "Past" ? "past" : (w.a === "perfective" ? "future" : "present");
    return {
      kind: "conjugation", i: L.indexOf(w), cyr: true,
      ask: `Choose the ${what} for “${target[0]}”`, prompt: w.w, sub: w.e || "", table: t,
      options: optionsOf(right, wrong),
    };
  }

  /* The other direction: here is a form, whose is it? Reading a conjugated verb
     is what the learner does when a sentence arrives, and it is not the same
     skill as producing one. */
  function qConjugationWho() {
    const pick = verbTable();
    if (!pick) return null;
    const { w, t } = pick;
    const rows = t.rows.filter((r) => r[1] && r[1].length);
    if (rows.length < 4) return null;
    const target = rows[Math.floor(Math.random() * rows.length)];
    // Only rows whose form differs: «он» and «оно» share a past in some verbs,
    // and two labels for one form is a question with two right answers.
    const others = rows.filter((r) => fold(r[1][0]) !== fold(target[1][0]));
    const wrong = threeWrong(target[0], others.map((r) => r[0]));
    if (!wrong) return null;
    return {
      kind: "conjugation", i: L.indexOf(w), cyr: true,
      ask: "Whose form is this?", prompt: target[1][0], sub: firstSense(w), table: t,
      options: shuffle([target[0]].concat(wrong))
        .map((s) => ({ label: s, right: s === target[0] })),
    };
  }

  const qConjugation = () => oneOf([qConjugationForm, qConjugationForm, qConjugationWho]);

  /* Move the stress to each other vowel to build the wrong answers. Any accented
     form counts, not only the headword: «рука́» and «ру́ки» shift, and that shift
     is the thing being drilled. */
  function stressQuestion(w, accented) {
    const plain = accented.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
    const positions = [];
    for (let k = 0; k < plain.length; k++) {
      if (VOWELS_RU.indexOf(plain[k]) >= 0) positions.push(k);
    }
    if (positions.length < 2) return null;
    const variants = positions
      .map((k) => plain.slice(0, k + 1) + "́" + plain.slice(k + 1))
      .filter((v) => fold(v) === fold(accented) && v !== accented);
    // Two options is a coin flip, not a drill — a word needs enough vowels to
    // place the stress somewhere genuinely wrong at least twice.
    if (variants.length < 2) return null;
    return {
      kind: "stress", i: L.indexOf(w), cyr: true,
      ask: "Choose where the stress falls", prompt: plain, sub: w.e || "", say: plain,
      options: shuffle([accented].concat(shuffle(variants).slice(0, 3)))
        .map((s) => ({ label: s, right: s === accented, cyr: true })),
    };
  }

  function qStress() {
    const w = pickWhere((x) => /́/.test(x.w) && x.b.length > 3);
    if (!w) return null;
    // The headword about half the time, else one of its inflected forms.
    if (Math.random() < 0.5) {
      const forms = shuffle(paradigmForms(w).filter((f) => /́/.test(f)));
      for (const f of forms.slice(0, 6)) {
        const q = stressQuestion(w, f);
        if (q) return q;
      }
    }
    return stressQuestion(w, w.w);
  }

  /* The rule a sentence shows, and the sentence a rule is shown by. The card
     examples are a fixed set — two per unit — so this drill has a ceiling the
     others do not; asking it in both directions is what doubles it, and the
     naming question below draws on the paradigm instead, which does not run out. */
  const unitsWithNotes = () => UN.filter((u) => u.g && u.g.examples && u.g.examples.length);

  function qGrammarRule() {
    const withNotes = unitsWithNotes();
    if (withNotes.length < 4) return null;
    const pick = withNotes[Math.floor(Math.random() * withNotes.length)];
    const ex = pick.g.examples[Math.floor(Math.random() * pick.g.examples.length)];
    const others = shuffle(withNotes.filter((u) => u.g.title !== pick.g.title)).slice(0, 3);
    if (others.length < 3) return null;
    return {
      kind: "grammar", cyr: true, ask: "Choose the rule this shows",
      prompt: ex[0], sub: ex[1], note: pick.g,
      options: shuffle([pick].concat(others))
        .map((u) => ({ label: u.g.title, right: u.id === pick.id })),
    };
  }

  function qGrammarExample() {
    const withNotes = unitsWithNotes();
    if (withNotes.length < 4) return null;
    const pick = withNotes[Math.floor(Math.random() * withNotes.length)];
    const ex = pick.g.examples[Math.floor(Math.random() * pick.g.examples.length)];
    const others = shuffle(withNotes.filter((u) => u.g.title !== pick.g.title));
    const wrong = threeWrong(ex[0], others.map((u) => u.g.examples[0][0]).filter(Boolean));
    if (!wrong) return null;
    return {
      kind: "grammar", cyr: true, ask: `Which sentence shows “${pick.g.title}”?`,
      prompt: "", sub: "", note: pick.g,
      options: optionsOf(ex[0], wrong),
    };
  }

  /* Name the form: the paradigm supplies the question, so this one grows with
     the curriculum rather than with the number of hand-written cards. */
  function qGrammarName() {
    const w = pickWhere((x) => (x.p === "noun" || x.p === "adjective" || x.p === "verb")
                               && (x.t || []).length);
    if (!w) return null;
    const t = (w.t || [])[Math.floor(Math.random() * w.t.length)];
    if (!t || !t.rows.length) return null;
    const cells = [];
    t.rows.forEach((r, ri) => cellsOf(r).forEach((c, ci) => {
      if (c && c.length) cells.push({ label: c[0], ri, ci });
    }));
    if (cells.length < 4) return null;
    const target = cells[Math.floor(Math.random() * cells.length)];
    const name = (o) => formName(t, o.ri, o.ci + 1, w).replace(/^the /, "");
    const right = name(target);
    // Only cells whose form differs, or two names would both be right.
    const others = cells.filter((o) => fold(o.label) !== fold(target.label));
    const wrong = threeWrong(right, unique(others.map(name)));
    if (!wrong) return null;
    return {
      kind: "grammar", i: L.indexOf(w), cyr: true,
      ask: "What form is this?", prompt: target.label, sub: firstSense(w), table: t,
      options: shuffle([right].concat(wrong)).map((s) => ({ label: s, right: s === right })),
    };
  }

  const qGrammar = () => oneOf([qGrammarName, qGrammarRule, qGrammarExample]);

  /* Try the shapes in a random order and take the first that produces a
     question: early on, a pool of seventy words cannot fill every shape. */
  function oneOf(shapes) {
    for (const make of shuffle(shapes.slice())) {
      const q = make();
      if (q) return q;
    }
    return null;
  }

  const GEN = { cases: qCases, aspect: qAspect, agreement: qAgreement,
                conjugation: qConjugation, stress: qStress, grammar: qGrammar };

  /* What makes two drill questions the same question: what is shown, what is
     asked, and what the answer is. The answer has to be in it — a shape whose
     content lives entirely in its options ("Which of these is perfective?")
     carries no prompt at all, and keying on the prompt alone collapsed every
     one of them into a single entry, so a run could hold exactly one. */
  const drillKey = (q) => [q.kind, q.prompt, q.ask,
                           (q.options || []).filter((o) => o.right).map((o) => o.label).join(",")]
    .join("|");

  /* `pool`: lemma indices the drill may ask about (see native data.js drillPool);
     without one, every word in the curriculum. `cells`: for the cases drill,
     the cells the route has introduced (formsIntroduced); without it, any. */
  function drillQuestions(type, n, pool, cells) {
    const out = [];
    const seen = new Set();
    const want = n || DRILL_N;
    withPool(pool, () => {
      for (let k = 0; k < want * 25 && out.length < want; k++) {
        const q = GEN[type] && GEN[type](cells);
        if (!q) continue;
        const key = drillKey(q);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(q);
      }
    });
    return out;
  }

  return {
    distractors, clozeFor, candidates, present, poolFor, speechPrompt, stageOf, unitsUpTo,
    vocabSteps, quizSteps, placementQuestions, sectionQuestions, drillQuestions, drillKey,
    sceneFor, listeningDrill, customQuiz, formPrompt, formSpec, formsIntroduced,
    drillsIntroduced, drillOpensAt,
  };
}
