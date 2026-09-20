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
/* Listening passages (tools/build_listening.py): spans of real video with the
   curriculum words they say. Required when the listening screen opens. */
export const passages = () => require("../assets/listening.json");
/* Numbered senses for the studied words (tools/ingest_wiktionary.py, §30q).
   Required when a word is opened, which is never the first screen. */
const sensesBlob = () => require("../assets/senses.json");
import { makeSearch, makeResolve, parseDeep } from "@core/search";
import { makeHydrator, makeDeepIndex } from "@core/entry";
import { lessonSize } from "@core/questions";
import { quizPassed } from "@core/state";
import { dueCards, wanted } from "@core/scheduler";

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

/* Recordings are served from the deployed site rather than bundled: 209 MB will not
   fit in a store binary, and streaming keeps the app installable. */
export const AUDIO_BASE = "https://bridges-jf.netlify.app/audio/";
export const audioUrl = (text) => {
  const hit = AUDIO[fold(text)];
  return hit ? AUDIO_BASE + hit : null;
};

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

export const DEEP_COUNT = (DATA.stats && DATA.stats.deep) || 0;

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
export const resolveWord = (w) => {
  const hit = rawResolve(w);
  return hit ? hydrate(hit) : null;
};

/* Which chapter a unit belongs to — the spine unit that opens it, or any of its
   themed units. Used by the headers so a screen can say where the learner is. */
export function chapterOf(unitId) {
  for (const s of STAGES) {
    if (s.core.id === unitId || s.branches.some((b) => b.id === unitId)) return s;
  }
  return null;
}

export const unitById = (id) => UN.find((u) => u.id === id) || null;

export { PASS_MARK, RELIEF_MARK, RELIEF_AFTER } from "@core/state";

/* Lessons ramp: five words each in chapter 1, six in chapter 2, seven after
   (core/questions.js LESSON_RAMP). A unit's chapter decides, spine or branch. */
const stageIndexOf = (u) =>
  STAGES.findIndex((s) => s.core === u || s.branches.includes(u));
export const unitLessonSize = (u) => lessonSize(stageIndexOf(u));
export const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / unitLessonSize(u)));
export const lessonWords = (u, i) => {
  const n = unitLessonSize(u);
  return u.w.slice(i * n, (i + 1) * n);
};

export const unitState = (st, id) =>
  st.unit[id] || { best: 0, done: false, lessons: {}, video: false };

/* A lesson is three things doable in any order. The video belongs to the unit — one
   video covers a unit's worth of vocabulary — so watching it counts for every lesson. */
export function components(st, u, i) {
  const s = unitState(st, u.id);
  const l = (s.lessons || {})[i] || {};
  const out = [
    { id: "vocab", label: "Vocabulary", done: !!l.v },
    { id: "quiz", label: "Quiz", score: l.q, tries: l.tries || 0, done: quizPassed(l) },
  ];
  if (u.v) out.push({ id: "video", label: "Video", done: !!s.video, shared: true });
  /* The lesson's conversation, where one was written for it — 32 of the 168
     (§30af). The owner, 2026-09-17: *"you can have them listed along with the
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
  return out;
}

/* Which lessons *feature* their conversation as a step on the lesson screen.
 *
 * Having a script and featuring it are different questions, and conflating them
 * put a Listening step on all fourteen of chapter 1's lessons — the owner,
 * 2026-09-17: *"You dont have to embed it into every single lesson. just 1 or 2
 * lessons per chapter where it's featured."* The spine's lessons 3 and 5 are
 * the two, which is one or two per chapter everywhere and matches where the
 * conversations for chapters 2-10 were written (§30af).
 *
 * Chapter 1's other twelve are **not deleted** — they are written, bought and
 * good, and they stay in Practice → Listening, which lists every script. This
 * only decides what a lesson puts in front of you. */
export const FEATURED_LESSONS = [2, 4];
export const featuresListening = (u, i) =>
  !!SCRIPTS[`${u.id}:${i}`] && /^core\d+$/.test(u.id) && FEATURED_LESSONS.includes(i);

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
    const cs = components(st, u, i);
    total += cs.length;
    done += cs.filter((c) => c.done).length;
  }
  return total ? done / total : 0;
}

export const stageDone = (st, s) => unitProgress(st, s.core) >= 1;

export function stageUnlocked(st, i) {
  if (st.dev) return true;
  if (i === 0) return true;
  return stageDone(st, STAGES[i - 1]);
}

/* Side quests. A chapter's branches are optional detours off the spine: the road
   forks once this many spine lessons are done, and the learner may take any of
   them or stay on the main path — the next chapter needs only the spine. */
export const FORK_AT = 2;
export const spineLessonsDone = (st, stage) => {
  let n = 0;
  for (let i = 0; i < lessonCount(stage.core); i++) if (lessonDone(st, stage.core, i)) n++;
  return n;
};
export const forkOpen = (st, stage) => !!st.dev || spineLessonsDone(st, stage) >= FORK_AT;

export function unitUnlocked(st, u) {
  if (st.dev) return true;
  const i = STAGES.findIndex((s) => s.core.id === u.id || s.branches.includes(u));
  if (i < 0) return true;
  if (!stageUnlocked(st, i)) return false;
  if (STAGES[i].core.id === u.id) return true;
  return forkOpen(st, STAGES[i]);
}

/* The first unfinished spine lesson — what "Continue" resumes. Side quests are
   never what Continue leads to; they are chosen on the map. */
export function nextLesson(st) {
  for (let i = 0; i < STAGES.length; i++) {
    if (!stageUnlocked(st, i)) break;
    const u = STAGES[i].core;
    for (let k = 0; k < lessonCount(u); k++) {
      if (!lessonDone(st, u, k)) return { unit: u, index: k };
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
  const c = components(st, here.unit, here.index).find((x) => !x.done);
  return { ...here, step: c ? c.id : "vocab" };
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
  const stage = STAGES.findIndex((s) => s.core.id === here.unit.id);
  return { stage: stage < 0 ? 0 : stage, lesson: here.index };
}

export const idxOfWord = (w) => {
  const h = IX[fold(w)];
  return h && h.length ? h[0] : -1;
};

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

/* Cards due now, across every direction — what "Review · N due" counts. */
export const dueCount = (st) => dueCards(st.seen, Date.now(), st.learnAhead).length;

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
export function drillPool(st, min = DRILL_POOL_MIN) {
  const out = [];
  const have = new Set();
  const add = (i) => { if (i >= 0 && !have.has(i)) { have.add(i); out.push(i); } };
  // State keys on the lemma's bare form; where two lemmas share a folded form
  // (все/всё), take the one whose bare form is the key, not the index's first.
  const exact = (w) => {
    const hits = IX[fold(w)] || [];
    const same = hits.find((i) => L[i] && L[i].b === w);
    return same !== undefined ? same : (hits.length ? hits[0] : -1);
  };
  for (const w of Object.keys(st.seen || {})) add(exact(w));
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

/* The floors DrillFlow walks up when a run will not fill. Each step reaches
   further along the route; the last is the whole curriculum, which is where a
   drill the learner's own words genuinely cannot supply has to end up — asking
   the same seven questions every sitting is worse than asking about a word
   they will meet next week. */
export const DRILL_POOL_STEPS = [DRILL_POOL_MIN, 150, 400, Infinity];
