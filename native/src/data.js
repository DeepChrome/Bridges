/* The generated payload and the curriculum logic that reads it.
 *
 * data.json is written by tools/build_site.py, the same bytes the web build embeds,
 * so both platforms are always a single generation of the pipeline.
 */

import DATA from "../assets/data.json";
import { fold, today } from "@core/util";

/* The three heavy parts of the payload — the dictionary (4.5 MB), the sentence
   pool and the video library, seventy per cent of the bytes — live in their own
   files and are required on first use, not at boot (P9.24). Nothing on the first
   screen needs them: a lesson reads the pool for its first example sentence,
   Immerse the library, a search the dictionary. */
const deepBlob = () => require("../assets/deep.json");
const sentPool = () => require("../assets/sent.json");
export const videos = () => require("../assets/videos.json");
/* A video's transcript for the player's panel: [[start ms, text, word
   offsets in cs]] (build_site.py `video_transcripts`). Required on first open;
   a public build ships none, and the panel then has nothing to offer. */
export function transcriptOf(id) {
  const all = require("../assets/transcripts.json");
  return (all && all[id]) || null;
}
/* The same lines in English, machine-translated (tools/build_transcript_en.py),
   one string per line and "" where a line has none; null when the video has
   none at all. Required only when the English is first shown. */
export function transcriptEnOf(id) {
  const all = require("../assets/transcripts_en.json");
  return (all && all[id]) || null;
}
/* Numbered senses for the studied words (tools/ingest_wiktionary.py, §30q).
   Required when a word is opened, which is never the first screen. */
const sensesBlob = () => require("../assets/senses.json");
import { rankEndings } from "@core/endings";
import { makeSearch, makeResolve, parseDeep } from "@core/search";
import { makeHydrator, makeDeepIndex } from "@core/entry";
import { lessonSize, lessonCountOf, lessonWordsOf } from "@core/questions";
import { quizPassed } from "@core/state";
import { wanted, cardFor, dayOf, familiarity, strength } from "@core/scheduler";
import { rollGoal, goalBadge } from "@core/queue";
import { isIrregular } from "@core/facts";
import { CASES } from "@core/cases";

/* The word endings, commonest first across every sentence the app carries
   (core/endings.js). Counted once and kept: about a tenth of a second over
   20,425 sentences in Node, and the pool has to be parsed on the way, so it
   happens on the first visit to the screen and never on boot. */
/* A dictionary sentence's English by its Russian, built on first use: a
   flashcard made from a lesson summary's example sentences is one of these,
   not a pooled sentence, and it came up with no English when turned (the
   owner, 2026-10-09). */
let sentenceEnglish = null;
export function englishOfSentence(ru) {
  if (sentenceEnglish === null) {
    sentenceEnglish = new Map();
    for (const r of sentPool()) if (r[1] && !sentenceEnglish.has(r[0])) sentenceEnglish.set(r[0], r[1]);
  }
  return sentenceEnglish.get(ru) || "";
}

let endingsRanked = null;
export function endingsByFrequency() {
  if (endingsRanked === null) endingsRanked = rankEndings(sentPool().map((r) => r[0]));
  return endingsRanked;
}

export const L = DATA.lemmas;
export const IX = DATA.index;
export const UN = DATA.units;
export const PATH = DATA.path;
export const STATS = DATA.stats;
export const AUDIO = (DATA.audio && DATA.audio.files) || {};
/* The speaking and listening pools (CLAUDE.md §30b): one shared row list, and per
   unit the rows each activity may draw from. */
export const SPEECH = DATA.speech || { rows: [], speak: {}, listen: {} };
/* The written lesson passages (§30l), keyed "unitId:lessonIndex": four or five
   sentences on one subject, using only what that lesson has taught. Small enough
   to sit in data.json, and the lesson quiz asks for one before it has drawn a
   single card, so it must be here at boot rather than required on use. */
export const SCRIPTS = DATA.scripts || {};
/* Adjective → nouns the corpus says after it (build_site.py), for the
   agreement drill: keyed by the adjective's lemma index. */
export const PAIRS = DATA.pairs || {};
/* The creators the library draws on — name, YouTube url, and where to support
   them (Patreon, a site) where that was found; data/curated/channels.json. */
export const CHANNELS = DATA.channels || [];
/* The Immerse library (`videos()` above): every harvested video with a
   transcript, its search keywords, and the study words it actually says (with
   moments). A unit's own episode is also here, marked with `unit`. */
export const videoById = (id) => videos().find((v) => v.id === id) || null;
export const videoWatched = (st, v) =>
  !!((st.watched || {})[v.id]) || (!!v.unit && !!unitState(st, v.unit).video);

/* Where a word is heard: every video that says it, with the moment (the owner,
   2026-09-08 — a definition should lead to a native speaker saying the word).
   Built once from the library's own word lists on first use, so an entry never
   scans three hundred videos to find its rows. A unit's episode lists the
   unit's words under `heard` and the library entry the rest; both count. */
let heardIndex = null;
export function heardIn(bare) {
  if (!heardIndex) {
    heardIndex = new Map();
    const add = (v, words) => {
      for (const w in words) {
        const occ = words[w];
        if (!occ || !occ.length) continue;
        if (!heardIndex.has(w)) heardIndex.set(w, []);
        const rows = heardIndex.get(w);
        if (!rows.some((r) => r.id === v.id)) rows.push({ id: v.id, title: v.title, ch: v.ch, n: occ.length, ...occ[0] });
      }
    };
    const episodes = new Set(UN.filter((u) => u.v).map((u) => u.v.id));
    for (const u of UN) if (u.v && u.v.heard) add(u.v, u.v.heard);
    for (const v of videos()) add(v, v.words);
    // A unit's own episode first, then where the word is said most.
    for (const rows of heardIndex.values()) {
      rows.sort((a, b) => (episodes.has(b.id) - episodes.has(a.id)) || (b.n - a.n));
    }
  }
  return heardIndex.get(bare) || [];
}

