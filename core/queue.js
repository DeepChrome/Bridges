/* The session builder (docs/PLAYBOOK.md 2.2).
 *
 * This is the bug the owner hit — "131 cards, sequential": the flashcard
 * queue was the ticked sets in unit order, filtered to what was due, Again
 * sent to the very end. A session is built here instead, and the rules are
 * Anki's:
 *
 *   1. due reviews, most forgotten first (retrievability ascending), ties
 *      shuffled — never storage order;
 *   2. learning cards whose step is due, or due within the learn-ahead window;
 *   3. new cards up to `newPerDay`, less what today already introduced;
 *   4. reviews and new cards interleaved evenly — never all of one then all
 *      of the other;
 *   5. siblings buried **for the day**: once a word is answered, its other
 *      directions wait until tomorrow, as they do in Anki. The card just
 *      answered still comes back on its learning step — that is the same card,
 *      not a sibling;
 *   6. capped at `sessionSize`, with what remains reported so the screen can
 *      offer the next chunk;
 *   7. `reviewsPerDay`, past which the day is done;
 *   8. Again re-enters the same session after at least `minGap` other cards.
 *
 * Pure: state and clock in, an ordered list out. The screen owns the session
 * as it runs (`requeue`, `bury`); the counts of what today introduced and
 * answered live in the learner's `daily` slot (core/state.js).
 */

import { DIRECTIONS, kindOf, isDue, retrievability, dayOf, readyFor } from "./scheduler.js";

/* `buryNew` and `buryReview` are Anki's two sibling settings, separately,
   because they cost very different things — see the table in `buildSession`. */
/* `newPerDay` is 5, down from 15 (the owner, 2026-09-17: "The default is maybe
   5"). It is safe to move because it is not the lever: §30aa priced it at 6, 10,
   15 and 25 new cards a day and the route's load barely moved — the lesson
   quizzes create most of the cards, not the flashcard ration. What the number
   does control is how many *unfamiliar* faces a flashcard session opens with,
   and five is a pace a learner can feel finishing. */
export const QUEUE_DEFAULTS = { newPerDay: 5, sessionSize: 20, reviewsPerDay: 200, learnAhead: 20,
                                minGap: 3, buryNew: true, buryReview: false };

/* Today's counts, or a fresh slot when the day has moved on. */
export function dailyFor(daily, now) {
  const day = dayOf(now);
  return daily && daily.day === day ? daily : { day: day, new: 0, reviews: 0 };
}

/* Fisher–Yates on a copy, with the caller's random source so a test and the
   simulator are repeatable. */
function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* Reviews and new cards spread evenly, the way Anki's "mix" does: with R
   reviews and N new the new ones land every R/N places, never bunched at
   either end. Learning cards go first — their step is due now. */
export function interleave(learning, reviews, fresh) {
  const out = learning.slice();
  if (!fresh.length) return out.concat(reviews);
  if (!reviews.length) return out.concat(fresh);
  const step = (reviews.length + fresh.length) / fresh.length;
  let nextNew = step / 2, r = 0, n = 0;
  for (let i = 0; i < reviews.length + fresh.length; i++) {
    if (n < fresh.length && (i >= nextNew || r >= reviews.length)) { out.push(fresh[n++]); nextNew += step; }
    else out.push(reviews[r++]);
  }
  return out;
}

/* -> { items, due, remaining, newLeft, reviewsLeft, done }
 *
 *   seen     the learner's schedule (seen[word][direction])
 *   words    the words the session may draw on (the ticked sets)
 *   dirs     which directions the learner studies on cards
 *   now      the clock, ms
 *   daily    today's counts (dailyFor)
 *   opts     QUEUE_DEFAULTS overrides; `ahead` lifts the new-card ration for
 *            one session (the learner chose to study ahead)
 *   rng      random source, Math.random by default
 */
