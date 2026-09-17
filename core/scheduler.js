/* The scheduler: ts-fsrs (FSRS-6) behind the app's own card.
 *
 * Phase 2 of docs/PLAYBOOK.md. core/fsrs.js is the hand-rolled FSRS-4.5 the
 * web app is frozen on; this is what the native app schedules with, and the
 * formulas are the library's — not rewritten here, which is the point.
 *
 * A card is one (word, direction). Three directions:
 *
 *   recognise   Russian shown, meaning asked        (RU → EN)
 *   produce     meaning shown, Russian asked         (EN → RU)
 *   listen      Russian heard, nothing shown
 *
 * They are siblings: the learner's `seen[word]` holds up to three cards,
 * `seen[word][direction]`. The card keeps the library's fields under the
 * app's names, with **time in milliseconds** — reviews are timed to the
 * minute now, because a card answered Again comes back in ten minutes, not
 * tomorrow:
 *
 *   { dueAt, lastAt?, s, d, state, steps, reps, lapses, elapsed, scheduled }
 *
 * `dueAt` and `lastAt` are named so that a reader still comparing `due` to a
 * day number fails loudly (undefined) instead of finding nothing due. A card
 * from before this — `{ s, d, due, last, … }` in days — is recognised and
 * converted on the way in (`fromLegacy`); the web app still writes that shape
 * and every old backup carries it.
 *
 * Days are whatever `dayOf` in core/util.js says they are — local days ending
 * at 4 am on a configured device, UTC days on one that never called
 * `setDayStart`. A review card is due on its day whatever the hour; a learning
 * card is due at its minute, or within the learn-ahead window.
 */

import { fsrs, createEmptyCard, State } from "ts-fsrs";
import { dayOf as dayOfLocal } from "./util.js";

export const DAY = 86400000;
export const MINUTE = 60000;
/* One day function for the whole app, and it lives in core/util.js because
   `today()` there was the other half of it — the streak counted UTC days while
   the scheduler counted UTC days separately, which is two sources of truth for
   one fact waiting to disagree. Where the day starts is set once at boot
   (`setDayStart`), never here. */
export const dayOf = dayOfLocal;

export const DIRECTIONS = ["recognise", "produce", "listen"];
export const isDirection = (d) => DIRECTIONS.includes(d);

/* The library's states, by number as the card and the log store them. */
export const NEW = State.New, LEARNING = State.Learning, REVIEW = State.Review, RELEARNING = State.Relearning;

/* The playbook's defaults (2.1): retention 0.9, a year at most, fuzz on,
   short-term steps on. `w` is null until an optimiser has fitted one. */
export const SCHEDULER_DEFAULTS = { retention: 0.9, maxInterval: 365, fuzz: true, w: null, learnAhead: 20 };
export const RETENTION_MIN = 0.8, RETENTION_MAX = 0.95;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const gradeOf = (g) => clamp(g | 0, 1, 4);

/* One library instance per parameter set. Building one is cheap, but the
   parameters are checked and clamped on the way in and a review should not
   pay that on every grade. */
const instances = new Map();
export function schedulerFor(opts) {
  const o = Object.assign({}, SCHEDULER_DEFAULTS, opts || {});
  const retention = clamp(Number(o.retention) || SCHEDULER_DEFAULTS.retention, 0.7, 0.99);
  const w = Array.isArray(o.w) && o.w.length ? o.w : null;
  const key = `${retention}|${o.maxInterval}|${o.fuzz === false ? 0 : 1}|${w ? w.join(",") : ""}`;
  let f = instances.get(key);
  if (!f) {
    f = fsrs(Object.assign({
      request_retention: retention, maximum_interval: o.maxInterval,
      enable_fuzz: o.fuzz !== false, enable_short_term: true,
    }, w ? { w: w } : {}));
    instances.set(key, f);
  }
  return f;
}