/* What a word means, as a dictionary would lay it out: numbered senses, each
 * with the labels that change how it is read (figurative, colloquial, archaic)
 * and, where Wiktionary has one, an attested example with its translation.
 *
 * The owner, 2026-09-11: *"every single word should have a detailed entry with
 * multiple uses of the word"*. The app was not hiding them — OpenRussian gives a
 * list of translations rather than senses, and 89% of the studied words had
 * exactly one. 58% have more than one now (§30q).
 *
 * By lemma index, since that is what a card and an entry already hold. Read on
 * first use and kept: the file is a megabyte and the parse is once per session.
 */
let senseIndex = null;
export function sensesOf(i) {
  if (i === undefined || i === null || i < 0) return null;
  if (!senseIndex) senseIndex = sensesBlob() || {};
  const s = senseIndex[String(i)];
  return s && s.length ? s : null;
}

/* Chapters come straight from the path layout: a spine unit, its title, and the
   themed units that follow it. */
export const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) {
      out.push({ core: UN[p.u], branches: [],
                 n: p.cn || out.length + 1, title: p.ch || "" });
    } else {
      out[out.length - 1].branches.push(UN[p.u]);
    }
  });
  return out;
})();

/* Which column each unit sits in: -1, 0 or +1. build_topics.py already lays the path
   out this way, so the route meanders the way the curriculum says rather than by an
   alternation invented in a screen. Kept as a lookup so STAGES.branches stays a plain
   list of units — unitUnlocked and nextLesson both rely on that. */
export const COL = (() => {
  const out = {};
  PATH.forEach((p) => { const u = UN[p.u]; if (u) out[u.id] = p.c || 0; });
  return out;
})();

/* The wider dictionary: headwords and meanings for every glossed lemma in the
   lexicon, not just the ones the curriculum teaches. Required and parsed on first
   use — a search, or a word link to a word the curriculum does not teach — never
   at a cold start. */
let deepCache = null;
const deepList = () => {
  if (deepCache === null) deepCache = parseDeep(deepBlob() || "");
  return deepCache;
};

let deepMap = null;
const deepIndex = () => {
  if (deepMap === null) deepMap = makeDeepIndex(deepList());
  return deepMap;
};

/* Tables and example sentences are stored once, shared, and rebuilt per entry —
   see core/entry.js. Screens keep reading `w.t` and `w.x` as they always have. */
export const hydrate = makeHydrator({
  deepIndex, shapes: DATA.shapes, slots: DATA.slots, sent: sentPool,
});

/* For the curriculum's own words. Lessons, drills and flashcards read `w.x` and
   `w.t` straight off these objects in a dozen places; registering them here means
   no call site can be missed and quietly lose its example sentences. Cheap: the
   tables and sentences are built on first read, not here (core/entry.js). */
L.forEach(hydrate);

const rawSearch = makeSearch({ L, IX, deep: deepList });
const rawResolve = makeResolve({ L, IX, deep: deepList });

export const searchWords = (q, limit) => rawSearch(q, limit).map(hydrate);
export const searchWordsScored = (q, limit) =>
  rawSearch.scored(q, limit).map((x) => ({ entry: hydrate(x.entry), score: x.score }));
/* `pos` picks between homographs — «есть» the verb and «есть» "there is" —
   where the caller knows which it meant (a search hit does). */
export const resolveWord = (w, pos) => {
  const hit = rawResolve(w, pos);
  return hit ? hydrate(hit) : null;
};

/* A form in the app's text that is not a course word, to its dictionary
   headword and part of speech (build_site.py `build_deep_forms`): what makes
   «палатку» in a sentence a link to «палатка». Required on the first tap of
   such a word. Null when the dictionary has nothing for it. */
let deepForms = null;
export function deepFormOf(surface) {
  if (!deepForms) {
    try { deepForms = require("../assets/deepforms.json") || {}; } catch (e) { deepForms = {}; }
  }
  const hit = deepForms[fold(surface || "")];
  if (!hit) return null;
  const bar = hit.lastIndexOf("|");
  return { word: hit.slice(0, bar), pos: hit.slice(bar + 1) };
}

/* Which chapter a unit belongs to — the spine unit that opens it, or any of its
   themed units. Used by the headers so a screen can say where the learner is. */
export function chapterOf(unitId) {
  for (const s of STAGES) {
    if (s.core.id === unitId || s.branches.some((b) => b.id === unitId)) return s;
  }
  return null;
}

export const unitById = (id) => UN.find((u) => u.id === id) || null;

export { PASS_MARK, RELIEF_MARK, RELIEF_AFTER, DRILL_PASS, SHADOW_PASS } from "@core/state";

/* A unit's lessons as the build cut them, groups whole (core/questions.js
   lessonWordsOf); the chapter's ramp size only for a payload without the cut. */
const stageIndexOf = (u) =>
  STAGES.findIndex((s) => s.core === u || s.branches.includes(u));
const unitLessonSize = (u) => lessonSize(stageIndexOf(u));
export const lessonCount = (u) => lessonCountOf(u, unitLessonSize(u));
export const lessonWords = (u, i) => lessonWordsOf(u, i, unitLessonSize(u));
/* What a lesson is about, by name: the groups of related words it teaches
   (`gr`, build_site.py — "Greetings", "Pronouns"), in the unit's reading
   order. A lesson is cut from whole groups (§30bi), so its groups are its
   title; a word list («э́то, в, на…») was a list, not a name (COURSE-ROADMAP
   WP6). A unit shipped without groups names nothing, and the caller falls
   back to the words. */
