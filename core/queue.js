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
 *   5. capped at `sessionSize`, with what remains reported so the screen can
 *      offer the next chunk;
 *   6. `reviewsPerDay`, past which the day is done;
 *   7. Again re-enters the same session after at least `minGap` other cards.
 *
 * A word is one card (core/scheduler.js CARD, 2026-09-23), so there are no
 * siblings to bury and no ladder to climb — both existed only to manage the
 * load of three cards a word, and went with them. `dirs` is which **fronts**
 * the learner has ticked; a card is dealt through one of them, taking them in
 * turn review by review, so "both ways" is the same card met each way
 * alternately and "audio only" is the same card heard.
 *
 * Pure: state and clock in, an ordered list out. The screen owns the session
 * as it runs (`requeue`); the counts of what today introduced and answered
 * live in the learner's `daily` slot (core/state.js).
 */

import { DIRECTIONS, DEFAULT_FRONTS, cardFor, kindOf, isDue, retrievability, dayOf, weakestSkill,
         SKILL_OF_FRONT } from "./scheduler.js";
/* (The day's goal — rollGoal, goalSession — is at the foot of the file.) */

/* `newPerDay` is 5, down from 15 (the owner, 2026-09-17: "The default is maybe
   5"). It is safe to move because it is not the lever: §30aa priced it at 6, 10,
   15 and 25 new cards a day and the route's load barely moved — the lesson
   quizzes create most of the cards, not the flashcard ration. What the number
   does control is how many *unfamiliar* faces a flashcard session opens with,
   and five is a pace a learner can feel finishing. */
/* Reviews a day: fifty (the owner, 2026-10-02: "when it says 213 for example,
   it's just overwhelming and I don't want to intimidate people… maybe… capped
   at like 50"). It was unlimited from 2026-09-30, because a cap that the badge
   ignored met "Daily goal met" beside 157 owed. The badge now counts the same
   capped portion the pile deals (native data.js dueCount), so the two cannot
   disagree; what is left waits for tomorrow, as in Anki, and "Keep going"
   (`beyond`) lifts the cap for a learner who wants more. */
export const DAILY_REVIEWS = 50;
export const QUEUE_DEFAULTS = { newPerDay: 5, sessionSize: 20, reviewsPerDay: DAILY_REVIEWS, learnAhead: 20,
                                minGap: 3 };

/* The front a card is asked through this time. With one front ticked there is
   no choice. With several, **the front whose skill is weakest** (the owner,
   2026-10-29: the app "should be intelligent when picking" — a word recalled
   into Russian easily and out of it poorly is asked from the English); the
   skill scores are the word's slots (core/skills.js), and a skill never asked
   is the weakest of all. Where two fronts tie — Russian shown and Russian heard
   both exercise one skill, or the word is new to both — the ticked fronts are
   taken in turn by how many times the card has been answered, which is the
   whole rule when no `entry` is handed in. A new card starts on the first
   ticked front, which by default is the Russian. */
export function frontFor(card, fronts, entry) {
  const turn = fronts[((card && card.reps) || 0) % fronts.length];
  if (!entry || fronts.length < 2) return turn;
  // No front's skill scored yet: nothing to prefer, so the turn decides.
  if (!fronts.some((f) => { const c = entry[SKILL_OF_FRONT[f]]; return c && c.s > 0; })) return turn;
  const weak = weakestSkill(entry, fronts.map((f) => SKILL_OF_FRONT[f]));
  const tied = fronts.filter((f) => SKILL_OF_FRONT[f] === weak);
  return tied.includes(turn) ? turn : tied[((card && card.reps) || 0) % tied.length];
}

/* Words or sentences: what a learner chooses to study on cards (the owner,
   2026-09-28: *"it can be sentences or individual words based on what the user
   wants to study"*). Read off the card's own key — a sentence is written with a
   space in it, a word is not — so a deck card or a pooled sentence needs no tag
   and the badge and the session cannot classify one card two ways. */
export const CARD_KINDS = ["words", "sentences"];
/* Both, since 2026-10-09 (the owner: "Make sure we also include sentences in
   the studies and daily reviews. Right now it seems very vocab centric"). */
