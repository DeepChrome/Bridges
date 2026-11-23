/* Case cards: paths of three or four flashcards on one case trigger, and a
 * session of paths (docs/case-cards.md is the framework; the owner,
 * 2026-11-23: "sequenced flashcards that focus on triggers and each one is a
 * path of 3-4 cards (but the cards can be sort of mix and matched)").
 *
 * Pure: it is handed the sentences sorted under each trigger (core/questions.js
 * triggerSightings) and the learner's trigger cards, and returns plain objects.
 * Drawing, grading by touch and saving are the screen's.
 *
 * A card is `{ face, trigger, s }`: `face` one of FACES, `trigger` the id it
 * asks about, `s` the real sentence it is built on — the noun at `s.k`, the
 * word that governs it at `s.j`. No two cards in a session share a sentence,
 * and the cards of one path each show a different word wherever the trigger
 * has that many.
 */

import { TRIGGERS, TEACH_ORDER, triggerById, siblingsOf, triggerKind } from "./triggers.js";
import { isDue, retrievability, familiarity, review } from "./scheduler.js";

/* A trigger is offered once it has this many sentences: a path wants four,
   each a different word, and the next session four more. */
export const PATH_MIN_SENTENCES = 8;
/* Paths in a session (about eighteen cards), and new triggers in one. */
export const SESSION_PATHS = 5;
const NEW_PER_SESSION = 2;
/* Sentences remembered as shown, so the next sessions draw others first. */
const RECENT_KEPT = 200;
/* A trigger held this well (familiarity) takes the three-card review. */
export const STRONG_AT = 60;

/* What each face asks, and how it is checked: `case` faces by a tap on one of
   the five cases, `self` faces by the learner's own grade, as a flashcard. */
export const FACES = {
  notice: { check: "case" },   // a real sentence, the noun marked: which case?
  trigger: { check: "case" },  // the trigger and its meaning: which case?
  form: { check: "self" },     // the trigger + the noun's dictionary form: say the phrase
  use: { check: "self" },      // the sentence with a gap: the form in place
};

/* The orders a path can take. `sib` marks a card on the trigger's sibling. */
export const TEMPLATES = {
  example: ["notice", "trigger", "form", "use"],
  rule: ["trigger", "form", "use", "notice"],
  contrast: ["notice", "notice:sib", "use", "use:sib"],
  review: ["notice", "form", "use"],
};

/* The learner's choice of order, in the options. "Mixed" is the framework's:
   example first for a trigger never met, then varied. */
export const ORDERS = [
  { id: "mixed", name: "Mixed" },
  { id: "example", name: "Example first" },
  { id: "rule", name: "Rule first" },
];

/* The triggers with enough sentences to make cards, in teaching order. */
export function offered(sightings) {
  const ok = new Set(TRIGGERS.filter((x) => ((sightings && sightings[x.id]) || []).length >= PATH_MIN_SENTENCES)
    .map((x) => x.id));
  return TEACH_ORDER.filter((id) => ok.has(id)).map(triggerById);
}

/* The sibling a contrast path can stand against: offered, and met already. */
function contrastSibling(x, pool, cards) {
  const mine = cards[x.id];
  if (!mine) return null;
  return siblingsOf(x).find((y) => pool.some((p) => p.id === y.id) && cards[y.id]) || null;
}

/* Which template a path takes. A trigger never met is example first (see it
   before saying it); a strong one the three-card review; otherwise the
   learner's order, or under "mixed" a contrast now and then where there is a
   sibling to stand against, and example or rule first in turn. */
function chooseTemplate(x, { card, sibling, order, rng = Math.random }) {
  if (order === "example") return "example";
  if (order === "rule") return card ? "rule" : "example";
  if (!card) return "example";
  if (sibling && rng() < 0.4) return "contrast";
  // Read on the full horizon: a trigger has no frequency rank.
  const score = familiarity(card);
  if (score !== null && score >= STRONG_AT) return "review";
  return rng() < 0.5 ? "example" : "rule";
}

/* `n` sentences from a trigger's list: never one used this session, the ones
   not shown lately before the rest, each a different word where it can be,
   and among those the easier and the better-known words first, shuffled a
   little so two sessions differ. */