export function lessonGroups(u, i) {
  const words = new Set(lessonWords(u, i));
  return (u.gr || []).filter(([, , ws]) => ws.some((w) => words.has(w))).map(([name]) => name);
}

export const unitState = (st, id) =>
  st.unit[id] || { best: 0, done: false, lessons: {}, video: false };

/* A lesson's steps, in the order a lesson runs (the owner, 2026-10-02: "the
   overall flow should be vocab, drill, quiz, summary, video"): the new words,
   the chapter's grammar on them, the quiz, the conversation where there is
   one, a summary that preps the video, and the video. Any of them may be
   opened in any order; the order is what Continue walks (`nextComponent`).
   The video belongs to the unit — one video covers a unit's worth of
   vocabulary — so watching it counts for every lesson. */
export function components(st, u, i) {
  const s = unitState(st, u.id);
  const l = (s.lessons || {})[i] || {};
  const out = [{ id: "vocab", label: "Vocabulary", done: !!l.v }];
  /* The chapter's grammar point is practised inside the vocabulary walk,
     which ends on questions on the rule; the ten-question run of it
     (GrammarFlow) is the unit screen's and Practice's, not a lesson step. It
     was one until 2026-10-08, when the learner agents found it duplicated the
     walk on every lesson's step list. */
  /* The case this chapter brings in, taught on its own (core/cases.js; the
     owner, 2026-10-08: "embed these specific modules into chapters where they
     make sense"): the spine's first lesson of chapters 5–9, after the rule.
     Optional, like every step added to lessons already finished; done once
     its lesson has been run. */
  const caseHere = caseOfLesson(u, i);
  if (caseHere) {
    out.push({ id: "case", label: `${caseHere.name} case`, optional: true, caseId: caseHere.id,
               done: !!((st.drills || {})[caseLearnKey(caseHere.id)]) });
  }
  out.push({ id: "quiz", label: "Quiz", score: l.q, tries: l.tries || 0, done: quizPassed(l) });
  /* The lesson's conversation, where one was written for it — a couple a
     chapter, on the spine (§30af). The owner, 2026-09-17: *"you can have them listed along with the
     lesson content..like where it says vocab lesson quiz video"*. It is listed
     as a step because that is where a learner looks for what a lesson contains;
     it is **optional** because making it required would un-finish lessons he has
     already completed, shrink `lessonsDone`, and move where the path thinks he
     is — new material appearing in old lessons must not rewrite old progress
     (rule 20.4's spirit).

     Done is read off the run the Listening flow already records for a chosen
     conversation (`scene:<unit>:<index>` in `drills`), not a new flag: a second
     place to record the same fact is a second thing to keep in step (§22). */
  if (featuresListening(u, i)) {
    out.push({ id: "listen", label: "Listening", optional: true,
               done: !!((st.drills || {})[`scene:${u.id}:${i}`]) });
  }
  /* What the lesson taught, reviewed before the video (2026-09-29). Optional:
     listed so it is found, never owed. */
  out.push({ id: "summary", label: "Summary", optional: true, done: !!l.s });
  /* **The video closes the unit, not every lesson** (the owner, 2026-10-05:
     "I watched the lesson 1 family video and then the next lesson after was
     using a lot of cards and sentences from the previous video… words for the
     video should be taught prior to the video"). A unit's words are cut from
     its video (§30bf), so only its last lesson has taught them all; offered
     after lesson 1, the video came before most of what prepares for it. Its
     words, the video and its questions are the last lesson's steps. Earlier
     lessons simply no longer list it, which finishes them sooner rather than
     undoing anything. */
  const closes = i === lessonCount(u) - 1;
  /* The video step opens its summary first — the words it says, with their
     flashcards — and the video from there (the owner, 2026-10-06: "summary
     (flashcard option…) -> video -> questions"); the separate "Video words"
     step that did the same cards went with it. */
  if (u.v && closes) out.push({ id: "video", label: "Video", done: !!s.video, shared: true });
  /* The video's five questions, after it (the owner, 2026-10-05: "you can
     throw video questions on that page after the video"). Optional, like
     every step added to lessons already finished, and shared with the video:
     done is the run recorded under its key (flows/VideoQuiz.js videoQuizKey). */
  if (u.v && u.v.quiz && closes) {
    out.push({ id: "vquiz", label: "Video questions", optional: true, shared: true,
               done: !!((st.drills || {})[`vquiz:${u.v.id}`]) });
  }
  return out;
}

/* The step Continue opens: the first one left **after the furthest one done**,
   so the lesson runs in order — optional steps included — and a step the
   learner chose to skip past is not pointed at again. Failing that, a required
   step still owed (a quiz not yet passed), and failing that anything left. */
/* Where a lesson step is: `[route, params]` on the Learn stack. The one table
   the path's Continue, the lesson screen and the end of a step all read, so
   none of them can send a step somewhere the others do not. */
export function stepRoute(id, u, i) {
  if (id === "listen") return ["Scenes", { key: `${u.id}:${i}` }];
  if (id === "vquiz") return ["VideoQuiz", { unitId: u.id, index: i, videoId: u.v && u.v.id }];
  if (id === "case") {
    const c = caseOfLesson(u, i);
    return ["CaseRun", { caseId: c && c.id, mode: "learn", unitId: u.id, index: i }];
  }
  const name = { vocab: "Vocab", quiz: "Quiz", summary: "Summary",
                 video: "VideoSummary" }[id] || "Vocab";
  return [name, { unitId: u.id, index: i }];
}

export function nextComponent(cs) {
  let last = -1;
  cs.forEach((c, k) => { if (c.done && !c.shared) last = k; });
  return cs.find((c, k) => k > last && !c.done)
    || cs.find((c) => !c.done && !c.optional)
    || cs.find((c) => !c.done) || null;
}

