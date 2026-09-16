/* FSRS-4.5 (Free Spaced Repetition Scheduler) with the published default weights.
 *
 * Ratings match Anki: 1 Again, 2 Hard, 3 Good, 4 Easy.
 * A card's memory is (stability, difficulty); the interval is how long until
 * recall probability falls to the requested retention.
 */

const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.0310,
                1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.5870, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const RETENTION = 0.9;
const MIN_S = 0.01, MAX_S = 36500;

const clampD = (d) => Math.min(10, Math.max(1, d));

/* Probability the word is still recallable t days after the last review. */
export function retrievability(t, s) {
  if (!s || s <= 0) return 0;
  return Math.pow(1 + FACTOR * t / s, DECAY);
}

export function initStability(g) {
  return Math.max(MIN_S, FSRS_W[g - 1]);
}
export function initDifficulty(g) {
  return clampD(FSRS_W[4] - FSRS_W[5] * (g - 3));
}

export function nextDifficulty(d, g) {
  const next = d - FSRS_W[6] * (g - 3);
  // Mean reversion towards the difficulty an "easy" first answer would give.
  return clampD(FSRS_W[7] * initDifficulty(4) + (1 - FSRS_W[7]) * next);
}

export function stabilityAfterRecall(d, s, r, g) {
  const hard = g === 2 ? FSRS_W[15] : 1;
  const easy = g === 4 ? FSRS_W[16] : 1;
  const inc = Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) *
              (Math.exp(FSRS_W[10] * (1 - r)) - 1) * hard * easy;
  return Math.min(MAX_S, Math.max(MIN_S, s * (1 + inc)));
}

export function stabilityAfterLapse(d, s, r) {
  const next = FSRS_W[11] * Math.pow(d, -FSRS_W[12]) *
               (Math.pow(s + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - r));
  return Math.min(MAX_S, Math.max(MIN_S, Math.min(next, s)));
}

export function intervalFor(s) {
  const days = (s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return Math.max(1, Math.round(days));
}

/* card: {s, d, due, last, reps, lapses} — or undefined for a brand new word.
   Returns the updated card. `now` is a day number.

   A lapse is an Again on a card the learner had *kept* — Anki's rule. A review
   on the day the card was last reviewed is a learning step: it reschedules the
   card but touches neither lapses nor difficulty. Without this a new word
   answered Again, Again, Good in one session was a leech before the day was
   out, and the trouble bank listed yesterday's new words rather than what is
   hard (the pedagogy review, 2026-09-08: 73 leeches of 212 words for the
   struggling simulated learner). */
export function fsrsReview(card, grade, now) {
  const g = Math.min(4, Math.max(1, grade | 0));
  let s, d, reps, lapses;

  if (!card || !card.s) {
    s = initStability(g);
    d = initDifficulty(g);
    reps = 1;
    lapses = 0;
  } else {
    const learning = card.last !== undefined && card.last >= now;
    const elapsed = Math.max(0, now - (card.last === undefined ? now : card.last));
    const r = retrievability(elapsed, card.s);
    d = learning ? card.d : nextDifficulty(card.d, g);
    s = g === 1 ? stabilityAfterLapse(d, card.s, r)
                : stabilityAfterRecall(d, card.s, r, g);
    reps = (card.reps || 0) + 1;
    lapses = (card.lapses || 0) + (g === 1 && !learning ? 1 : 0);
  }

  // Again comes back in the same session rather than tomorrow.
  const iv = g === 1 ? 0 : intervalFor(s);
  return { s: s, d: d, due: now + iv, last: now, reps: reps, lapses: lapses };
}

/* What each button would schedule, for the button labels. */
export function fsrsPreview(card, now) {
  const out = {};
  [1, 2, 3, 4].forEach((g) => {
    const c = fsrsReview(card, g, now);
    const iv = c.due - now;
    out[g] = iv <= 0 ? "now" : iv === 1 ? "1d" : iv < 30 ? iv + "d"
           : iv < 365 ? Math.round(iv / 30) + "mo" : (iv / 365).toFixed(1) + "y";
  });
  return out;
}

/* A word is "trouble" once it has lapsed repeatedly or sits at high difficulty. */
export const LEECH_LAPSES = 4;
export function isTrouble(card) {
  if (!card) return false;
  return (card.lapses || 0) >= LEECH_LAPSES || ((card.d || 0) >= 8.5 && (card.reps || 0) >= 3);
}

/* The grade a right-or-wrong answer earns. One rule for both runners: an answer
   reached with the table open is Hard, not Good — recognised, not recalled. An
   activity that scores itself more finely (a spoken sentence, say) skips this and
   hands applyGrade a grade of its own. */
export const gradeFor = (correct, hinted) => (correct ? (hinted ? 2 : 3) : 1);

/* One graded review applied to learner state, returned as new objects. `seen` and
   `trouble` are the two slots a review touches; nothing else is read. The trouble
   rule follows the grade: a lapse on a word the scheduler now counts as a leech is
   held against it, and any recall that lifts it back out clears it. This is the
   runners' rule; the flashcard screens keep their own for now (see the core test). */
export function applyGrade(seen, trouble, word, grade, now) {
  const g = Math.min(4, Math.max(1, grade | 0));
  const card = fsrsReview(seen[word], g, now);
  const nextSeen = Object.assign({}, seen, { [word]: card });
  const nextTrouble = Object.assign({}, trouble);
  if (g === 1 && isTrouble(card)) nextTrouble[word] = (nextTrouble[word] || 0) + 1;
  else if (g > 1 && nextTrouble[word] && !isTrouble(card)) delete nextTrouble[word];
  return { seen: nextSeen, trouble: nextTrouble, card: card };
}

/* The row a review leaves behind: the card as it *was*, the grade, and when.
 *
 * FSRS's optimiser fits its weights to exactly this — what the learner had
 * remembered up to the moment and what they then said — and none of it can be
 * read back off the card afterwards, since fsrsReview overwrites the memory
 * state. So the row is built before applyGrade runs, from the same card.
 *
 * `now` is the day number the scheduler was given; `at` the clock in
 * milliseconds, kept because two reviews on one day are two rows and the day
 * cannot tell them apart. `elapsed` is the days since the last review, null
 * for a card with no memory yet. `source` names what asked the question.
 * Columns FSRS-4.5 has no value for (a learning state, the interval that was
 * scheduled) are not invented here; the scheduler that fills them adds them. */
export function reviewRow(card, word, grade, now, at, source) {
  const g = Math.min(4, Math.max(1, grade | 0));
  const c = card && card.s ? card : null;
  return {
    word: word, grade: g, day: now, at: at,
    s: c ? c.s : null, d: c ? c.d : null, due: c ? c.due : null, last: c ? c.last : null,
    reps: card ? (card.reps || 0) : 0, lapses: card ? (card.lapses || 0) : 0,
    elapsed: c && c.last !== undefined ? Math.max(0, now - c.last) : null,
    source: source || null,
  };
}

/* The rows for a batch of grades applied in order — a question that grades
   several words, a conversation turn. A word graded twice in one batch gets
   two rows, the second built on the card the first produced, and each row
   takes its own millisecond so no two share a key. */
export function reviewRows(seen, list, now, at, source) {
  let cur = seen || {};
  const rows = [];
  for (const it of list || []) {
    if (!it || !it.word) continue;
    rows.push(reviewRow(cur[it.word], it.word, it.grade, now, at + rows.length, source));
    cur = Object.assign({}, cur, { [it.word]: fsrsReview(cur[it.word], it.grade, now) });
  }
  return rows;
}