export const DEFAULT_KINDS = ["words", "sentences"];
/* The share of a session's new cards kept for sentences when both kinds are
   studied. Ranked on one scale with the words, a sentence is as common as its
   rarest word, so with five new cards a day they came behind every word and
   were almost never dealt. A third, interleaved. */
export const SENTENCE_SHARE = 1 / 3;
export function mixNew(ordered, share = SENTENCE_SHARE) {
  const words = ordered.filter((x) => cardKind(x.word) === "words");
  const sents = ordered.filter((x) => cardKind(x.word) === "sentences");
  if (!words.length || !sents.length || !share) return ordered;
  const out = [];
  let s = 0, w = 0;
  while (w < words.length || s < sents.length) {
    const wantS = Math.floor((out.length + 1) * share) > s;
    if ((wantS && s < sents.length) || w >= words.length) out.push(sents[s++]);
    else out.push(words[w++]);
  }
  return out;
}
export const cardKind = (word) => (/\s/.test(String(word || "").trim()) ? "sentences" : "words");
export const kindsOf = (chosen) => {
  const k = (chosen || []).filter((x) => CARD_KINDS.includes(x));
  return k.length ? k : DEFAULT_KINDS;
};

/* An extra round on chosen cards, due or not — the trouble words once the
   day's pile is done (the owner, 2026-09-28: *"after the user sufficiently
   studies for the day, they can have the option to review more trouble
   words"*). It is practice beyond the schedule, so nothing is rationed and
   nothing is left "remaining"; each answer is still a real review, which FSRS
   takes early without complaint. Order is the caller's — worst first. */
export function practiceSession({ seen, words, dirs, size }) {
  const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
  if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
  const items = (words || []).slice(0, size || QUEUE_DEFAULTS.sessionSize).map((w) => {
    const entry = (seen && seen[w]) || {};
    const card = cardFor(entry);
    return { word: w, direction: frontFor(card, fronts, entry), card: card, kind: kindOf(card) };
  });
  return { items: items, due: 0, remaining: 0, newLeft: 0, reviewsLeft: Infinity, done: false,
           practice: true };
}

/* A card in a learning step it was put in today — the one kind of due card
   the daily cap does not bound (buildSession; native data.js dueCount). */
