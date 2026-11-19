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
         SKILL_OF_FRONT, familiarity, DAY } from "./scheduler.js";
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
    return { word: w, direction: frontFor(card, fronts, entry), card: card, kind: kindOf(card),
             why: { source: "round" } };
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
      fresh.push({ word: w, direction: direction, card: card || null, kind: kind,
                   why: { source: "new", rank: o.rank ? o.rank(w) : null } });
      continue;
    }
    if (!isDue(card, now, o.learnAhead)) continue;
    const r = retrievability(card, now, o.scheduler);
    const item = { word: w, direction: direction, card: card, kind: kind, r: r,
                   why: { source: stepToday(card, now) ? "learning" : "due", r: r } };
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
  for (const x of reviews) Object.assign(x.why, { urgency: urgency(x), rankWeight: weight(x), rank: o.rank ? o.rank(x.word) : null });
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
 *   3. and to make up the rest, a **weighted draw** over the learner's met
 *      cards that are not due (`fillPriority` below, 2026-11-12): how long
 *      since each was last revisited, how much has faded, how well it is
 *      held, the gap between its two meaning skills and how hard it was to
 *      acquire — never a card answered yesterday.
 *
 * **Faded, not weak** was the first cut (the owner, 2026-10-12: *"the study
 * cards repeating themselves for the past week. It's not rotating through all
 * my cards"*). The fill was sorted by familiarity, which is stability alone
 * and knows nothing of when the card was last seen, so the weakest card this
 * morning was the weakest again this evening and tomorrow. Sorting by
 * retrievability instead walked the pool — and then, a month on, had the same
 * complaint in a new shape: the least retrievable cards each day are the
 * *young* ones, so the same twenty led every day and a card held well was
 * never dealt. Hence the draw.
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
 * sizes the session; `beyond` is "Keep going", past the goal.
 *
 * `order(word)`, optional, replaces the draw with the learner's own order for
 * the make-up fill — "From the start" on the Study options (the owner,
 * 2026-11-02: *"personal review English to Russian gets really hung up on
 * recent words even if there's earlier gaps… the option to build up or
 * continue where they were struggling"*). Ordered by the route, the fill
 * walks from the first lesson's words forward, so a gap left early is met
 * before anything recent; the cooldown still applies, so the walk moves on
 * day by day. Cards due are due either way. `rare` are the low-priority
 * cards, in the draw at a fraction of their weight. */
/* `next`, optional: words not met yet, in the order the learner would meet
 * them along the route. **Past the goal the review has no end** (the owner,
 * 2026-11-06: *"Default to the personal review. Don't have a hard limit. Just
 * let it keep going until the user stops"*): once every met card has been
 * answered today, the chunk is made up of new words from here, uncapped by the
 * day's ration — the learner chose to keep going, and a new word is the one
 * thing left that is not a card already answered today. Only past the goal:
 * inside it, new words keep to the day's ration as they always have. */
/* ------------------------------------------------- what fills the goal, and how often
 *
 * The owner, 2026-11-12: *"it really seems to focus heavily on the same words
 * back to back to back. Like I've had almost all of the same words two days in
 * a row. That should never happen… let's make it focus more on how long since
 * a word has been revisited… a hidden algorithm that factors in a few things… the
 * idea isn't always to focus in one area… it's a maintenance tool. It's totally
 * okay to bounce around to old material."*
 *
 * He was right about the cause. The fill was a **sort** by retrievability, and
 * the least retrievable cards on any given day are the young ones — stability
 * of a day or two, met this week — because a card held a month barely fades
 * between sittings. An early Good on a young card lifts it a day or two, so it
 * is the least retrievable again tomorrow, and the same twenty led the fill
 * every day while the hundreds held a little better were never dealt. A sort
 * has no memory of yesterday and no room for the rest of the pool.
 *
 * So the fill is a **weighted draw** over a priority, not a sort, and a card
 * answered yesterday is out of it (`FILL_COOLDOWN_DAYS`). The priority, each
 * part read off the card the scheduler already keeps — nothing here is a new
 * counter (§30ar's rule, as the familiarity ring keeps it):
 *
 *   fade   1 − retrievability: how much has been forgotten since the last look
 *   since  days since it was last answered, as a share of SINCE_HORIZON_DAYS —
 *          the lever he named, and the heaviest weight: a word unseen for a
 *          month outranks a young word seen the day before yesterday however
 *          well it is held, which is what brings old material back
 *   score  1 − familiarity/100: the overall score; every Easy, and every long
 *          gap before one, lifts stability and so pushes the word down here
 *   hole   the gap between the two meaning skills (core/skills.js): a word
 *          recalled into English and not out of it, or asked one way only
 *   hard   FSRS difficulty, 1–10 — the persistent record of how hard this
 *          word was to acquire; it rises with every Again and eases slowly
 *
 * Weighted, not sorted, so that two days are never the same list: the draw is
 * Efraimidis–Spirakis sampling without replacement (key = u^(1/weight)), with
 * weight = priority^FILL_SHARPEN so a word long unseen is several times as
 * likely as a word seen the day before yesterday, and a mastered word still
 * turns up — bouncing around to old material is the point. A card the learner
 * set aside as low priority (`rare`) is in the draw at RARE_WEIGHT of its
 * weight: *"low prio shouldn't eliminate a card completely but it should be
 * extremely rare relative to others."* Due cards are the schedule's and are
 * dealt before any of this, as always; low-priority cards' due dates are
 * ignored — they come only through this draw.
 *
 * With the caller's `rng` constant (a test's `() => 0.5`) the draw is a plain
 * sort by priority, which is what makes it checkable. */
export const FILL_COOLDOWN_DAYS = 1;
export const FILL_WEIGHTS = { fade: 0.30, since: 0.35, score: 0.15, hole: 0.10, hard: 0.10 };
export const SINCE_HORIZON_DAYS = 30;
export const FILL_SHARPEN = 3;
export const RARE_WEIGHT = 0.05;
/* **A card held well is left alone for a while** (the owner, 2026-11-17: *"a
 * ton of excessive repetition on words that have not been problematic to
 * me… if a word has easily been mastered, and I flag it easy, I'd rather not
 * see it for a while"*). The draw weighted such a card down but could not
 * keep it out: with a pool of a few hundred met cards and twenty or more to
 * fill a day, a third of the pool is dealt every day whatever the weights,
 * and the one-day cooldown let a card pressed Easy on Monday back on
 * Wednesday. So a card is out of the fill until FILL_HOLD_SHARE of the
 * interval the scheduler gave it has passed — never less than the cooldown,
 * never more than FILL_HOLD_MAX_DAYS, so a word mastered for months still
 * comes back after three weeks and bounces around with the rest. An Easy
 * lengthens the interval, so an Easy is exactly what buys the longer rest.
 * Due cards are the schedule's and never held. */
export const FILL_HOLD_SHARE = 0.5;
export const FILL_HOLD_MAX_DAYS = 21;
export function fillHoldDays(card) {
  if (!card || !(card.dueAt > 0) || !(card.lastAt > 0)) return FILL_COOLDOWN_DAYS;
  const interval = Math.max(0, (card.dueAt - card.lastAt) / DAY);
  return Math.min(FILL_HOLD_MAX_DAYS, Math.max(FILL_COOLDOWN_DAYS, interval * FILL_HOLD_SHARE));
}
/* Past the cooldown and past its hold: in the fill. A card that was never
   stamped with an answer (an old conversion) has nothing to rest from. */
export const fillReady = (card, now) =>
  cooledDown(card, now) && (!(card && card.lastAt > 0) || (now - card.lastAt) / DAY >= fillHoldDays(card));
/* The two meaning skills' scores, 0–100 each or null, read as a gap in 0–1:
   both scored, their difference over HOLE_SPAN; one scored and one never asked
   is the widest hole there is; neither scored says nothing (0.5 — a word met
   only in lessons has both to build). */
export const HOLE_SPAN = 50;
export function meaningHole(entry) {
  const slot = (id) => { const c = entry && entry[id]; return c && c.s > 0 ? familiarity(c) : null; };
  const a = slot("ru2en"), b = slot("en2ru");
  if (a === null && b === null) return 0.5;
  if (a === null || b === null) return 1;
  return Math.min(1, Math.abs(a - b) / HOLE_SPAN);
}
/* The priority and each part of it in 0–1 (the developer panel on a card
   reads the parts; the draw reads `p`). */
export function fillPriorityParts({ card, entry, r, score, now }) {
  const W = FILL_WEIGHTS;
  const days = card && card.lastAt !== undefined && card.lastAt !== null
    ? Math.max(0, (now - card.lastAt) / DAY) : SINCE_HORIZON_DAYS;
  const since = Math.min(1, days / SINCE_HORIZON_DAYS);
  const fam = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) / 100 : 0;
  const hard = Math.min(1, Math.max(0, (((card && card.d) || 1) - 1) / 9));
  const fade = Math.min(1, Math.max(0, 1 - (Number.isFinite(r) ? r : 0)));
  const hole = meaningHole(entry);
  const parts = { fade, since, score: 1 - fam, hole, hard };
  const p = W.fade * fade + W.since * since + W.score * (1 - fam) + W.hole * hole + W.hard * hard;
  return { p, parts, days };
}
export const fillPriority = (x) => fillPriorityParts(x).p;
/* Answered today or within the cooldown: out of the fill. */
export const cooledDown = (card, now) => {
  if (!card || card.lastAt === undefined || card.lastAt === null) return true;
  return dayOf(card.lastAt) < dayOf(now) - FILL_COOLDOWN_DAYS;
};
/* The draw (Efraimidis–Spirakis): every candidate keyed by u^(1/weight),
   highest keys first. The key and the weight ride beside each entry for the
   panel that says why a card came up (§30cw); the bare-list form this once
   had beside it (`weightedDraw`) had no caller and went. */
export function drawKeys(list, weightOf, random) {
  return list.map((x) => {
    const w = Math.max(1e-9, Number(weightOf(x)) || 0);
    return { x, w, key: Math.pow(random(), 1 / w) };
  }).sort((a, b) => b.key - a.key);
}

/* ------------------------------------------------- what the day's new words add
 *
 * The owner, 2026-11-19: *"keep the daily review flashcards conceptually
 * separate but in the same stack as the new content flashcards… the daily
 * review is still using the current 25 card base format… but it will focus on
 * curating words previously exposed to the learner… if the learner has
 * covered a new chapter, these new words are not in that 25 quota… instead
 * they are 'tacked on' to the pile. So if a learner did a ton of chapters in a
 * single day, maybe they have 70 cards to review. But if they didn't do any
 * chapters, they still have that baseline 25… These cards are integrated and
 * shuffled randomly among themselves."*
 *
 * So the goal is two things in one number: the baseline (`rollGoal`: twenty
 * plus the new-word setting a study day, carried when skipped) and the words
 * the learner was exposed to today — a lesson's words as its quiz first makes
 * their cards, a video's words when it is watched (Video.js). `tackOn` records
 * them on the day (`daily.met`) and adds them to what is owed, uncapped; the
 * session deals them beside the due cards whatever their schedule says
 * (`goalSession` `tacked`), and a card answered in Study leaves the list
 * (`untack`). Nothing of this touches the schedule: a lesson's card is still
 * due when FSRS says, and today's look at it is one more review. */
export function tackOn(state, words, now, opts) {
  const daily = dailyFor(state.daily, now);
  const have = new Set(daily.met || []);
  const fresh = (words || []).filter((w) => w && !have.has(w));
  if (!fresh.length) return state;
  const goal = rollGoal(state.goal, now, opts);
  return { ...state, daily: { ...daily, met: (daily.met || []).concat(fresh) },
           goal: { ...goal, owed: (goal.owed || 0) + fresh.length } };
}
/* The words tacked on today and not yet answered in Study. */
export const tackedToday = (daily, now) => dailyFor(daily, now).met || [];
export const untack = (daily, word) =>
  (daily && Array.isArray(daily.met) && daily.met.includes(word)
    ? { ...daily, met: daily.met.filter((w) => w !== word) } : daily);

/* `tacked`: today's new words (above), dealt in the chunk before the make-up
 * fill and however the scheduler has them — new, in a learning step, or
 * scheduled out. `shuffle`: the chunk dealt in random order rather than the
 * scheduler's (the owner: *"not sequential… still use the formula though for
 * the spaced repetition"*): the formula decides which cards are in the day,
 * the shuffle decides nothing but the order they are met in. */
export function goalSession({ seen, words, dirs, now, daily, opts, rng, owed, beyond, familiar, order, next, rare,
                              tacked, shuffle }) {
  const o = Object.assign({}, QUEUE_DEFAULTS);
  for (const k in opts || {}) if (opts[k] !== undefined) o[k] = opts[k];
  const random = rng || Math.random;
  const want = beyond ? o.sessionSize : Math.min(o.sessionSize, Math.max(0, owed || 0));
  const base = buildSession({ seen, words, dirs, now, daily, opts: { ...opts, reviewsPerDay: Infinity, sessionSize: want },
                              rng, beyond: true });
  const items = base.items.slice(0, want);
  if (items.length < want && Array.isArray(tacked) && tacked.length) {
    const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
    if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
    const have = new Set(items.map((x) => x.word));
    for (const w of tacked) {
      if (items.length >= want) break;
      if (have.has(w)) continue;
      have.add(w);
      const entry = (seen && seen[w]) || {};
      const card = cardFor(entry);
      items.push({ word: w, direction: frontFor(card, fronts, entry), card: card || null, kind: kindOf(card),
                   extra: true, why: { source: "tacked" } });
    }
  }
  if (items.length < want) {
    const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
    if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
    const have = new Set(items.map((x) => x.word));
    const score = familiar || (() => 0);
    const pool = [];
    const consider = (w, isRare) => {
      if (have.has(w)) return;
      have.add(w);
      const entry = (seen && seen[w]) || {};
      const card = cardFor(entry);
      if (!card || kindOf(card) === "new") return;
      // Answered today or yesterday, or still inside its hold (fillHoldDays):
      // not dealt again — never two days running, and a card held well rests.
      if (!fillReady(card, now)) return;
      const r = retrievability(card, now, o.scheduler);
      const fam = score(w, card);
      const { p, parts, days } = fillPriorityParts({ card, entry, r, score: fam, now });
      pool.push({ w, entry, card, rare: !!isRare, p,
                  why: { source: isRare ? "rare" : "fill", p, parts, weights: FILL_WEIGHTS, r, days, score: fam,
                         hold: fillHoldDays(card) } });
    };
    for (const w of words || []) consider(w, false);
    for (const w of rare || []) consider(w, true);
    /* The learner's order, where given ("From the start"): earliest on the
       route first, the priority deciding only between words at the same place.
       Otherwise the weighted draw, over a shuffle so equal keys never fall in
       storage order. */
    const drawn = typeof order === "function"
      ? pool.slice().sort((a, b) => (order(a.w) - order(b.w)) || (b.p - a.p))
          .map((x) => ({ x, w: null, key: order(x.w) }))
      : drawKeys(shuffled(pool, random), (x) => Math.pow(x.p, FILL_SHARPEN) * (x.rare ? RARE_WEIGHT : 1), random);
    drawn.forEach(({ x, w: weight, key }, place) => {
      if (items.length >= want) return;
      items.push({ word: x.w, direction: frontFor(x.card, fronts, x.entry), card: x.card, kind: kindOf(x.card), extra: true,
                   why: { ...x.why, weight, key, place, of: drawn.length, ordered: typeof order === "function" } });
    });
  }
  if (beyond && items.length < want && Array.isArray(next)) {
    const fronts = (dirs && dirs.length ? dirs : DEFAULT_FRONTS).filter((d) => DIRECTIONS.includes(d));
    if (!fronts.length) fronts.push(DEFAULT_FRONTS[0]);
    const have = new Set(items.map((x) => x.word));
    for (const w of next) {
      if (items.length >= want) break;
      if (have.has(w)) continue;
      const entry = (seen && seen[w]) || {};
      const card = cardFor(entry);
      if (card && kindOf(card) !== "new") continue;
      have.add(w);
      items.push({ word: w, direction: frontFor(card, fronts, entry), card: card || null, kind: "new", extra: true,
                   why: { source: "next" } });
    }
  }
  /* The pool could not fill the session: everything met has been answered
     today. Nothing is "remaining" then — a remainder the next chunk cannot
     deal would have the screen dealing empty chunks for ever. */
  const exhausted = items.length < want;
  // `remaining`: the goal past this chunk, so the sitting's counter spans the
  // day and not only the twenty dealt (Study.js sittingTally).
  return { items: shuffle ? shuffled(items, random) : items, owed: owed || 0, due: base.due, newLeft: base.newLeft,
           goal: true, exhausted,
           remaining: beyond || exhausted ? 0 : Math.max(0, (owed || 0) - items.length), newRemaining: 0 };
}
/* Familiarity at which a card counts as mastered — the Study header's count
   and the reinforcement above read the same line. */
export const MASTERED_AT = 80;

/* ------------------------------------------------------- a word that will not stick
 *
 * The owner, 2026-11-06: *"I don't want the user to get caught on the same
 * word forever so if it's not sticking like 10 times in a row maybe it's time
 * to just move on to a new word. I've seen it just float in the same area for
 * a while."*
 *
 * Two things kept a failing word in view. Again sent it back after three other
 * cards however often it had failed, so a word missed five times in a sitting
 * was a fifth of the sitting; and the review's fill deals the most faded card
 * first, which a failing card always is, so tomorrow opened on it again.
 *
 * So the gap grows with each miss in the sitting (`againGap`), and a run of
 * `STUCK_AT` Agains in a row — counted across sittings, broken by any other
 * answer — rests the word for `REST_DAYS`: out of the review, its schedule
 * untouched, back on its own when the days are up. `rest` is a map in the
 * learner's state, word → `{ run }` while counting, `{ until }` (a day) while
 * resting. Pure; the screen saves what it returns. */
export const STUCK_AT = 10;
export const REST_DAYS = 3;
export function noteAnswer(rest, word, grade, now) {
  const today = dayOf(now);
  const out = {};
  // Rests that have run their course are dropped on the way through.
  for (const w in rest || {}) {
    const e = rest[w];
    if (e && (e.until === undefined || e.until > today)) out[w] = e;
  }
  const cur = out[word];
  if (cur && cur.until !== undefined) return { rest: out, rested: false };
  if (grade !== 1) { delete out[word]; return { rest: out, rested: false }; }
  const run = (cur ? cur.run || 0 : 0) + 1;
  if (run >= STUCK_AT) { out[word] = { until: today + REST_DAYS }; return { rest: out, rested: true }; }
  out[word] = { run };
  return { rest: out, rested: false };
}
export const isResting = (rest, word, now) => {
  const e = rest && rest[word];
  return !!(e && e.until !== undefined && e.until > dayOf(now));
};
/* The gap an Again comes back after: `minGap` cards the first time, and that
   much more each time the same card is missed again in the sitting, so a word
   that is not landing is met less often rather than every fourth card. */
export const againGap = (misses, minGap = QUEUE_DEFAULTS.minGap) =>
  minGap * Math.min(4, Math.max(1, misses));

/* Again: the card comes back after at least `minGap` other cards — a
   learning step inside the session, not the end of the pile. `at` is the
   index of the card just answered; the copy is placed after the gap, or at
   the end when the session is shorter than that. */
export function requeue(items, at, item, minGap) {
  const gap = minGap === undefined ? QUEUE_DEFAULTS.minGap : minGap;
  const pos = Math.min(items.length, at + 1 + gap);
  return items.slice(0, pos).concat([Object.assign({}, item, { again: true })], items.slice(pos));
}