/* What a finished step leads on to: the first step of the lesson after the
   named one that is not done yet (`skip` names steps a caller sends elsewhere),
   or null at the end. One reader for the quiz, the case module and the summary,
   which each used to scan the components by hand (WP8.9). */
export function afterStep(st, u, i, id, skip = []) {
  const cs = components(st, u, i);
  const at = cs.findIndex((c) => c.id === id);
  return cs.find((c, k) => k > at && !c.done && !skip.includes(c.id)) || null;
}

/* Whether a unit has a grammar point to practise: its card's `form`, or its
   chapter spine's (a side quest inherits it, as core/questions.js formSpec
   does). Chapter 1 has none. Read here rather than off the questions module,
   which imports this one. */
export function grammarNoteOf(u) {
  if (u.g && u.g.form) return u.g;
  const s = STAGES.find((x) => x.core.id === u.id || x.branches.some((b) => b.id === u.id));
  return s && s.core.g && s.core.g.form ? s.core.g : null;
}
export const hasGrammar = (u) => !!grammarNoteOf(u);
/* The unit whose grammar Practice offers: the one Continue is in, or the
   latest reached that has a point (chapter 1 has none). */
export function currentGrammarUnit(st) {
  const next = nextStep(st);
  if (next && hasGrammar(next.unit)) return next.unit;
  return reachedUnits(st).slice().reverse().find(hasGrammar) || null;
}
/* Where a grammar run is recorded: a lesson's, or the unit's own module. */
/* The case modules' run keys in `drills`: the lesson, and the drill. */
export const caseLearnKey = (id) => `case:${id}`;
export const caseDrillKey = (id) => `casedrill:${id}`;
/* The case a lesson carries: its chapter's, on the spine's first lesson. */
export function caseOfLesson(u, i) {
  if (i !== 0) return null;
  const k = STAGES.findIndex((s) => s.core === u);
  return k < 0 ? null : CASES.find((c) => c.stage === k) || null;
}

export const grammarKey = (u) => `grammar:${u.id}`;

/* Which lessons *feature* their conversation as a step on the lesson screen.
 *
 * Having a script and featuring it are different questions, and conflating them
 * put a Listening step on all fourteen of chapter 1's lessons — the owner,
 * 2026-09-17: *"You dont have to embed it into every single lesson. just 1 or 2
 * lessons per chapter where it's featured."* There are two a chapter now, on
 * the spine, and each sits on the lesson whose words it uses: when related
 * words were grouped (2026-09-30) the lessons were re-cut and nine
 * conversations moved to the lesson they fit, so the lesson is read off the
 * script's key rather than fixed at the third and fifth. */
export const featuresListening = (u, i) =>
  !!SCRIPTS[`${u.id}:${i}`] && /^core\d+$/.test(u.id);

/* Optional steps are listed and counted on the lesson screen, but a lesson is
   finished when its required ones are. */
export const lessonDone = (st, u, i) =>
  components(st, u, i).every((c) => c.optional || c.done);

/* How far into a unit the learner has actually got — the count of its finished
   lessons, so a written passage can be pitched at what they have met rather
   than at what the unit eventually teaches. Gaps count as not reached: the run
   stops at the first lesson still open. */
export function lessonsDone(st, u) {
  let n = 0;
  while (n < lessonCount(u) && lessonDone(st, u, n)) n++;
  return n;
}

/* Every written scenario this learner can open, by chapter (§30l).
 *
 * The owner, 2026-09-11: *"in the listening section, I only see one transcript
 * with 5 questions. Ideally, there would be one or two scenarios per chapter and
 * then maybe some extras. Each should have a scenario title."* There were 168 of
 * them all along; the activity drew one and dealt it out, so a learner could
 * neither see what existed nor go back to one.
 *
 * A chapter's own two come first and are the spine's — the conversation built
 * from the words that chapter is named for — and its side quests are the extras
 * behind them. Unlocking follows the path exactly as the map does, `st.dev`
 * included (rule 20.9), so this can never offer a lesson the path would not. */
export function scenarioLibrary(st) {
  const out = [];
  for (const stage of STAGES) {
    const rows = [];
    const take = (u, extra) => {
      if (!unitUnlocked(st, u)) return;
      const n = lessonCount(u);
      const reach = st.dev ? n : lessonsDone(st, u);
      for (let i = 0; i < reach; i++) {
        const s = SCRIPTS[`${u.id}:${i}`];
        if (s && s.title) {
          rows.push({ key: `${u.id}:${i}`, unit: u, index: i, extra,
                      title: s.title, cast: (s.cast || []).map((c) => c.ru) });
        }
      }
    };
    take(stage.core, false);
    stage.branches.forEach((u) => take(u, true));
    if (rows.length) out.push({ stage, rows });
  }
  return out;
}

export function markComponent(st, u, i, id, extra) {
  const s = { best: 0, done: false, lessons: {}, video: false, ...(st.unit[u.id] || {}) };
  s.lessons = { ...s.lessons };
  if (id === "video") {
    s.video = true;
  } else {
    const l = { ...s.lessons[i] };
    if (id === "vocab") l.v = true;
    if (id === "summary") l.s = true;
    if (id === "quiz") {
      l.q = Math.max(l.q || 0, extra || 0);
      l.tries = (l.tries || 0) + 1;            // what the relief rule counts
      s.best = Math.max(s.best || 0, extra || 0);
    }
    s.lessons[i] = l;
  }
  const next = { ...st, unit: { ...st.unit, [u.id]: s } };
  s.done = Array.from({ length: lessonCount(u) }, (_, k) => k)
    .every((k) => lessonDone(next, u, k));
  return next;
}