/* A word earns its harder directions (2026-09-16).
 *
 * Three cards a word, all three starting at once, is three times the review
 * load on the day a word is met — and the simulator, once it was honest
 * enough to model them (ROADMAP 13.26), said what that costs: at 40 lessons
 * every profile sat permanently in backlog, 113 leeches for the *quick*
 * learner against 8 before, and 39 of 59 days spent clearing rather than
 * learning. A learner cannot be asked to produce and to transcribe a word on
 * the same day they first see it.
 *
 * So the ladder is the one the app already believes in (§30j `PRODUCE_AT`):
 * recognition meets a word, production keeps it. A word's `produce` and
 * `listen` cards are not dealt until its `recognise` card has held for
 * LADDER_AT days of stability — the same four days, and for the same reason:
 * it is roughly the third or fourth correct recall, late enough that the word
 * is known and early enough that it is still being learned.
 *
 * **Swept, and it buys less than it first appeared to.** `simulate.mjs
 * --ladder N`, four seeds, the struggling profile at 40 lessons:
 *
 *     ladder   leeches (per seed)      backlog days
 *       0      50, 43, 45, 53  (47.8)  26, 21, 24, 20  (22.8)
 *       4      35, 49, 48, 39  (42.8)  18, 20, 19, 19  (19.0)
 *
 * The leech count is **noise** — the ladder is worse on two of the four seeds
 * and the means are a few cards apart. What is real is the backlog: fewer
 * days overflow the cap on *every* seed, which is what gating new cards
 * behind maturity should do, since it spreads the load rather than making any
 * one card easier. The rule is kept on that evidence and no more; anyone
 * tempted to claim it cures leeches should re-read this table.
 *
 * Cards already created are never withdrawn; this gates only what is *new*,
 * so a profile migrated from Phase 1 keeps everything it had. */
export const LADDER_AT = 4;
export const LADDER_FROM = "recognise";
export function readyFor(entry, direction, at = LADDER_AT) {
  if (direction === LADDER_FROM) return true;
  if (entry && entry[direction]) return true;          // it exists; it is not new
  const base = entry && entry[LADDER_FROM];
  return !!base && typeof base.s === "number" && base.s >= at;
}

/* The scheduler's options as the learner's state holds them: the retention
   they chose, and a fitted `w` once an optimiser has produced one. */
export const schedulerOpts = (st) => ({
  retention: st && st.retention !== undefined ? st.retention : SCHEDULER_DEFAULTS.retention,
  w: (st && st.w) || null,
});

/* ------------------------------------------------------------- the card */

function toTs(card) {
  return {
    due: new Date(card.dueAt), stability: card.s || 0, difficulty: card.d || 0,
    elapsed_days: card.elapsed || 0, scheduled_days: card.scheduled || 0,
    learning_steps: card.steps || 0, reps: card.reps || 0, lapses: card.lapses || 0,
    state: card.state || NEW,
    last_review: card.lastAt !== undefined && card.lastAt !== null ? new Date(card.lastAt) : undefined,
  };
}

function fromTs(c) {
  const out = {
    dueAt: +c.due, s: c.stability, d: c.difficulty, state: c.state, steps: c.learning_steps,
    reps: c.reps, lapses: c.lapses, elapsed: c.elapsed_days, scheduled: c.scheduled_days,
  };
  if (c.last_review) out.lastAt = +c.last_review;
  return out;
}

export function newCard(now) { return fromTs(createEmptyCard(new Date(now))); }

/* A card from before Phase 2: `{ s, d, due, last, reps, lapses }` with `due`
   and `last` as day numbers and no `state` — every card carries a state since.
   (A Phase 1 database row is brought forward by the schema step in
   native/src/sqlite.js, with the same rule in SQL; this is the rule for a
   blob, a backup, or the web app's export.) */
export function isLegacyCard(c) {
  if (!c || typeof c !== "object" || c.state !== undefined) return false;
  return typeof c.due === "number" || typeof c.s === "number" || typeof c.dueAt === "number";
}

export function fromLegacy(c) {
  const s = c.s || 0;
  const due = c.due !== undefined ? c.due : (c.dueAt || 0);
  const last = c.last !== undefined ? c.last : c.lastAt;
  const kept = s > 0 && typeof last === "number";
  const out = {
    dueAt: due * DAY, s: s, d: c.d || 0, state: s > 0 ? REVIEW : NEW, steps: 0,
    reps: c.reps || 0, lapses: c.lapses || 0, elapsed: 0,
    scheduled: kept ? Math.max(0, due - last) : 0,
  };
  if (kept) out.lastAt = last * DAY;
  return out;
}

/* `seen` as the app keeps it now, whatever shape it arrived in: a word that
   was one card becomes that card under `recognise` — recognition is the
   weaker claim, and a single blended card is proof of no more; production
   and listening start new. Returns the same object when nothing needed
   converting, so a save can see that nothing changed. */
export function normaliseSeen(seen) {
  if (!seen || typeof seen !== "object") return {};
  let out = null;
  for (const w in seen) {
    const x = seen[w];
    if (!x || typeof x !== "object") continue;
    let fixed = null;
    if (isLegacyCard(x)) {
      fixed = { recognise: fromLegacy(x) };
    } else {
      for (const dir in x) {
        if (x[dir] && isLegacyCard(x[dir])) {
          fixed = fixed || Object.assign({}, x);
          fixed[dir] = fromLegacy(x[dir]);
        }
      }
    }
    if (fixed) {
      out = out || Object.assign({}, seen);
      out[w] = fixed;
    }
  }
  return out || seen;
}

