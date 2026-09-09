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

export const QUIZ_N = 8;

/* How the speech activities join a lesson quiz, on top of QUIZ_N: from which chapter
   (0-based stage index) and how many per quiz. The first chapters stay reading-only
   — a learner who has met forty words is not ready to transcribe a sentence — and
   the numbers live here, in one place, rather than in each generator. */
export const SPEECH_MIX = {
  hear: { fromStage: 1, perQuiz: 1 },
  scene: { fromStage: 1, perQuiz: 1 },
  say: { fromStage: 2, perQuiz: 1 },
};

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
      case "cloze": {
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, bySense)));
        return {
          kind: e.t, i: e.i, ask: "Fill the gap",
          prompt: gapped(e.ex.ru, e.token), sub: e.ex.en, cyr: true,
          options: opts.map((i) => ({ label: L[i].b, right: i === e.i, cyr: true })),
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
      /* Already in its final shape: sceneFor builds the questions with the rows. */
      case "scene":
        return e.scene;
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

  /* A run of scenes for the listening drill, no two opening on the same sentence. */
  function listeningDrill(units, n) {
    const ids = units.map((u) => u.id);
    const out = [], seen = new Set();
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      const s = sceneFor(ids, null);
      if (!s || seen.has(s.rows[0].ru)) continue;
      seen.add(s.rows[0].ru);
      out.push(s);
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
    const wordKinds = kinds.filter((k) => ["choose-en", "choose-ru", "listen", "cloze", "type"].includes(k));
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

  /* Vocabulary: teach a word, then retrieve the pair just seen. */
  function vocabSteps(unit, index) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    const steps = [];
    if (index === 0 && unit.g) steps.push({ t: "grammar", note: unit.g });
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
    const own = pool[unit.id] || [];
    const all = unitsUpTo(unit).flatMap((u) => pool[u.id] || []);
    const want = new Set(lessonWords(unit, index));
    const row = pickPrompt(SPEECH.rows, own, want, IX, null, true)
      || pickPrompt(SPEECH.rows, all, want, IX, null, true)
      || pickPrompt(SPEECH.rows, own, null, IX)
      || pickPrompt(SPEECH.rows, all, null, IX);
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

  /* The quiz is mixed and unordered, and asks for production at least twice. A
     short last lesson tops up with words from the unit's earlier lessons — review,
     not padding — so a three-word lesson is not a five-question quiz. */
  function quizSteps(unit, index) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    const bag = words.map((i) => {
      const c = candidates(i, pool);
      return c[Math.floor(Math.random() * c.length)];
    });
    const production = words
      .map((i) => candidates(i, pool).filter((e) => e.t === "type" || e.t === "cloze"))
      .filter((a) => a.length).map((a) => a[0]);
    shuffle(production).slice(0, 2).forEach((e) => bag.push(e));
    const earlier = shuffle(unit.w.slice(0, index * lessonWords(unit, 0).length)
      .filter((i) => !words.includes(i)));
    while (bag.length < QUIZ_N && earlier.length) {
      const c = candidates(earlier.pop(), pool);
      bag.push(c[Math.floor(Math.random() * c.length)]);
    }
    const out = spread(shuffle(bag).slice(0, QUIZ_N)).map(present).filter(Boolean);
    // Speech steps ride on top of the QUIZ_N vocabulary questions, at a random
    // position each — never first, so the quiz opens on a word rather than audio.
    const stage = stageOf(unit);
    for (const kind of Object.keys(SPEECH_MIX)) {
      const mix = SPEECH_MIX[kind];
      if (stage < mix.fromStage) continue;
      for (let k = 0; k < mix.perQuiz; k++) {
        const e = speechPrompt(kind, unit, index);
        if (e) out.splice(1 + Math.floor(Math.random() * out.length), 0, present(e));
      }
    }
    return out;
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

  function pickWhere(fn, tries, anywhere) {
    const from = !anywhere && drillPool && drillPool.length ? drillPool : L;
    for (let n = 0; n < (tries || 300); n++) {
      const w = from[Math.floor(Math.random() * from.length)];
      if (w && fn(w)) return w;
    }
    return null;
  }

  function qCases() {
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
    const askable = opts.filter((o) => fold(o.label) !== fold(w.w));
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

  function qAspect() {
    const w = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.a);
    if (!w) return null;
    const others = [];
    for (let n = 0; n < 60 && others.length < 3; n++) {
      const o = pickWhere((x) => x.p === "verb" && realPartner(x.pt) && x.pt !== w.pt, 60, true);
      if (o && !others.includes(o.pt.trim())) others.push(o.pt.trim());
    }
    if (others.length < 3) return null;
    const want = w.a === "imperfective" ? "perfective" : "imperfective";
    return {
      kind: "aspect", i: L.indexOf(w), cyr: true,
      ask: `Choose the ${want} partner`, prompt: w.w, sub: w.e || "",
      note: (UN.find((u) => u.id === "core8") || {}).g,
      options: shuffle([w.pt.trim()].concat(others))
        .map((s) => ({ label: s, right: s === w.pt.trim(), cyr: true })),
    };
  }

  function qAgreement() {
    const adj = pickWhere((x) => x.p === "adjective" && tableTitled(x, /Declension/));
    // The noun only sets the gender; any noun the learner has met will do, and
    // when the pool has no adjective yet the drill has no question — as it should.
    // …but not a plural-only noun: «часы» is plural, and «но́вый часы» is not
    // agreement.
    const noun = pickWhere((x) => x.p === "noun" && ["m", "f", "n"].includes(x.g) && !x.pl);
    if (!adj || !noun) return null;
    const t = tableTitled(adj, /Declension/);
    const nom = t.rows.find((r) => /Nominative/i.test(r[0]));
    if (!nom) return null;
    const want = { m: 0, f: 1, n: 2 }[noun.g];
    const forms = cellsOf(nom).map((c) => (c && c.length ? c[0] : null));
    if (!forms[want] || forms.filter(Boolean).length < 3) return null;
    // An adjective whose genders share a form (an indeclinable «беж») would
    // offer the right answer twice.
    if (new Set(forms.filter(Boolean)).size !== forms.filter(Boolean).length) return null;
    return {
      kind: "agreement", i: L.indexOf(adj), cyr: true,
      ask: "Choose the form that agrees", prompt: `___ ${noun.w}`,
      sub: `${firstSense(adj)} ${firstSense(noun)}`, table: t,
      options: shuffle(forms.filter(Boolean))
        .map((f) => ({ label: f, right: f === forms[want], cyr: true })),
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
      kind: "conjugation", i: L.indexOf(w), cyr: true,
      ask: `Choose the form for “${target[0]}”`, prompt: w.w, sub: w.e || "", table: t,
      options: shuffle([target].concat(wrong))
        .map((r) => ({ label: r[1][0], right: r[1][0] === target[1][0], cyr: true })),
    };
  }

  /* Move the stress to each other vowel to build the wrong answers. */
  function qStress() {
    const w = pickWhere((x) => /́/.test(x.w) && x.b.length > 3);
    if (!w) return null;
    const positions = [];
    for (let k = 0; k < w.b.length; k++) {
      if (VOWELS_RU.indexOf(w.b[k]) >= 0) positions.push(k);
    }
    if (positions.length < 2) return null;
    const variants = positions
      .map((k) => w.b.slice(0, k + 1) + "́" + w.b.slice(k + 1))
      .filter((v) => fold(v) === fold(w.w) && v !== w.w);
    // Two options is a coin flip, not a drill — a word needs enough vowels to
    // place the stress somewhere genuinely wrong at least twice.
    if (variants.length < 2) return null;
    return {
      kind: "stress", i: L.indexOf(w), cyr: true,
      ask: "Choose where the stress falls", prompt: w.b, sub: w.e || "", say: w.b,
      options: shuffle([w.w].concat(shuffle(variants).slice(0, 3)))
        .map((s) => ({ label: s, right: s === w.w, cyr: true })),
    };
  }

  function qGrammar() {
    const withNotes = UN.filter((u) => u.g && u.g.examples && u.g.examples.length);
    if (withNotes.length < 4) return null;
    const pick = withNotes[Math.floor(Math.random() * withNotes.length)];
    const ex = pick.g.examples[Math.floor(Math.random() * pick.g.examples.length)];
    const others = shuffle(withNotes.filter((u) => u.id !== pick.id)).slice(0, 3);
    return {
      kind: "grammar", cyr: true, ask: "Choose the rule this shows",
      prompt: ex[0], sub: ex[1], note: pick.g,
      options: shuffle([pick].concat(others))
        .map((u) => ({ label: u.g.title, right: u.id === pick.id })),
    };
  }

  const GEN = { cases: qCases, aspect: qAspect, agreement: qAgreement,
                conjugation: qConjugation, stress: qStress, grammar: qGrammar };

  /* `pool`: lemma indices the drill may ask about (see native data.js drillPool);
     without one, every word in the curriculum. */
  function drillQuestions(type, n, pool) {
    const out = [];
    const seen = new Set();
    const want = n || DRILL_N;
    drillPool = pool && pool.length ? pool.map((i) => L[i]).filter(Boolean) : null;
    try {
      for (let k = 0; k < want * 25 && out.length < want; k++) {
        const q = GEN[type] && GEN[type]();
        if (!q) continue;
        const key = q.kind + "|" + q.prompt + "|" + q.ask;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(q);
      }
    } finally {
      drillPool = null;
    }
    return out;
  }

  return {
    distractors, clozeFor, candidates, present, poolFor, speechPrompt, stageOf, unitsUpTo,
    vocabSteps, quizSteps, placementQuestions, sectionQuestions, drillQuestions,
    sceneFor, listeningDrill, customQuiz,
  };
}
