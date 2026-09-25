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

/* **A word is one card** (the owner, 2026-09-23: *"for me a word is
 * technically 1 card. They can elect to drill in one way, both ways, or audio
 * only… It should default to Russian to English though."*).
 *
 * Phase 2 (§30w) gave every word three cards — recognise, produce, listen —
 * each its own FSRS memory, and the honest simulator (§30aa) priced it: three
 * times the material, the review load pinned at the daily cap for two hundred
 * days, a ladder invented to spread it and sibling burying invented to hide
 * it. He does not want that, and he is the one who studies with it.
 *
 * So `DIRECTIONS` are now the three **fronts** a card can be asked through —
 * the Russian shown, the meaning shown, the Russian heard — and a direction
 * on a log row or a session item records *how the card was asked*, never
 * which of several memories was touched. There is one memory a word, and it
 * lives in the `CARD` slot of `seen[word]`; the slot keeps its old name so no
 * row, backup or migration has to move. A lesson question, a spoken turn and
 * a flashcard all grade the same card, and a learner who ticks two fronts
 * meets the card through each in turn. */
export const DIRECTIONS = ["recognise", "produce", "listen"];
export const isDirection = (d) => DIRECTIONS.includes(d);
export const CARD = "recognise";
/* The shipped default front: Russian on the front, the meaning behind. */
export const DEFAULT_FRONTS = [CARD];
/* The word's card. An entry a Phase 2 build left as several cards is read as
   its strongest (`mergeEntry`), so every reader agrees before the save that
   merges it for good. */
export const cardFor = (entry) => {
  const m = mergeEntry(entry);
  return (m && m[CARD]) || null;
};

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

/* A word that Phase 2 split into several cards, back to one. The card kept is
   the **strongest memory** — the most stability, since that is what
   `strength` always reported as the word's — and a tie goes to the slot
   order, recognise first. Nothing is lost that mattered: the review log
   holds every grade of every former card, and a memory weaker than the one
   kept was a claim the kept one already covered. Returns the entry itself
   when it is already one card, so a save can see nothing changed. */
export function mergeEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const dirs = DIRECTIONS.filter((d) => entry[d]);
  if (dirs.length === 0) return entry;
  if (dirs.length === 1 && dirs[0] === CARD) return entry;
  let best = null;
  for (const d of dirs) {
    const c = entry[d];
    if (!best || (c.s || 0) > (best.s || 0)) best = c;
  }
  return { [CARD]: best };
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

/* `seen` as the app keeps it now, whatever shape it arrived in: a card timed
   in days becomes one timed in milliseconds, and a word Phase 2 had split into
   several cards becomes one again (`mergeEntry`). Returns the same object
   when nothing needed converting, so a save can see that nothing changed. */
