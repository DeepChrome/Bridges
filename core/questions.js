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
   generator.

   **There is deliberately no `scene` entry.** The 30–45-second conversation was
   spliced into the quiz from chapter 2 (2026-09-10), then from chapter 1
   (2026-09-17), and the owner then ruled it out of the quiz altogether the same
   day: *"I don't know if I like the listening as embedded in the quiz. I think
   it's better as a standalone exercise."* He is right about the shape — a quiz
   is eight short retrieval questions and half a minute of audio with five
   comprehension questions is a session of its own, which is the argument
   `writtenPassage` already won for Practice → Listening, where one scenario is
   drawn rather than five (§30l).

   Removing the key is the whole change, because `quizSteps` loops over this
   object's keys: a kind that is not named here is not spliced. The
   conversations live on `SceneList` — Practice → Listening → Conversations,
   which lists them by chapter — and nothing else reaches for them.

   `hear` stays. It is a different exercise wearing similar clothes: one
   sentence, a real recording from the collection, typed back. */
export const SPEECH_MIX = {
  hear: { fromStage: 0, fromLesson: 2, perQuiz: 1 },
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
/* Days of stability after which a word is asked by production rather than by
   recognition (ROADMAP P10.1). Four is roughly the third or fourth correct
   recall: long enough that the word is known, early enough that it is still
   being learned. */
export const PRODUCE_AT = 4;

/* A listening passage (ROADMAP P10.3): how many questions it carries, and how
   many of its words a learner must already know before it is offered at all.
   Five questions is what fits on the screen under the player without scrolling
   while the audio is still in mind. */
export const PASSAGE_Q = 5;
export const PASSAGE_MIN_KNOWN = 6;
/* Below this rank a lemma is a function word, not something to listen for —
   the same line the scenes and the speech grading already draw. */
export const PASSAGE_SKIP_TOP = 100;
/* What the player skips by, in milliseconds — the owner asked for a YouTube-ish
   five seconds, and build_listening.py steps its windows by the same amount. */
export const SKIP_MS = 5000;

export const SCENE_ROWS = [2, 3];
/* Sentences in a lesson-level listening passage. Five of the corpus's short
   sentences with a pause between them is the half minute the owner asked for,
   and five is also what fits on the screen with its questions. */
export const LESSON_LINES = 5;
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

export const DRILL_N = 10;
export const PLACEMENT_N = 50;
export const SECTION_N = 30;
export const TEST_OUT = 0.8;

const VOWELS_RU = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
/* A partner worth asking about: present, Cyrillic, and **not the verb itself**.
   Some rows record a biaspectual verb as its own partner, and the drill then
   asked the learner to produce the word printed above the question — caught by
   the typed-drill check, which only fails on the runs that happen to draw one
   (`w` is optional so the old one-argument calls still read the same). */
const realPartner = (p, w) => !!p && p.trim() && p.trim() !== "-" && /[а-яё]/i.test(p)
  && (!w || fold(p) !== fold(w));
const tableTitled = (w, re) => (w.t || []).find((t) => re.test(t.title));
const cellsOf = (row) => row.slice(1);

export const DRILL_TYPES = [
  { id: "cases", name: "Cases", icon: "cases",
    blurb: "Put a noun in the case a sentence needs" },
  { id: "aspect", name: "Aspect pairs", icon: "aspect",
    blurb: "Match imperfective and perfective partners" },
  { id: "agreement", name: "Agreement", icon: "agreement",
    blurb: "Make adjectives agree with their noun" },
  { id: "conjugation", name: "Conjugation", icon: "conjugation",
    blurb: "Put a verb with the right person" },
  { id: "stress", name: "Stress", icon: "stress",
    blurb: "Hear where the emphasis falls" },
  { id: "grammar", name: "Grammar rules", icon: "rules",
    blurb: "Spot the rule a sentence is showing" },
];

export function makeQuestions(env) {
  const { L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice, SPEECH } = env;
  // The written lesson passages (§30l), keyed "unitId:lessonIndex". Absent on a
  // platform that does not ship them, in which case the scene falls back to the
  // corpus pools as it did before.
  const SCRIPTS = env.SCRIPTS || {};
  const voice = () => (typeof hasVoice === "function" ? hasVoice() : !!hasVoice);
  const stageOf = (u) =>
    STAGES.findIndex((s) => s.core === u || (s.branches || []).includes(u));

  /* ------------------------------------------------------------ helpers */

  /* A meaning with its parentheticals stripped, for comparing one gloss against
     another: `firstSense` gives "on (place)" for «на», which never matches the
     plain "on" sitting in «в»'s list even though a learner offered both would be
     right either way. */
  const senseKey = (s) => fold(String(s || "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim());
  const mainSense = (w) => senseKey(firstSense(w));
  /* Every synonym in a gloss, not only the first group: OpenRussian separates
     senses with semicolons and synonyms within a sense with commas, and both
     matter here because either can be the meaning a learner reads. */
  const allSenses = (w) =>
    new Set(String(w.e || "").split(/[;,]/).map(senseKey).filter(Boolean));

  /* Whether `i` can be a wrong answer against `correctIdx`.
     A distractor is unsafe when the option a learner sees is *also* a right
     answer. It was checked one way only — first sense against first sense —
     which let «у» stand as a wrong answer to "at" beside «на», and 1.1 % of all
     option sets carried a second genuinely correct choice. Both directions are
     checked now, because the two question shapes read the pair opposite ways:
     choose-en shows the distractor's meaning against the answer's word, and
     choose-ru shows the answer's meaning against the distractor's word. */
  function safeDistractor(correctIdx, i) {
    const a = L[correctIdx], b = L[i];
    if (!a || !b) return false;
    return !allSenses(a).has(mainSense(b)) && !allSenses(b).has(mainSense(a));
  }

  /* Wrong answers, preferring words of the same class as the right one.
     Ignoring part of speech meant that in 23.7 % of option sets the answer was
     the only option of its own kind — "in" standing against *want*, *year* and
     *he* — so the ending gave it away without the learner knowing the word at
     all. Same class first, then anything, then (only if the pool is too thin to
     fill four options at all) the merely-distinct. A question with three
     options is worse than one with a weak fourth. */
  function distractors(correctIdx, pool, n, key) {
    const want = key(L[correctIdx]);
    const pos = (L[correctIdx] || {}).p;
    const out = [];
    /* Within a tier, the options nearest the answer in length.
     *
     * Class was the first tell to go (the 23.7 % above); length is the one left.
     * Measured over 500 questions, the answer was three characters longer or
     * shorter than every distractor in 14 % of "choose the meaning" sets —
     * "to make somebody's acquaintance" standing against "bread", "five" and
     * "here", which needs no Russian at all. Picking from the nearest eight
     * rather than the nearest three keeps the option sets varied
     * (tools/audit_options.mjs). */
    const take = (accept) => {
      if (out.length === n) return;
      const fit = [];
      for (const i of pool) {
        if (i === correctIdx || out.includes(i)) continue;
        const v = key(L[i]);
        if (!v || v === want || out.some((o) => key(L[o]) === v)) continue;
        if (!accept(i)) continue;
        fit.push(i);
      }
      const near = fit.sort((a, b) => Math.abs(String(key(L[a])).length - String(want).length)
                                    - Math.abs(String(key(L[b])).length - String(want).length));
      for (const i of shuffle(near.slice(0, Math.max(n * 2, 8)))) {
        if (out.length === n) return;
        if (out.some((o) => key(L[o]) === key(L[i]))) continue;
        out.push(i);
      }
    };
    take((i) => L[i].p === pos && safeDistractor(correctIdx, i));
    take((i) => safeDistractor(correctIdx, i));
    take(() => true);
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
    const scored = [];
    for (const ex of w.x) {
      const toks = ex.ru.match(TOKEN) || [];
      if (toks.length < 3) continue;
      const hit = toks.find((t) => {
        const ids = IX[fold(t)];
        return ids && ids.includes(idx);
      });
      if (!hit) continue;
      const unknown = toks.filter((t) => !IX[fold(t)]).length;
      scored.push({ ex, token: hit, score: unknown * 100 + toks.length });
    }
    if (!scored.length) return null;
    /* Readability is a filter, not a ranking. Returning the single minimum made
       the gap-fill for a word the same sentence for ever — 97 % of words have
       another that qualifies, and the whole curriculum could only ever show 892
       of its ~4,100 example sentences. Anything within a few points of the best
       is equally readable, so draw among those. */
    const best = Math.min(...scored.map((s) => s.score));
    const close = scored.filter((s) => s.score <= best + 3);
    const pick = close[Math.floor(Math.random() * close.length)];
    return { ex: pick.ex, token: pick.token };
  }

  /* `s`, cased like `sample`'s first letter.
   *
   * Both directions, because the tell runs both ways: a sentence-initial gap
   * gives the answer a capital the distractors lack, and a mid-sentence gap
   * whose distractor happens to be a proper noun gives *that* one away
   * instead. Only the first letter is touched — an all-caps word is a word,
   * not a case to normalise. */
  const casedLike = (sample, s) => {
    const str = String(s || "");
    const first = String(sample || "").charAt(0);
    if (!first || !str) return str;
    const upper = first === first.toUpperCase() && first !== first.toLowerCase();
    return (upper ? str.charAt(0).toUpperCase() : str.charAt(0).toLowerCase()) + str.slice(1);
  };

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

  /* Options for a word, easiest first: recognition before production.
     With `known` (the learner's card for this word), a word the scheduler already
     trusts is asked the other way round — see PRODUCE_AT. */
  function candidates(idx, pool, known) {
    const list = [{ t: "choose-en", i: idx }];
    if (voice()) list.push({ t: "listen", i: idx });
    list.push({ t: "choose-ru", i: idx });
    const c = clozeFor(idx);
    if (c) list.push({ t: "cloze", i: idx, ex: c.ex, token: c.token });
    list.push({ t: "type", i: idx });
    const out = list.map((e) => Object.assign(e, { pool }));
    return mature(known) ? productionOnly(out) : out;
  }

  /* Recognition is picking the right answer out of four; production is finding
     it yourself. Every review of the big apps lands on the same complaint — that
     tapping through multiple choice teaches you to recognise words you cannot
     use — and the research agrees that producing a word builds more than
     choosing it does (ROADMAP P10.1).

     So recognition is for meeting a word, not for keeping it. Once the scheduler
     holds a card for PRODUCE_AT days it has been recalled correctly several
     times, and from then on the word is asked by typing or by a gap to fill.
     Stability rather than a count of reviews, because that is what the scheduler
     actually believes about the memory. */
  /* `known` is the word's entry — up to three cards, one a direction
     (core/scheduler.js) — and the strongest of them is what the scheduler
     believes about the memory. */
  const mature = (entry) => !!entry && Object.keys(entry).some((d) =>
    entry[d] && typeof entry[d].s === "number" && entry[d].s >= PRODUCE_AT);
  const PRODUCTION = ["type", "cloze"];
  /* Not a reordering — a restriction. The quiz picks at random from what this
     returns, so leaving the recognition kinds in the list would leave them in
     the quiz. A word with no example sentence has only `type`, which is fine. */
  const productionOnly = (list) => {
    const say = list.filter((e) => PRODUCTION.includes(e.t));
    return say.length ? say : list;
  };

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

  /* Every lemma that leads with a given meaning, built once on first use.
     When the learner types, any Russian word with the meaning on screen is a
     right answer: "jacket" → «пиджак» or «куртка». This used to search the
     question's own pool, which is the unit's word list, so «тут» was marked
     wrong for "here" because «здесь» happened to be the word the unit taught.
     The learner had written correct Russian for the prompt they were given, and
     the app told them they were wrong — the one verdict a study app must never
     get backwards. The index is over the whole curriculum instead. */
  let senseIndex = null;
  function bySenseIndex() {
    if (senseIndex) return senseIndex;
    senseIndex = new Map();
    L.forEach((x, i) => {
      const k = mainSense(x);
      if (!k) return;
      if (!senseIndex.has(k)) senseIndex.set(k, []);
      senseIndex.get(k).push(i);
    });
    return senseIndex;
  }
  const sameSense = (e, w) =>
    unique((bySenseIndex().get(mainSense(w)) || [])
      .filter((i) => i !== e.i)
      .map((i) => fold(L[i].b)));

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
        /* Every option cased the way the gap needs it (ROADMAP 13.15).
           The answer is the form exactly as the sentence spelled it, and the
           distractors come from the paradigm and the index, which are
           lowercase — so a gap at the start of a sentence handed the answer a
           capital letter and the other three none. «_____ Ду́ма провела́…»
           offered «Госуда́рственная» against three lowercase forms, which is a
           free elimination for somebody who reads no Russian at all. Found
           reading the Phase 0 walkthrough shots, 2026-09-15. */
        const opts = [{ label: token, right: true, cyr: true }].concat(wrong)
          .map((o) => ({ ...o, label: casedLike(token, o.label) }));
        return {
          kind: e.t, i: e.i, ask: "Fill the gap",
          prompt: gapped(e.ex.ru, token), sub: e.ex.en, cyr: true,
          options: shuffle(opts),
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
  function sceneFor(unitIds, want, lines) {
    if (!SPEECH || !SPEECH.listen || !SPEECH.rows) return null;
    const rows = SPEECH.rows;
    const idxs = unique(unitIds.flatMap((id) => SPEECH.listen[id] || []));
    if (idxs.length < 5) return null;
    const preferred = want && want.size
      ? idxs.filter((i) => sentenceLemmas(rows[i][0], IX).some((l) => want.has(l)))
      : [];
    const first = preferred.length ? pickOne(preferred) : pickOne(idxs);
    const rest = shuffle(idxs.filter((i) => i !== first));
    const count = Math.min(lines || pickOne(SCENE_ROWS), rest.length + 1);
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
      // No cast: a corpus scene is unrelated sentences from the pool, not a
      // conversation. The activity draws it as one voice with no speakers.
      cast: [],
      lines: chosen.map((ri) => ({ ru: rows[ri][0], en: rows[ri][1],
                                   lemmas: sentenceLemmas(rows[ri][0], IX) })),
      lemmas: heardAll, questions,
    };
  }

  /* --------------------------------------------------- the written passages */

  /* The listening passage written for one lesson (§30l).
   *
   * The corpus could not do this job. Its listening pool is drawn from what his
   * decks and the videos happen to contain, so a beginner's scene was either a
   * handful of three-word fragments or, from a video, half a minute of native
   * speech using words the first three chapters never teach — the owner's verdict
   * on 2026-09-10 was "way too advanced". These passages are written per lesson
   * against that lesson's own vocabulary and checked by tools/check_scripts.mjs,
   * so the level is a property of the file rather than a hope.
   *
   * `written: true` rides on the question: there is no recording for a sentence
   * nobody has said, so the device voice reads it and the screen says so (§27).
   */
  /* One written conversation, and five questions about the situation in it
     (the owner, 2026-09-10 — §30k).
   *
   * The questions are authored with the scenario rather than generated from it,
   * because what he asked for cannot be generated: "who is talking? are they
   * friends? where are they going? what is their problem?" are questions about
   * a situation, and nothing in the corpus knows a situation. The options are
   * shuffled here so a learner cannot learn the answer's position, and the
   * whole conversation rides on the question so the activity can play it, move
   * around inside it, and show it word-linked afterwards.
   */
  function scenarioFor(unit, index) {
    const s = SCRIPTS[`${unit.id}:${index}`];
    if (!s || !s.lines || !s.lines.length || !s.questions || !s.questions.length) return null;
    const lines = s.lines.map((l) => ({
      s: l.s, ru: l.ru, en: l.en, lemmas: sentenceLemmas(l.ru, IX),
    }));
    const questions = s.questions.map((q) => ({
      ask: q.ask,
      options: shuffle(q.options.map((label, n) => ({ label, right: n === (q.answer || 0) }))),
    }));
    return {
      kind: "scene", scenario: true, ask: "Listen, then answer", prompt: "", cyr: true,
      // The lesson's own key, which is also the key its audio track is built
      // under (tools/build_scene_tracks.mjs) and the seed its voices are drawn
      // from. It rides on the question so the activity never has to rebuild it
      // out of a display title.
      script: `${unit.id}:${index}`,
      /* Words the conversation uses that this lesson has not taught (§30l,
         2026-09-17). Shown before it plays, with the cast and the questions,
         so a learner meets them rather than guesses at them. A handful at
         most — `INTRO_MAX` in tools/check_scripts.mjs — and every one of them
         is really said in the lines, which the checker enforces. */
      intro: s.intro || [],
      unit: unit.id, cast: s.cast || [], lines, questions,
      lemmas: unique(lines.flatMap((l) => l.lemmas)),
      level: unit.name, topic: s.title, written: true,
    };
  }

  function scriptScene(unit, index) {
    return SCRIPTS ? scenarioFor(unit, index) : null;
  }

  /* The written passage for the latest lesson a learner has reached, for the
     Listening activity in Practice — where there is no lesson to ask about, the
     level still has to come from somewhere. `reached(unit) -> lessons done`
     lets the caller say how far into each unit they are; without it the whole
     unit counts as reached. */
  function writtenPassage(units, reached) {
    const keys = [];
    for (const u of units) {
      const n = lessonCount(u);
      const done = reached ? Math.min(n, reached(u)) : n;
      for (let i = 0; i < done; i++) if (SCRIPTS[`${u.id}:${i}`]) keys.push({ u, i });
    }
    if (!keys.length) return null;
    // Latest first, so the passage matches where they are rather than where
    // they started; a few back from the front so it is not always the same one.
    const recent = keys.slice(-8);
    for (const { u, i } of shuffle(recent)) {
      const scene = scriptScene(u, i);
      if (scene) return scene;
    }
    return null;
  }

  /* ------------------------------------------------------- listening passages */

  /* Half a minute of one native speaker on one subject, and questions about what
     was caught in it (ROADMAP P10.3, the owner 2026-09-10).
     `passages` come from tools/build_listening.py: a video, a span, and the
     curriculum words said in it with their milliseconds.

     What the questions can honestly be: the captions are YouTube's own, with no
     punctuation and no translation, so nothing here claims to test whether the
     learner understood the passage. It tests what they caught — which words went
     past — and that is a real skill at any level and the only thing the data
     supports. The moment each word was said rides on the question, so a missed
     one can be played back where it happened. */

  /* How well a passage suits this learner: the words in it they have met. `known`
     is a Set of bare forms. Nothing is gated — a beginner simply gets the passage
     with most of their own words in it. */
  function passageFit(passage, known) {
    let n = 0;
    for (const w in passage.words) {
      if ((!known || known.has(w)) && contentWord(w)) n++;
    }
    return n;
  }

  /* Words below PASSAGE_SKIP_TOP by frequency are «и», «не», «в» — a native
     speaker says them constantly, so counting them made "richest in your own
     words" a ranking by function-word density, and 95 % of the answers were
     one. The same rule already guards the scenes (SCENE_SKIP_TOP) and the
     per-word grading (SPEECH_SKIP_TOP). L is in frequency order. */
  const contentWord = (bare) => {
    const i = (IX[fold(bare)] || [])[0];
    return i !== undefined && i >= PASSAGE_SKIP_TOP;
  };

  /* The passages worth offering, best fit first. */
  function passagesFor(passages, known, limit) {
    const scored = (passages || [])
      .map((p) => ({ p, fit: passageFit(p, known) }))
      .filter((x) => x.fit >= PASSAGE_MIN_KNOWN)
      .sort((a, b) => b.fit - a.fit);
    return scored.slice(0, limit || 40).map((x) => x.p);
  }

  /* PASSAGE_Q questions about one passage. `known` keeps both the answers and the
     wrong options inside what the learner has met — being unable to answer
     because you have never seen any of the four words teaches nothing. */
  function passageQuestions(passage, known) {
    const said = Object.keys(passage.words || {})
      .filter((w) => (!known || known.has(w)) && contentWord(w));
    if (said.length < 4) return [];
    const idx = (b) => (IX[fold(b)] || [])[0];
    const heard = shuffle(said.slice()).filter((b) => idx(b) !== undefined);
    if (heard.length < 4) return [];
    /* Words the learner knows that this passage does not say — and `maybe` is
       the difference between "not said" and "not settled". A form the resolver
       could not pin to one lemma is still a form that was spoken, so offering
       its candidates as wrong answers marked a learner wrong for hearing
       correctly (build_listening.py). */
    const spoken = new Set(Object.keys(passage.words || {}).concat(passage.maybe || []));
    const absent = shuffle([...(known || [])]
      .filter((b) => !spoken.has(b) && contentWord(b)))
      .filter((b) => idx(b) !== undefined);
    const out = [];
    for (const b of heard.slice(0, PASSAGE_Q - 1)) {
      const wrong = absent.splice(0, 3);
      if (wrong.length < 3) break;
      const i = idx(b);
      out.push({
        kind: "heard", i, cyr: true, ask: "Which of these did you hear?",
        prompt: "", at: passage.words[b][0],
        lemmas: [i],
        options: shuffle([{ label: L[i].w, right: true }]
          .concat(wrong.map((x) => ({ label: L[idx(x)].w, right: false }))))
          .map((o) => ({ ...o, cyr: true })),
      });
    }
    // …and one about the order two of them came in, which needs the passage to
    // have been followed rather than scanned.
    const two = heard.filter((b) => passage.words[b][0] !== undefined).slice(0, 6);
    const pair = two.map((b) => ({ b, at: passage.words[b][0] }))
      .sort((a, b) => a.at - b.at);
    if (pair.length >= 2 && out.length) {
      const first = pair[0], later = pair[pair.length - 1];
      if (later.at - first.at > 2000) {
        const i = idx(first.b);
        out.push({
          kind: "heard", i, cyr: true, ask: "Which came first?",
          prompt: "", at: first.at, lemmas: [i],
          options: shuffle([
            { label: L[i].w, right: true, cyr: true },
            { label: L[idx(later.b)].w, right: false, cyr: true },
          ]),
        });
      }
    }
    return out;
  }

  /* Listening at the learner's own level (the owner, 2026-09-10: "the listening
     audios are way too advanced… all the learning content needs to be at the
     level the learner is at").

     A passage of real video is native speech at native speed, and the build's own
     numbers said what that means for a beginner: 45 seconds of it uses more words
     than the first three chapters teach. This is the other source, and it was
     already here — his own corpus. A unit's listening pool holds sentences every
     word of which that unit or an earlier one teaches (build_site.py
     measure_sentences), each with a real recording and a real English side. In
     chapter 1 that is 32 sentences averaging under four words.

     One unit at a time, so the sentences sit on one topic rather than wandering
     the whole route; the latest unit the learner has reached, so the level rises
     with them; and LESSON_LINES of them, which at that length is the half minute
     he asked for. Nothing here is generated: fabricated Russian read by a robot
     is exactly the material a learner cannot check (§30a). */
  function lessonPassage(units, want) {
    if (!SPEECH || !SPEECH.listen) return null;
    const deep = (u) => (SPEECH.listen[u.id] || []).length;
    // Latest first: where they are now, falling back down the route.
    const rich = units.slice().reverse().filter((u) => deep(u) >= LESSON_LINES + 3);
    for (const u of rich.slice(0, 6)) {
      const scene = sceneFor([u.id], want, LESSON_LINES);
      if (scene) return { ...scene, kind: "scene", unit: u.id, level: u.name };
    }
    // Nothing single-unit is deep enough yet — the first lessons. Everything
    // reached so far, which is still only what they have been taught.
    const all = sceneFor(units.map((u) => u.id), want, LESSON_LINES);
    return all ? { ...all, level: units.length ? units[units.length - 1].name : "" } : null;
  }

  /* Shadowing (ROADMAP P10.6): hear a sentence and say it straight back.
   *
   * The third thing you can do with a sentence, and the one the app was
   * missing. Hear types what was said; Say produces Russian from an English
   * prompt; shadowing gives the learner the model and asks only for the mouth —
   * no decoding, no retrieval, just the sounds and the rhythm. It is the
   * cheapest of the three to build because every piece already exists, and the
   * one with nothing else like it in the app.
   *
   * Drawn from the **speak** pool, which is cut to sentences that have a real
   * recording and run 3–12 tokens: shadowing a device voice would be shadowing
   * a robot's rhythm, which is the one thing the exercise is for. No sentence
   * without audio can appear here, so unlike Hear there is no fallback. */
  function shadowDrill(units, n) {
    if (!SPEECH || !SPEECH.speak || !SPEECH.rows) return [];
    const rows = SPEECH.rows;
    const idxs = unique(units.flatMap((u) => SPEECH.speak[u.id] || []));
    if (!idxs.length) return [];
    const out = [];
    for (const ri of shuffle(idxs).slice(0, n)) {
      const [ru, en] = rows[ri];
      out.push({
        kind: "shadow", ask: "Listen, then say it back", prompt: "", cyr: true,
        autoplay: ru, target: ru, en, unit: units[units.length - 1].id,
        lemmas: sentenceLemmas(ru, IX),
      });
    }
    return out;
  }

  /* `listeningDrill` — five corpus scenes for Practice — lived here until
     2026-09-18. Practice → Listening has drawn the written scenarios since
     §30l, falling back to `lessonPassage`, and no screen called it; only a
     test did. Removed by the efficacy review (§30ak) rather than kept for a
     screen that does not exist. `sceneFor` stays: the lesson passage and the
     quiz's "scene" kind are built on it. */

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
    if (only !== undefined) {
      const cells = formCells(L[only], spec);
      return cells.length ? formQuestion(only, pickOne(cells), typed) : null;
    }

    /* The tiers used to be a fallback chain: the lesson's words, and only if
       none of them had the form, the unit's, and only then the route's. Chapter
       6's card asks for a table cell few of its words carry, so the narrow tier
       was almost never empty — it held one or two words — and the wider ones
       were therefore almost never reached. The chapter could ask **seven**
       distinct questions across five lessons and every retake of them.

       They are shares of one draw now. The lesson's own words are still what a
       question is most likely to be about, which is the reason the tiers existed;
       they are no longer the only thing it can be about.

       The share is on the *tier*, not on each word in it. Weighting words and
       shuffling one bag was the obvious way to do it and does not work here:
       the route tier holds hundreds of words against the lesson's one or two,
       so even at four times the weight the lesson was the subject of 9 % of
       draws. Pick which tier to ask from, then a word inside it. */
    const seen = new Set();
    const ableOf = (tier) => {
      const out = [];
      for (const i of unique(tier)) {
        if (seen.has(i)) continue;
        seen.add(i);
        if (formCells(L[i], spec).length) out.push(i);
      }
      return out;
    };
    const pools = [
      { words: ableOf(lessonWords(unit, index)), share: 0.55 },
      { words: ableOf(unit.w), share: 0.25 },
      { words: ableOf(unitsUpTo(unit).flatMap((u) => u.w)), share: 0.20 },
    ].filter((p) => p.words.length);
    if (!pools.length) return null;

    const total = pools.reduce((n, p) => n + p.share, 0);
    let roll = Math.random() * total;
    let chosen = pools.length - 1;
    for (let k = 0; k < pools.length; k++) {
      roll -= pools[k].share;
      if (roll <= 0) { chosen = k; break; }
    }
    // The chosen tier first, then the others, so a tier whose words all fail to
    // build a question costs range rather than the whole question.
    const order = [pools[chosen]].concat(pools.filter((_, k) => k !== chosen));
    for (const p of order) {
      for (const i of shuffle(p.words.slice()).slice(0, 12)) {
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
        // Drawn, not fixed at [0]. `candidates` is ordered easiest first, and
        // taking the head meant every one of the 1,199 retrievals across the
        // whole route was "What does this mean?" — four English options, for
        // every word a learner ever meets. The easiest two shapes still carry
        // it: this is the retrieval right after meeting the word.
        words.slice(Math.max(0, n - 1), n + 1).forEach((r) => {
          const c = candidates(r, pool).slice(0, 3);
          steps.push(present(c[Math.floor(Math.random() * c.length)]));
        });
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
    /* There is no `scene` branch here any more, and its absence is the design.
       A conversation is a standalone exercise (`SPEECH_MIX` above), reached
       through `scriptScene` from the Conversations screen; `speechPrompt` is
       the quiz's builder and the quiz no longer asks for one. The branch was
       left unreachable for about an hour and is gone rather than kept "just in
       case" (§6) — a second way to build a scene is a second thing to keep in
       step with the first. */
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
  function quizSteps(unit, index, prefer, seen, last) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    // `seen` is the learner's schedule keyed on the Russian string (rule 20.4).
    // A word the scheduler already holds is asked by production (PRODUCE_AT).
    const card = (i) => (seen && L[i] ? seen[L[i].b] : null);

    /* `last` is what the previous attempt asked (`stepKeys` below). A retake
       repeated 41 % of the quiz and half of that word for word, which is not a
       second look at the material — it is the same screen again, and the
       learner is being marked on whether they remember the last five minutes.
       A word that comes back comes back in a different shape when it has one;
       when it has only one, it repeats, because asking nothing would be worse. */
    const avoid = new Set(last || []);
    const drawFrom = (list, i) => {
      const fresh = list.filter((e) => !avoid.has(`${e.t}:${i}`));
      const from = fresh.length ? fresh : list;
      return from.length ? from[Math.floor(Math.random() * from.length)] : null;
    };
    const draw = (i) => drawFrom(candidates(i, pool, card(i)), i);

    const bag = words.map(draw).filter(Boolean);
    /* Both production shapes, not just the first. `find(type) || find(cloze)`
       could never reach its second branch: `candidates` always ends with a
       `type`, so the gap-fill was unreachable here and every guaranteed
       production slot in the app was a typed one. */
    const production = words
      .map((i) => drawFrom(candidates(i, pool, card(i)).filter((e) => PRODUCTION.includes(e.t)), i))
      .filter(Boolean);
    shuffle(production).slice(0, 2).forEach((e) => bag.push(e));
    const review = shuffle((prefer || []).filter((i) => L[i] && !words.includes(i)));
    const earlier = shuffle(unit.w.slice(0, index * lessonWords(unit, 0).length)
      .filter((i) => !words.includes(i) && !review.includes(i)));
    while (bag.length < QUIZ_N && (review.length || earlier.length)) {
      const pick = review.length ? review.pop() : earlier.pop();
      const e = draw(pick);
      if (e) bag.push(e);
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

  /* What a run asked, in the form `quizSteps` takes back as `last`. The caller
     keeps it between attempts; it is a list of "shape:word", so it says nothing
     about whether the learner got them right and needs no schema of its own. */
  function stepKeys(steps) {
    return (steps || [])
      .filter((q) => q && q.kind && typeof q.i === "number")
      .map((q) => `${q.kind}:${q.i}`);
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

  /* What the learner ticked before starting, as a Set of focus ids — or nothing,
     which means everything (the owner, 2026-09-16: *"imagine I want to focus on
     imperative only, then I can just ensure that's checked"*). An empty set is
     read as "everything" too: a screen where the learner has unticked the last
     box must still be able to ask a question, and the setup screen keeps at
     least one ticked anyway. */
  const allows = (only, id) => !only || !only.size || only.has(id);

  /* The question shapes a drill can be narrowed to. Dynamic where the route
     decides it — the cases a chapter-3 learner may be asked are the cases the
     route has introduced (`formsIntroduced`), not all six. Empty means the
     drill has nothing to narrow and the setup screen is skipped for it. */
  function drillFocus(type, units) {
    if (type === "conjugation") {
      return [{ id: "present", name: "Present / future" },
              { id: "past", name: "Past" },
              { id: "imperative", name: "Imperative" },
              { id: "who", name: "Whose form is this?" }];
    }
    if (type === "aspect") {
      return [{ id: "partner", name: "Name the partner" },
              { id: "which", name: "Which aspect is it?" }];
    }
    if (type === "cases" || type === "agreement") {
      const rows = [];
      for (const c of formsIntroduced(units || [])) if (!rows.includes(c.row)) rows.push(c.row);
      return rows.map((r) => ({ id: r, name: r }));
    }
    return [];
  }

  /* `cells` ({ row, col } pairs, from formsIntroduced) limits what may be asked
     for to the cases the route has taught; the wrong answers still come from
     the whole table. `only` narrows it further, to the cases the learner ticked. */
  function qCases(cells, typed, only) {
    const w = pickWhere((x) => x.p === "noun" && tableTitled(x, /Declension/));
    if (!w) return null;
    const t = tableTitled(w, /Declension/);
    const opts = [];
    t.rows.forEach((r, ri) => cellsOf(r).forEach((c, ci) => {
      // The rest of the cell rides along: a cell with two forms has two right
      // answers, and a typed drill must accept either.
      if (c && c.length) opts.push({ label: c[0], ri, ci, alts: c.slice(1) });
    }));
    // Four to choose between, but a typed question needs only the one to write.
    if (opts.length < (typed ? 1 : 4)) return null;
    // Never ask for the form already on screen: the headword is usually the
    // nominative singular, and asking for it answers itself.
    const askable = opts.filter((o) => fold(o.label) !== fold(w.w)
      && (!cells || cells.some((c) => c.row === t.rows[o.ri][0] && c.col === t.columns[o.ci + 1]))
      && allows(only, t.rows[o.ri][0]));
    if (!askable.length) return null;
    const target = askable[Math.floor(Math.random() * askable.length)];
    const what = `${t.rows[target.ri][0].toLowerCase()} ${t.columns[target.ci + 1].toLowerCase()}`;
    const base = { kind: "cases", i: L.indexOf(w), cyr: true,
                   prompt: w.w, sub: w.e || "", table: t };
    if (typed) return written(base, `Write ${what}`, target.label, target.alts);
    /* One option per *form*, not per cell. A paradigm repeats itself — an
       inanimate noun's accusative is its nominative, an animate one's is its
       genitive — so taking three cells at random put the same word on screen
       twice in 18 % of questions (tools/audit_options.mjs). Two identical
       options are one option: the learner is choosing from three, and the
       repeat tells them it is not the answer. */
    const wrong = [];
    const shown = new Set([target.label]);
    for (const o of shuffle(opts.slice())) {
      if (shown.has(o.label)) continue;
      shown.add(o.label);
      wrong.push(o);
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) return null;
    return {
      ...base, ask: `Choose ${what}`,
      options: shuffle([target].concat(wrong))
        .map((o) => ({ label: o.label, right: o.label === target.label, cyr: true })),
    };
  }

  /* A drill question answered by writing the form rather than choosing it.
   *
   * The owner, 2026-09-11: *"fill in the blank allows the user to generate it
   * completely rather than guess"* — which is §30j's own rule ("recognition
   * meets a word; production keeps it") applied to the drills, where every
   * question was four options.
   *
   * The shape is the one the typed form question already uses (`formQuestion`),
   * so the runner needs no new view and the grading — a letter off is half
   * credit, any other form of the same cell is right — is the grading every
   * typed answer in the app gets. */
  function written(base, ask, target, alts) {
    return { ...base, ask, typed: true, answer: target, target,
             alts: (alts || []).filter(Boolean).map(fold) };
  }

  /* Three wrong labels for a drill: `from` first (the word's own paradigm, which
     is what a learner confuses), topped up by `more()` (other words), never
     equal to the answer or to each other. Null when three cannot be found —
     two options is a coin flip, not a drill. */
  /* How many near-length candidates to choose the three from. Wide enough that
     the same three do not come back every time a word does, narrow enough to
     keep the answer off both ends of the screen. */
  const NEAR_WINDOW = 8;

  function threeWrong(right, from, more) {
    const seen = new Set([fold(right)]);
    const out = [];
    const take = (f) => {
      if (!f || seen.has(fold(f))) return;
      seen.add(fold(f));
      out.push(f);
    };
    /* Nearest in length first, then the rest.
     *
     * Taking three at random let the answer be the longest or shortest line on
     * screen — "instrumental singular" against "dative plural", and whole
     * sentences where «Э́то он.» stood against «у́лицы и пло́щади». Measured at
     * 17 % of the grammar drill, which is the drill a learner meets with the
     * shipped settings, since the other four are written rather than chosen.
     * `partnerWrong` already did this for the aspect pair; doing it here covers
     * every generator that asks for three wrong labels. */
    const byLength = from.slice().sort((a, b) =>
      Math.abs(String(a).length - String(right).length)
      - Math.abs(String(b).length - String(right).length));
    shuffle(byLength.slice(0, NEAR_WINDOW)).forEach(take);
    shuffle(byLength.slice(NEAR_WINDOW)).forEach(take);
    for (let n = 0; n < 80 && out.length < 3 && more; n++) take(more());
    return out.length >= 3 ? out.slice(0, 3) : null;
  }

  const optionsOf = (right, wrong) =>
    shuffle([right].concat(wrong)).map((s) => ({ label: s, right: s === right, cyr: true }));

  /* Aspect, two ways round: name a verb's partner, or pick the verb of an aspect
     out of four. The partner question is limited by how many verbs in the pool
     have one — seven after the first chapter — so the second shape carries the
     drill early on, where any verb marked for aspect qualifies. */
  function qAspectPartner(_cells, typed) {
    const w = pickWhere((x) => x.p === "verb" && realPartner(x.pt, x.w) && x.a);
    if (!w) return null;
    const want = w.a === "imperfective" ? "perfective" : "imperfective";
    if (typed) {
      return written({ kind: "aspect", i: L.indexOf(w), cyr: true, prompt: w.w,
                       sub: w.e || "", note: (UN.find((u) => u.id === "core8") || {}).g },
                     `Write the ${want} partner`, w.pt.trim());
    }
    const wrong = partnerWrong(w.w, w.pt.trim());
    if (!wrong) return null;
    return {
      kind: "aspect", i: L.indexOf(w), cyr: true,
      ask: `Choose the ${want} partner`, prompt: w.w, sub: w.e || "",
      note: (UN.find((u) => u.id === "core8") || {}).g,
      options: optionsOf(w.pt.trim(), wrong),
    };
  }

  /* Wrong partners that are actually in the running.
   *
   * The owner, 2026-09-11: *"selecting the perfective pair is obvious because
   * one option usually shares the root word"*. Measured over 400 questions, the
   * answer was the only option sharing a stem with the prompt in 23 % of them,
   * and no distractor shared one in any of them (kin 0.0 of 3).
   *
   * An aspect partner *is* the verb with a prefix added or a stem changed, so
   * the answer cannot be made to look unlike the prompt — that is what a partner
   * is. The distractors have to be made to look like it instead: verbs carrying
   * the same prefix, then verbs built on the same root, then verbs of about the
   * same length. «передавать» → «передать» now stands against «переходить» and
   * «переписать» rather than «поужинать» and «делать».
   *
   * The honest limit: this makes the shape stop giving the answer away, not the
   * question easy to answer by reasoning. Where a learner should produce the
   * partner rather than spot it, the written drill is the better instrument
   * (Settings → "Write drill answers"), and it is on by default. */
  /* Two verbs are related when they share a run of letters that is not just the
   * infinitive ending.
   *
   * Stripping the prefix and comparing what is left was the obvious way and it
   * does not work: Russian prefixes are ambiguous, so «вступать» loses «вс» and
   * «наступать» loses «на», and the same root comes out as two different stems.
   * Cutting the *ending* instead is unambiguous — every infinitive ends in one
   * of a handful of ways — and then the longest run the two share finds the
   * root wherever it sits. «вступать»/«наступать» share «ступа»;
   * «рисовать»/«танцевать» share only «ва», which is why the ending has to go
   * first or every pair of infinitives would look related. */
  const verbStem = (word) => fold(word).replace(/(ться|тся|ть|ти|чь)$/, "");
  /* Two verbs look alike enough that neither can be eliminated on shape: they
     share four letters somewhere outside the infinitive ending.
   *
   * A proportional rule was tried — a run covering most of the shorter stem, to
   * catch «дать»/«давать» (sharing «да») — and it was wrong twice over. It let
   * any two-letter stem match anywhere, so «бить» counted as a lookalike of
   * «любить»; and the case it was for cannot be a giveaway in the first place,
   * because the answer only stands out when *it* shares four or more with the
   * prompt, which a two-letter stem never does. Measured: kin fell 1.8 → 0.8
   * and root moved 16 % → 14 %. Four letters, then. */
  const RELATED_RUN = 4;
  /* The four-letter pieces of a stem. Two stems share a run of four or more
     letters exactly when they share one of these, so "related" becomes a set
     lookup rather than a character-by-character search of every candidate. */
  function grams(stem) {
    const out = new Set();
    for (let i = 0; i + RELATED_RUN <= stem.length; i++) out.add(stem.slice(i, i + RELATED_RUN));
    return out;
  }

  /* Every verb the curriculum knows and every recorded partner, indexed once:
     by the four-letter pieces of its stem, and by its length.
   *
   * Measured before this existed (2026-09-15): 5.7 ms a question, 57 ms when a
   * drill opened. Caching the folded stems alone took it to 4.7 — the cost was
   * the run comparison itself, done about 1,400 × 2 times a question. With the
   * pieces indexed a question touches only the candidates that can qualify
   * (usually tens), and the ones nearest the answer in length come out of the
   * length buckets rather than a sort of everything. docs/PLAYBOOK.md Phase
   * 0.3 asked for the length index; the piece index is what the measurement
   * said was needed. `L` is fixed for the life of `makeQuestions`, so once is
   * right. */
  let verbIndex = null;
  function verbIndexed() {
    if (verbIndex) return verbIndex;
    const have = new Set();
    const cands = [], byGram = new Map(), byLen = new Map();
    for (const x of L) {
      if (x.p !== "verb") continue;
      for (const cand of [x.w, realPartner(x.pt) ? x.pt.trim() : null]) {
        if (!cand) continue;
        const f = fold(cand);
        if (have.has(f)) continue;
        have.add(f);
        const i = cands.push({ cand, f }) - 1;
        for (const g of grams(verbStem(cand))) {
          if (!byGram.has(g)) byGram.set(g, []);
          byGram.get(g).push(i);
        }
        if (!byLen.has(f.length)) byLen.set(f.length, []);
        byLen.get(f.length).push(i);
      }
    }
    verbIndex = { cands, byGram, byLen };
    return verbIndex;
  }

  function partnerWrong(promptWord, answer) {
    const pf = fold(promptWord), af = fold(answer);
    const ps = verbStem(promptWord), as = verbStem(answer);
    /* Every verb the curriculum knows, not the learner's own handful.
     *
     * Two restrictions were narrowing this to almost nothing, and both were
     * accidents rather than decisions:
     *
     * - It read `drillPool`, so the distractors came from the words this
     *   learner has met. The rule three hundred lines up says the opposite in
     *   as many words — *"Distractors still come from anywhere — a wrong option
     *   needs no acquaintance"* — and `qAspectWhich` already passes `anywhere`
     *   for exactly this reason. A learner forty words in had four verbs to
     *   stand against, so the answer was the only one on the prompt's root
     *   however well this scored them.
     * - It considered only other verbs' *recorded partners* (`x.pt`), so a verb
     *   with no partner in the data could never be a wrong answer, though it is
     *   a perfectly good-looking one. Measured over the 691 verbs that can be
     *   asked: candidates with the same root go 687 → 1,413, and the verbs with
     *   nothing at all to stand against go 42 → 25.
     *
     * What a distractor has to be is a Russian verb that looks like it could be
     * the partner. It does not have to be a word anybody has taught. */
    const { cands, byGram, byLen } = verbIndexed();
    if (cands.length < 3) return null;
    /* Related: built on the prompt's root — the one a learner cannot tell apart
       by shape — or on the answer's, which is usually the same root seen from
       the other side of the pair. (These used to score 3 and 2; both counted
       as "related" and the order within that tier was by length, so the two
       scores never told the output apart. One set, then.) */
    const related = new Set();
    for (const stem of [ps, as]) {
      for (const g of grams(stem)) {
        for (const i of byGram.get(g) || []) {
          const f = cands[i].f;
          if (f !== af && f !== pf) related.add(i);
        }
      }
    }
    /* Related first, and only then anything else.
     *
     * Ranking by score and taking the best dozen shuffled was the first attempt
     * and it did nothing: a handful of verbs share the answer's root and dozens
     * merely match its length, so the shuffle almost always drew the latter.
     * Measured on the curriculum's 693 verbs with a recorded partner: 227 have
     * three or more same-root alternatives to stand against, 224 have one or
     * two, and **242 have none at all**. Where there are none this question
     * cannot be made unguessable from this data, which is the case for asking
     * the learner to write the partner instead. */
    /* Within a tier, the ones closest in length: the answer used to be the
       longest or shortest thing on screen in 13 % of these, which is a second
       free elimination on top of the first. Six to choose three from, so the
       same three do not come back every time the verb does. */
    const strong = shuffle([...related]
      .sort((a, b) => Math.abs(cands[a].f.length - af.length)
                    - Math.abs(cands[b].f.length - af.length))
      .slice(0, 6)).map((i) => cands[i].cand);
    /* The rest come out of the length buckets, nearest ring first, until there
       are six to choose from — the same rule, without sorting 1,400 verbs to
       find six. Within a ring the order is random where the sort's was table
       order, which is more variety at the boundary, not less. */
    const rest = [];
    for (let d = 0; rest.length < 6 && d <= 24; d++) {
      const ring = [];
      for (const len of d === 0 ? [af.length] : [af.length - d, af.length + d]) {
        for (const i of byLen.get(len) || []) {
          const f = cands[i].f;
          if (!related.has(i) && f !== af && f !== pf) ring.push(i);
        }
      }
      for (const i of shuffle(ring)) if (rest.length < 6) rest.push(i);
    }
    return strong.concat(shuffle(rest).map((i) => cands[i].cand)).slice(0, 3);
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

  /* Writing the partner is the only one of the two shapes that can be written:
     "which of these is perfective?" is a question about a list, and there is
     nothing to produce. A typed run is therefore all partners. */
  const qAspect = (cells, typed, only) => {
    const partner = allows(only, "partner"), which = allows(only, "which");
    if (typed) {
      // Writing the partner is the only shape that can be written, so a typed
      // run narrowed to "which aspect is it?" is a chosen run — saying so with
      // a question rather than with nothing is the honest answer.
      if (!partner) return qAspectWhich();
      return qAspectPartner(cells, true) || (which ? qAspectWhich() : null);
    }
    if (partner && which) return oneOf([qAspectWhich, qAspectPartner]);
    return partner ? qAspectPartner(cells, false) : qAspectWhich();
  };

  /* Agreement in any case the adjective declines for, not the nominative alone.
     The noun is shown in that case too — «___ кни́ге» wants «но́вой» — so the
     question is read rather than pattern-matched off a familiar ending. The
     wrong answers come from the adjective's own table, which is where the
     confusion lives; taking them from the same case's other genders alone
     failed whenever two genders share a form, which in the oblique cases they
     usually do. */
  const GENDER_COL = { m: "Masculine", f: "Feminine", n: "Neuter" };
  function qAgreement(_cells, typed, only) {
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
      return r[col] && r[col].length && nr && nr[1] && nr[1].length && allows(only, r[0]);
    }));
    if (!rows.length) return null;
    const row = rows[0];
    const right = row[col][0];
    const nounForm = nt.rows.find((x) => x[0] === row[0])[1][0];
    if (typed) {
      return written({ kind: "agreement", i: L.indexOf(adj), cyr: true,
                       prompt: `___ ${nounForm}`, sub: `${adj.w} · ${adj.e || ""}`.trim(),
                       table: t },
                     "Write the form that agrees", right, row[col].slice(1));
    }
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
  /* A verb's three tables, each with the focus id that selects it. "Present"
     covers a perfective verb's future too — one table, two names, and the
     question already says which it is asking for. */
  const VERB_TABLES = [{ id: "present", re: /^Present/ }, { id: "past", re: /^Past/ },
                       { id: "imperative", re: /^Imperative/ }];
  function verbTable(only) {
    /* Narrowed to a tense, that is the tense. Narrowed to *only* "whose form is
       this?" — which is a shape, not a tense — every table is fair game again:
       the learner asked for the reading question, not for no questions. */
    const able = VERB_TABLES.filter((x) => allows(only, x.id));
    const from = able.length ? able : VERB_TABLES;
    const re = from[Math.floor(Math.random() * from.length)].re;
    const w = pickWhere((x) => x.p === "verb" && tableTitled(x, re));
    return w ? { w, t: tableTitled(w, re) } : null;
  }

  function qConjugationForm(_cells, typed, only) {
    const pick = verbTable(only);
    if (!pick) return null;
    const { w, t } = pick;
    /* Never ask for the word that is on the screen.
     *
     * The imperative of «расти» is «расти», and of «вырасти» «вырасти» — so
     * "write the imperative for ты" printed the answer above the question and
     * the learner copied it. 3 of 3,200 typed conjugation questions, which is
     * why it surfaced as a core check that failed about one run in six rather
     * than as anything anybody noticed.
     *
     * §30r fixed exactly this for the aspect drill (`realPartner` refusing a
     * partner equal to the verb) and the same trap was left standing here.
     * Filtering the rows covers both shapes at once: the typed answer, and the
     * right option in the chosen one. A verb with nothing left to ask returns
     * null and the caller draws another. */
    const rows = t.rows.filter((r) => r[1] && r[1].length && fold(r[1][0]) !== fold(w.w));
    if (!rows.length) return null;
    const target = rows[Math.floor(Math.random() * rows.length)];
    const right = target[1][0];
    if (typed) {
      const label = t.title === "Imperative" ? "imperative"
        : t.title === "Past" ? "past" : (w.a === "perfective" ? "future" : "present");
      return written({ kind: "conjugation", i: L.indexOf(w), cyr: true,
                       prompt: w.w, sub: w.e || "", table: t },
                     `Write the ${label} for “${target[0]}”`, right, target[1].slice(1));
    }
    // The verb's own other persons first — the imperative has only two rows, so
    // the same cell from other verbs fills the rest.
    const own = rows.filter((r) => r !== target).map((r) => r[1][0]);
    const wrong = threeWrong(right, own, () => {
      const o = pickWhere((x) => x.p === "verb" && x !== w && tableTitled(x, new RegExp("^" + t.title.split(" ")[0])), 40, true);
      if (!o) return null;
      const ot = tableTitled(o, new RegExp("^" + t.title.split(" ")[0]));
      const or = ot && ot.rows.find((r) => r[0] === target[0]);
      if (!or || !or[1] || !or[1].length) return null;
      // …nor offer it as a wrong one: an option the learner can rule out by
      // reading the prompt is a free elimination (§30r).
      return fold(or[1][0]) === fold(w.w) ? null : or[1][0];
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
  function qConjugationWho(_cells, _typed, only) {
    const pick = verbTable(only);
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

  /* "Whose form is this?" is read, not produced — the answer is a label, not
     Russian — so a typed run asks only for forms. */
  const qConjugation = (cells, typed, only) => {
    /* "Whose form is this?" is read, not produced — the answer is a label, not
       Russian — so a typed run asks only for forms unless the learner has
       narrowed it to exactly that shape. `who` is the shape; the other three
       ids are tables, and a run may mix them. */
    const who = allows(only, "who");
    const forms = VERB_TABLES.some((x) => allows(only, x.id));
    if (!forms) return who ? qConjugationWho(cells, false, only) : null;
    if (typed) return qConjugationForm(cells, true, only) || (who ? qConjugationWho(cells, false, only) : null);
    const shapes = who ? [qConjugationForm, qConjugationForm, qConjugationWho] : [qConjugationForm];
    const pick = shapes[Math.floor(Math.random() * shapes.length)];
    return pick(cells, false, only);
  };

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
    /* Rule titles run from "Believing in" to "What someone is, was, or became",
       and taking three at random left the answer the longest or shortest line on
       screen in 24 % of questions (tools/audit_options.mjs) — which is a tell
       that costs nothing to remove: pick from the titles nearest it in length.
       Eight to choose three from, so the same three do not recur. */
    /* Six, not eight: there are only about a dozen cards with notes, so a
       window of eight was most of them and "Believing in" still went up
       against "Places in the plural". */
    const near = withNotes.filter((u) => u.g.title !== pick.g.title)
      .sort((a, b) => Math.abs(a.g.title.length - pick.g.title.length)
                    - Math.abs(b.g.title.length - pick.g.title.length));
    const others = shuffle(near.slice(0, 6)).slice(0, 3);
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
                           // A typed question has no options; its answer is what
                           // makes it the question it is.
                           q.typed ? q.target
                             : (q.options || []).filter((o) => o.right).map((o) => o.label).join(",")]
    .join("|");

  /* `pool`: lemma indices the drill may ask about (see native data.js drillPool);
     without one, every word in the curriculum. `cells`: for the cases drill,
     the cells the route has introduced (formsIntroduced); without it, any. */
  /* `typed` asks for questions the learner writes the answer to rather than
     picks (the owner, 2026-09-11). Not every shape can be written — "which of
     these is perfective?" and "whose form is this?" are questions about a list —
     so those generators answer with their chosen shape either way, and the
     stress and grammar drills ignore the flag entirely. */
  /* `only`: the focus ids the learner ticked (drillFocus), or nothing for all. */
  function drillQuestions(type, n, pool, cells, typed, only) {
    const out = [];
    const seen = new Set();
    const want = n || DRILL_N;
    const set = only && only.length ? new Set(only) : null;
    withPool(pool, () => {
      for (let k = 0; k < want * 25 && out.length < want; k++) {
        const q = GEN[type] && GEN[type](cells, typed, set);
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
    vocabSteps, quizSteps, stepKeys, placementQuestions, sectionQuestions, drillQuestions, drillKey,
    sceneFor, lessonPassage, scriptScene, writtenPassage, shadowDrill,
    customQuiz, formPrompt, formSpec, formsIntroduced, drillFocus,
    drillsIntroduced, drillOpensAt, passagesFor, passageQuestions, passageFit,
  };
}
