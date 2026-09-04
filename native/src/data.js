/* The generated payload and the curriculum logic that reads it.
 *
 * data.json is written by tools/build_site.py, the same bytes the web build embeds,
 * so both platforms are always a single generation of the pipeline.
 */

import DATA from "../assets/data.json";
import { fold } from "@core/util";

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

/* Stages come straight from the path layout: a spine unit and its branches. */
export const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) out.push({ core: UN[p.u], branches: [] });
    else out[out.length - 1].branches.push(UN[p.u]);
  });
  return out;
})();

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