export function normaliseSeen(seen) {
  if (!seen || typeof seen !== "object") return {};
  let out = null;
  for (const w in seen) {
    const x = seen[w];
    if (!x || typeof x !== "object") continue;
    let fixed = null;
    if (isLegacyCard(x)) {
      fixed = { [CARD]: fromLegacy(x) };
    } else {
      for (const dir in x) {
        if (x[dir] && isLegacyCard(x[dir])) {
          fixed = fixed || Object.assign({}, x);
          fixed[dir] = fromLegacy(x[dir]);
        }
      }
      const merged = mergeEntry(fixed || x);
      if (merged !== (fixed || x)) fixed = merged;
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

/* The cards an entry holds — one since 2026-09-23, still a list so every
   reader that summed or scanned "a word's cards" reads the same way. An entry
   not yet merged (a backup from the three-card weeks) answers with its
   strongest, as `cardFor` does. */
export const cardsOf = (entry) => {
  const card = cardFor(entry);
  return card ? [{ direction: CARD, card: card }] : [];
};

/* Every word whose card is due, across the whole schedule. */
export function dueCards(seen, now, learnAhead) {
  const out = [];
  for (const w in seen || {}) {
    for (const { direction, card } of cardsOf(seen[w])) {
      if (isDue(card, now, learnAhead)) out.push({ word: w, direction: direction, card: card });
    }
  }
  return out;
}

/* A word that wants attention: its card is due, or the learner added it to
   review themselves (a new card in the schedule comes only from "Add to
   review" — a word taught in a lesson has no card until it is graded). That
   is what the quiz tops up with and what the "Due today" set holds; the due
   *count* stays what is due. */
export const wanted = (entry, now, learnAhead) =>
  cardsOf(entry).some(({ card }) => card.state === NEW || isDue(card, now, learnAhead));

/* A word's memory, in days of stability — what "strongest first" means where
   a list is sorted by it. */
export const strength = (entry) =>
  cardsOf(entry).reduce((a, { card }) => Math.max(a, card.s || 0), 0);

/* **Familiarity**, 0–100, for the flashcard (the owner, 2026-09-23: *"the
 * more often the user marks easy, the higher that score goes up to a max of
 * 100… colorized… from red to yellow to green"*).
 *
 * Not a new counter. FSRS already keeps the number this is: **stability**,
 * the days a memory is expected to hold. Every Good raises it, Easy raises
 * it more, Again knocks it back — which is exactly the behaviour he
 * described, and reading it off the card means the score can never disagree
 * with the schedule (a second tally would, the first time an Undo or a
 * restore touched one and not the other). Log-scaled, because stability is:
 * a memory held a day is nothing like one held a week, and a year is the
 * scheduler's own ceiling (`maxInterval`), so that is where 100 sits.
 *
 *   1 day → 12   4 days → 27   a month → 58   100 days → 78   a year → 100
 *
 * A card that does not exist, or is still new, has no score: it is flagged
 * New instead. */
export const FAMILIAR_AT = SCHEDULER_DEFAULTS.maxInterval;
export function familiarity(card) {
  if (!card || card.state === NEW || !(card.s > 0)) return null;
  return Math.round(100 * Math.min(1, Math.log1p(card.s) / Math.log1p(FAMILIAR_AT)));
}

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

/* **Trouble** (the owner, 2026-09-24): *"it's very normal to press Again on
 * a card for the first 5–7 times you've seen it… but if you're still pressing
 * Again after many many times, especially in comparison to the other cards,
 * then maybe we mark it trouble… and cap troubled words at something like
 * 20."*
 *
 * So a card is not trouble until it has been *seen enough to judge* —
 * TROUBLE_MIN_REPS answers — and then only when it keeps failing: TROUBLE_LAPSES
 * lapses (an Again on a card that had graduated; learning-step Agains are not
 * lapses, which is what makes the early ones free), or a difficulty the
 * scheduler has pushed near its ceiling. `troubleRank` orders the candidates by
 * how badly they are going — lapses per answer, then difficulty — and
 * `troubleWords` keeps the worst TROUBLE_CAP of them: the bank is the words
 * that stand out *against the others*, not everything that ever missed. The
 * flag on a card and the "Trouble words" set read the same list. */
export const TROUBLE_MIN_REPS = 8;
export const TROUBLE_LAPSES = 3;
export const TROUBLE_CAP = 20;
export function isTrouble(card) {
  if (!card || (card.reps || 0) < TROUBLE_MIN_REPS) return false;
  return (card.lapses || 0) >= TROUBLE_LAPSES || (card.d || 0) >= 9;
}
export const troubleRank = (card) =>
  (card ? ((card.lapses || 0) / Math.max(1, card.reps || 0)) * 10 + (card.d || 0) / 10 : 0);
export const wordTrouble = (entry) => cardsOf(entry).some(({ card }) => isTrouble(card));
/* The bank: every word whose card is trouble, worst first, at most TROUBLE_CAP. */
export function troubleWords(seen) {
  const out = [];
  for (const w in seen || {}) {
    const card = cardFor(seen[w]);
    if (isTrouble(card)) out.push({ w, r: troubleRank(card) });
  }
  return out.sort((a, b) => b.r - a.r).slice(0, TROUBLE_CAP).map((x) => x.w);
}

/* One graded review applied to learner state, returned as new objects. The
   trouble rule follows the grade: a lapse on a word the scheduler now counts
   as a leech is held against it, and a recall that lifts it back out clears
   it. `direction` is how the card was asked — it is checked, since the log
   row records it, and it does not choose a card: there is one. `prev` is the
   card as it was, for undo. */
export function applyGrade(seen, trouble, word, direction, grade, now, opts) {
  if (!isDirection(direction)) throw new Error("not a direction: " + direction);
  const g = gradeOf(grade);
  const entry = mergeEntry((seen && seen[word]) || {});
  const prev = cardFor(entry) || undefined;
  const card = review(prev, g, now, opts);
  const nextEntry = { [CARD]: card };
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
    const entry = mergeEntry(cur[it.word] || {});
    rows.push(reviewRow(cardFor(entry) || undefined, it.word, it.direction, it.grade, now, now + rows.length, source));
    cur = applyGrade(cur, {}, it.word, it.direction, it.grade, now, opts).seen;
  }
  return rows;
}

/* Which front a question kind asks through (native/src/screens/Run.js VIEWS),
   recorded on the review row so the log says how a word was asked;
   registry.test.js holds that every kind is here. */
export const DIRECTION_OF_KIND = {
  "choose-en": "recognise", match: "recognise", stress: "recognise",
  "choose-ru": "produce", cloze: "produce", type: "produce", form: "produce",
  cases: "produce", aspect: "produce", agreement: "produce", conjugation: "produce",
  say: "produce", "pair-say": "produce",
  listen: "listen", hear: "listen", scene: "listen",
  "pair-hear": "listen", shadow: "listen",
  /* A mouth drill that grades no word (core/buildup.js) — it is here because
     every kind must name a direction, not because a card is ever written. */
  buildup: "produce",
};
export const directionOfKind = (kind) => DIRECTION_OF_KIND[kind] || "recognise";