export function buildSession({ seen, words, dirs, now, daily, opts, rng, ahead }) {
  // An option left unset is the default — `Object.assign` would let an
  // `undefined` through and turn the ration into NaN, which dealt nothing.
  const o = Object.assign({}, QUEUE_DEFAULTS);
  for (const k in opts || {}) if (opts[k] !== undefined) o[k] = opts[k];
  const random = rng || Math.random;
  const directions = (dirs && dirs.length ? dirs : DIRECTIONS).filter((d) => DIRECTIONS.includes(d));
  const today = dailyFor(daily, now);
  const reviewsLeft = Math.max(0, o.reviewsPerDay - today.reviews);
  const newLeft = ahead ? Infinity : Math.max(0, o.newPerDay - today.new);

  const learning = [], reviews = [], fresh = [];
  const todayNum = dayOf(now);
  for (const w of words || []) {
    const entry = (seen && seen[w]) || {};
    /* **Siblings are buried for the day, as Anki buries them** — not merely
     * for the session, which is all `bury()` below can do.
     *
     * A word is three cards (recognise, produce, listen). Answering one used
     * to leave the other two free to be dealt tomorrow, and the day after, so
     * a word the learner plainly knows kept arriving on consecutive days
     * wearing a different hat. The owner, 2026-09-17: *"I shouldn't see the
     * same basic word multiple days in a row unless the algorithm determines
     * that it needs to be."*
     *
     * **New and due are two settings, because they cost very different
     * things.** Priced with `simulate.mjs --bury-new/--bury-review`, the
     * struggling profile, four seeds:
     *
     *     buried        leeches            backlog days
     *     nothing       43.3 (35,45,48,45)  20.8 (18,23,23,19)
     *     new only      46.3 (44,52,41,48)  22.0 (20,25,21,22)
     *     everything    50.8 (55,54,47,47)  28.3 (29,29,28,27)
     *
     * Burying a **due** card defers work that was owed, and the card comes
     * back weaker: seven more leeches and seven more backlog days, worse on
     * every seed. Burying a **new** one defers work that had not started, and
     * costs about three leeches — inside the seed spread. So new siblings wait
     * and due ones do not, which is the distinction Anki draws and the one
     * that buys what he asked for at a price worth paying.
     *
     * The card already answered today is **not** buried by this — a learning
     * step is the same card coming back, which is the algorithm deciding it
     * needs to, and burying that would break the 1m/10m steps entirely. */
    const answeredToday = DIRECTIONS.filter((d) => entry[d] && entry[d].lastAt !== undefined
                                                   && dayOf(entry[d].lastAt) === todayNum);
    /* **Every card that exists is reviewable; `dirs` gates only what is new.**
     *
     * A lesson grades the direction its question exercised (a typed answer is
     * production) whatever the flashcards are set to, so a learner who turns
     * a direction off still accumulates cards in it. Letting `dirs` filter
     * reviews as well made those cards unreachable: due for ever, counted by
     * the tab badge, and never dealt by the screen that owed them. Measured
     * over the full route with `--dirs recognise`: 1,964 cards still due at
     * the end and a backlog on every day of the run. A setting may decide
     * what a learner takes on; it must not strand what they already have. */
    for (const d of DIRECTIONS) {
      const card = entry[d];
      const kind = kindOf(card);
      /* Buried: another direction of this word was answered today. Which kinds
         are buried is two settings, as it is in Anki, because they cost very
         different things — the table in the comment above `buryNew`. */
      const buried = answeredToday.length && !answeredToday.includes(d);
      if (buried && (kind === "new" ? o.buryNew : o.buryReview)) continue;
      if (kind === "new") {
        if (!directions.includes(d)) continue;
        /* A word earns produce and listen by holding its recognise card
           (core/scheduler.js `readyFor`). Without this every word arrives as
           three cards at once and the day it is met costs three reviews. */
        if (!readyFor(entry, d, o.ladder)) continue;
        fresh.push({ word: w, direction: d, card: card || null, kind: kind });
        continue;
      }
      if (!isDue(card, now, o.learnAhead)) continue;
      const item = { word: w, direction: d, card: card, kind: kind, r: retrievability(card, now, o.scheduler) };
      (kind === "learning" ? learning : reviews).push(item);
    }
  }
  // Most forgotten first; equal retrievability in a random order — never
  // the order the words were stored in.
  const byR = (a, b) => a.r - b.r;
  const sortedReviews = shuffled(reviews, random).sort(byR);
  const sortedLearning = shuffled(learning, random).sort((a, b) => a.card.dueAt - b.card.dueAt);
  const due = sortedReviews.length + sortedLearning.length;

  const done = reviewsLeft === 0 && due > 0;
  /* The day's load is what is due (within the day's cap) plus the new cards
     it may introduce; one session takes its share of each in that ratio, so
     a backlog of 131 still lets a couple of new words in, and an empty pile
     is new words alone. */
  const todayReviews = Math.min(due, reviewsLeft);
  const todayNew = Math.min(fresh.length, newLeft);
  const load = todayReviews + todayNew;
  const size = Math.min(o.sessionSize, load);
  const newInSession = load ? Math.min(todayNew, Math.round(size * todayNew / load)) : 0;
  const reviewsInSession = Math.min(todayReviews, size - newInSession);
  const pickedLearning = sortedLearning.slice(0, reviewsInSession);
  const pickedReviews = sortedReviews.slice(0, reviewsInSession - pickedLearning.length);
  const pickedNew = shuffled(fresh, random).slice(0, newInSession);
  const items = interleave(pickedLearning, pickedReviews, pickedNew).slice(0, o.sessionSize);

  return { items: items, due: due, remaining: todayReviews - reviewsInSession,
           newLeft: newLeft === Infinity ? fresh.length : newLeft, reviewsLeft: reviewsLeft, done: done };
}

/* Again: the card comes back after at least `minGap` other cards — a
   learning step inside the session, not the end of the pile. `at` is the
   index of the card just answered; the copy is placed after the gap, or at
   the end when the session is shorter than that. */
export function requeue(items, at, item, minGap) {
  const gap = minGap === undefined ? QUEUE_DEFAULTS.minGap : minGap;
  const pos = Math.min(items.length, at + 1 + gap);
  return items.slice(0, pos).concat([Object.assign({}, item, { again: true })], items.slice(pos));
}

/* A word answered buries its siblings for the rest of the session: nothing
   after `from` may be another direction of the same word. A re-queued copy of
   the very card just answered is not a sibling and stays. */
export function bury(items, from, word, direction) {
  return items.filter((x, i) => i <= from || x.word !== word || x.direction === direction);
}