/* --------------------------------------------------------- one review */

/* What each button would do, for the four labels: "10m · 1d · 4d · 9d". */
export function preview(card, now, opts) {
  const rec = schedulerFor(opts).repeat(card ? toTs(card) : createEmptyCard(new Date(now)), new Date(now));
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = { card: fromTs(rec[g].card), label: intervalLabel(+rec[g].card.due - now) };
  return out;
}

export function intervalLabel(ms) {
  if (ms < MINUTE) return "now";
  const m = Math.round(ms / MINUTE);
  if (m < 60) return m + "m";
  const h = Math.round(ms / 3600000);
  if (h < 24) return h + "h";
  const d = Math.round(ms / DAY);
  if (d < 30) return d + "d";
  if (d < 365) return Math.round(d / 30) + "mo";
  return (d / 365).toFixed(1) + "y";
}

export function review(card, grade, now, opts) {
  const r = schedulerFor(opts).next(card ? toTs(card) : createEmptyCard(new Date(now)), new Date(now), gradeOf(grade));
  return fromTs(r.card);
}

/* Probability the card is still recallable now. A card with no memory is 0. */
export function retrievability(card, now, opts) {
  if (!card || !card.s) return 0;
  return schedulerFor(opts).get_retrievability(toTs(card), new Date(now), false);
}

/* ------------------------------------------------------------ due, new */

export const kindOf = (card) =>
  (!card || card.state === NEW ? "new"
    : card.state === LEARNING || card.state === RELEARNING ? "learning" : "review");

/* A review card is due on its day whatever the hour: reviewed at eight in
   the evening, it must not be missing from a nine o'clock session four days
   later. A learning card is due at its minute, or inside the learn-ahead
   window so a ten-minute step does not leave the learner staring at an
   empty pile. A new card is not "due" — it is new, and rationed separately. */
export function isDue(card, now, learnAhead) {
  if (!card || card.state === NEW) return false;
  const ahead = (learnAhead === undefined ? SCHEDULER_DEFAULTS.learnAhead : learnAhead) * MINUTE;
  if (card.state === LEARNING || card.state === RELEARNING) return card.dueAt <= now + ahead;
  return dayOf(card.dueAt) <= dayOf(now);
}

export const cardsOf = (entry) =>
  DIRECTIONS.filter((d) => entry && entry[d]).map((d) => ({ direction: d, card: entry[d] }));

export const wordMet = (seen, w) => !!(seen && seen[w] && DIRECTIONS.some((d) => seen[w][d]));

/* Every (word, direction) that is due, across the whole schedule. */
export function dueCards(seen, now, learnAhead) {
  const out = [];
  for (const w in seen || {}) {
    for (const { direction, card } of cardsOf(seen[w])) {
      if (isDue(card, now, learnAhead)) out.push({ word: w, direction: direction, card: card });
    }
  }
  return out;
}

export const anyDue = (entry, now, learnAhead) =>
  cardsOf(entry).some(({ card }) => isDue(card, now, learnAhead));

/* A word that wants attention: one with a card due, or one the learner added
   to review themselves (a new card in the schedule comes only from "Add to
   review" — a word taught in a lesson has no card until it is graded). That
   is what the quiz tops up with and what the "Due today" set holds; the due
   *count* stays what is due. */
export const wanted = (entry, now, learnAhead) =>
  cardsOf(entry).some(({ card }) => card.state === NEW || isDue(card, now, learnAhead));

/* The strongest memory a word has, in days of stability — what "strongest
   first" means where a list is sorted by it. */
export const strength = (entry) =>
  cardsOf(entry).reduce((a, { card }) => Math.max(a, card.s || 0), 0);

export const maxLapses = (entry) =>
  cardsOf(entry).reduce((a, { card }) => Math.max(a, card.lapses || 0), 0);

/* A day is done when something was answered today and nothing is waiting
   (§30t). Not `state.day`, which is stamped by opening the app; what means
   work is the review that a grade stamps on a card. */
export function reviewedOn(entry, day) {
  return cardsOf(entry).some(({ card }) => card.lastAt !== undefined && dayOf(card.lastAt) === day);
}
export function workedOn(state, day) {
  const seen = (state && state.seen) || {};
  for (const w in seen) if (reviewedOn(seen[w], day)) return true;
  return false;
}
export const dayDone = (state, due, day) => (due || 0) === 0 && workedOn(state, day);

/* ------------------------------------------------------------- trouble */

