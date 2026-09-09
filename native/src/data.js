/* The generated payload and the curriculum logic that reads it.
 *
 * data.json is written by tools/build_site.py, the same bytes the web build embeds,
 * so both platforms are always a single generation of the pipeline.
 */

import DATA from "../assets/data.json";
import { fold } from "@core/util";
import { makeSearch, makeResolve, parseDeep } from "@core/search";
import { makeHydrator, makeDeepIndex } from "@core/entry";
import { lessonSize } from "@core/questions";
import { quizPassed } from "@core/state";

export const L = DATA.lemmas;
export const IX = DATA.index;
export const UN = DATA.units;
export const PATH = DATA.path;
export const STATS = DATA.stats;
export const AUDIO = (DATA.audio && DATA.audio.files) || {};
/* The speaking and listening pools (CLAUDE.md §30b): one shared row list, and per
   unit the rows each activity may draw from. */
export const SPEECH = DATA.speech || { rows: [], speak: {}, listen: {} };
/* The Immerse library: every harvested video with a transcript, its search
   keywords, and the study words it actually says (with moments). A unit's own
   episode is also here, marked with `unit`. */
export const VIDEOS = DATA.videos || [];
export const videoById = (id) => VIDEOS.find((v) => v.id === id) || null;
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
    for (const u of UN) if (u.v && u.v.heard) add(u.v, u.v.heard);
    for (const v of VIDEOS) add(v, v.words);
    // The unit's own episode first, then where the word is said most.
    for (const rows of heardIndex.values()) {
      rows.sort((a, b) => (b.n - a.n));
    }
  }
  return heardIndex.get(bare) || [];
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
   lexicon, not just the ones the curriculum teaches. Parsed on first use — it costs
   about 16ms, which is worth paying when someone searches rather than at every
   cold start. */
let deepCache = null;
const deepList = () => {
  if (deepCache === null) deepCache = parseDeep(DATA.deep || "");
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
  deepIndex, shapes: DATA.shapes, slots: DATA.slots, sent: DATA.sent,
});

/* Eagerly, for the curriculum's own words. Lessons, drills and flashcards read
   `w.x` and `w.t` straight off these objects in a dozen places; filling them here
   means no call site can be missed and quietly lose its example sentences. Costs
   about 120ms at start, measured, most of it parsing the dictionary once. */
L.forEach(hydrate);

const rawSearch = makeSearch({ L, IX, deep: deepList });
const rawResolve = makeResolve({ L, IX, deep: deepList });

export const searchWords = (q, limit) => rawSearch(q, limit).map(hydrate);
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
  return out;
}

export const lessonDone = (st, u, i) => components(st, u, i).every((c) => c.done);

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

export const idxOfWord = (w) => {
  const h = IX[fold(w)];
  return h && h.length ? h[0] : -1;
};

/* What a practice drill may ask about: the words the learner has met, widened
   along the route until there are enough to drill. A fresh learner gets the first
   units' words in path order; nobody gets the genitive plural of a word they have
   never seen. DRILL_POOL_MIN is the floor below which the route is added. */
export const DRILL_POOL_MIN = 40;
export function drillPool(st) {
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
  if (out.length >= DRILL_POOL_MIN) return out;
  // The route in order: every unit up to and including where the learner is,
  // then onward until the floor is met.
  const here = nextLesson(st);
  const route = [];
  for (const s of STAGES) route.push(s.core, ...s.branches);
  const at = here ? route.indexOf(here.unit) : route.length - 1;
  for (let k = 0; k < route.length && out.length < DRILL_POOL_MIN; k++) {
    if (k > at && out.length >= DRILL_POOL_MIN) break;
    for (const i of route[k].w) add(i);
  }
  return out;
}