export const stepToday = (card, now) => !!card && kindOf(card) === "learning"
  && card.lastAt !== undefined && card.lastAt !== null && dayOf(card.lastAt) === dayOf(now);

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
export function buildSession({ seen, words, dirs, now, daily, opts, rng, ahead, beyond }) {
  // An option left unset is the default — `Object.assign` would let an
  // `undefined` through and turn the ration into NaN, which dealt nothing.
  const o = Object.assign({}, QUEUE_DEFAULTS);
  for (const k in opts || {}) if (opts[k] !== undefined) o[k] = opts[k];
  const random = rng || Math.random;
  const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
  if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
  const today = dailyFor(daily, now);
  // `beyond`: the learner chose to keep going past the day's reviews.
  const reviewsLeft = beyond ? Infinity : Math.max(0, o.reviewsPerDay - today.reviews);
  const newLeft = ahead ? Infinity : Math.max(0, o.newPerDay - today.new);

  const learning = [], reviews = [], fresh = [];
  for (const w of words || []) {
    const entry = (seen && seen[w]) || {};
    const card = cardFor(entry);
    const kind = kindOf(card);
    const direction = frontFor(card, fronts, entry);
    if (kind === "new") {
      fresh.push({ word: w, direction: direction, card: card || null, kind: kind });
      continue;
    }
    if (!isDue(card, now, o.learnAhead)) continue;
    const item = { word: w, direction: direction, card: card, kind: kind, r: retrievability(card, now, o.scheduler) };
    /* A learning step is exempt from the cap only when it is today's — a card
       answered today and coming back in ten minutes is being learnt right now.
       One left mid-step on an earlier day is a review like any other: the
       owner saw "218 due … 223 left" after a few days away (2026-10-02),
       because every card stuck in a step had walked past the fifty. */
    (stepToday(card, now) ? learning : reviews).push(item);
  }
  /* **Which fifty, when there are more** (the owner, 2026-10-02: "the app can
     decide what the best words to show the user are when it gets to 50 or when
     the user has been stale on reviewing"). Most forgotten first, as before,
     but a common word forgotten outranks a rare one forgotten a little more:
     «как» lost is a word lost from every sentence. `rank` is the caller's
     frequency order (lower is commoner); without it the order is retrievability
     alone, ties shuffled — never the order the words were stored in. */
  const weight = o.rank
    ? (x) => { const k = o.rank(x.word); return Number.isFinite(k) ? 1 + 0.25 * Math.log10(1 + k / 100) : 1.5; }
    : () => 1;
  const urgency = (x) => (1 - x.r) / weight(x);
  const sortedReviews = shuffled(reviews, random).sort((a, b) => urgency(b) - urgency(a));
  const sortedLearning = shuffled(learning, random).sort((a, b) => a.card.dueAt - b.card.dueAt);
  const due = sortedReviews.length + sortedLearning.length;

  const done = reviewsLeft === 0 && sortedReviews.length > 0 && !sortedLearning.length;
  /* The day's load is what is due (within the day's cap) plus the new cards
     it may introduce; one session takes its share of each in that ratio, so
     a backlog of 131 still lets a couple of new words in, and an empty pile
     is new words alone. */
  const todayReviews = sortedLearning.length + Math.min(sortedReviews.length, reviewsLeft);
  const todayNew = Math.min(fresh.length, newLeft);
  const load = todayReviews + todayNew;
  const size = Math.min(o.sessionSize, load);
  const newInSession = load ? Math.min(todayNew, Math.round(size * todayNew / load)) : 0;
  const reviewsInSession = Math.min(todayReviews, size - newInSession);
  const pickedLearning = sortedLearning.slice(0, reviewsInSession);
  const pickedReviews = sortedReviews.slice(0, reviewsInSession - pickedLearning.length);
  /* **The commonest words first, not a handful drawn out of the hat.**
   *
   * `fresh` arrives in curriculum order and was then shuffled, so the new
   * cards of a session were a uniform sample of everything ticked — which is
   * how «воспользоваться» turns up among a beginner's opening cards. The
   * owner, 2026-09-22: *"prioritize feeding words by the most common and/or
   * the most relevant to the blocks that the learner has completed… 'to avail
   * oneself' appears as one of the initial cards. Feels a bit rushed when
   * there are more simple words."*
   *
   * `rank` is supplied by the caller because only the app knows what order it
   * means: the native screen passes the lemma's own index, which the build
   * assigns by frequency, so lower is commoner. Ties and unranked cards (a
   * deck card, a sentence) keep the order they arrived in, which is the
   * curriculum's. With no `rank` the old shuffle stands, so every other
   * caller is unchanged.
   *
   * It is a sort, not a filter: nothing is withheld, and a rare word is dealt
   * the moment the commoner ones above it are done. */
  const byRank = o.rank;
  const ordered = mixNew(byRank
    ? fresh.map((x, i) => ({ x, i, k: byRank(x.word) }))
        .sort((a, b) => (a.k - b.k) || (a.i - b.i)).map((e) => e.x)
    : shuffled(fresh, random));
  const pickedNew = ordered.slice(0, newInSession);
  const items = interleave(pickedLearning, pickedReviews, pickedNew).slice(0, o.sessionSize);

  // `newRemaining`: today's new cards past this chunk, so a counter over the
  // whole day can count them before the chunk that deals them (Study.js).
  // `today`: what is due *today* — the capped portion the badge counts too.
  return { items: items, due: due, today: todayReviews, remaining: todayReviews - reviewsInSession,
           newRemaining: Math.max(0, todayNew - pickedNew.length),
           newLeft: newLeft === Infinity ? fresh.length : newLeft, reviewsLeft: reviewsLeft, done: done };
}

/* ------------------------------------------------------------ the day's goal
 *
 * The owner, 2026-10-05: *"The idea is the user 'fights' that number by
 * conducting daily reviews. Their goal is to turn that number to 0 every
 * day… Each day the user should review 20 words plus whatever their setting
 * for new words is. If they skip a day, this number climbs daily… they can
 * customize which days per week they want to study, and then they will only
 * get cards pushed on those days."*
 *
 * So the number on the Study tab is a goal, not the scheduler's due count:
 * every study day adds `GOAL_REVIEWS` plus the learner's new-word setting,
 * what is not done is carried, and every card answered in Study takes one
 * off. The due count could not be fought — cards answered Again come back and
 * the day's learning steps sat outside its cap, so the owner watched 38 stay
 * 38. The goal can always be met: when nothing is due, the cards that fill it
 * are the learner's own weakest (goalSession). */