/* A word is "trouble" once a card of it has lapsed repeatedly or sits at high
   difficulty. Per card; a word is trouble if any of its directions is. */
export const LEECH_LAPSES = 4;
export function isTrouble(card) {
  if (!card) return false;
  return (card.lapses || 0) >= LEECH_LAPSES || ((card.d || 0) >= 8.5 && (card.reps || 0) >= 3);
}
export const wordTrouble = (entry) => cardsOf(entry).some(({ card }) => isTrouble(card));

/* One graded review applied to learner state, returned as new objects. The
   trouble rule follows the grade: a lapse on a word the scheduler now counts
   as a leech is held against it, and any recall that lifts every direction
   back out clears it. `prev` is the card as it was, for undo. */
export function applyGrade(seen, trouble, word, direction, grade, now, opts) {
  if (!isDirection(direction)) throw new Error("not a direction: " + direction);
  const g = gradeOf(grade);
  const entry = (seen && seen[word]) || {};
  const prev = entry[direction];
  const card = review(prev, g, now, opts);
  const nextEntry = Object.assign({}, entry, { [direction]: card });
  const nextSeen = Object.assign({}, seen, { [word]: nextEntry });
  const nextTrouble = Object.assign({}, trouble);
  if (g === 1 && isTrouble(card)) nextTrouble[word] = (nextTrouble[word] || 0) + 1;
  else if (g > 1 && nextTrouble[word] && !wordTrouble(nextEntry)) delete nextTrouble[word];
  return { seen: nextSeen, trouble: nextTrouble, card: card, prev: prev };
}

/* The grade a right-or-wrong answer earns (one rule for every runner): an
   answer reached with the table open is Hard, not Good — recognised, not
   recalled. */
export const gradeFor = (correct, hinted) => (correct ? (hinted ? 2 : 3) : 1);

/* ----------------------------------------------------------- the log */

/* The row a review leaves behind: the card as it *was*, the grade, when, and
   what asked. The optimiser fits to exactly this, and it cannot be read back
   off the card afterwards. Built before the grade is applied, from the same
   card. `at` is the clock in ms and the row's key with the word and
   direction; `now` is the same clock, kept apart so a batch can give each row
   its own millisecond. */
export function reviewRow(card, word, direction, grade, now, at, source) {
  const c = card && card.s ? card : null;
  return {
    word: word, direction: direction, grade: gradeOf(grade), day: dayOf(now), at: at,
    s: c ? c.s : null, d: c ? c.d : null,
    due: card ? card.dueAt : null,
    last: card && card.lastAt !== undefined ? card.lastAt : null,
    reps: card ? (card.reps || 0) : 0, lapses: card ? (card.lapses || 0) : 0,
    elapsed: card && card.lastAt !== undefined ? Math.max(0, Math.round((now - card.lastAt) / DAY)) : null,
    state: card ? (card.state || NEW) : NEW, steps: card ? (card.steps || 0) : 0,
    scheduled: card ? (card.scheduled || 0) : null,
    source: source || null,
  };
}

/* Rows for a batch of grades applied in order — a question that grades
   several words, a conversation turn. `list` is [{ word, direction, grade }].
   A card graded twice in one batch gets two rows, the second built on the
   card the first produced, each a millisecond on so no two share a key. */
export function reviewRows(seen, list, now, source, opts) {
  let cur = seen || {};
  const rows = [];
  for (const it of list || []) {
    if (!it || !it.word || !isDirection(it.direction)) continue;
    const entry = cur[it.word] || {};
    rows.push(reviewRow(entry[it.direction], it.word, it.direction, it.grade, now, now + rows.length, source));
    cur = applyGrade(cur, {}, it.word, it.direction, it.grade, now, opts).seen;
  }
  return rows;
}

/* Which direction a question kind exercises (native/src/screens/Run.js VIEWS).
   The runner grades a question's words through the card of this direction;
   registry.test.js holds that every kind is here. */
export const DIRECTION_OF_KIND = {
  "choose-en": "recognise", match: "recognise", grammar: "recognise", stress: "recognise",
  "choose-ru": "produce", cloze: "produce", type: "produce", form: "produce",
  cases: "produce", aspect: "produce", agreement: "produce", conjugation: "produce",
  say: "produce", "pair-say": "produce",
  listen: "listen", hear: "listen", scene: "listen", passage: "listen", heard: "listen",
  "pair-hear": "listen", shadow: "listen",
  /* A mouth drill that grades no word (core/buildup.js) — it is here because
     every kind must name a direction, not because a card is ever written. */
  buildup: "produce",
};
export const directionOfKind = (kind) => DIRECTION_OF_KIND[kind] || "recognise";