/* A unit's goal-video sentences (tools/build_video_lines.py, carried on the
   unit as `v.lines`: [row in SPEECH.rows, ms into the video]). The speaker's
   own words, punctuated, with an English translation; the recording is a
   bought one in the lessons' voice, and `t` is where the video says it. */
export function videoLines(u) {
  const out = [];
  for (const [r, t] of (u && u.v && u.v.lines) || []) {
    const row = SPEECH.rows[r];
    if (row) out.push({ ru: row[0], en: row[1], t, vid: u.v.id });
  }
  return out;
}

const LINE_WORD = /[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*/g;

/* Where on the route each lemma is first taught (the unit's place in UN). */
let FIRST_TAUGHT = null;
const firstTaught = () => {
  if (!FIRST_TAUGHT) {
    FIRST_TAUGHT = new Map();
    UN.forEach((u, k) => u.w.forEach((i) => { if (!FIRST_TAUGHT.has(i)) FIRST_TAUGHT.set(i, k); }));
  }
  return FIRST_TAUGHT;
};
/* A line's words as lemmas, through the lookup index as every word link does. */
const lineLemmas = (ru) => (ru.match(LINE_WORD) || []).map((tok) => (IX[fold(tok)] || [])[0]);

/* Over this share of shared words, a line is a near-copy of one already shown. */
export const LINE_OVERLAP = 0.6;

/* The lines of a unit's video that say any of these words (lemma indices),
   best first (the owner, 2026-10-02: the sentences at the end of a lesson
   should "use the vocab words and… [be] more digestible", and not be "the tea
   is tasty", "the hot tea is tasty" — not unique enough to be helpful). Picked
   one at a time: the most of the lesson's words not yet shown, then fewest
   words the route has not taught by this unit, then short; a line sharing
   most of its words with one already chosen is not shown at all. */
export function linesWith(u, idxs, n = Infinity) {
  const want = new Set(idxs);
  const at = UN.indexOf(u);
  const taught = firstTaught();
  const cands = videoLines(u).map((l) => {
    const lem = lineLemmas(l.ru);
    // Compared as written, so a word the lookup cannot name still counts.
    const set = new Set((l.ru.match(LINE_WORD) || []).map(fold));
    return {
      l, set,
      hits: [...new Set(lem)].filter((i) => want.has(i)),
      // A word nobody has taught by here, or one the lookup cannot name.
      unknown: lem.filter((i) => typeof i !== "number" || !(taught.get(i) <= at)).length,
      words: lem.length,
    };
  }).filter((c) => c.hits.length);
  const out = [], shown = new Set();
  const overlap = (a) => Math.max(0, ...out.map((b) => {
    const both = [...a.set].filter((i) => b.set.has(i)).length;
    return both / Math.max(1, Math.min(a.set.size, b.set.size));
  }));
  while (cands.length && out.length < n) {
    let best = -1, score = -Infinity;
    cands.forEach((c, k) => {
      // A near-copy is never shown: fewer lines beats the same line twice.
      if (overlap(c) >= LINE_OVERLAP) return;
      const fresh = c.hits.filter((i) => !shown.has(i)).length;
      const s = 4 * fresh + c.hits.length - 2 * c.unknown - 0.3 * Math.max(0, c.words - 7);
      if (s > score) { score = s; best = k; }
    });
    if (best < 0) break;
    const [c] = cands.splice(best, 1);
    c.hits.forEach((i) => shown.add(i));
    out.push(c);
  }
  return out.map((c) => c.l);
}
/* The curriculum this build teaches, as a fingerprint of every unit's words
   (build_site.py `stats.curriculum`). */
export const CURRICULUM = (DATA.stats && DATA.stats.curriculum) || null;

/* Lesson progress carried across a re-cut curriculum (Phase 14, V7).
 *
 * Progress is stored by lesson index, and a rebuilt curriculum puts different
 * words in each lesson, so the old flags would claim lessons done that the
 * learner never saw and hide ones they had. Cards are untouched — they key on
 * the word (rule 20.4) — and what the learner has actually studied is
 * therefore known exactly. So, once per new curriculum:
 *
 *   - a unit finished before stays finished: it was learned, or tested out of,
 *     and a re-cut must not take a completed chapter away;
 *   - otherwise a lesson is done when every word in it has been studied — met
 *     and reviewed at least once — carrying the unit's best quiz score;
 *   - the watched flag follows the unit's *current* video, which may be a new
 *     one — except in a finished unit, whose video step stays done, or the
 *     unwatched new video would lock every chapter after it;
 *   - the old record is kept whole beside the new (`unitBefore`), never
 *     deleted.
 *
 * A profile with no progress simply takes the stamp. */
export function reconcileCurriculum(st) {
  if (!CURRICULUM || !st || st.curriculum === CURRICULUM) return st;
  const old = st.unit || {};
  if (!Object.keys(old).length) return { ...st, curriculum: CURRICULUM };
  const seen = st.seen || {};
  const studied = (w) => !!seen[w] && (cardFor(seen[w]).reps || 0) > 0;
  const unit = {};
  for (const u of UN) {
    const was = old[u.id] || {};
    const n = lessonCount(u);
    const lessons = {};
    for (let i = 0; i < n; i++) {
      const words = lessonWords(u, i).map((k) => L[k].b);
      if (was.done || (words.length && words.every(studied))) {
        lessons[i] = { v: true, q: Math.max(80, was.best || 0), tries: 1, carried: true };
      }
    }
    const watched = !!(u.v && (st.watched || {})[u.v.id]);
    if (!Object.keys(lessons).length && !watched && !was.best) continue;
    unit[u.id] = { best: was.best || 0, lessons, video: watched || !!was.done,
                   done: Object.keys(lessons).length === n };
  }
  return { ...st, unit, unitBefore: old, curriculum: CURRICULUM };
}

export function unitProgress(st, u) {
  const n = lessonCount(u);
  let done = 0;
  for (let i = 0; i < n; i++) if (lessonDone(st, u, i)) done++;
  return Math.min(1, done / n);
}

/* Partial credit, so the browser shows movement inside a lesson and not only after it. */
export function unitFineProgress(st, u) {
  const n = lessonCount(u);
  let total = 0, done = 0;
  for (let i = 0; i < n; i++) {
    /* Required steps only. The optional ones (summary, listening, grammar)
       are offered, not owed: counted, a finished unit read under 100 % and
       kept offering "Test out" (the review, 2026-09-30). */
    const cs = components(st, u, i).filter((c) => !c.optional);
    total += cs.length;
    done += cs.filter((c) => c.done).length;
  }
  return total ? done / total : 0;
}

/* The quests a chapter *requires*, and the ones it merely offers.
 *
 * Every branch used to be optional and the next chapter needed only the spine.
 * The owner, 2026-09-22: *"all parallel nodes must be completed before moving
 * down a node unless there are specifically optional lessons. Optional lessons
 * should be about niche subjects."* Which is which is decided in the pipeline
 * (`OPTIONAL` in build_topics.py) and rides on the unit as `opt`, so the path
 * and the gate cannot come to disagree about it (§22). */
export const optional = (u) => !!(u && u.opt);
export const required = (stage) => stage.branches.filter((u) => !optional(u));

/* A chapter is done when its spine and every quest it requires are done. */
export const stageDone = (st, s) =>
  unitProgress(st, s.core) >= 1 && required(s).every((u) => unitProgress(st, u) >= 1);

export function stageUnlocked(st, i) {
  if (st.dev) return true;
  if (i === 0) return true;
  return stageDone(st, STAGES[i - 1]);
}

/* **The fork opens when the chapter's spine is finished**, not part way
   through it. The owner, same message: *"Lines connecting two learning modes
   should only appear once the higher node has been completed, thus unlocking
   the next node."* It used to open after `FORK_AT` (2) spine lessons, so a
   chapter's quests appeared beside a spine unit the learner was still in the
   middle of, and the lanes to them were drawn — greyed and dashed — from the
   first screen. Now the road is: finish the spine, the quests appear, finish
   the ones the chapter requires, the next chapter opens.

   `spineLessonsDone` counted finished lessons for the old `FORK_AT` test and
   went with it: the question is whether the unit is done, which
   `unitProgress` already answers. */
export const forkOpen = (st, stage) => !!st.dev || unitProgress(st, stage.core) >= 1;

export function unitUnlocked(st, u) {
  if (st.dev) return true;
  const i = STAGES.findIndex((s) => s.core.id === u.id || s.branches.includes(u));
  if (i < 0) return true;
  if (!stageUnlocked(st, i)) return false;
  if (STAGES[i].core.id === u.id) return true;
  return forkOpen(st, STAGES[i]);
}

/* The first unfinished lesson on the route — what "Continue" resumes.
 *
 * The chapter's spine first, then **the quests that chapter requires**, then
 * the next chapter. Until 2026-09-22 this walked the spine alone, which was
 * right while every branch was optional: Continue followed the road and the
 * quests were chosen off the map. Now the required ones gate the next chapter,
 * and a Continue that could not reach them would have run out of things to say
 * the moment a spine was finished — the button gone, no disc filled, and the
 * only way on being to guess which disc to press. Optional quests stay off it;
 * those are still chosen on the map, which is the whole of what makes them
 * optional. */
export function nextLesson(st) {
  for (let i = 0; i < STAGES.length; i++) {
    if (!stageUnlocked(st, i)) break;
    for (const u of [STAGES[i].core, ...required(STAGES[i])]) {
      for (let k = 0; k < lessonCount(u); k++) {
        if (!lessonDone(st, u, k)) return { unit: u, index: k };
      }
    }
  }
  return null;
}

/* The first thing left to do in that lesson — what Continue opens directly, so
   the path leads to a question and not to a checklist (the interface review,
   2026-09-08): { unit, index, step } with step one of vocab | quiz | video. */
export function nextStep(st) {
  const here = nextLesson(st);
  if (!here) return null;
  const c = nextComponent(components(st, here.unit, here.index));
  return { ...here, step: c ? c.id : "vocab" };
}

/* Where Continue goes once a unit's video and its questions are done: the
   next thing on the path, kept linear (the owner, 2026-10-09: "After I
   answer the video questions, continue should take me to the next chapter.
   It's important to keep things pretty linear other than optional
   lessons"). Null at the end of the course. */
export function nextRoute(st) {
  const n = nextStep(st);
  return n ? stepRoute(n.step, n.unit, n.index) : null;
}

/* The personal review's words (the owner, 2026-10-05: *"words from lessons
   that the user has already completed or will encounter slightly in the
   future (upcoming lessons)"*): every finished lesson's words, wherever on
   the route, and the next lesson's — met first on a card is met early, not
   met out of order. Lemma indices. */
export function personalWords(st) {
  const out = [], have = new Set();
  const add = (i) => { if (!have.has(i)) { have.add(i); out.push(i); } };
  for (const u of UN) {
    for (let k = 0; k < lessonCount(u); k++) if (lessonDone(st, u, k)) lessonWords(u, k).forEach(add);
  }
  const here = nextLesson(st);
  if (here) lessonWords(here.unit, here.index).forEach(add);
  return out;
}

/* Where the learner is: every unit on the route up to the spine lesson Continue
   would resume, or the whole route once it is done. What a quiz or a listening
   drill draws from by default — cumulative, to here (the owner, 2026-09-07). */
export function reachedUnits(st) {
  const here = nextLesson(st);
  const out = [];
  for (const s of STAGES) {
    out.push(s.core);
    if (here && s.core.id === here.unit.id) return out;
    out.push(...s.branches);
    // Continue can now stop on a required quest (`nextLesson`), so the route
    // can end inside a chapter's fork rather than only at its spine.
    if (here && s.branches.some((u) => u.id === here.unit.id)) return out;
  }
  return out;
}

/* Where the learner has actually reached, as the chapter and the lesson within
   its spine — the facts `core/openings.js` needs to say when something opens.
   Off `nextLesson`, so it is the route's own position and never developer
   mode: unlocking every lesson is not the same as having arrived at one. */
export function routePosition(st) {
  const here = nextLesson(st);
  if (!here) return { stage: STAGES.length - 1, lesson: Infinity };
  /* `nextLesson` can stop on a required quest now, and a quest is part way
     *through* its chapter, not at lesson N of the spine — so a learner on one
     has finished the spine and is reported at the end of it. Reporting
     `here.index` there would have said "chapter 3, lesson 2" while they were
     in the middle of chapter 3's Home, and `core/openings.js` reads this to
     decide what has opened. */
  const spine = STAGES.findIndex((s) => s.core.id === here.unit.id);
  if (spine >= 0) return { stage: spine, lesson: here.index };
  const inFork = STAGES.findIndex((s) => s.branches.some((u) => u.id === here.unit.id));
  if (inFork >= 0) return { stage: inFork, lesson: lessonCount(STAGES[inFork].core) };
  return { stage: 0, lesson: here.index };
}

export const idxOfWord = (w) => {
  const h = IX[fold(w)];
  return h && h.length ? h[0] : -1;
};

/* The lemma whose bare form *is* `w`, or -1. State keys on that string (rule
   20.4), and fold() does not preserve it: «всё» and «все» share a key, and a
   form shares one with its lemma. Anything reading a card's schedule by its
   word needs this, not idxOfWord's first hit. */
export const exactIdx = (w) => {
  const hits = IX[fold(w)] || [];
  const same = hits.find((i) => L[i] && L[i].b === w);
  return same === undefined ? -1 : same;
};

/* What the learner did today, for the day's recap (core/questions.js
   `recapQuestions`): `words`, every word whose card was graded today, in the
   order the day met them, so the recap can walk the whole day; `missed`, the
   words of today's wrong answers, newest first; and `focus`, those misses and
   then the day's weakest few — what the recap may lean on, never what it is.
   Words only — a sentence card is a string with a space in it and has no lemma
   to ask about. */
const RECAP_WEAKEST = 4;
export function todaysWork(st, day = dayOf(Date.now())) {
  const seen = st.seen || {};
  const graded = [];
  for (const w in seen) {
    if (w.includes(" ")) continue;
    const card = cardFor(seen[w]);
    if (!card || card.lastAt === undefined || card.lastAt === null || dayOf(card.lastAt) !== day) continue;
    const i = exactIdx(w);
    if (i >= 0) graded.push({ i, at: card.lastAt, s: card.s || 0 });
  }
  const missed = [];
  for (const m of st.misses || []) {
    if (!m || !m.w || !m.at || dayOf(m.at) !== day) continue;
    const i = exactIdx(m.w);
    if (i >= 0 && !missed.includes(i)) missed.push(i);
  }
  const weakest = graded.slice().sort((a, b) => a.s - b.s).slice(0, RECAP_WEAKEST).map((g) => g.i);
  const focus = missed.concat(weakest.filter((i) => !missed.includes(i)));
  return { words: graded.sort((a, b) => a.at - b.at).map((g) => g.i), missed, focus };
}
/* Enough done today for a recap to be worth taking. */
export const RECAP_FROM = 5;
export const recapKey = (day = dayOf(Date.now())) => `recap:${day}`;

/* A studied word's frequency rank, 1 for the commonest — which is its lemma
 * index plus one, since the build assigns indices by frequency (§30ap reads it
 * the same way). What the familiarity score's horizon scales by
 * (core/scheduler.js `masteryHorizon`).
 *
 * By the **exact headword**, not through the form index: `IX` maps a form to
 * whichever lemma owns it, and a shared form belongs to one of its lemmas only
 * (§23 — «нет» was once a form of «житься»). A learner's cards are keyed by
 * headword, so the headword is the thing to look up. Undefined for a deck card
 * or a sentence, which have no rank and take the full horizon. */
let rankByHeadword = null;
export function rankOf(w) {
  if (rankByHeadword === null) {
    rankByHeadword = new Map();
    L.forEach((x, i) => { if (!rankByHeadword.has(x.b)) rankByHeadword.set(x.b, i + 1); });
  }
  return rankByHeadword.get(w);
}

/* What the scheduler wants back today, as lemma indices: the trouble bank
   first, then everything due. What a quiz tops up with and a drill asks for
   before anything else — review on the path, not only in the Study tab. */
export function reviewWords(st) {
  const now = Date.now();
  const out = [], have = new Set();
  const add = (w) => { const i = idxOfWord(w); if (i >= 0 && !have.has(i)) { have.add(i); out.push(i); } };
  for (const w in (st.trouble || {})) add(w);
  for (const w in (st.seen || {})) if (wanted(st.seen[w], now, st.learnAhead)) add(w);
  return out;
}
/* Every word the learner has actually met, as bare forms — the scheduler's own
   record, which is the honest answer to "what do they know". */
export const knownWords = (st) => Object.keys((st && st.seen) || {});

/* Cards due now — what "Review · N due" counts and what the Study tab badges.
 *
 * **Only the fronts the learner has chosen** (`st.flash`), because this number
 * is a promise about the pile that screen will deal, and since 2026-09-22 that
 * pile is filtered by them (core/queue.js). A badge counting cards the session
 * would not hand over is the stranding bug wearing the other hat: work owed
 * that nothing can reach. The Stats screen is the other question — what the
 * whole schedule holds — and deliberately still counts every direction. */
/* …and only the kinds of card chosen (words, sentences): the Study screen
   deals exactly these, whatever sets are ticked, so this number and the pile
   are the same number (2026-09-28 — the badge said ~150 while a buried tick
   let the pile hand over twenty). */
/* …and since 2026-10-05 it is not a due count at all but **the day's goal**
   (core/queue.js rollGoal): 20 reviews plus the new-word setting each study
   day, carried when missed, one off for every card answered in Study (the
   owner: *"the user 'fights' that number… Their goal is to turn that number
   to 0 every day"*). The due count could not be fought — Agains came back
   and today's learning steps sat outside its cap, so it read 38 all day. On
   a day that is not a study day it is 0: nothing is pushed. */
export const goalOpts = (st) => ({ newPerDay: st.newPerDay, days: st.studyDays });
export const goalNow = (st, now = Date.now()) => rollGoal(st.goal, now, goalOpts(st));
export const dueCount = (st) => goalBadge(st.goal, Date.now(), goalOpts(st));

/* What a practice drill may ask about: the words the learner has met, widened
   along the route until there are enough to drill. A fresh learner gets the first
   units' words in path order; nobody gets the genitive plural of a word they have
   never seen. DRILL_POOL_MIN is the floor below which the route is added. */
/* …and `min` is a floor on *words*, which is not the same as a floor on
   questions. Measured with tools/audit_banks.mjs on 2026-09-16: at 40 words the
   aspect drill can build **seven** distinct questions in total, because it needs
   verbs that carry a recorded partner and there are barely any that early. The
   caller raises the floor until the run actually fills (DrillFlow), rather than
   this guessing a number that happens to work for one drill. */
export const DRILL_POOL_MIN = 40;
/* The words to tell a tutor the learner knows: the words met, strongest first
   (the scheduler's stability, not the order met), topped up along the route —
   the drills' pool. Talk and the personal tutor send the same list. */
export const studiedFor = (st) => {
  const s = (i) => strength((st.seen || {})[L[i].b]);
  return drillPool(st).slice().sort((a, b) => s(b) - s(a)).map((i) => L[i].b).slice(0, 300);
};

export function drillPool(st, min = DRILL_POOL_MIN) {
  const out = [];
  const have = new Set();
  const add = (i) => { if (i >= 0 && !have.has(i)) { have.add(i); out.push(i); } };
  for (const w of Object.keys(st.seen || {})) {
    const i = exactIdx(w);
    add(i >= 0 ? i : idxOfWord(w));
  }
  if (out.length >= min) return out;
  // The route in order: every unit up to and including where the learner is,
  // then onward until the floor is met.
  const here = nextLesson(st);
  const route = [];
  for (const s of STAGES) route.push(s.core, ...s.branches);
  const at = here ? route.indexOf(here.unit) : route.length - 1;
  for (let k = 0; k < route.length && out.length < min; k++) {
    if (k > at && out.length >= min) break;
    for (const i of route[k].w) add(i);
  }
  return out;
}

/* The words of the chosen chapters, spine and quests, as a drill pool — what
   a drill draws on when the learner picked chapters on its cog rather than
   "your words" (2026-09-26). Chapter indices are 0-based; unknown ones are
   ignored, so a profile from a longer course cannot crash a shorter one. */
export function chapterWords(indices) {
  const out = [];
  const have = new Set();
  for (const k of indices || []) {
    const s = STAGES[k];
    if (!s) continue;
    for (const u of [s.core].concat(s.branches)) {
      for (const i of u.w) if (!have.has(i)) { have.add(i); out.push(i); }
    }
  }
  return out;
}

/* Every word the units teach that breaks the rules (core/facts.js
   `irregularities`), in path order — what a drill narrowed to irregulars
   draws on, and what a lesson's word list sets apart. Built once: reading a
   word's tables hydrates it, and 1,045 of those is a few milliseconds. */
let irregularCache = null;
/* Every word the units teach. A drill draws only on these (2026-10-04): the
   ~2,700 studied words the units do not teach have no recording, and
   «участвовать»'s table was read by the phone's voice mid-drill (the owner:
   "more words that all sound awfully pronounced"). */
let unitWordSet = null;
const unitWords = () => {
  if (unitWordSet === null) {
    unitWordSet = new Set();
    for (const u of UN) for (const i of u.w || []) unitWordSet.add(i);
  }
  return unitWordSet;
};
/* The words a learner knows well enough to drill their forms: a card at
   familiarity `KNOWN_AT` or above (the owner, 2026-10-08: *"the 'your words'
   setting still brings up random new words. Realistically, that should only
   show words with a mastery score of 40 or higher"*). A drill asks for an
   ending; asking it of a word whose meaning is not yet held is two things to
   recall at once. Nothing widens this — a learner with few such words gets a
   short run, and the cog's chapters are the way to drill anything else. */
export const KNOWN_AT = 40;
export function knownPool(st) {
  const out = [], have = new Set();
  for (const w of Object.keys(st.seen || {})) {
    const score = familiarity(cardFor(st.seen[w]), rankOf(w));
    if (score === null || score < KNOWN_AT) continue;
    const e = exactIdx(w);
    const i = e >= 0 ? e : idxOfWord(w);
    if (i >= 0 && unitWords().has(i) && !have.has(i)) { have.add(i); out.push(i); }
  }
  return out;
}

export function irregularWords() {
  if (irregularCache === null) {
    const out = [], have = new Set();
    for (const u of UN) for (const i of u.w || []) {
      if (!have.has(i) && L[i] && isIrregular(L[i])) { have.add(i); out.push(i); }
    }
    irregularCache = out;
  }
  return irregularCache;
}