function pickSightings(list, n, { used, recent, known, rng = Math.random, avoidWords }) {
  const avoid = avoidWords || new Set();
  const score = (s) => s.ease - 4 * (known ? known(s.i) : 0) + (recent && recent.has(s.ru) ? 50 : 0)
    + (avoid.has(s.i) ? 30 : 0) + rng() * 4;
  const ranked = list.filter((s) => !used.has(s.ru)).map((s) => [score(s), s]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const out = [], words = new Set();
  for (const s of ranked) {
    if (out.length >= n) break;
    if (words.has(s.i)) continue;
    out.push(s); words.add(s.i);
  }
  // A trigger with fewer words than cards repeats a word, never a sentence.
  for (const s of ranked) {
    if (out.length >= n) break;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/* One path: the template's cards on `x` (and on `sib` for a contrast), each
   on its own sentence. Null when the trigger cannot fill it. */
function buildPath(x, template, sightings, opts) {
  const faces = TEMPLATES[template];
  const sib = template === "contrast" ? opts.sibling : null;
  if (!faces || (template === "contrast" && !sib)) return null;
  const mine = faces.filter((f) => !f.endsWith(":sib"));
  const theirs = faces.filter((f) => f.endsWith(":sib"));
  const a = pickSightings(sightings[x.id] || [], mine.length, opts);
  if (a.length < mine.length) return null;
  a.forEach((s) => opts.used.add(s.ru));
  const avoidWords = new Set(a.map((s) => s.i));
  const b = sib ? pickSightings(sightings[sib.id] || [], theirs.length, { ...opts, avoidWords }) : [];
  if (b.length < theirs.length) { a.forEach((s) => opts.used.delete(s.ru)); return null; }
  b.forEach((s) => opts.used.add(s.ru));
  let ai = 0, bi = 0;
  const cards = faces.map((f) => (f.endsWith(":sib")
    ? { face: f.slice(0, -4), trigger: sib.id, s: b[bi++] }
    : { face: f, trigger: x.id, s: a[ai++] }));
  return { trigger: x.id, sibling: sib ? sib.id : null, template, cards };
}

/* Mixes the triggers so no two of the same case run together where that can
   be helped: always the next one in line whose case differs from the last. */
export function interleave(list) {
  const left = list.slice(), out = [];
  while (left.length) {
    const last = out.length ? out[out.length - 1].case : null;
    const k = left.findIndex((x) => x.case !== last);
    out.push(left.splice(k < 0 ? 0 : k, 1)[0]);
  }
  return out;
}

/* A session. `focus` is one trigger practised on its own; otherwise the
   triggers of the chosen `cases` and `kinds`: what is due (the most
   forgotten first), then up to `newMax` new ones in teaching order, then the
   least recently seen — mixed by case. Returns the paths. */
export function caseSession({ sightings, cards = {}, now = Date.now(), n = SESSION_PATHS, newMax = NEW_PER_SESSION,
                              focus = null, cases = null, kinds = null, order = "mixed", known = null,
                              recent = null, rng = Math.random, schedOpts }) {
  const all = offered(sightings);
  const pool = focus ? all.filter((x) => x.id === focus)
    : all.filter((x) => (!cases || !cases.length || cases.includes(x.case))
                      && (!kinds || !kinds.length || kinds.includes(triggerKind(x))));
  if (!pool.length) return [];
  const used = new Set();
  const opts = { used, recent: recent instanceof Set ? recent : new Set(recent || []), known, rng };
  const pathFor = (x, k) => {
    const card = cards[x.id] || null;
    const sibling = contrastSibling(x, all, cards);
    const template = focus && card ? ["example", "rule", sibling ? "contrast" : "example", "review"][k % 4]
      : chooseTemplate(x, { card, sibling, order, rng });
    return buildPath(x, template, sightings, { ...opts, sibling })
      || (template !== "example" ? buildPath(x, "example", sightings, { ...opts, sibling: null }) : null)
      || buildPath(x, "review", sightings, { ...opts, sibling: null });
  };
  if (focus) {
    const out = [];
    for (let k = 0; k < n; k++) { const p = pathFor(pool[0], k); if (!p) break; out.push(p); }
    return out;
  }
  const due = pool.filter((x) => cards[x.id] && isDue(cards[x.id], now, 0))
    .sort((a, b) => retrievability(cards[a.id], now, schedOpts) - retrievability(cards[b.id], now, schedOpts));
  const fresh = pool.filter((x) => !cards[x.id]).slice(0, newMax);
  const rest = pool.filter((x) => cards[x.id] && !due.includes(x))
    .sort((a, b) => (cards[a.id].lastAt || 0) - (cards[b.id].lastAt || 0));
  const picked = [];
  // Only when nothing met is left to fill the session does it take more than
  // `newMax` new ones: a first session is still a session.
  const more = pool.filter((x) => !cards[x.id]);
  for (const x of due.concat(fresh, rest, more)) if (picked.length < n && !picked.includes(x)) picked.push(x);
  return interleave(picked).map((x, k) => pathFor(x, k)).filter(Boolean);
}

/* What a path's cards say about each trigger it touched, as one grade each:
   a wrong case or an Again is Again; a Hard is Hard; otherwise Good, or Easy
   when every graded card was Easy. `results[k]` is `{ right }` for a case
   card and `{ grade }` for a self-graded one; a card not answered is left
   out. */
export function pathGrades(path, results) {
  const by = {};
  path.cards.forEach((c, k) => {
    const r = results[k];
    if (!r) return;
    (by[c.trigger] = by[c.trigger] || []).push(r);
  });
  const out = {};
  for (const id in by) {
    const rs = by[id];
    const graded = rs.filter((r) => typeof r.grade === "number").map((r) => r.grade);
    if (rs.some((r) => r.right === false) || graded.includes(1)) out[id] = 1;
    else if (graded.includes(2)) out[id] = 2;
    else if (graded.length && graded.every((g) => g === 4)) out[id] = 4;
    else out[id] = 3;
  }
  return out;
}

/* The trigger cards after a path: each graded trigger reviewed once. */
export function gradeTriggers(cards, grades, now, opts) {
  const next = Object.assign({}, cards || {});
  for (const id in grades) next[id] = review(next[id] || null, grades[id], now, opts);
  return next;
}

/* The sentences shown, newest last, capped. */
export function keepRecent(was, shown) {
  const set = new Set(shown);
  return (was || []).filter((r) => !set.has(r)).concat(shown).slice(-RECENT_KEPT);
}