export const GOAL_REVIEWS = 20;
/* What a long absence can pile up: a week's goals. Past that the number stops
   meaning "today" and starts meaning "you were away", which is the wall
   §30at's owner did not want to show (*"120 notifications"*). */
export const GOAL_CAP_DAYS = 7;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/* The day of the week of a study day (`dayOf`): day 0 was a Thursday. 0 is
   Sunday, as Date.getDay() counts. */
export const weekdayOf = (day) => (((day + 4) % 7) + 7) % 7;
export const isStudyDay = (day, days) =>
  (Array.isArray(days) && days.length ? days : ALL_DAYS).includes(weekdayOf(day));
export const goalPerDay = (newPerDay) =>
  GOAL_REVIEWS + Math.max(0, Number.isFinite(newPerDay) ? newPerDay : QUEUE_DEFAULTS.newPerDay);

/* The goal brought up to today: { day, owed, done }. Each study day since it
   was last seen adds a day's goal; `done` is today's count. Pure — the badge
   reads it without writing, and the screen saves what it returns. */
export function rollGoal(goal, now, { newPerDay, days } = {}) {
  const today = dayOf(now);
  const per = goalPerDay(newPerDay);
  const cap = per * GOAL_CAP_DAYS;
  if (!goal || !Number.isFinite(goal.day)) {
    return { day: today, owed: isStudyDay(today, days) ? per : 0, done: 0 };
  }
  if (goal.day >= today) return goal;
  let owed = Math.max(0, goal.owed || 0);
  // A year away is not 365 loops of work: past the cap, nothing changes.
  for (let d = Math.max(goal.day + 1, today - 60); d <= today && owed < cap; d++) {
    if (isStudyDay(d, days)) owed += per;
  }
  return { day: today, owed: Math.min(cap, owed), done: 0 };
}

/* One card answered: one off the goal, one onto today's count. */
export const spendGoal = (goal, n = 1) =>
  ({ ...goal, owed: Math.max(0, (goal.owed || 0) - n), done: (goal.done || 0) + n });

/* What the Study tab says: the goal on a study day, nothing on a day off. */
export const goalBadge = (goal, now, opts) => {
  const g = rollGoal(goal, now, opts);
  return isStudyDay(dayOf(now), opts && opts.days) ? g.owed : 0;
};

/* The cards that meet the goal (the owner, 2026-10-05: *"as a user masters
 * the card, and gets closer to 100, that word should appear less frequently
 * but every once in a while still pop in. The most common cards should be
 * the recently learned cards to increase repetitions"*):
 *
 *   1. today's learning steps, then everything the scheduler has due, most
 *      forgotten first (buildSession's order, common words weighted up);
 *   2. new cards from the learner's own pool, up to the day's allowance;
 *   3. and to make up the rest, the learner's met cards that are not due,
 *      **most faded first** — retrievability ascending, so a word met
 *      yesterday comes round far more than one held for a month — with one
 *      mastered card sprinkled in every `MASTERED_EVERY`.
 *
 * **Faded, not weak** (the owner, 2026-10-12: *"the study cards repeating
 * themselves for the past week. It's not rotating through all my cards"*).
 * The fill was sorted by familiarity, which is stability alone and knows
 * nothing of when the card was last seen. An early Good on a card already
 * held three weeks moves its stability a day or two — FSRS, correctly,
 * learns little from recalling what was 99 % recallable — so the card that
 * was the weakest this morning is the weakest again this evening, in the
 * next chunk of the same sitting, and tomorrow, and the hundreds held a
 * little better are never dealt at all. Measured over ten simulated days with
 * nothing due: one card dealt seventeen times, two a day on seven of them,
 * while 250 of 400 were not dealt once. Retrievability is what has faded
 * *since the last review*: a card answered today sits at 1.0 and goes to the
 * back, every other card has decayed a little, and the fill walks the whole
 * pool — fastest through the recently learned, whose memory fades fastest,
 * which is still the owner's "recently learned cards most often".
 *
 * **And a card answered today is never dealt again today** (the owner,
 * 2026-10-19: *"I keep getting drilled with the same exact word even when I'm
 * pressing easy. An easy should push it pretty far back"*). It used to come
 * round once the pool was exhausted, least recently answered first, so that
 * a learner with fewer met cards than the goal could still bring the number
 * on the tab to 0 — and a learner a few days away, owing more than they had
 * met, was handed the cards they had just pressed Easy on. The session is
 * `exhausted` instead when the pool cannot fill it, and the screen counts
 * the rest of the goal as met: there was nothing left to do, which is what
 * a goal met means.
 *
 * `words` is the pool (the personal review: every card met of the chosen
 * kinds, and the unmet words of finished lessons and the next one). `owed`
 * sizes the session; `beyond` is "Keep going", past the goal. */
