/* The video library's pure helpers — how it is ordered, searched and read by
   channel — and the small formatters every video screen shares. No React. */

import { UN, STAGES } from "./data";
import { fold, today } from "@core/util";

export const short = (title) => title.split(" | ")[0].trim();
export const minutes = (dur) => (dur ? `${Math.round(dur / 60)} min` : "");

export const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* How far a skip goes — the overlay's two buttons, a double tap on either
   half of the picture, a headset's skip keys (the owner, 2026-11-18: "control
   how many seconds the rewind button takes them… 5 10 20 30… synch with the
   same time the user set"). One setting, `st.skip`, in seconds; anything else
   stored reads as the default. YouTube's own is ten. */
export const SKIP_SECONDS = [5, 10, 20, 30];
export const DEFAULT_SKIP = 10;
export const SKIP_OPTIONS = SKIP_SECONDS.map((s) => ({ id: s, name: `${s} s` }));
export const skipSeconds = (st) => (SKIP_SECONDS.includes(st && st.skip) ? st.skip : DEFAULT_SKIP);
export const skipMsOf = (st) => skipSeconds(st) * 1000;

export const isFave = (st, id) => !!((st.faves || {})[id]);
/* Toggle a favourite: id -> the day it was marked. Keyed on the video id, which
   is YouTube's and survives a rebuild of the library. */
export const toggleFave = (prev, id) => {
  const faves = { ...(prev.faves || {}) };
  if (faves[id]) delete faves[id]; else faves[id] = today();
  return { ...prev, faves };
};

/* The library's orders (the owner, 2026-09-23: "default organize the immerse
   in a logical sequence that more or less mirrors a logical learning
   progression… but maybe have a sort by option at the top").

   `level` is the resting order and the progression: the units' own episodes
   along the path — they are keyed to chapters, so that *is* the route — then
   everything else by its CEFR code, easiest first within a code, the unrated
   last. The other three are plain sorts a learner may want on a given day. */
export const VIDEO_SORTS = [
  { id: "level", name: "By level" }, { id: "easiest", name: "Easiest" },
  { id: "newest", name: "Newest" }, { id: "shortest", name: "Shortest" },
];
const CEFR_RANK = { A1: 0, A2: 1, B1: 2, "B1+": 3, B2: 4, C1: 5, C2: 6 };
const cefrRank = (v) => (v.cefr in CEFR_RANK ? CEFR_RANK[v.cefr] : 9);

export function libraryOrder(videos, sort = "level") {
  const unitPos = {};
  UN.forEach((u, k) => { unitPos[u.id] = k; });
  const byEase = (a, b) => (b.ease || 0) - (a.ease || 0);
  const cmp = sort === "easiest" ? byEase
    : sort === "newest" ? (a, b) => String(b.up || "").localeCompare(String(a.up || "")) || byEase(a, b)
    : sort === "shortest" ? (a, b) => (a.dur || Infinity) - (b.dur || Infinity) || byEase(a, b)
    : (a, b) => {
      const ua = a.unit ? unitPos[a.unit] : Infinity;
      const ub = b.unit ? unitPos[b.unit] : Infinity;
      if (ua !== ub) return ua - ub;
      return cefrRank(a) - cefrRank(b) || byEase(a, b);
    };
  return videos.slice().sort(cmp);
}

/* **A few videos for this learner** (the owner, 2026-11-19: *"In immerse let's
   add a small little suggest a video feature where the learner's context will
   be used to select a few options"*). Scored off what the app already knows,
   no model: how many of the words the video says the learner holds (the
   sweet spot is most but not all of them — comprehensible input, a step up),
   whether it is a unit's episode near where they are on the path, its CEFR
   code against their level, and its length. Watched videos are out.
   `skip` passes over the first picks, for "Show others". Pure, for the test. */
const LEVEL_CEFR = { beginner: ["A1", "A2"], intermediate: ["B1", "B1+"], advanced: ["B2", "C1", "C2"] };
export const KNOWN_SWEET = 0.65;
export function suggestVideos(list, { seen = {}, known = () => false, stage = 0, level = "beginner", watched = () => false,
                                       n = 3, skip = 0 } = {}) {
  const unitStage = {};
  STAGES.forEach((s, k) => { unitStage[s.core.id] = k; s.branches.forEach((u) => { unitStage[u.id] = k; }); });
  const scored = [];
  for (const v of list) {
    if (watched(v)) continue;
    const words = Object.keys(v.words || {});
    if (!words.length) continue;
    const held = words.filter((w) => known(w)).length;
    const share = held / words.length;
    // Nothing known is noise; everything known is nothing to learn.
    const fit = 1 - Math.min(1, Math.abs(share - KNOWN_SWEET) / KNOWN_SWEET);
    const us = v.unit && unitStage[v.unit] !== undefined ? unitStage[v.unit] : null;
    const near = us === null ? 0 : us === stage ? 1 : Math.abs(us - stage) === 1 ? 0.6 : 0;
    const levelFit = (LEVEL_CEFR[level] || []).includes(v.cefr) ? 1 : v.cefr ? 0.3 : 0.5;
    const shortish = v.dur ? Math.max(0, 1 - Math.max(0, v.dur - 300) / 900) : 0.5;
    const score = 3 * fit + 2 * near + 1.5 * levelFit + 0.5 * shortish;
    scored.push({ v, score, held, total: words.length });
  }
  scored.sort((a, b) => b.score - a.score || (b.v.ease || 0) - (a.v.ease || 0));
  return scored.slice(skip, skip + n);
}

/* A CEFR code typed as a search term ("b1", "B1+", "a2") filters on the video's
   code: "b1" takes B1 and B1+, "b1+" only B1+. The codes are never displayed. */
const CEFR_TERM = /^[abc][12]\+?$/;
const cefrMatches = (term, code) => {
  if (!code) return false;
  const c = code.toLowerCase();
  return term.endsWith("+") ? c === term : c === term || c === term + "+";
};

export function searchVideos(videos, query, sort) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return libraryOrder(videos, sort);
  const scored = [];
  for (const v of videos) {
    const hay = ((v.kw || "") + " " + v.title + " " + (v.ch || "")).toLowerCase();
    let score = 0, ok = true;
    for (const term of terms) {
      if (CEFR_TERM.test(term)) {
        if (cefrMatches(term, v.cefr)) { score += 2; continue; }
        ok = false; break;
      }
      const cyr = /[а-яё]/.test(term);
      const said = cyr && Object.keys(v.words || {}).some((w) => fold(w).startsWith(term));
      const inTitle = v.title.toLowerCase().includes(term);
      if (said) score += 3;
      else if (inTitle) score += 2;
      else if (hay.includes(term)) score += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ v, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.v.ease || 0) - (a.v.ease || 0));
  return scored.map((x) => x.v);
}

/* The channels the library actually holds, in the order the rows will read
   (the owner, 2026-09-28: *"filter by channel where it also prepopulates all
   the different channels in the database"*). Read off the videos rather than
   off `data/curated/channels.json`: the curated file is the credit list, and
   a channel harvested but not yet credited — or credited and not yet
   harvested — would put a filter on the screen that matches nothing. The
   count rides along, because "Easy Russian 147" says more than a name. */
export function channelsOf(list) {
  const n = new Map();
  for (const v of list) if (v.ch) n.set(v.ch, (n.get(v.ch) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
               .map(([name, count]) => ({ name, count }));
}
