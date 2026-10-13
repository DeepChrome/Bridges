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
import { fold, shuffle, sample, firstSense, askSense, onSense, TOKEN } from "./util.js";
import { sentenceLemmas, pickPrompt } from "./speech.js";
import { charDistance } from "./compare.js";
import { describeForm, GENERIC_COLUMN } from "./forms.js";
import { buildupDrill } from "./buildup.js";
import { CASES, caseById, AS_VERBS, PREPOSITIONS, SET_PHRASES, TIME_NOUNS } from "./cases.js";
import { irregularities, stemChange, conjugation } from "./facts.js";

/* Ten since 2026-10-05: a lesson's quiz now reaches back over the chapter so
   far (quizSteps), and eight left no room for it beside the lesson's own. */
export const QUIZ_N = 10;

/* The smallest pool a shadowing run will draw its sentences from, widening
   along the route to reach it (`shadowDrill`). The owner's number, 2026-09-23:
   a hundred so that six a sitting is not the same six. */
export const SHADOW_POOL_MIN = 100;

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
   paradigm. Which form is the card's
   business (`form` in grammar_notes.json); a branch card without one inherits
   its chapter's. Chapter 1's card ("no is") teaches nothing a table can ask, so
   the question starts with chapter 2. Written from the first (the owner,
   2026-10-06: "It's easy to select a conjugation from a list. It's harder to
   generate it and that will challenge them"); it was chosen from four until
   chapter 6. */
export const FORM_MIX = { fromStage: 1, typedFromStage: 1, perQuiz: 1 };
/* A word built from its end inside a lesson quiz (core/buildup.js; the owner,
   2026-10-02: "pronunciation exercises… should be mixed in"): the lesson's
   longest word, when it has one worth building. Graded nothing and left out
   of the mark — saying a word is not knowing it. */
export const PRON_MIX = { fromStage: 0, fromLesson: 1, perQuiz: 1 };
/* A grammar run (grammarRun): ten questions on the chapter's point, written —
   one chosen to open a full run (`GRAMMAR_CHOOSE`, rounded down, so the two
   questions after a lesson's card are both written). It was 60 % chosen,
   and choosing a form from a list is recognising it, not producing it (the
   owner, 2026-10-06). */
export const GRAMMAR_N = 10;
export const GRAMMAR_CHOOSE = 0.1;
/* The rule tried right after its card in every lesson's vocabulary. */
export const GRAMMAR_IN_LESSON = 2;
/* The mixed round that closes a lesson's words (vocabSteps): one of the
   lesson's, the rest from the chapter so far. */
export const VOCAB_MIXED = 3;
/* Words from earlier in the route asked in every lesson quiz, on top of
   QUIZ_N — the due and the weakest first (the owner, 2026-10-04: "embedding
   some questions using words from previous chapters… to create spaced
   repetition"). */
/* One each, since 2026-10-08: the learner agents counted 13–18 questions in
   a quiz for five to eight words, half of them on other words (two review
   words, two drills, listening and speaking and a build-up all at once). A
   quiz is now its lesson's words — `QUIZ_WORDS` per word taught, between
   `QUIZ_MIN` and `QUIZ_N - 2` — and one each of the chapter's form, a drill,
   an earlier word and a spoken step (`spokenStep`), about twelve at most. */
export const REVIEW_MIX = { perQuiz: 1 };
/* At most this share of a lesson quiz is on earlier chapters (quizStepsIn). */
export const OLD_SHARE = 0.2;
export const QUIZ_WORDS = 2;
export const QUIZ_MIN = 6;

/* Practice's drills inside a lesson quiz: this many, of the drills the route
   has opened, on the chapter's own words (quizSteps). */
export const DRILL_MIX = { perQuiz: 1 };
/* The columns of a noun's declension table, for a spec that names rows only. */
const NOUN_COLUMNS = ["Singular", "Plural"];
/* The six cases as panel.py titles a declension's rows — what the cases and
   agreement drills can be narrowed to, all six, since the drill is open from
   the first screen (§30au) and the learner may choose any of them (the owner,
   2026-09-26: *"For cases, you should be able to select each case or all
   cases"*). The route's own cases are only the default ticks (Flows.js). */
export const CASE_ROWS = ["Nominative", "Genitive", "Dative", "Accusative", "Instrumental", "Prepositional"];
/* An adjective's stem class, off its dictionary ending: the three shapes a
   learner has to keep apart, and what the agreement drill narrows to ("maybe
   you want to focus on irregulars"). Hard is the default pattern; soft covers
   the -ий adjectives, including the spelling-rule ones after к г х ш ж ч щ;
   stressed is the -ой set whose endings carry the stress. */
export const ADJ_STEMS = [
  { id: "stem:hard", name: "Hard stem, -ый", re: /ый$/ },
  { id: "stem:soft", name: "Soft stem, -ий", re: /ий$/ },
  { id: "stem:stressed", name: "Stressed ending, -ой", re: /ой$/ },
];
export const adjStem = (bare) => {
  const s = ADJ_STEMS.find((x) => x.re.test(String(bare || "")));
  return s ? s.id : null;
};

/* A listening scene: two or three sentences from the listening pool, played in
   a row, with a question per sentence and one about a word heard — the questions
   readable before the audio starts (the owner, 2026-09-07). */
/* Days of stability after which a word is asked by production rather than by
   recognition (ROADMAP P10.1). Four is roughly the third or fourth correct
   recall: long enough that the word is known, early enough that it is still
   being learned. */
export const PRODUCE_AT = 4;

/* Below this rank a lemma is met from the first screen — «не», «и», «в» — and
   never counts as a word the learner cannot read (build_site.py
   COVERAGE_FREE_RANK draws the same line for the speech pools). */
export const FREE_RANK = 500;
/* …but inside a lesson the line is the commonest hundred: «статья́» and
   «у́тро» are in the top five hundred and a chapter-1 gap read «Статья́
   появи́лась в "Правде" на сле́дующее у́тро» (the learner agents, 2026-10-08). */
export const LESSON_FREE_RANK = 100;
/* …and the line ramps: nothing is free in chapter 1, fifty words in chapter
   2, the hundred after. Chapter 1 teaches the commonest words themselves, so
   counting the top hundred as readable put «Где они сейчас _____ что они
   делают?» in lesson 1 — они, сейчас, что, делают all untaught (the
   curriculum review, 2026-10-12). A word with no readable sentence is asked
   another way, which on day one is the right way. */
export const lessonFreeRank = (stage) => (stage <= 0 ? 0 : stage === 1 ? 50 : LESSON_FREE_RANK);

/* Verbs that take no imperative anyone says — impersonal or stative — so a
   chapter whose rule is the imperative does not ask «явля́йтесь» three times
   (the review, 2026-10-12). The lexicon carries the forms; nobody uses them. */
export const NO_IMPERATIVE = new Set(["являться", "приходиться", "получиться", "получаться", "казаться",
                                      "показаться", "хотеться", "нравиться", "понравиться", "удаваться",
                                      "удаться", "следовать", "стоить", "значить", "мочь", "смочь"]);

/* A stable order of lemma indices for one key, so two builders that cannot
   talk to each other (the vocabulary walk and the quiz after it, lesson N and
   lesson N+1) can still agree about what the other drew. Not a shuffle: the
   same key gives the same order on every call. */
const seedOf = (s) => {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};
export const orderBy = (list, key) =>
  list.map((i) => [seedOf(`${key}:${i}`), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

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
/* The final test at the end of the path (the owner, 2026-09-19): fifty
   questions over every chapter. */
export const FINAL_N = 50;
/* New words per lesson, by chapter: a ramp, not a flat seven from lesson one. The
   first chapter's lessons carry five, the second's six, then seven. Both apps and
   the simulator size lessons through this, so the lesson a state key names is the
   same lesson everywhere. */
export const LESSON_RAMP = [5, 6];
export const LESSON_SIZE = 7;
export const lessonSize = (stageIndex) =>
  (stageIndex >= 0 && stageIndex < LESSON_RAMP.length ? LESSON_RAMP[stageIndex] : LESSON_SIZE);

/* A unit's lessons as the build cut them. The ramp above is each chapter's
   *target*; the build ends a lesson where a group of related words ends, so a
   lesson runs a little under or over it (build_topics.py cut_lessons) and the
   sizes ride on the unit as `ls`. Every reader — both apps, the simulator, the
   tools — slices through these two, so the lesson a state key names is the
   same lesson everywhere. A payload without `ls` cuts fixed `n`-word lessons. */
export function lessonCountOf(u, n) {
  return u.ls && u.ls.length ? u.ls.length : Math.max(1, Math.ceil(u.w.length / n));
}
export function lessonWordsOf(u, i, n) {
  if (!(u.ls && u.ls.length)) return u.w.slice(i * n, (i + 1) * n);
  let at = 0;
  for (let k = 0; k < i && k < u.ls.length; k++) at += u.ls[k];
  return i < u.ls.length ? u.w.slice(at, at + u.ls[i]) : [];
}

export const DRILL_N = 10;
export const PLACEMENT_N = 50;
export const SECTION_N = 30;
export const TEST_OUT = 0.8;

const VOWELS_RU = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
/* A word as written without its stress mark (ё kept: it is spelling), whether
   a written word shows where its stress falls (a mark, or an ё, which is
   always stressed), and how many syllables it has. */
const plainOf = (s) => String(s || "").normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
const stressed = (s) => /́/.test(String(s || "").normalize("NFD")) || /[ёЁ]/.test(String(s || ""));
const syllables = (s) => [...plainOf(s)].filter((c) => VOWELS_RU.includes(c)).length;
/* A partner worth asking about: present, Cyrillic, and **not the verb itself**.
   Some rows record a biaspectual verb as its own partner, and the drill then
   asked the learner to produce the word printed above the question — caught by
   the typed-drill check, which only fails on the runs that happen to draw one
   (`w` is optional so the old one-argument calls still read the same). */
const realPartner = (p, w) => !!p && p.trim() && p.trim() !== "-" && /[а-яё]/i.test(p)
  && (!w || fold(p) !== fold(w));
/* A verb's partners, one each. The lexicon records some verbs with more than
   one — «лови́ть» → "поймать,изловить", «съесть» → "есть,съедать" — and the
   whole string was used as one partner: the typed drill wanted the learner to
   write "поймать,изловить" and the chosen one offered it, comma and all, as a
   single option (the review, 2026-10-01). Every listed partner is a right
   answer; any one of them is the one shown. */
const partnersOf = (x) => String((x && x.pt) || "").split(",").map((p) => p.trim())
  .filter((p) => realPartner(p, x.w));
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
  /* There was a sixth, "Grammar rules" — choose the rule a sentence shows —
     until 2026-09-18. The owner: *"Grammar rules doesn't really feel effective
     as a quiz."* He is right: naming a rule's title from a list tests
     recognition of the label, not the grammar. The rules are feedback now — a
     question built on a chapter's card carries that card as `note`, and the
     runner shows it under a wrong answer (§30al). */
];

export function makeQuestions(env) {
  const { L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice, SPEECH } = env;
  // Adjective → nouns the corpus says after it, by lemma index (payload.pairs).
  const PAIRS = env.PAIRS || {};
  // The written lesson passages (§30l), keyed "unitId:lessonIndex". Absent on a
  // platform that does not ship them, in which case the scene falls back to the
  // corpus pools as it did before.
  const SCRIPTS = env.SCRIPTS || {};
  const voice = () => (typeof hasVoice === "function" ? hasVoice() : !!hasVoice);
  const stageOf = (u) =>
    STAGES.findIndex((s) => s.core === u || (s.branches || []).includes(u));

  /* ------------------------------------------------------- what is taught */

  /* While a lesson's material is being built, the grammar the route has
     taught by then (the learner agents, 2026-10-08: gaps asking «тобо́й» on
     day two, "write the future" in chapter 3, a plural drill made of
     «друзья́» and «времена́»). `route` is set by `inRoute` for the lesson
     builders and is null everywhere else — Practice is the learner's own
     choice and asks what they ask for.
       stage   0-based chapter: the present from 1, the past from 6 (core7),
               a perfective's future from 8 (core9), the imperative from 9
       cases   the case rows a card on the route has named, and the nominative */
  const PRESENT_FROM = 1, PAST_FROM = 6, FUTURE_FROM = 8, IMPERATIVE_FROM = 9;
  // The plural is chapter 4's card (core4): a gap whose answer is «де́ти» or
  // «де́душки» is not "nominative, taught" before then.
  const PLURAL_FROM = 3;
  let curriculumCache = null;
  const curriculumWords = () => curriculumCache || (curriculumCache = unique(UN.flatMap((u) => u.w)));
  const PRONOMINAL = new Set(["сам", "тот", "весь", "самый", "который", "какой", "такой", "один", "каждый",
                              "любой", "иной", "другой", "этот", "чей"]);
  // The open classes — what a review slot is for; the rest is met on every screen.
  const CONTENT = new Set(["noun", "verb", "adjective", "adverb"]);
  let route = null;
  function inRoute(unit, fn) {
    const before = route;
    route = { stage: stageOf(unit),
              cases: new Set(["Nominative"].concat(formsIntroduced(unitsUpTo(unit)).map((c) => c.row))) };
    try { return fn(); } finally { route = before; }
  }
  /* A table the route has taught a verb's forms in. */
  const verbTableTaught = (w, title) => !route
    || (/^Present/.test(title) ? route.stage >= (w.a === "perfective" ? FUTURE_FROM : PRESENT_FROM)
      : /^Past/.test(title) ? route.stage >= PAST_FROM
      : /^Imperative/.test(title) ? route.stage >= IMPERATIVE_FROM
      /* No lesson card teaches an adjective's short form or its comparison
         (the owner, 2026-10-09: "I'm not sure short form has been explained
         to us"); the grammar reference does, outside the route. */
      : /^(Short form|Comparison)/.test(title) ? false : true);
  /* Whether a form of word `i` is one the route has taught: its dictionary
     form always; a verb's form in a tense taught; a declined word's form in a
     case taught. A word with no table (an adverb, a preposition) is itself. */
  function formTaught(i, tok) {
    if (!route) return true;
    const w = L[i];
    if (!w) return true;
    const f = fold(tok);
    if (f === fold(w.b)) return true;
    const tables = w.t || [];
    if (!tables.length) return true;
    /* Every cell the form sits in, not the first: «кни́ги» is the genitive
       singular and the nominative plural, and it is taught when either is. A
       plural column counts only once the plural has been taught — the first
       cut read «де́ти» as "nominative, so taught" in chapter 1. */
    let found = false;
    for (const t of tables) {
      for (const r of t.rows) {
        for (let ci = 1; ci < r.length; ci++) {
          if (!(r[ci] || []).some((x) => fold(x) === f)) continue;
          found = true;
          const plural = /Plural/.test(t.columns[ci] || "");
          if (plural && route.stage < PLURAL_FROM) continue;
          if (/Declension/.test(t.title) ? route.cases.has(r[0]) : verbTableTaught(w, t.title)) return true;
        }
      }
    }
    return !found;
  }
  /* A verb whose present is the infinitive's stem plus the table's ending —
     no mutation, no -ова-/-у-, not reflexive, not mixed. What chapter 2's
     conjugation practice may ask: its card shows -ю/-ешь/-ет, and the first
     verbs it asked were «ви́деть → ви́жу» and «дава́ть → даёт», which break
     the card they were meant to practise (the review, 2026-10-12). */
  const plainPresent = (w) => !/ся$/.test(w.b || "") && !stemChange(w) && conjugation(w) !== "mixed";
  /* A word that keeps its rule: what the questions after a card ask, so the
     first plural a learner meets is «столы́» and not «друзья́». */
  const regular = (w) => !route || !irregularities(w).length;

  /* ------------------------------------------------------------ helpers */

  /* A meaning with its parentheticals stripped, for comparing one gloss against
     another: `firstSense` gives "on (place)" for «на», which never matches the
     plain "on" sitting in «в»'s list even though a learner offered both would be
     right either way. */
  /* "to read" and "read" are one sense: firstSense writes verbs as
     infinitives, the gloss list they are compared against does not. */
  const senseKey = (s) => fold(String(s || "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim()
    .replace(/^to\s+/i, ""));
  const mainSense = (w) => senseKey(firstSense(w));
  const glossed = (w) => !!(w && w.e && String(w.e).trim());
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
    /* A wrong option is a word with a meaning. A glossless row — «м», an
       abbreviation in his decks — compared as "a different meaning" and so
       passed, and stood beside «в» as one letter away (the walkthrough,
       2026-09-30). Nothing a learner could ever choose is an option. */
    // The gloss itself, not mainSense: firstSense falls back to the word when
    // there is no gloss, so «м»'s "meaning" was «м».
    if (!glossed(b)) return false;
    return !allSenses(a).has(mainSense(b)) && !allSenses(b).has(mainSense(a));
  }

  /* Wrong answers, preferring words of the same class as the right one.
     Ignoring part of speech meant that in 23.7 % of option sets the answer was
     the only option of its own kind — "in" standing against *want*, *year* and
     *he* — so the ending gave it away without the learner knowing the word at
     all. Same class first, then anything, then (only if the pool is too thin to
     fill four options at all) the merely-distinct. A question with three
     options is worse than one with a weak fourth. */
  /* The words that look and sound like this one, nearest first — the wrong
     answers a listening question wants (the owner, 2026-09-21: "if the word is
     это, I'd want to hear этот, его… Multiple choice should never be that
     obvious"). Measured before this existed: 82 % of "what did you hear?"
     sets had no option within earshot of the answer, and a wrong option was on
     average 5.9 letters away — «в» against «все», «из» and «и». Drawn from
     every studied lemma, not the lesson's pool: a wrong option needs no
     acquaintance (§30t), and the look-alikes of «это» are not in chapter 1.
     Edit distance on the folded forms, within half the word's length; it is a
     proxy for sound, and a fair one — Russian is spelt close to how it is
     said, and ё/е fold together. Cached per word. */
  const ALL = L.map((_, i) => i).filter((i) => L[i] && L[i].b);
  const alikeCache = new Map();
  const alikeRange = (s) => Math.max(1, Math.ceil(s.length / 2));
  function lookalikes(idx) {
    if (alikeCache.has(idx)) return alikeCache.get(idx);
    const target = fold(L[idx].b);
    const range = alikeRange(target);
    const out = [];
    const proper = /[А-ЯЁ]/.test(L[idx].b);
    for (const i of ALL) {
      if (i === idx) continue;
      // A name or an abbreviation looks like nothing a learner hears: «США»
      // is not what «она» sounds like on the page. Unless the answer is one.
      if (/[А-ЯЁ]/.test(L[i].b) !== proper) continue;
      const b = fold(L[i].b);
      if (Math.abs(b.length - target.length) > range) continue;
      const d = charDistance(target, b);
      if (d > range) continue;
      out.push({ i, d, off: Math.abs(b.length - target.length) });
    }
    out.sort((a, b) => a.d - b.d || a.off - b.off);
    alikeCache.set(idx, out);
    return out;
  }

  /* `n` of `cands` nearest `target` by spelling, drawn from the nearest 2n so a
     retake does not repeat the set. For the "which word did you hear?" of a
     scene and a passage, whose candidates are already fixed by a rule of their
     own (words the audio did not say). */
  function nearest(target, cands, keyOf, n) {
    const ranked = cands.map((c) => ({ c, d: charDistance(target, keyOf(c)) }))
      .sort((a, b) => a.d - b.d);
    return shuffle(ranked.slice(0, n * 2)).slice(0, n).map((x) => x.c);
  }

  function distractors(correctIdx, pool, n, key, alike = false) {
    const want = key(L[correctIdx]);
    const pos = (L[correctIdx] || {}).p;
    const out = [];
    const lenOff = (i) => Math.abs(String(key(L[i])).length - String(want).length);
    /* **What is written on the option, as well as what it means.**
     *
     * `key` is the meaning for choose-ru and choose-en, and two options that
     * mean different things can still be spelt the same — «мочь» the verb and
     * «мочь» the noun. That was rare while distractors came from a unit's
     * pool; drawing look-alikes makes it likely, because a homograph is at
     * distance 0 from the answer and sorts first. The simulator caught it on
     * the first run: «быть» offered with two identical options.
     *
     * Only when `alike` is on, and only over the Russian, because that is the
     * label those two kinds render; §30r's `dupes` metric folds its
     * comparison and so cannot see this at all. */
    const shown = alike ? new Set([L[correctIdx].w]) : null;
    /* Within a tier, the options nearest the answer in length.
     *
     * Class was the first tell to go (the 23.7 % above); length is the one left.
     * Measured over 500 questions, the answer was three characters longer or
     * shorter than every distractor in 14 % of "choose the meaning" sets —
     * "to make somebody's acquaintance" standing against "bread", "five" and
     * "here", which needs no Russian at all. Picking from the nearest eight
     * rather than the nearest three keeps the option sets varied
     * (tools/audit_options.mjs). */
    const take = (from, accept, rank) => {
      if (out.length === n) return;
      const fit = [];
      for (const i of from) {
        if (i === correctIdx || out.includes(i)) continue;
        const v = key(L[i]);
        if (!v || v === want || out.some((o) => key(L[o]) === v)) continue;
        if (shown && shown.has(L[i].w)) continue;
        if (!accept(i)) continue;
        fit.push(i);
      }
      const near = fit.sort((a, b) => rank(a) - rank(b));
      for (const i of shuffle(near.slice(0, Math.max(n * 2, 8)))) {
        if (out.length === n) return;
        if (out.some((o) => key(L[o]) === key(L[i]))) continue;
        if (shown && shown.has(L[i].w)) continue;
        if (shown) shown.add(L[i].w);
        out.push(i);
      }
    };
    /* Look-alikes first when the options are Russian words heard, or read
       against a meaning: nearest by spelling, whatever their class — «это»
       against «этот», «что» and «то» is the question, and holding out for a
       particle would have given it «но» and «по» instead. The pool tiers below
       fill whatever is left. */
    if (alike) {
      const near = lookalikes(correctIdx);
      const dist = new Map(near.map((x) => [x.i, x.d * 10 + x.off]));
      take(near.map((x) => x.i), (i) => safeDistractor(correctIdx, i), (i) => dist.get(i));
    }
    take(pool, (i) => L[i].p === pos && safeDistractor(correctIdx, i), lenOff);
    take(pool, (i) => safeDistractor(correctIdx, i), lenOff);
    /* A thin pool reaches across the curriculum before it gives up on the
       safety check: the last tier used to take any glossed word, and chapter
       1's small pool put «где» beside «куда» for "where" — a second right
       answer marked wrong (the learner agents, 2026-10-08). */
    if (out.length < n) {
      const all = curriculumWords();
      take(all, (i) => L[i].p === pos && safeDistractor(correctIdx, i), lenOff);
      take(all, (i) => safeDistractor(correctIdx, i), lenOff);
    }
    return out;
  }

  /* A gap-fill needs an example whose blanked token really is this lemma. Of the
     examples that qualify, the one a learner can read: every word resolvable in
     the index, then the shortest. Without that rule the first example won — and
     lesson 1 asked for a gap in «Это явление продолжает оставаться в фокусе
     внимания экспертов». */
  /* `known`, when given, is the set of lemma indices the learner can be
     expected to read — the route so far — and a word outside it counts as
     unknown the same as a word outside the curriculum. Without it, "unknown"
     meant only "not in the curriculum at all", and a chapter-1 quiz asked
     for the gap in «Как показало исследование, 12% покупателей ___ ноутбук по
     весу» because every word in it is taught *somewhere* (the owner,
     2026-09-24: keep lesson quizzes to words they would understand). */
  /* `opts.avoid` is a set of folded sentences not to show again (the walk's,
     when the quiz draws); a word whose every readable sentence is in it has no
     gap-fill this time and is asked another way. `opts.seed` makes the draw
     among equally readable sentences repeatable, which is how the quiz knows
     which one the walk showed without the two ever meeting. */
  function clozeFor(idx, known, opts) {
    const w = L[idx];
    if (!w.x || !w.x.length) return null;
    const scored = [];
    const avoid = (opts && opts.avoid) || null;
    const strange = (t) => {
      const ids = IX[fold(t)];
      if (!ids) return true;
      if (!known) return false;
      const free = route ? lessonFreeRank(route.stage) : FREE_RANK;
      return !ids.some((i) => i === idx || known.has(i) || i < free);
    };
    /* In the meaning the word is taught in (onSense): «вилка» is the fork, and
       a sentence about a plug is another word to a learner (2026-10-05). A
       rank, not a filter: readability still comes first — an unknown word
       costs 100 — and among sentences as readable, one in the taught sense
       beats one outside it (50, more than any length difference). */
    const inSense = new Set(onSense(w, w.x));
    for (const ex of w.x) {
      const toks = ex.ru.match(TOKEN) || [];
      if (toks.length < 3) continue;
      // The gap's answer is a form the route has taught (formTaught): no
      // «тобо́й» before the cases.
      /* …and a form no word of another kind shares: «добра́» in «сде́лал
         мно́го добра́» is the noun «добро́», but it is also «до́брый»'s short
         feminine, and the gap was built as the adjective's — wrong options from
         the wrong word and a "short form" note (the owner, 2026-10-09). Which
         one a sentence means is not something the index can say. */
      const hit = toks.find((t) => {
        const ids = IX[fold(t)];
        return ids && ids.includes(idx) && formTaught(idx, t)
          && ids.every((j) => j === idx || !L[j] || L[j].p === w.p);
      });
      if (!hit) continue;
      if (avoid && avoid.has(fold(ex.ru))) continue;
      const unknown = toks.filter(strange).length;
      // Inside a lesson, a sentence the learner can read: one unknown word at
      // most, and short (a day-one gap was «У нас в гру́ппе мно́го но́вых
      // студе́нтов»).
      if (route && known && (unknown > 1 || toks.length > 10)) continue;
      scored.push({ ex, token: hit, score: unknown * 100 + (inSense.has(ex) ? 0 : 50) + toks.length });
    }
    if (!scored.length) return null;
    /* Readability is a filter, not a ranking. Returning the single minimum made
       the gap-fill for a word the same sentence for ever — 97 % of words have
       another that qualifies, and the whole curriculum could only ever show 892
       of its ~4,100 example sentences. Anything within a few points of the best
       is equally readable, so draw among those. */
    const best = Math.min(...scored.map((s) => s.score));
    const close = scored.filter((s) => s.score <= best + 3);
    const at = opts && opts.seed !== undefined
      ? seedOf(`${opts.seed}:${idx}`) % close.length
      : Math.floor(Math.random() * close.length);
    const pick = close[at];
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
  /* `cloze` steers the gap-fill: `{ plan }` is a Map of word → the sentence
     a lesson's walk shows for it (clozePlan), `{ avoid }` a set of sentences
     not to show again, `{ seed }` a repeatable draw. */
  function candidates(idx, pool, known, readable, cloze) {
    const list = [{ t: "choose-en", i: idx }];
    if (voice()) list.push({ t: "listen", i: idx });
    list.push({ t: "choose-ru", i: idx });
    const c = cloze && cloze.plan && cloze.plan.has(idx) ? cloze.plan.get(idx) : clozeFor(idx, readable, cloze);
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
  /* `known` is the word's entry — one card since §30at, in the `recognise`
     slot; the strongest slot an older profile still carries is what the
     scheduler believes about the memory. */
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
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, bySense, true)));
        return {
          kind: e.t, i: e.i, ask: "Choose the Russian",
          prompt: askSense(w), cyr: false,
          options: opts.map((i) => ({ label: L[i].w, right: i === e.i, cyr: true })),
        };
      }
      case "listen": {
        const opts = shuffle([e.i].concat(distractors(e.i, e.pool, 3, (x) => x.b, true)));
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
        /* **All four options marked for stress, or none.** The answer was the
           token as the sentence spelled it — usually unmarked, since his decks
           mostly are — and the wrong ones came from the paradigm, which marks
           every form: in 27 % of gap-fills the one option without an accent
           was the answer (the review, 2026-10-01). The answer takes its stress
           from the paradigm when the paradigm spells it only one way (it
           cannot choose between «ру́ки» and «руки́» for a bare «руки»); the
           other words are offered as the lexicon accents them; a one-syllable
           word carries no mark anywhere; and if any option of two syllables
           or more is still unmarked, the marks come off all of them. */
        const forms = paradigmForms(w);
        const sameLetters = (f) => plainOf(f).toLowerCase() === plainOf(token).toLowerCase();
        const marks = unique(forms.filter((f) => sameLetters(f) && stressed(f)));
        const answer = stressed(token) || marks.length !== 1 ? token : marks[0];
        const seen = new Set([plainOf(token).toLowerCase()]);
        const fresh = (f) => {
          const k = plainOf(f).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        };
        // Wrong options are forms the route has taught too: «добре́йший» was
        // offered beside a gap no lesson had prepared (formTaught).
        const own = shuffle(unique(forms.filter((f) => fold(f) !== fold(token) && formTaught(e.i, f)))).filter(fresh);
        const wrong = own.slice(0, 3).map((f) => ({ label: f, right: false, cyr: true }));
        if (wrong.length < 3) {
          for (const i of distractors(e.i, e.pool, 3, bySense)) {
            if (wrong.length < 3 && fresh(L[i].w)) wrong.push({ label: L[i].w, right: false, cyr: true });
          }
        }
        const bare = (s) => (syllables(s) < 2 ? plainOf(s) : s);
        const uniform = [answer].concat(wrong.map((o) => o.label)).map(bare)
          .every((s) => syllables(s) < 2 || stressed(s));
        const shown = (s) => (uniform ? bare(s) : plainOf(s));
        const form = describeForm(w, token);
        /* Every option cased the way the gap needs it (ROADMAP 13.15).
           The answer is the form exactly as the sentence spelled it, and the
           distractors come from the paradigm and the index, which are
           lowercase — so a gap at the start of a sentence handed the answer a
           capital letter and the other three none. «_____ Ду́ма провела́…»
           offered «Госуда́рственная» against three lowercase forms, which is a
           free elimination for somebody who reads no Russian at all. Found
           reading the Phase 0 walkthrough shots, 2026-09-15. */
        const opts = [{ label: answer, right: true, cyr: true }].concat(wrong)
          .map((o) => ({ ...o, label: casedLike(token, shown(o.label)) }));
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
          prompt: askSense(w), cyr: false, typed: true, answer: w.w, target: w.b,
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

  const unique = (a) => [...new Set(a)];
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
      const wrong = nearest(L[h].b, absent, (i) => L[i].b, 3);
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
  function shadowDrill(units, n, all) {
    if (!SPEECH || !SPEECH.speak || !SPEECH.rows) return [];
    const rows = SPEECH.rows;
    const pool = (us) => unique(us.flatMap((u) => SPEECH.speak[u.id] || []));
    let reach = units;
    let idxs = pool(reach);
    /* **Widened until there is a pool worth drawing from.**
     *
     * The units a learner has reached carry very few of these early on:
     * measured 2026-09-23, chapter 1 has **29** sentences in the speak pool
     * and chapter 2 is the first to pass a hundred. Six a run out of
     * twenty-nine is the same handful every sitting — the owner: *"it seems
     * like there's only like 10-20 options or so. I'd like to hear like 100
     * options min."*
     *
     * Reaching past what they have met is §30ac's rule for a thin drill pool,
     * and it costs less here than it does there: shadowing hands the learner
     * the model and asks only for their mouth (§30o). There is nothing to
     * decode and nothing to retrieve, so a sentence carrying a word from next
     * month is a sentence you can still say. What it must not do is put that
     * word into the scheduler, which is why `known` rides on the question —
     * see the note on `beyond` below. */
    if (idxs.length < SHADOW_POOL_MIN && all && all.length) {
      const seen = new Set(reach.map((u) => u.id));
      const widened = reach.slice();
      for (const u of all) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        widened.push(u);
        if (pool(widened).length >= SHADOW_POOL_MIN) break;
      }
      reach = widened;
      idxs = pool(reach);
    }
    if (!idxs.length) return [];
    /* Which sentences are within what the learner has been taught. A word met
       in a lesson may be graded by saying it; a word from a unit they have not
       opened may not, or the exercise would enrol vocabulary nobody taught
       them. The activity reads this and grades nothing on a `beyond` step. */
    const met = new Set(pool(units));
    const out = [];
    for (const ri of shuffle(idxs).slice(0, n)) {
      const [ru, en] = rows[ri];
      out.push({
        kind: "shadow", ask: "Listen, then say it back", prompt: "", cyr: true,
        autoplay: ru, target: ru, en, unit: units[units.length - 1].id,
        beyond: !met.has(ri),
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
    // In a lesson: a tense the route has taught, and a word that keeps the rule.
    if (!verbTableTaught(w, spec.table) || !regular(w)) return [];
    if (/^Imperative/.test(spec.table) && NO_IMPERATIVE.has(fold(w.b))) return [];
    // The chapter that teaches the present asks it of verbs that follow the card.
    if (route && route.stage <= PRESENT_FROM && /^Present/.test(spec.table) && !plainPresent(w)) return [];
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
    /* `at` is the cell the answer is in. The app's reference sheet (the bulb)
       draws the whole paradigm with that cell marked, so a learner looking the
       pattern up sees which row the question is about (§30az: nothing is
       hidden — "everything should be referenceable"). */
    const base = { kind: "form", i, cyr: true, prompt: w.w, sub: firstSense(w), table: t, at: [ri, ci] };
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
    // Nor another form of the asked cell, which is a right answer too («есть»
    // and «бу́ду» … the review, 2026-10-01).
    const seen = new Set(forms.concat(w.w).map(fold));
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
  /* `avoid` — lemma indices the lesson's own grammar practice already asked,
     so the quiz's form question is about another word (the review, 2026-10-12:
     «фи́рма → фи́рме» in the walk and again in the quiz). */
  function formPrompt(unit, index, only, avoid) {
    const spec = formSpec(unit);
    if (!spec) return null;
    // Inside a lesson, not the chapter's rule in a quest whose own card says
    // something else (drillsOwnRule).
    if (route && !drillsOwnRule(unit)) return null;
    /* Every form question carries the card it was built on, so a wrong answer
       can show the rule rather than only the answer. */
    const withNote = (q) => (q && !q.note ? { ...q, note: formNote(unit) || undefined } : q);
    if (spec.drill) {
      // Asked only in the cases and tenses the route has introduced: chapter
      // 3's agreement card is the nominative, not all six (the review,
      // 2026-10-01).
      const reached = unitsUpTo(unit);
      const { cells, only } = routeDrill(spec.drill, reached);
      const focus = only ? new Set(only) : null;
      const typedDrill = stageOf(unit) >= FORM_MIX.typedFromStage;
      /* A generator may decline a draw (an agreement whose answer would be
         the adjective on screen), so it is asked a few times. */
      return withNote(withPool(metBy(unit, index), () => {
        for (let k = 0; k < 20 && GEN[spec.drill]; k++) {
          const q = GEN[spec.drill](cells, typedDrill, focus);
          if (q) return q;
        }
        return null;
      }));
    }
    const typed = stageOf(unit) >= FORM_MIX.typedFromStage;
    if (only !== undefined) {
      const cells = formCells(L[only], spec);
      return cells.length ? withNote(formQuestion(only, pickOne(cells), typed)) : null;
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
    const seen = new Set(avoid || []);
    const ableOf = (tier) => {
      const out = [];
      for (const i of unique(tier)) {
        if (seen.has(i)) continue;
        seen.add(i);
        if (formCells(L[i], spec).length) out.push(i);
      }
      return out;
    };
    /* Never a word from a later lesson of this unit: the question grades the
       word it asks, and a card started before the word is taught is a card
       started early. */
    const pools = [
      { words: ableOf(lessonWords(unit, index)), share: 0.55 },
      { words: ableOf(unitSoFar(unit, index)), share: 0.25 },
      { words: ableOf(metBy(unit, index)), share: 0.20 },
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
        if (q) return withNote(q);
      }
    }
    return null;
  }

  /* ------------------------------------------------------------ case modules */

  /* Real sentences sorted into the uses of each case (core/cases.js; the
     owner, 2026-10-08: "a wide array of words and sentences… a lot of examples
     of how the cases can be used"). Every curriculum word's example sentences
     are read once; a noun counts when its form belongs to **one** case in its
     own table — «кни́гу» is accusative and nothing else, «кни́ге» could be dative
     or prepositional and is left out, so a question never asks for a form the
     sentence does not settle — and when the words before it say which use it
     is (`useOf`). Adjectives and possessives between the trigger and the noun
     are passed over: «в большо́м го́роде» is «в» meaning where. Built on first
     use and kept. */
  const SKIP_BEFORE = new Set(["adjective", "pronoun", "numeral"]);
  const PREP_SET = new Set(PREPOSITIONS);
  const AS_SET = new Set(AS_VERBS);
  const TIME_SET = new Set(TIME_NOUNS);
  /* A word the learner is unlikely to know: past the commonest CASE_COMMON
     lemmas (the index is assigned by frequency), or not in the dictionary. */
  const CASE_COMMON = 2500;
  // The fewest sentences a case drill draws from.
  const CASE_POOL = 100;
  let caseIndex = null;
  function useOf(c, tokens, k) {
    const found = useAt(c, tokens, k);
    if (!found) return null;
    // A set phrase is not the preposition's ordinary meaning (cases.js).
    const around = " " + tokens.slice(Math.max(0, found.j), k + 2).map(fold).join(" ") + " ";
    if (SET_PHRASES.some((p) => around.includes(" " + p + " "))) return null;
    return found.u;
  }
  function useAt(c, tokens, k) {
    let j = k - 1;
    while (j >= 0 && j >= k - 3) {
      const ids = IX[fold(tokens[j])];
      const p = ids && L[ids[0]] ? L[ids[0]].p : null;
      // A preposition or a counting word is a trigger even when the lexicon files
      // it as a pronoun or numeral («у», «два»); anything else describing the
      // noun is passed over.
      const f = fold(tokens[j]);
      if (PREP_SET.has(f) || c.uses.some((u) => u.triggers.includes(f))) break;
      if (!p || !SKIP_BEFORE.has(p)) break;
      j--;
    }
    // Returns the use and where its trigger stands, for the set-phrase check.
    const at = (u) => (u ? { u, j: Math.max(0, j) } : null);
    if (j < 0) return at(c.uses.find((u) => u.after === "none"));
    const f = fold(tokens[j]);
    const ids = IX[f];
    const w = ids && L[ids[0]];
    for (const u of c.uses) if (u.triggers.includes(f)) return at(u);
    // «не́ было», «не бу́дет»: a use whose trigger is нет also takes these.
    if ((f === "было" || f === "будет") && j > 0 && fold(tokens[j - 1]) === "не") {
      const absent = c.uses.find((u) => u.triggers.includes("нет"));
      if (absent) return at(absent);
    }
    if (PREP_SET.has(f)) return null;                    // a preposition no use names
    for (const u of c.uses) {
      if (u.after === "verb" && w && w.p === "verb") return at(u);
      if (u.after === "as" && w && AS_SET.has(fold(w.b))) return at(u);
      if (u.after === "noun" && w && w.p === "noun") return at(u);
      if (u.after === "none") return at(u);
    }
    return null;
  }
  function caseSightings() {
    if (caseIndex) return caseIndex;
    caseIndex = {};
    for (const c of CASES) caseIndex[c.id] = [];
    // Every curriculum word's examples, and the speaking and listening pools —
    // the sentences with recordings, which a lesson already plays.
    const sentences = new Map();
    for (const i of unique(UN.flatMap((u) => u.w))) {
      for (const ex of (L[i] && L[i].x) || []) if (ex && ex.ru && !sentences.has(ex.ru)) sentences.set(ex.ru, ex);
    }
    for (const row of (SPEECH && SPEECH.rows) || []) {
      if (row && row[0] && row[1] && !sentences.has(row[0])) sentences.set(row[0], { ru: row[0], en: row[1] });
    }
    const byRow = new Map(CASES.map((c) => [c.row, c]));
    for (const ex of sentences.values()) {
      const tokens = ex.ru.match(TOKEN) || [];
      if (tokens.length < 3 || tokens.length > 12) continue;
      tokens.forEach((tok, k) => {
        // A capital mid-sentence is a name («с То́мом» is Tom, not «том», a
        // volume — the learner agents, 2026-10-08).
        if (k > 0 && tok[0] !== tok[0].toLowerCase()) return;
        const ids = IX[fold(tok)];
        const i = ids && ids[0];
        const w = i !== undefined ? L[i] : null;
        if (!w || w.p !== "noun") return;
        // «Сериа́л сериа́лу рознь»: the same noun twice is an idiom, not a use.
        if (k > 0 && (IX[fold(tokens[k - 1])] || [])[0] === i) return;
        const t = tableTitled(w, /Declension/);
        if (!t) return;
        const rows = new Set(), at = [];
        t.rows.forEach((r, ri) => cellsOf(r).forEach((cell, ci) => {
          if ((cell || []).some((f) => fold(f) === fold(tok))) { rows.add(r[0]); at.push([ri, ci + 1]); }
        }));
        if (rows.size !== 1) return;
        const c = byRow.get([...rows][0]);
        if (!c) return;
        const u = useOf(c, tokens, k);
        if (!u) return;
        // «в феврале́» is when, not where.
        if ((u.id === "where" || u.id === "to") && TIME_SET.has(fold(w.b))) return;
        const [ri, ci] = at[0];
        // Easiest first: a word outside the commonest costs three plain ones.
        const rare = tokens.filter((x) => { const h = IX[fold(x)]; return !h || h[0] >= CASE_COMMON; }).length;
        caseIndex[c.id].push({ ru: ex.ru, en: ex.en, token: tok, i, use: u.id, table: t, at: [ri, ci],
                               form: cellsOf(t.rows[ri])[ci - 1], plural: /plural/i.test(t.columns[ci] || ""),
                               ease: tokens.length + 3 * rare });
      });
    }
    return caseIndex;
  }

  /* The easier part of a use's sentences, shuffled: the easiest `share`, but
     never fewer than `min`, so a drill still ranges widely and a lesson opens
     on sentences a learner can read. */
  const easiest = (list, share, min) => {
    const sorted = list.slice().sort((a, b) => a.ease - b.ease);
    return shuffle(sorted.slice(0, Math.max(min, Math.ceil(sorted.length * share))));
  };

  /* A sentence with the noun taken out and its dictionary form given: write
     (or choose) the form the sentence needs. */
  function caseGap(s, typed) {
    const w = L[s.i];
    const gap = s.ru.replace(s.token, "___");
    if (gap === s.ru) return null;
    const base = { kind: "cases", i: s.i, cyr: true, prompt: gap, caseRu: s.ru,
                   sub: `${w.w}${s.plural ? " (plural)" : ""} · ${s.en}`, table: s.table, at: s.at, caseUse: s.use };
    const right = s.form[0];
    if (typed) return written(base, "Fill the gap", right, s.form.slice(1).concat(s.token));
    const others = s.table.rows.flatMap((r) => cellsOf(r).flat()).filter(Boolean);
    const wrong = threeWrong(right, others.filter((f) => !s.form.some((x) => fold(x) === fold(f))
      && fold(f) !== fold(s.token)));
    return wrong ? { ...base, ask: "Fill the gap", options: optionsOf(right, wrong) } : null;
  }

  /* The sentence whole, and the question is the situation: what calls for this
     case here? The options are the uses of this case and of the cases taught
     before it (`upTo`), so the learner tells «в» meaning where from «в»
     meaning where to — the distinction the module is for. No word is graded:
     this is about the sentence, not the noun. */
  function caseWhy(s, c, upTo) {
    const pool = CASES.slice(0, CASES.indexOf(c) + 1).filter((x) => !upTo || upTo.includes(x.id))
      .flatMap((x) => x.uses.map((u) => ({ x, u })));
    const right = pool.find((p) => p.x === c && p.u.id === s.use);
    if (!right) return null;
    const label = (p) => (p.x === c ? p.u.label : `${p.u.label} (${p.x.name.toLowerCase()})`);
    const wrong = shuffle(pool.filter((p) => p !== right)).slice(0, 3);
    if (wrong.length < 2) return null;
    return { kind: "cases", cyr: true, prompt: s.ru, sub: s.en, caseUse: s.use, caseRu: s.ru,
             ask: `Why «${s.token}»?`,
             note: { title: right.u.label, body: right.u.body, examples: right.u.examples },
             options: shuffle([right].concat(wrong)).map((p) => ({ label: label(p), right: p === right })) };
  }

  /* The case's own cell of a noun's table, for the forms themselves. */
  const caseForm = (c, typed, pool) =>
    drillQuestions("cases", 1, pool || curriculumNouns(), null, typed, [c.row])[0] || null;
  const curriculumNouns = () => unique(UN.flatMap((u) => u.w)).filter((i) => L[i] && L[i].p === "noun");

  /* The lesson of one case: what it is for, then each use in turn — its card
     and two questions on sentences of exactly that use, the first chosen and
     the second written — then two of the case's forms to write. The cards
     are `{ t: "grammar" }` steps, the shape a lesson's rule card already is. */
  function caseLesson(caseId) {
    const c = caseById(caseId);
    if (!c) return [];
    const seen = caseSightings()[c.id];
    const steps = [{ t: "grammar", note: { title: `The ${c.name.toLowerCase()} case`, body: c.intro,
                                            examples: c.uses.map((u) => u.examples[0]) } }];
    const used = new Set();
    for (const u of c.uses) {
      steps.push({ t: "grammar", note: { title: u.label, body: u.body, examples: u.examples } });
      const mine = easiest(seen.filter((s) => s.use === u.id && !used.has(s.ru)), 0, 6);
      let made = 0;
      for (const s of mine) {
        const q = caseGap(s, made === 1);
        if (!q) continue;
        used.add(s.ru);
        steps.push(q);
        if (++made === 2) break;
      }
    }
    for (let k = 0; k < 2; k++) { const q = caseForm(c, true); if (q) steps.push(q); }
    return steps;
  }

  /* The drill of one case: `n` questions over a wide spread of words and
     sentences, every use in turn so none is drowned by the commonest (most
     accusatives are objects), mostly gaps to write, some "why", a few forms.
     `upTo` is the cases the learner has met (their options in "why"). */
  /* A case's pool: the easier half of each use's sentences, but never fewer
     than CASE_POOL across the case (the owner, 2026-10-08: "10 questions at a
     time but a pool of like 100 per case"), each use given its share. */
  function casePool(c) {
    const seen = caseSightings()[c.id];
    const per = Math.ceil(CASE_POOL / c.uses.length);
    return c.uses.map((u) => easiest(seen.filter((s) => s.use === u.id), 0.5, per));
  }
  /* `recent` is what this case's last runs asked (the sentences, kept with
     the drill's best): a run draws what it has not asked first, so a learner
     works through the pool before a sentence comes round again. */
  function caseDrill(caseId, n = 10, upTo, recent) {
    const c = caseById(caseId);
    if (!c) return [];
    const asked = new Set(recent || []);
    // Unasked first, the rest after, each list still shuffled within.
    const byUse = casePool(c).map((list) => list.filter((s) => !asked.has(s.ru)).concat(list.filter((s) => asked.has(s.ru))));
    const out = [], usedRu = new Set(), usedWord = new Map();
    /* Which use a slot draws on: each in proportion to what it has not yet
       asked, so a small use («о» meaning about, 29 sentences) is not used up
       in strict turns while a large one still has seventy left. The first
       slots still go round every use, so a run is never one use only. */
    const unasked = (u) => byUse[u].filter((x) => !asked.has(x.ru) && !usedRu.has(x.ru)).length;
    const pickUse = (k) => {
      if (k < byUse.length) return k;
      const weights = byUse.map((_, u) => unasked(u) || 0.01);
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let u = 0; u < weights.length; u++) { roll -= weights[u]; if (roll <= 0) return u; }
      return weights.length - 1;
    };
    for (let k = 0; out.length < n && k < n * 6; k++) {
      const slot = out.length;
      if (slot % 6 === 5) { const q = caseForm(c, true); if (q) { out.push(q); continue; } }
      const list = byUse[pickUse(k)];
      const s = list.find((x) => !usedRu.has(x.ru) && (usedWord.get(x.i) || 0) < 2);
      if (!s) continue;
      usedRu.add(s.ru);
      usedWord.set(s.i, (usedWord.get(s.i) || 0) + 1);
      // "Why?" needs three uses to choose from; a case with two (the first
      // module) asks the gap instead.
      const q = (slot % 4 === 2 && caseWhy(s, c, upTo)) || caseGap(s, true);
      if (q) out.push(q);
    }
    return out;
  }
  /* The size of a case's drill pool, for the tests. */
  const casePoolSize = (caseId) => { const c = caseById(caseId); return c ? casePool(c).flat().length : 0; };
  /* How many sentences each use of a case has, for the tests and the build. */
  const caseCounts = () => Object.fromEntries(CASES.map((c) => [c.id,
    Object.fromEntries(c.uses.map((u) => [u.id, caseSightings()[c.id].filter((s) => s.use === u.id).length]))]));

  /* A run of practice on one chapter's grammar point (the owner, 2026-09-30:
     "exercises within the lessons that focus on … one of the grammar points
     from that chapter with words from that chapter… imagine conjugations
     present"). The point is the card's own `form` (formSpec, inherited by a
     side quest), so the run cannot teach something the card does not.
     Words: this lesson's first when there is a lesson, then the unit's, then
     the route so far — each word in turn, so the run starts on what was just
     met and widens. Chosen first, written last (`GRAMMAR_CHOOSE` of the run),
     the build-up a learner wants on a new form. Never the same word and cell
     twice. Empty when the chapter has no point (chapter 1). */
  function grammarRun(unit, index, n = GRAMMAR_N) {
    return inRoute(unit, () => grammarRunIn(unit, index, n));
  }
  function grammarRunIn(unit, index, n) {
    const spec = formSpec(unit);
    if (!spec) return [];
    /* The chapter's own card names the run, whatever card a drill attaches
       to its questions — or the Done title and the Practice row disagree. */
    const note = formNote(unit) || undefined;
    const withNote = (q) => ({ ...q, note: note || q.note });
    /* What the learner has been taught by the end of this step: earlier
       chapters whole, this chapter's spine, and this unit — up to and
       including the lesson when it is a lesson's step. Never a sibling side
       quest, which the learner may not have taken (§30l), and never a later
       lesson of this unit: the run grades every word it asks, and a word
       graded before it is taught starts its card early (the review). */
    const lesson = index !== undefined && index !== null;
    const soFar = unitSoFar(unit, index);
    const reached = unitsUpTo(unit);
    const route = metBy(unit, index);
    // The cases and tenses the route has introduced, for a drill-shaped point.
    const { cells, only } = routeDrill(spec.drill, reached);
    const choose = Math.floor(n * GRAMMAR_CHOOSE);
    if (spec.drill) {
      /* A rule the drills already ask (agreement, aspect): the same draw, on
         these words, chosen then written — and never one question twice in
         its two shapes, which `drillKey` cannot see (it keys on the ask). */
      const same = (q) => `${q.prompt}|${q.typed ? q.target : (q.options || []).filter((o) => o.right).map((o) => o.label).join("/")}`;
      const first = drillQuestions(spec.drill, choose, route, cells, false, only);
      const keys = new Set(first.map(same));
      const rest = drillQuestions(spec.drill, n, route, cells, true, only)
        .filter((q) => !keys.has(same(q))).slice(0, n - first.length);
      return first.concat(rest).map(withNote);
    }
    const able = [], seen = new Set();
    const tiers = [lesson ? lessonWords(unit, index) : [], soFar, route];
    /* Inside a lesson the order is fixed by the unit and the walk starts
       `index · n` words along it, so lesson N+1 practises the next words along
       rather than drawing the same two again (the review, 2026-10-12:
       «начина́ть» and «переста́ть» three lessons running) — and the quiz can
       recompute what the walk asked. A standalone run is shuffled: variety is
       what a retake wants. */
    for (const tier of tiers) {
      const order = lesson ? orderBy(unique(tier), unit.id) : shuffle(unique(tier).slice());
      for (const i of order) {
        if (seen.has(i)) continue;
        seen.add(i);
        if (formCells(L[i], spec).length) able.push(i);
      }
    }
    if (!able.length) return [];
    const offset = lesson ? (index * n) % able.length : 0;
    const out = [], asked = new Set();
    for (let k = 0; out.length < n && k < n * 20; k++) {
      const i = able[(offset + k) % able.length];
      const cell = pickOne(formCells(L[i], spec));
      const key = `${i}:${cell.ri}:${cell.ci}`;
      if (asked.has(key)) continue;
      const q = formQuestion(i, cell, out.length >= choose);
      if (!q) continue;
      asked.add(key);
      out.push(withNote(q));
    }
    return out;
  }

  /* Which practice drills the route so far has taught, read off the same grammar
     cards that drive the form question. A learner three lessons in was being
     offered the Aspect drill, which chapter 8 teaches — and the pool of aspect
     questions their words could fill was fifteen, so it asked the same handful
     over and over. Stress is open from the start: it is about words in general
     rather than a rule the path introduces. */
  function drillsIntroduced(units) {
    const out = new Set(["stress"]);
    for (const u of units) {
      const spec = formSpec(u);
      if (!spec) continue;
      if (spec.drill) out.add(spec.drill);
      else if (spec.pos === "noun" && spec.table === "Declension") out.add("cases");
      else if (spec.pos === "verb") out.add("conjugation");
    }
    return out;
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
      /* A scene carries its sentences as `lines`; this read `rows`, which no
         scene has, so every scene keyed as the same empty string and a quiz
         asked for twenty scenes held one (the review, 2026-10-01). */
      const key = q.kind + "|" + (q.target || (q.lines ? q.lines.map((l) => l.ru).join("|") : ""));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      made++;
    }
    return spread(shuffle(out)).slice(0, n);
  }

  /* The day's recap (the owner, 2026-10-01: "a daily recap… that reviews
     things you specifically did that day… 10-20 questions"; then: "It should
     be a review of the biggest things covered that day. You can highlight the
     biggest areas to focus on… but it shouldn't be the focus. The idea is
     spaced refresher/exposure").
     So it is a walk through the day, not a list of mistakes:
       - `words`, everything graded today in the order it was met, sampled
         evenly so every part of the day is in it, asked mostly to recognise
         and hear — refreshing, not testing;
       - `focus` (today's misses, then the weakest), at most RECAP_FOCUS of the
         questions, written in Russian, and shuffled in rather than first;
       - sentences to hear from the units the day touched (RECAP_HEAR), for
         exposure to the words in use;
       - the chapter's grammar point once or twice, where a unit touched today
         teaches one.
     RECAP_MIN to RECAP_MAX questions; fewer than RECAP_MIN / 2 words worked is
     no recap. */
  const RECAP_MIN = 10, RECAP_MAX = 20, RECAP_FOCUS = 0.25, RECAP_HEAR = 0.2, RECAP_GRAMMAR = 2;
  function recapQuestions({ words, focus = [], n }) {
    const all = unique(words).filter((i) => L[i]);
    if (all.length < RECAP_MIN / 2) return [];
    const target = Math.max(RECAP_MIN, Math.min(RECAP_MAX, n || Math.round(all.length * 0.8)));
    const dayWords = new Set(all);
    const units = UN.filter((u) => u.w.some((i) => dayWords.has(i)));
    const pool = all.length >= 8 ? all : poolFor(units[0] || UN[0]);
    const out = [];
    const used = new Set();
    const ask = (i, t) => {
      if (t === "cloze") {
        const c = clozeFor(i);
        return c ? present({ t: "cloze", i, ex: c.ex, token: c.token, pool }) : present({ t: "choose-en", i, pool });
      }
      return present({ t, i, pool });
    };
    // The weak spots: a share, never the whole.
    const focusN = Math.min(Math.round(target * RECAP_FOCUS), focus.length);
    for (const i of unique(focus).filter((i) => dayWords.has(i))) {
      if (out.length >= focusN) break;
      const q = ask(i, "type");
      if (q) { out.push(q); used.add(i); }
    }
    // The chapter's grammar, where the day touched a unit that teaches one.
    for (const u of units) {
      if (out.filter((q) => q.kind === "form").length >= RECAP_GRAMMAR) break;
      const cand = u.w.find((i) => dayWords.has(i) && !used.has(i));
      const f = cand === undefined ? null : formPrompt(u, 0, cand);
      if (f) { const q = present({ t: "form", q: f }); if (q) { out.push(q); used.add(cand); } }
    }
    // Sentences to hear, from the day's units.
    const hearN = voice() ? Math.round(target * RECAP_HEAR) : 0;
    const unitIds = units.map((u) => u.id);
    const heard = new Set();
    for (let k = 0; heard.size < hearN && k < hearN * 5; k++) {
      const q = sentencePrompt("hear", unitIds);
      if (!q || heard.has(q.target)) continue;
      heard.add(q.target);
      out.push(q);
    }
    // The rest: the whole day, evenly, mostly recognised and heard.
    const rest = all.filter((i) => !used.has(i));
    const wordN = target - out.length;
    const kinds = ["choose-en", "cloze", "choose-ru"].concat(voice() ? ["listen"] : []);
    // Evenly spaced through the day; a short day goes round again in a new shape.
    const step = rest.length / Math.max(1, wordN);
    for (let k = 0; k < wordN && rest.length; k++) {
      const i = rest[Math.min(rest.length - 1, Math.floor(k * step))];
      const q = ask(i, kinds[k % kinds.length]);
      if (q) out.push(q);
    }
    return spread(shuffle(out)).slice(0, target);
  }

  /* The final test: one paper over the whole course rather than a tenth
     chapter's quiz. Cumulative by construction — words are dealt chapter by
     chapter in turn, so every chapter is in it whatever the draw — and
     diverse by construction: the word kinds rotate instead of being picked at
     random, and a fifth of the paper is sentences heard and said. The spine
     only, because every learner walks the spine and a side quest is optional;
     a test on a chapter you were free to skip is not a fair test. */
  const FINAL_WORD_KINDS = ["choose-en", "choose-ru", "listen", "cloze", "type", "form"];
  function finalExam(n = FINAL_N) {
    const units = STAGES.map((s) => s.core);
    const sentenceShare = Math.round(n / 5);
    const wordShare = n - sentenceShare;
    const bags = units.map((u) => shuffle(u.w.slice()));
    const picks = [];
    for (let k = 0; picks.length < wordShare && bags.some((b) => b.length); k++) {
      const b = bags[k % bags.length];
      if (b.length) picks.push({ i: b.shift(), unit: units[k % units.length] });
    }
    const pool = unique(units.flatMap((u) => u.w));
    const out = [];
    picks.forEach(({ i, unit }, k) => {
      const kind = FINAL_WORD_KINDS[k % FINAL_WORD_KINDS.length];
      let e = { t: kind, i, pool };
      if (kind === "cloze") {
        const c = clozeFor(i);
        e = c ? { t: "cloze", i, ex: c.ex, token: c.token, pool } : { t: "choose-en", i, pool };
      } else if (kind === "form") {
        // The word's own chapter decides the form; a word with none is typed.
        const f = formPrompt(unit, 0, i);
        e = f ? { t: "form", q: f } : { t: "type", i, pool };
      }
      const q = present(e);
      if (q) out.push(q);
    });
    const unitIds = units.map((u) => u.id);
    const seen = new Set();
    for (let k = 0, made = 0; made < sentenceShare && k < sentenceShare * 5; k++) {
      const q = sentencePrompt(k % 2 ? "say" : "hear", unitIds);
      if (!q) continue;
      const key = q.kind + "|" + q.target;
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
  /* The grammar is in every lesson as **practice**, and taught once (the
     owner, 2026-10-07: "The grammar rules don't need to be repeated. The
     enforcement or the drills are what need to be repeated"). The unit's own
     card opens its first lesson; every lesson then closes on a short try of
     the rule on its own words (`GRAMMAR_IN_LESSON`). A side quest with no card
     of its own shows none — its chapter's card was met on the spine — and
     drills its chapter's rule. The card stays a tap away under a wrong answer
     and in the reference. It used to close every later lesson too. */
  function vocabSteps(unit, index) {
    return inRoute(unit, () => vocabStepsIn(unit, index));
  }
  /* A side quest whose own card teaches something no table can ask (идти and
     ходить, the number rule, «у меня боли́т») is not drilled on its chapter's
     rule instead: the body quest's card says the aching part is nominative and
     the drill then asked it in the accusative (the learner agents,
     2026-10-08). Drilled only where the unit's own card has a form, or where
     the unit has no card and borrows its chapter's. */
  const drillsOwnRule = (unit) => !unit.g || !!unit.g.form;
  function vocabStepsIn(unit, index) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    const steps = [];
    const note = unit.g || formNote(unit);
    const practice = note && drillsOwnRule(unit) ? grammarRun(unit, index, GRAMMAR_IN_LESSON) : [];
    /* Variety: a shape not the same as the question before it, "what did you
       hear?" at most a third of the walk's questions, and no typing in chapter
       1 (the walk knows nothing of the learner's cards; the quiz does). */
    const stageNow = stageOf(unit);
    const readable = new Set(metBy(unit, index));
    const chapterBefore = chapterReview(unit, index, readable);
    /* The walk's gap sentences are planned once, one per word and no sentence
       twice; the quiz builds the same plan and shows none of them again. */
    const cloze = { plan: clozePlan(unit, index, words.concat(chapterBefore), readable) };
    const barred = meaningClash(words);
    let lastKind = null, asked = 0, heard = 0;
    /* **Never the same shape twice for one word in a walk** (the review,
       2026-10-12: «Choose the Russian | to know → знать» and the identical
       question three lines later as its review — in 41 of 42 lessons). A word
       asked again is asked another way; only a word with one shape repeats. */
    const shapesUsed = new Map();
    const pickShape = (list) => {
      let c = list.filter((e) => e && (stageNow > 0 || e.t !== "type"));
      const notHeard = c.filter((e) => e.t !== "listen");
      if (heard * 3 >= asked + 1 && notHeard.length) c = notHeard;
      if (c.length) {
        // The meaning rule first: a barred word repeats a shape before it is
        // ever asked by a meaning another word on the list shares.
        const notByMeaning = barred.has(c[0].i) ? c.filter((e) => !MEANING.includes(e.t)) : c;
        if (notByMeaning.length) c = notByMeaning;
        const used = shapesUsed.get(c[0].i);
        const unused = used ? c.filter((e) => !used.has(e.t)) : c;
        if (unused.length) c = unused;
      }
      const fresh = c.filter((e) => e.t !== lastKind);
      const from = fresh.length ? fresh : c;
      const e = from[Math.floor(Math.random() * from.length)];
      if (e) {
        lastKind = e.t; asked++; if (e.t === "listen") heard++;
        if (!shapesUsed.has(e.i)) shapesUsed.set(e.i, new Set());
        shapesUsed.get(e.i).add(e.t);
      }
      return e;
    };
    if (index === 0 && unit.g) steps.push({ t: "grammar", note: unit.g });
    if (words.length) steps.push({ t: "list", words });
    /* **Cumulative, not two at a time** (the owner, 2026-10-05: "right now we
       introduce two words, we answer a question that has two words as obvious
       answers. I'm not really sure learning happens there… accumulate words
       and grammar checks from the entire chapter"). After each pair, one
       question goes back: a word met earlier in this lesson, or earlier in
       the chapter once the lesson has none. And the words close on a short
       mixed round over the lesson and the chapter so far, in any shape — a
       word met an hour ago can be typed. All of it from `metBy`, so never a
       word this learner was not taught. */
    const back = [];                        // what went back, so nothing goes back twice
    const goBack = (pairStart) => {
      const inLesson = shuffle(words.slice(0, pairStart)).find((i) => !back.includes(i));
      const pick = inLesson !== undefined ? inLesson : chapterBefore.find((i) => !back.includes(i));
      if (pick === undefined) return;
      back.push(pick);
      const q = present(pickShape(candidates(pick, pool, null, readable, cloze)));
      if (q) steps.push({ ...q, review: true });
    };
    let lastPair = [];
    words.forEach((w, n) => {
      steps.push({ t: "word", i: w });
      if (n % 2 === 1 || n === words.length - 1) {
        // Drawn, not fixed at [0]. `candidates` is ordered easiest first, and
        // taking the head meant every one of the 1,199 retrievals across the
        // whole route was "What does this mean?" — four English options, for
        // every word a learner ever meets. The easiest two shapes still carry
        // it: this is the retrieval right after meeting the word.
        const start = Math.max(0, n - (n % 2 === 1 ? 1 : 0));
        lastPair = words.slice(start, n + 1);
        lastPair.forEach((r) => {
          steps.push(present(pickShape(candidates(r, pool).slice(0, 3))));
        });
        goBack(start);
      }
    });
    /* The closing round: a lesson word and the chapter's, mixed — and not the
       word just presented, whose retrieval was two questions ago (the review,
       2026-10-12: «yellow → жёлтый», a review, «yellow → жёлтый»). */
    const fresh = words.filter((i) => !back.includes(i));
    const notLast = fresh.filter((i) => !lastPair.includes(i));
    const closing = shuffle(notLast.length ? notLast : fresh).slice(0, 1)
      .concat(chapterBefore.filter((i) => !back.includes(i)).slice(0, VOCAB_MIXED - 1));
    for (const i of shuffle(closing)) {
      const q = present(pickShape(candidates(i, pool, null, readable, cloze)));
      if (q) steps.push(words.includes(i) ? q : { ...q, review: true });
    }
    practice.forEach((q) => steps.push({ ...q, drill: true }));
    return steps;
  }

  /* Which gap sentence a lesson's walk shows for each word it might ask: a
     repeatable draw (seeded on the lesson), taken in a fixed order so that two
     words sharing a sentence («Вы будете чай или кофе?») do not both gap it.
     The walk and the quiz each compute it and so agree without ever meeting;
     a word in the plan with no sentence has no gap-fill in that lesson. */
  function clozePlan(unit, index, candidatesFor, readable) {
    const seed = `${unit.id}:${index}`;
    const avoid = new Set();
    const plan = new Map();
    for (const i of unique(candidatesFor).slice().sort((a, b) => a - b)) {
      const c = clozeFor(i, readable, { seed, avoid });
      plan.set(i, c);
      if (c) avoid.add(fold(c.ex.ru));
    }
    return plan;
  }

  /* The chapter's earlier words a walk may review, in an order the lesson
     before it does not share. `chapterBefore` was a fresh shuffle each lesson
     with no memory of the last, so «так» came back as the review in eight of
     chapter 2's seventeen lessons (the review, 2026-10-12). The order is fixed
     by the lesson (`orderBy`), and the words the previous lesson's order put
     first — about what one walk reviews — go to the back of this one. */
  const WALK_REVIEWS = VOCAB_MIXED + 2;
  function chapterReview(unit, index, readable) {
    const stage = stageOf(unit);
    const poolAt = (j) => unique(Array.from({ length: j }, (_, k) => lessonWords(unit, k)).flat()
      .concat(unitsUpTo(unit).filter((u) => u !== unit && stageOf(u) === stage).flatMap((u) => u.w)))
      .filter((i) => readable.has(i) && !lessonWords(unit, j).includes(i));
    const ordered = orderBy(poolAt(index), `${unit.id}:${index}`);
    if (index === 0) return ordered;
    const prev = new Set(orderBy(poolAt(index - 1), `${unit.id}:${index - 1}`).slice(0, WALK_REVIEWS));
    return ordered.filter((i) => !prev.has(i)).concat(ordered.filter((i) => prev.has(i)));
  }

  /* Two words of one lesson with the same first meaning — «здесь» and «тут»,
     «число́» and «но́мер» — cannot both be asked *by* that meaning: "Choose the
     Russian | here" has two right answers on the screen's own word list, and
     the learner is marked on which one the app meant. The commoner word keeps
     the meaning shapes; the others are asked by their Russian (the review,
     2026-10-12). */
  const MEANING = ["choose-ru", "type"];
  function meaningClash(words) {
    const first = new Map(), barred = new Set();
    for (const i of words.slice().sort((a, b) => a - b)) {
      const k = L[i] && mainSense(L[i]);
      if (!k) continue;
      if (first.has(k)) barred.add(i); else first.set(k, i);
    }
    return barred;
  }

  /* The units a learner standing at this one has certainly been through, in
     route order: the spine of this chapter and every earlier one, the
     **required** side quests of earlier chapters, and the unit itself.
   *
   * Never a sibling side quest of the same chapter, and never an optional
   * quest other than the unit itself: the learner may have taken neither. It
   * used to be "earlier chapters whole, and this chapter up to the unit", so a
   * side quest's quiz asked «автомоби́ль» from a sibling quest and Emotion's
   * listening played «Он пошёл к врачу́» on the strength of Work (the review,
   * 2026-10-01), and a spine lesson could ask a word only an optional quest
   * teaches. This is the one rule for "what has the learner met"; the quiz,
   * the form question, the speech prompts, the grammar run and the drills
   * spliced into a lesson all read it. */
  function unitsUpTo(unit) {
    const out = [];
    for (const s of STAGES) {
      const here = [s.core].concat(s.branches || []);
      if (here.includes(unit)) {
        out.push(s.core);
        if (unit !== s.core) out.push(unit);
        return out;
      }
      out.push(s.core, ...(s.branches || []).filter((b) => !b.opt));
    }
    return out;
  }

  /* This unit's words up to and including lesson `index` — the whole unit when
     there is no lesson (a unit-level run). */
  function unitSoFar(unit, index) {
    if (index === undefined || index === null) return unit.w;
    return Array.from({ length: index + 1 }, (_, j) => lessonWords(unit, j)).flat();
  }

  /* Every word a learner at this lesson has been taught: the route before the
     unit (unitsUpTo) and this unit up to the lesson. What anything that grades
     a word inside a lesson may draw from — a word from a later lesson of the
     same unit would start its card before it is taught. */
  function metBy(unit, index) {
    const own = index === undefined || index === null ? [] : lessonWords(unit, index);
    return unique(unitsUpTo(unit).filter((u) => u !== unit).flatMap((u) => u.w)
      .concat(unitSoFar(unit, index))).filter((i) => taughtOk(i, own));
  }

  /* **What this learner was actually taught**, when the app says (the owner,
     2026-10-05: "any standalone question about a specific word should have
     been taught previously… you shouldn't target a question to focus on an
     unlearned word"). The route says what a learner here *should* have met,
     and that is not the same thing: a curriculum re-cut can add a word to a
     lesson already finished (§30bf V7 keeps it finished), and «сколько»,
     moved into chapter 1 after the owner had done it, was asked in a chapter 1
     quest he had never been shown it in. So a lesson flow passes the
     learner's own record — a word with a card has been met — and everything
     that targets a word inside it (`metBy`, the quiz's fill and review, the
     drills and grammar spliced in) keeps to that, plus the lesson's own words.
     Unset (the web app, the tools, the tests) it is the route, as before.
     Synchronous by design: set for one call and cleared, never left behind. */
  let taught = null;
  function taughtOk(i, own) {
    return !taught || taught(i) || (own && own.includes(i));
  }
  function withTaught(fn, run) {
    const before = taught;
    taught = typeof fn === "function" ? fn : null;
    try { return run(); } finally { taught = before; }
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
    /* A sentence's unit is where the build found its last word taught, along
       the whole path — so a side quest's pool can hold a sentence whose other
       word only a sibling quest teaches («Како́й сего́дня курс до́ллара…» in
       Business, «до́ллар» from Work; the review, 2026-10-01). Only sentences
       every word of which the learner has met, or meets on every screen —
       and a common word is not "met on every screen" when a quest beside
       this route is where it is taught: «врач» is Work's. */
    const route = unitsUpTo(unit);
    /* Up to this lesson, not the whole unit: «пе́сня» was said in a lesson
       before the one that teaches it (the review, 2026-10-12). */
    const met = new Set(metBy(unit, index));
    const k = stageOf(unit);
    const beside = new Set(STAGES.slice(0, k + 1).flatMap((s) => [s.core].concat(s.branches || []))
      .filter((u) => !route.includes(u)).flatMap((u) => u.w));
    // A common word is not free either when it is this unit's own, taught in a
    // later lesson («спать» in the home quest's second lesson, taught in its third).
    const later = new Set(unit.w.filter((l) => !met.has(l)));
    const sayable = (i) => sentenceLemmas(SPEECH.rows[i][0], IX)
      .every((l) => met.has(l) || (l < FREE_RANK && !beside.has(l) && !later.has(l)));
    const own = (pool[unit.id] || []).concat(fallback && !(pool[unit.id] || []).length ? (fallback[unit.id] || []) : [])
      .filter(sayable);
    const all = route.flatMap((u) => pool[u.id] || []).filter(sayable);
    const want = new Set(lessonWords(unit, index));
    const row = pickPrompt(SPEECH.rows, own, want, IX, null, true)
      || pickPrompt(SPEECH.rows, all, want, IX, null, true)
      || pickPrompt(SPEECH.rows, own, null, IX)
      || pickPrompt(SPEECH.rows, all, null, IX)
      || (fallback ? pickPrompt(SPEECH.rows, route.flatMap((u) => fallback[u.id] || []).filter(sayable), null, IX) : null);
    return row ? { t: kind, row, unit: unit.id } : null;
  }

  /* No two consecutive questions about the same word: a repeat straight after
     is not retrieval, it is the answer still on screen. Rebuilds the (already
     shuffled) list greedily, taking the first question that is not about the word
     just asked; only when nothing else is left does a repeat follow itself. */
  /* …and no two consecutive questions of one shape either, where the mix
     allows: quizzes opened on four typed answers in a row (the review,
     2026-10-12). The word rule is the hard one; the shape rule yields to it. */
  function spread(list) {
    const same = (a, b) => a && b && typeof a.i === "number" && a.i === b.i;
    const sameKind = (a, b) => a && b && a.t === b.t;
    const rest = list.slice(), out = [];
    while (rest.length) {
      const last = out[out.length - 1];
      let k = rest.findIndex((e) => !same(e, last) && !sameKind(e, last));
      if (k < 0) k = rest.findIndex((e) => !same(e, last));
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
    return inRoute(unit, () => quizStepsIn(unit, index, prefer, seen, last));
  }
  /* Typing waits in chapter 1 until a word has been answered twice (the
     learner agents, 2026-10-08: a beginner with shaky Cyrillic met three typed
     answers in the first quiz). A card is from the scheduler (`seen`). */
  const typeReady = (stage, entry) => stage > 0
    || Object.values(entry || {}).some((c) => c && (c.reps || 0) >= 2);
  function quizStepsIn(unit, index, prefer, seen, last) {
    const words = lessonWords(unit, index);
    const pool = poolFor(unit);
    // `seen` is the learner's schedule keyed on the Russian string (rule 20.4).
    // A word the scheduler already holds is asked by production (PRODUCE_AT).
    const card = (i) => (seen && L[i] ? seen[L[i].b] : null);
    // The lesson's words set the length: two questions a word, six to eight.
    const QN = Math.min(QUIZ_N - 2, Math.max(QUIZ_MIN, QUIZ_WORDS * words.length));
    const stageHere = stageOf(unit);

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
    // What this learner can read: everything taught by this lesson (clozeFor).
    const readable = new Set(metBy(unit, index));
    /* The gap sentences the walk before this quiz showed (the same seeded
       draw) are not shown again, and no sentence is gapped twice in one quiz
       («Вы будете чай или ___», then «Вы будете ___ или кофе»). */
    const usedEx = new Set();
    for (const c of clozePlan(unit, index, words.concat(chapterReview(unit, index, readable)), readable).values()) {
      if (c) usedEx.add(fold(c.ex.ru));
    }
    const barred = meaningClash(words);
    // "What did you hear?" and the gap-fill each at most a third of the words' questions.
    let heardN = 0, clozeN = 0;
    const shapes = (i) => {
      let list = candidates(i, pool, card(i), readable, { avoid: usedEx })
        .filter((e) => e.t !== "type" || typeReady(stageHere, card(i)));
      const quiet = list.filter((e) => e.t !== "listen");
      if (heardN * 3 >= QN && quiet.length) list = quiet;
      const noGap = list.filter((e) => e.t !== "cloze");
      if (clozeN * 3 >= QN && noGap.length) list = noGap;
      const notByMeaning = list.filter((e) => !MEANING.includes(e.t));
      if (barred.has(i) && notByMeaning.length) list = notByMeaning;
      return list;
    };
    const draw = (i) => {
      const e = drawFrom(shapes(i), i);
      if (e && e.t === "listen") heardN++;
      if (e && e.t === "cloze") { clozeN++; usedEx.add(fold(e.ex.ru)); }
      return e;
    };

    /* **Not every word a lesson shows is a word it drills** (the owner,
       2026-10-02: "you can give multiple greeting options and then just drill
       the most common one… Focus is always on the core words"). A lesson's
       block may teach «здравствуйте» beside «привет»; the quiz asks the
       lesson's commonest words always, the rest only where a slot is free.
       The lemma index is frequency order (build_site), read here, never keyed
       on (rule 20.4). */
    const byUse = words.slice().sort((a, b) => a - b);
    // Two slots are production on core words; a lesson with more words than
    // fit keeps one slot for one of its others, or it would never be asked.
    const coreN = byUse.length > QN - 2 ? QN - 3 : QN - 2;
    const core = byUse.slice(0, coreN);
    const extra = byUse.slice(coreN);
    const bag = core.map(draw).filter(Boolean);
    /* Both production shapes, not just the first. `find(type) || find(cloze)`
       could never reach its second branch: `candidates` always ends with a
       `type`, so the gap-fill was unreachable here and every guaranteed
       production slot in the app was a typed one. */
    /* …and only for a word not already asked by production. A word drawn as
       `type` above and then again as the guaranteed `type` was the same
       question twice in one quiz, in 26 % of quizzes (the review,
       2026-10-01). */
    const produced = new Set(bag.filter((e) => PRODUCTION.includes(e.t)).map((e) => e.i));
    /* …and only a production shape the last attempt did not ask: in chapter 1
       the gap-fill is the only one left, and forcing it repeated the retake. */
    // A word barred from its meaning (meaningClash) produces only through a gap.
    const production = core.filter((i) => !produced.has(i))
      .map((i) => drawFrom(shapes(i).filter((e) => PRODUCTION.includes(e.t) && !avoid.has(`${e.t}:${i}`)
                                                   && !(barred.has(i) && MEANING.includes(e.t))), i))
      .filter(Boolean);
    shuffle(production).slice(0, 2).forEach((e) => { bag.push(e); if (e.t === "cloze") usedEx.add(fold(e.ex.ru)); });
    /* One word, one question — and where a word has two, the production one
       stays: «hello» chosen and then typed was the same word twice in one
       quiz (the learner agents, 2026-10-08). Done before the fill, so the
       quiz is topped up to its length rather than left short. */
    for (const e of bag.filter((x) => PRODUCTION.includes(x.t))) {
      for (let k = bag.length - 1; k >= 0; k--) {
        if (bag[k] !== e && bag[k].i === e.i && !PRODUCTION.includes(bag[k].t)) bag.splice(k, 1);
      }
    }
    const inBag = (i) => bag.some((e) => e.i === i);
    // The lesson's other words, where there is room before any review.
    for (const i of shuffle(extra)) {
      if (bag.length >= QN) break;
      const e = draw(i);
      if (e) bag.push(e);
    }
    /* **The rest is the chapter so far** (the owner, 2026-10-05: "accumulate
       words and grammar checks from the entire chapter… That's how we build.
       We integrate. Temporal memory of two words" is not learning). A lesson
       of two words used to fill its quiz with those two asked again; now the
       free slots go to the words this chapter has already taught — this
       unit's earlier lessons and the chapter's other units on the route —
       what is due among them first, then the weakest, then any. Past the
       chapter only when it has nothing left (a chapter's first lesson). */
    const stage0 = stageOf(unit);
    const ok = (i) => L[i] && !words.includes(i) && readable.has(i);
    const strengthOf = (i) => {
      const c = card(i);
      if (!c) return Infinity;
      const s = Object.values(c).map((d) => (d && typeof d.s === "number" ? d.s : Infinity));
      return Math.min(...s);
    };
    const dueSet = new Set(prefer || []);
    const chapterSoFar = unique(Array.from({ length: index }, (_, j) => lessonWords(unit, j)).flat()
      .concat(unitsUpTo(unit).filter((u) => u !== unit && stageOf(u) === stage0).flatMap((u) => u.w)))
      .filter(ok);
    const byNeed = (list) => {
      const due = shuffle(list.filter((i) => dueSet.has(i)));
      const rest = shuffle(list.filter((i) => !dueSet.has(i)));
      // Weakest first among the rest, with the order among equals left random.
      rest.sort((a, b) => strengthOf(a) - strengthOf(b));
      return due.concat(rest);
    };
    const fill = byNeed(chapterSoFar);
    const outside = byNeed(unitsUpTo(unit).filter((u) => stageOf(u) < stage0).flatMap((u) => u.w)
      .filter((i) => ok(i) && !chapterSoFar.includes(i)));
    /* **Older material is the minority** (the owner, 2026-10-09: "if 10
       questions, 8 of them should focus on current chapter and maybe 1 or 2
       on older concepts"). A quiz's budget for earlier chapters is
       OLD_SHARE of its length; the review word and the second drill (on
       earlier chapters' words) spend theirs first, and the fill from before
       this chapter gets what is left. A chapter's first lesson of five words
       had filled three slots that way and reached 7 older of 12; it asks a
       shorter quiz now instead of padding it with old words. */
    const reachedHere = unitsUpTo(unit);
    const drillsHere = Math.min(DRILL_MIX.perQuiz, drillsIntroduced(reachedHere).size);
    const oldMax = Math.max(1, Math.floor(OLD_SHARE * (QN + FORM_MIX.perQuiz + drillsHere + REVIEW_MIX.perQuiz + 1)));
    const reviewOld = stageHere > 0 ? REVIEW_MIX.perQuiz : 0;
    const drillOld = drillsHere > 1 && stageHere > 0 && oldMax - reviewOld > 0 ? 1 : 0;
    let outsideLeft = Math.max(0, oldMax - reviewOld - drillOld);
    const queueFill = fill.map((i) => ({ i, old: false })).concat(outside.map((i) => ({ i, old: true })));
    while (bag.length < QN && queueFill.length) {
      const { i, old } = queueFill.shift();
      if (inBag(i)) continue;                    // «мы» twice in one quiz
      if (old && outsideLeft <= 0) break;
      const e = draw(i);
      if (e) { bag.push(e); if (old) outsideLeft--; }
    }
    const out = spread(shuffle(bag).slice(0, QN)).map(present).filter(Boolean);
    const stage = stageOf(unit);
    // And the chapter's form, the same way: on top, never first — and not
    // beside another question about its word, since it has one.
    if (stage >= FORM_MIX.fromStage) {
      // Not the words the walk's grammar practice just asked (it is a fixed draw).
      const practised = drillsOwnRule(unit) ? grammarRun(unit, index, GRAMMAR_IN_LESSON).map((q) => q.i) : [];
      for (let k = 0; k < FORM_MIX.perQuiz; k++) {
        const q = formPrompt(unit, index, undefined, practised);
        // `chapter`: the chapter's own point, whatever its word (tools/quiz_mix.mjs).
        if (q) out.splice(slotApart(out, q), 0, { ...q, chapter: true });
      }
    }
    /* And Practice's drills, the ones the route has opened, on this chapter's
       own words (the owner, 2026-09-29: *"embed some of the exercises using
       the words from the chapter into each lesson"*). Different drills each
       time; a drill the chapter's words cannot fill reaches back along the
       route, as Practice does. */
    const reached = unitsUpTo(unit);
    const met = metBy(unit, index);
    const types = shuffle([...drillsIntroduced(reached)]).slice(0, DRILL_MIX.perQuiz);
    if (types.length) {
      /* The first drill on this chapter's words, the second on earlier
         chapters' — a conjugation challenge on a verb from two chapters back
         is spaced repetition in a different shape (the owner, 2026-10-04).
         Never a word from a later lesson of this unit (`metBy`). */
      const metSet = new Set(met);
      const chapter = reached.filter((u) => stageOf(u) === stage && u !== unit).flatMap((u) => u.w)
        .concat(unitSoFar(unit, index)).filter((i) => metSet.has(i));
      const before = reached.filter((u) => stageOf(u) < stage).flatMap((u) => u.w).filter((i) => metSet.has(i));
      types.forEach((type, k) => {
        /* Only what the route has introduced. The cases drill always kept to
           the cases taught (`cells`), but agreement and conjugation ignore
           `cells`, so a chapter-2 lesson asked the past and the imperative and
           a chapter-3 lesson the instrumental (the review, 2026-10-01). */
        const { cells, only } = routeDrill(type, reached);
        // Earlier chapters' words only while the older budget allows (above).
        const first = k === 1 && drillOld && before.length ? before : chapter;
        // Written, as the form question is: producing the form is the skill.
        const q = drillQuestions(type, 1, first, cells, true, only)[0]
          || drillQuestions(type, 1, met, cells, true, only)[0];
        if (q) out.splice(slotApart(out, q), 0, { ...q, drill: true, older: first === before });
      });
    }
    /* Spaced review: words from earlier in the route, asked again inside the
       lesson. What the app says is due or in trouble comes first (`prefer`),
       then the weakest the learner has a card for, then any — earlier
       chapters before this chapter's earlier units. */
    /* …and now and then a core word from before this chapter, to keep it
       fresh ("occasionally core learned words from outside the chapter"):
       the spines of earlier chapters, what is due first, then the weakest. */
    const asked = new Set(out.map((q) => q.i).filter((i) => typeof i === "number"));
    const prior = reached.filter((u) => u !== unit);
    const earlierCore = prior.filter((u) => stageOf(u) < stage && STAGES.some((s) => s.core === u))
      .flatMap((u) => u.w).filter((i) => readable.has(i));
    const sameCh = prior.filter((u) => stageOf(u) === stage).flatMap((u) => u.w).filter((i) => readable.has(i));
    /* Not a closed-class word of the top hundred: a review slot spent on «и»,
       «э́то» or «у» — met on every screen — reviews nothing (2026-10-12). */
    const everyday = (i) => i < LESSON_FREE_RANK && !CONTENT.has(L[i].p);
    const all = unique(byNeed(earlierCore).concat(earlierCore.length ? [] : byNeed(sameCh)))
      .filter((i) => !asked.has(i));
    const content = all.filter((i) => !everyday(i));
    const queue = content.length ? content : all;
    let added = 0;
    for (const i of queue) {
      if (added >= REVIEW_MIX.perQuiz) break;
      const e = draw(i);
      const q = e && present(e);
      if (!q) continue;
      out.splice(slotApart(out, q), 0, { ...q, review: true });
      asked.add(i);
      added++;
    }
    /* **One spoken step, rotating** (the learner agents, 2026-10-08: every
       quiz from chapter 2 carried listen-and-type, say-it and a build-up at
       once). Whichever of them the route has opened, one at random, at a
       random place after the first question. */
    const spoken = Object.keys(SPEECH_MIX).filter((kind) => speechFrom(kind, stage, index));
    const pronOpen = stage > PRON_MIX.fromStage || (stage === PRON_MIX.fromStage && index >= PRON_MIX.fromLesson);
    if (pronOpen) spoken.push("pron");
    const pickSpoken = spoken.length ? spoken[Math.floor(Math.random() * spoken.length)] : null;
    if (pickSpoken && pickSpoken !== "pron") {
      const e = speechPrompt(pickSpoken, unit, index);
      if (e) out.splice(1 + Math.floor(Math.random() * out.length), 0, present(e));
    }
    if (pickSpoken === "pron") {
      /* The lesson's own long words first; a lesson of pronouns and
         prepositions has none, so then the unit's earlier words, then the
         route's. One of them at random each time, so a retake builds another. */
      /* The route's words only while the older-material budget has room
         (OLD_SHARE): a chapter's first lesson with no long word of its own
         was building one from two chapters back on top of its review word. */
      const tiers = [words, Array.from({ length: index }, (_, j) => lessonWords(unit, j)).flat().filter((i) => readable.has(i)),
                     unitsUpTo(unit).filter((u) => outsideLeft > 0 || stageOf(u) === stageHere)
                       .flatMap((u) => u.w).filter((i) => readable.has(i))];
      for (const tier of tiers) {
        const cands = tier.filter((i) => !words.includes(i) || tier === words)
          .map((i) => ({ i, ru: L[i].w, en: firstSense(L[i]) }));
        /* Built a syllable at a time, then **said whole and assessed** (the
           owner, 2026-10-02: "for the test I'd expect them to press the mic
           button and hold and then the app assesses if they said it well"),
           with as many tries as they like and a way past for a learner who
           cannot speak just now. It counts in the mark and never in the
           scheduler: saying a word is not the claim of knowing it. */
        const [step] = buildupDrill(cands, 1, { listen: true });
        if (!step) continue;
        const i = cands.find((c) => c.ru === step.ru).i;
        const q = { ...step, i, assess: true };
        out.splice(slotApart(out, q), 0, q);
        break;
      }
    }
    return out;
  }

  /* What a run asked, in the form `quizSteps` takes back as `last`. The caller
     keeps it between attempts; it is a list of "shape:word", so it says nothing
     about whether the learner got them right and needs no schema of its own. */
  function stepKeys(steps) {
    return (steps || [])
      .filter((q) => q && q.kind && typeof q.i === "number" && !q.assess)
      .map((q) => `${q.kind}:${q.i}`);
  }

  /* A position after the first question whose neighbours are not about q's
     word; any position after the first when there is none. */
  /* A slot for a question spliced into a quiz: never beside another about its
     word, and by preference not beside one of its own shape. */
  function slotApart(out, q) {
    const clash = (x) => x && typeof x.i === "number" && x.i === q.i;
    const alike = (x) => x && x.kind === q.kind;
    const free = [];
    for (let p = 1; p <= out.length; p++) if (!clash(out[p - 1]) && !clash(out[p])) free.push(p);
    const apart = free.filter((p) => !alike(out[p - 1]) && !alike(out[p]));
    return apart.length ? pickOne(apart) : free.length ? pickOne(free) : 1 + Math.floor(Math.random() * out.length);
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
     box must still be able to ask a question, and the drill's cog keeps at
     least one ticked anyway (§30aw). */
  const allows = (only, id) => !only || !only.size || only.has(id);

  /* The question shapes a drill can be narrowed to. Dynamic where the route
     decides it — the cases a chapter-3 learner may be asked are the cases the
     route has introduced (`formsIntroduced`), not all six. Empty means the
     drill has nothing to narrow and its cog offers no "Ask about" row. */
  function drillFocus(type) {
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
    /* All six cases, not the route's (the owner, 2026-09-26). Until then the
       list was `formsIntroduced` and a chapter-3 learner could not be offered
       the instrumental; now the route's cases are the default ticks and the
       rest are there to tick. Agreement adds the adjective's stem class as a
       second thing to narrow by. */
    if (type === "cases") return CASE_ROWS.map((r) => ({ id: r, name: r }));
    if (type === "agreement") {
      return CASE_ROWS.map((r) => ({ id: r, name: r }))
        .concat(ADJ_STEMS.map((s) => ({ id: s.id, name: s.name, group: "stem" })));
    }
    return [];
  }

  /* The cases the route so far has introduced, as focus ids — the default
     ticks for the cases and agreement drills. Empty before any case chapter,
     which the caller reads as "all of them". */
  function defaultFocus(type, units) {
    if (type !== "cases" && type !== "agreement") return null;
    const rows = [];
    for (const c of formsIntroduced(units || [])) if (!rows.includes(c.row)) rows.push(c.row);
    if (!rows.length) return null;
    return type === "agreement" ? rows.concat(ADJ_STEMS.map((s) => s.id)) : rows;
  }

  /* What a drill spliced into a lesson — or a chapter's own point asked as a
     drill — may ask, read off the same cards as `formsIntroduced`: agreement
     in the nominative (chapter 3's card) and the cases taught since;
     conjugation in the tables the verb cards have introduced, read either
     way round. Null where the route sets no bound. A Practice drill keeps the
     learner's own selection (`drillFocus`, `defaultFocus`); this is only for
     questions the learner did not choose, which must not run ahead of the
     path (the review, 2026-10-01). */
  function routeFocus(type, units) {
    if (type === "agreement") {
      const rows = ["Nominative"];
      for (const c of formsIntroduced(units)) if (!rows.includes(c.row)) rows.push(c.row);
      return rows;
    }
    if (type === "conjugation") {
      const ids = [];
      for (const u of units) {
        const s = u.g && u.g.form;
        if (!s || s.pos !== "verb") continue;
        const v = VERB_TABLES.find((x) => x.re.test(s.table));
        if (v && !ids.includes(v.id)) ids.push(v.id);
      }
      return ids.length ? ids.concat("who") : null;
    }
    return null;
  }
  const routeDrill = (type, units) => ({ cells: formsIntroduced(units), only: routeFocus(type, units) });

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
                   prompt: w.w, sub: w.e || "", table: t, at: [target.ri, target.ci + 1] };
    if (typed) return written(base, `Write ${what}`, target.label, target.alts);
    /* One option per *form*, not per cell. A paradigm repeats itself — an
       inanimate noun's accusative is its nominative, an animate one's is its
       genitive — so taking three cells at random put the same word on screen
       twice in 18 % of questions (tools/audit_options.mjs). Two identical
       options are one option: the learner is choosing from three, and the
       repeat tells them it is not the answer. */
    /* …and never the headword, which is the prompt printed above the options:
       an option the learner can rule out by reading the screen is a free
       elimination, and it was one of the four in 44 % of these (the review,
       2026-10-01). `formQuestion` has barred it since the walkthrough of
       2026-09-09; this drill was left behind. Nor the target cell's other
       forms, which are right answers too. Compared folded, as there. */
    const wrong = [];
    const shown = new Set([target.label, w.w].concat(target.alts).map(fold));
    for (const o of shuffle(opts.slice())) {
      if (shown.has(fold(o.label))) continue;
      shown.add(fold(o.label));
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
    const w = pickWhere((x) => x.p === "verb" && partnersOf(x).length && x.a);
    if (!w) return null;
    const want = w.a === "imperfective" ? "perfective" : "imperfective";
    const partners = partnersOf(w);
    if (typed) {
      return written({ kind: "aspect", i: L.indexOf(w), cyr: true, prompt: w.w,
                       sub: w.e || "", note: (UN.find((u) => u.id === "core8") || {}).g },
                     `Write the ${want} partner`, partners[0], partners.slice(1));
    }
    // One of the partners, written as the lexicon accents it where it can: an
    // unmarked answer among marked distractors is a tell of its own.
    const right = verbLabel(pickOne(partners));
    const wrong = partnerWrong(w, right);
    if (!wrong) return null;
    return {
      kind: "aspect", i: L.indexOf(w), cyr: true,
      ask: `Choose the ${want} partner`, prompt: w.w, sub: w.e || "",
      note: (UN.find((u) => u.id === "core8") || {}).g,
      options: optionsOf(right, wrong),
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
    /* The accented spelling of every verb the curriculum carries, and every
       verb's partners both ways round — what a distractor must not be. A wrong
       option the lexicon records as a partner of the prompt (or that records
       the prompt as *its* partner) is a second right answer: «ви́деть» was
       offered «уви́деть» beside «завидеть» (the review, 2026-10-01). */
    const accented = new Map(), pairs = new Map();
    const pair = (a, b) => {
      if (!pairs.has(a)) pairs.set(a, new Set());
      pairs.get(a).add(b);
    };
    for (const x of L) {
      if (x.p !== "verb") continue;
      if (!accented.has(fold(x.b))) accented.set(fold(x.b), x.w);
      for (const p of partnersOf(x)) { pair(fold(x.w), fold(p)); pair(fold(p), fold(x.w)); }
    }
    for (const x of L) {
      if (x.p !== "verb") continue;
      for (const raw of [x.w].concat(partnersOf(x))) {
        const cand = accented.get(fold(raw)) || raw;
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
    verbIndex = { cands, byGram, byLen, accented, pairs };
    return verbIndex;
  }
  const verbLabel = (p) => verbIndexed().accented.get(fold(p)) || p;

  function partnerWrong(verb, answer) {
    const promptWord = verb.w;
    const pf = fold(promptWord), af = fold(answer);
    const ps = verbStem(promptWord), as = verbStem(answer);
    const { pairs } = verbIndexed();
    const partnered = pairs.get(pf) || new Set();
    const isPartner = (f) => partnered.has(f) || (pairs.get(f) || new Set()).has(pf);
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
          if (f !== af && f !== pf && !isPartner(f)) related.add(i);
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
          if (!related.has(i) && f !== af && f !== pf && !isPartner(f)) ring.push(i);
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
  /* The noun is one the corpus actually puts after this adjective (`PAIRS`,
     built from adjacent tokens by build_site.py). Any adjective with any noun
     asked for «половая ягода» — "sexual berry" (the owner, 2026-09-24); a
     pair a sentence has said is a pair worth agreeing. An adjective with no
     attested partner is passed over. */
  const nounOk = (x) => x && x.p === "noun" && ["m", "f", "n"].includes(x.g) && !x.pl
                        && tableTitled(x, /Declension/);
  function qAgreement(_cells, typed, only) {
    /* Narrowed to a stem class, only adjectives of that class; a selection
       naming no stem at all is every stem, the rule `verbTable` follows for a
       selection naming no table. */
    const stems = ADJ_STEMS.filter((s) => allows(only, s.id)).map((s) => s.id);
    const stemOk = (x) => !stems.length || stems.includes(adjStem(x.b));
    /* Not the pronoun-like adjectives: the corpus pairs them with anything
       («тот приве́т», «сам факт», «весь мужчи́на»), and the pair reads as
       nonsense (the learner agents, 2026-10-08). */
    const partners = (x) => (PAIRS[L.indexOf(x)] || []).map((i) => L[i]).filter(nounOk);
    const eligible = (x) => x.p === "adjective" && stemOk(x) && tableTitled(x, /Declension/)
                                 && !PRONOMINAL.has(fold(x.b)) && partners(x).length;
    /* An adjective the corpus pairs with a noun the learner is practising,
       before any adjective at all: chapter 3's agreement used to ask «своя́»
       of «це́рковь», «изба́», «бума́га» — nouns from chapter 9 or nowhere —
       because the adjective was picked first and the noun fell back to
       whatever the corpus had (the review, 2026-10-12). */
    const ours = (x) => drillPool && partners(x).some((n) => drillPool.includes(n));
    const adj = (drillPool && pickWhere((x) => eligible(x) && ours(x), 150)) || pickWhere(eligible);
    if (!adj) return null;
    // …but not a plural-only noun: «часы» is plural, and «но́вый часы» is not
    // agreement.
    const nouns = partners(adj);
    /* A noun from the words being practised when the corpus pairs one with this
       adjective — a chapter's grammar run asked «поэ́том» and «усло́вии» of a
       chapter that teaches neither — and any attested partner otherwise. */
    const practised = drillPool ? nouns.filter((x) => drillPool.includes(x)) : [];
    const from = practised.length ? practised : nouns;
    const noun = from.length ? from[Math.floor(Math.random() * from.length)] : null;
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
    const nounForm = nt.rows.find((x) => x[0] === row[0])[1][0];
    /* The masculine accusative cell holds two forms — «твой» for a thing,
       «твоего́» for a person or an animal — and the first was always taken, so
       the drill asked «___ отца́» and wanted «тво́й». The noun says which: an
       animate noun's accusative is its genitive.
     *
     * Animacy is read off the **plural**: an animate noun's accusative plural
     * is its genitive plural (мужчи́н, отцо́в; but столы́, столо́в). The singular
     * cannot say it for the masculine nouns in -а/-я — «мужчи́ну» is neither
     * nominative nor genitive — and reading it there wanted «жена́тый мужчи́ну»
     * (the review, 2026-09-30). */
    const pl = nt.columns.indexOf("Plural");
    const aPl = t.columns.indexOf("Plural");
    const nAcc = nt.rows.find((x) => x[0] === "Accusative");
    const nGen = nt.rows.find((x) => x[0] === "Genitive");
    const accPl = pl > 0 && nAcc && nAcc[pl], genPl = pl > 0 && nGen && nGen[pl];
    const animate = !!(accPl && genPl && accPl.length && accPl.some((f) => genPl.some((g) => fold(g) === fold(f))));
    /* The adjective's forms for one case and column — for a two-form
       accusative cell, the one this noun's animacy takes. */
    const agreeing = (label, c) => {
      const r = t.rows.find((x) => x[0] === label);
      const forms = ((r && r[c]) || []).filter(Boolean);
      if (label !== "Accusative" || forms.length < 2) return forms;
      const ref = t.rows.find((x) => x[0] === (animate ? "Genitive" : "Nominative"));
      const hit = forms.filter((f) => ((ref && ref[c]) || []).some((g) => fold(g) === fold(f)));
      return hit.length ? hit : forms;
    };
    const asked = agreeing(row[0], col);
    if (!asked.length) return null;
    const right = asked[0];
    /* Never a form that is the adjective printed beside the gap: the masculine
       nominative answered itself («___ ребёнок · ма́ленький → ма́ленький»).
       The caller draws again. */
    if (fold(right) === fold(adj.w)) return null;
    /* **Every reading of the noun form, not only the one drawn.** A noun form
       is often two cells at once — «ле́кции» is genitive singular and
       nominative plural, «мужчи́не» dative and prepositional — and the typed
       question named neither, so «но́вые ле́кции», which is correct Russian,
       was marked wrong in 18 % of typed questions (the review, 2026-10-01).
       The case asked is stated now, as the chosen question always stated it;
       and an answer that agrees with any reading is still accepted when
       written, and never offered as a wrong option when chosen. */
    const readings = new Set(asked.map(fold));
    const nf = fold(nounForm);
    for (const nr of nt.rows) {
      if (!CASE_ROWS.includes(nr[0])) continue;
      for (const [nc, ac] of [[1, col], [pl, aPl]]) {
        if (nc < 1 || ac < 1 || !(nr[nc] || []).some((f) => fold(f) === nf)) continue;
        agreeing(nr[0], ac).forEach((f) => readings.add(fold(f)));
      }
    }
    const at = [t.rows.indexOf(row), col];
    const sub = `${firstSense(adj)} ${firstSense(noun)} · ${row[0].toLowerCase()}`;
    if (typed) {
      return written({ kind: "agreement", i: L.indexOf(adj), cyr: true,
                       prompt: `___ ${nounForm}`, sub: `${adj.w} · ${sub}`,
                       table: t, at },
                     "Write the form that agrees", right,
                     [...readings].filter((f) => f !== fold(right)));
    }
    const own = t.rows.flatMap((r) => cellsOf(r).map((c) => (Array.isArray(c) ? c[0] : c)));
    const wrong = threeWrong(right, own.filter((f) => f && !readings.has(fold(f))));
    if (!wrong) return null;
    return {
      kind: "agreement", i: L.indexOf(adj), cyr: true,
      ask: "Choose the form that agrees", prompt: `___ ${nounForm}`,
      sub, table: t, at,
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
    // In a lesson, a tense the route has taught and a verb that keeps its
    // pattern: no "write the future" of «найти́» in chapter 4 (verbTableTaught).
    const w = pickWhere((x) => x.p === "verb" && tableTitled(x, re)
      && verbTableTaught(x, tableTitled(x, re).title) && regular(x));
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
    const note = conjugationNote(w, t, target);
    const at = [t.rows.indexOf(target), 1];
    if (typed) {
      const label = t.title === "Imperative" ? "imperative"
        : t.title === "Past" ? "past" : (w.a === "perfective" ? "future" : "present");
      return written({ kind: "conjugation", i: L.indexOf(w), cyr: true,
                       prompt: w.w, sub: w.e || "", table: t, note, at },
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
      ask: `Choose the ${what} for “${target[0]}”`, prompt: w.w, sub: w.e || "", table: t, note, at,
      options: optionsOf(right, wrong),
    };
  }

  /* The feedback for a conjugation miss is about *this* verb and *this* form
     (the owner, 2026-09-24: *"the feedback on the conjugation is totally
     irrelevant to what I got wrong… needs to be relevant to what's being
     input"*). The chapter's "two verb patterns" card said nothing about
     «возникнуть», so it is not attached here; the note is built from the
     verb's own table: which pattern it follows, read off its они form, whether
     its present is a future, and the whole paradigm as the examples with the
     asked row first. */
  /* The present table's third-person row is labelled «он / она» in one cell,
     and its examples came out with no English (the review, 2026-10-01). */
  const PERSON_EN = { "я": "I", "ты": "you", "он": "he", "она": "she", "оно": "it",
                      "он / она": "he / she", "он / она / оно": "he / she / it",
                      "мы": "we", "вы": "you (plural)", "они": "they" };
  function conjugationNote(w, t, target) {
    const rows = t.rows.filter((r) => r[1] && r[1].length);
    const they = rows.find((r) => r[0] === "они");
    const ending = they ? fold(they[1][0]).slice(-2) : "";
    const first = ending === "ут" || ending === "ют";
    const second = ending === "ат" || ending === "ят";
    const lines = [];
    if (/^Present/.test(t.title)) {
      lines.push(w.a === "perfective"
        ? `«${w.w}» is perfective: these forms are its future — there is no present.`
        : `«${w.w}» is imperfective: these forms are its present.`);
      if (first) lines.push("First conjugation (the -е- pattern): -у/-ю, -ешь, -ет, -ем, -ете, -ут/-ют.");
      else if (second) lines.push("Second conjugation (the -и- pattern): -у/-ю, -ишь, -ит, -им, -ите, -ат/-ят.");
    } else if (/^Past/.test(t.title)) {
      lines.push("The past tense agrees with the subject's gender and number, not its person.");
    } else if (/^Imperative/.test(t.title)) {
      lines.push("The imperative is built on the stem of the они form.");
    }
    const ordered = [target].concat(rows.filter((r) => r !== target));
    return {
      title: `«${w.w}» — ${t.title.toLowerCase()}`,
      body: lines.join(" "),
      examples: ordered.slice(0, 8).map((r) => [`${r[0]} ${r[1][0]}`, PERSON_EN[r[0]] || ""]),
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
      // Here the answer is the row's *label*, not a form, so that is the cell
      // the reference marks.
      ask: "Whose form is this?", prompt: target[1][0], sub: firstSense(w), table: t,
      at: [t.rows.indexOf(target), 0],
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
    /* A wrong stress must be wrong. «пла́тите» (you pay) and «плати́те» (pay!)
       are both forms of «плати́ть», spelled alike, so offering the second as a
       wrong answer to the first was a question with two right answers (the
       review, 2026-10-01). A placement the word's own paradigm uses is never
       a distractor. */
    const real = new Set(paradigmForms(w).concat(w.w).map((f) => f.normalize("NFC")));
    const variants = positions
      .map((k) => (plain.slice(0, k + 1) + "́" + plain.slice(k + 1)).normalize("NFC"))
      .filter((v) => fold(v) === fold(accented) && v !== accented.normalize("NFC") && !real.has(v));
    // Two options is a coin flip, not a drill — a word needs enough vowels to
    // place the stress somewhere genuinely wrong at least twice.
    if (variants.length < 2) return null;
    return {
      kind: "stress", i: L.indexOf(w), cyr: true,
      ask: "Choose where the stress falls", prompt: plain, sub: w.e || "", say: plain,
      options: shuffle([accented.normalize("NFC")].concat(shuffle(variants).slice(0, 3)))
        .map((s) => ({ label: s, right: s === accented.normalize("NFC"), cyr: true })),
    };
  }

  function qStress() {
    const w = pickWhere((x) => /́/.test(x.w) && x.b.length > 3);
    if (!w) return null;
    // The headword about half the time, else one of its inflected forms — in
    // a lesson only a form the route has taught, and never the bookish -ою/-ею
    // instrumental («ма́мою», «страно́ю»), which nobody says.
    if (Math.random() < 0.5) {
      const bookish = (f) => fold(f).length > 4 && /(ою|ею)$/.test(fold(f));
      const forms = shuffle(paradigmForms(w).filter((f) => /́/.test(f) && !bookish(f)
        && formTaught(L.indexOf(w), f)));
      for (const f of forms.slice(0, 6)) {
        const q = stressQuestion(w, f);
        if (q) return q;
      }
    }
    return stressQuestion(w, w.w);
  }

  /* The Grammar rules drill — "choose the rule this shows", "which sentence
     shows X", "what form is this" — was here until 2026-09-18 (see DRILL_TYPES).
     Its cards are `note`s on the questions that use them now. */

  /* The card a question is built on, for the runner to show under a wrong
     answer (§30al): the unit's own when it defines the form, else the chapter
     spine's it inherited from — found by the spec object itself, so this cannot
     disagree with `formSpec` about where a spec came from. */
  function formNote(unit) {
    const spec = formSpec(unit);
    if (!spec) return null;
    const owner = [unit].concat(unitsUpTo(unit)).find((u) => u.g && u.g.form === spec);
    return owner ? owner.g : null;
  }

  /* The card that introduces a practice drill: the first unit on the route
     whose grammar teaches it. Stress has none — it is not a rule the path
     introduces. */
  function noteForDrill(drill) {
    if (drill === "stress") return null;
    for (const s of STAGES) {
      for (const u of [s.core].concat(s.branches || [])) {
        if (u.g && drillsIntroduced([u]).has(drill)) return u.g;
      }
    }
    return null;
  }

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
                conjugation: qConjugation, stress: qStress };

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
    // A count of 0 is zero questions; only an unset count means the default.
    const want = n === undefined || n === null ? DRILL_N : n;
    if (!want) return [];
    const set = only && only.length ? new Set(only) : null;
    // The chapter card that teaches this drill rides on every question, for the
    // runner to show under a wrong answer. Aspect's generator sets its own.
    const note = noteForDrill(type);
    withPool(pool, () => {
      for (let k = 0; k < want * 25 && out.length < want; k++) {
        const q = GEN[type] && GEN[type](cells, typed, set);
        if (!q) continue;
        const key = drillKey(q);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(!q.note && note ? { ...q, note } : q);
      }
    });
    return out;
  }

  return {
    distractors, clozeFor, candidates, present, poolFor, speechPrompt, stageOf, unitsUpTo,
    vocabSteps, quizSteps, stepKeys, placementQuestions, sectionQuestions, drillQuestions, drillKey,
    sceneFor, lessonPassage, scriptScene, writtenPassage, shadowDrill,
    customQuiz, finalExam, recapQuestions, formPrompt, formSpec, formsIntroduced, drillFocus, defaultFocus, routeFocus, grammarRun,
    drillsIntroduced, withTaught, caseLesson, caseDrill, caseCounts, casePoolSize, metBy,
  };
}