export const MASTERED_EVERY = 8;
export function goalSession({ seen, words, dirs, now, daily, opts, rng, owed, beyond, familiar }) {
  const o = Object.assign({}, QUEUE_DEFAULTS);
  for (const k in opts || {}) if (opts[k] !== undefined) o[k] = opts[k];
  const random = rng || Math.random;
  const want = beyond ? o.sessionSize : Math.min(o.sessionSize, Math.max(0, owed || 0));
  const base = buildSession({ seen, words, dirs, now, daily, opts: { ...opts, reviewsPerDay: Infinity, sessionSize: want },
                              rng, beyond: true });
  const items = base.items.slice(0, want);
  if (items.length < want) {
    const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
    if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
    const have = new Set(items.map((x) => x.word));
    const score = familiar || (() => 0);
    const today = dayOf(now);
    const weak = [], held = [];
    for (const w of words || []) {
      if (have.has(w)) continue;
      const entry = (seen && seen[w]) || {};
      const card = cardFor(entry);
      if (!card || kindOf(card) === "new") continue;
      // Answered today: scheduled out, and not dealt again today.
      if (card.lastAt !== undefined && card.lastAt !== null && dayOf(card.lastAt) === today) continue;
      const x = { w, entry, card, f: score(w, card), r: retrievability(card, now, o.scheduler) };
      (x.f >= MASTERED_AT ? held : weak).push(x);
    }
    // Shuffled first so equal retrievabilities are not dealt in storage order.
    // The mastered cards walk in the same order: a random draw from a few
    // hundred lands on the same card twice in a week, a walk cannot.
    const byFade = (a, b) => a.r - b.r;
    const faded = shuffled(weak, random).sort(byFade);
    const sprinkle = shuffled(held, random).sort(byFade);
    const extra = [];
    while (items.length + extra.length < want && (faded.length || sprinkle.length)) {
      const n = items.length + extra.length + 1;
      const from = (n % MASTERED_EVERY === 0 && sprinkle.length) || !faded.length ? sprinkle : faded;
      const x = from.shift();
      extra.push({ word: x.w, direction: frontFor(x.card, fronts, x.entry), card: x.card, kind: kindOf(x.card), extra: true });
    }
    items.push(...extra);
  }
  /* The pool could not fill the session: everything met has been answered
     today. Nothing is "remaining" then — a remainder the next chunk cannot
     deal would have the screen dealing empty chunks for ever. */
  const exhausted = items.length < want;
  // `remaining`: the goal past this chunk, so the sitting's counter spans the
  // day and not only the twenty dealt (Study.js sittingTally).
  return { items, owed: owed || 0, due: base.due, newLeft: base.newLeft, goal: true, exhausted,
           remaining: beyond || exhausted ? 0 : Math.max(0, (owed || 0) - items.length), newRemaining: 0 };
}
/* Familiarity at which a card counts as mastered — the Study header's count
   and the reinforcement above read the same line. */
export const MASTERED_AT = 80;

/* Again: the card comes back after at least `minGap` other cards — a
   learning step inside the session, not the end of the pile. `at` is the
   index of the card just answered; the copy is placed after the gap, or at
   the end when the session is shorter than that. */
export function requeue(items, at, item, minGap) {
  const gap = minGap === undefined ? QUEUE_DEFAULTS.minGap : minGap;
  const pos = Math.min(items.length, at + 1 + gap);
  return items.slice(0, pos).concat([Object.assign({}, item, { again: true })], items.slice(pos));
}

