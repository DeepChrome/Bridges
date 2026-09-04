/* The generated payload and the curriculum logic that reads it.
 *
 * data.json is written by tools/build_site.py, the same bytes the web build embeds,
 * so both platforms are always a single generation of the pipeline.
 */

import DATA from "../assets/data.json";
import { fold } from "@core/util";
import { makeSearch, makeResolve, parseDeep } from "@core/search";
import { makeHydrator } from "@core/entry";

export const L = DATA.lemmas;
export const IX = DATA.index;
export const UN = DATA.units;
export const PATH = DATA.path;
export const STATS = DATA.stats;
export const AUDIO = (DATA.audio && DATA.audio.files) || {};

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
  if (deepMap === null) {
    deepMap = new Map();
    for (const d of deepList()) if (!deepMap.has(d.b)) deepMap.set(d.b, d);
  }
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

export const LESSON_SIZE = 7;
export const PASS_MARK = 80;

export const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / LESSON_SIZE));
export const lessonWords = (u, i) => u.w.slice(i * LESSON_SIZE, (i + 1) * LESSON_SIZE);

export const unitState = (st, id) =>
  st.unit[id] || { best: 0, done: false, lessons: {}, video: false };

/* A lesson is three things doable in any order. The video belongs to the unit — one
   video covers a unit's worth of vocabulary — so watching it counts for every lesson. */
export function components(st, u, i) {
  const s = unitState(st, u.id);
  const l = (s.lessons || {})[i] || {};
  const out = [
    { id: "vocab", label: "Vocabulary", done: !!l.v },
    { id: "quiz", label: "Quiz", score: l.q,
      done: typeof l.q === "number" && l.q >= PASS_MARK },
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

export function unitUnlocked(st, u) {
  if (st.dev) return true;
  const i = STAGES.findIndex((s) => s.core.id === u.id || s.branches.includes(u));
  if (i < 0) return true;
  if (!stageUnlocked(st, i)) return false;
  if (STAGES[i].core.id === u.id) return true;
  return unitProgress(st, STAGES[i].core) > 0;
}

/* The first unfinished lesson in path order — what "Continue" resumes. */
export function nextLesson(st) {
  for (let i = 0; i < STAGES.length; i++) {
    if (!stageUnlocked(st, i)) break;
    for (const u of [STAGES[i].core].concat(STAGES[i].branches)) {
      if (!unitUnlocked(st, u)) continue;
      for (let k = 0; k < lessonCount(u); k++) {
        if (!lessonDone(st, u, k)) return { unit: u, index: k };
      }
    }
  }
  return null;
}

export const idxOfWord = (w) => {
  const h = IX[fold(w)];
  return h && h.length ? h[0] : -1;
};
