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
import { SKILL_IDS, SKILL_OF_FRONT, isSkill, skillOfKind } from "./skills.js";

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
/* **Beside the card, four scores** (the owner, 2026-10-29; core/skills.js).
 * `seen[word]` also holds a slot per skill — `ru2en`, `en2ru`, `forms`,
 * `usage` — each a memory of the same shape as the card, graded only by the
 * questions that exercise that skill (`gradeSkill`), never due, never dealt.
 * The schedule reads the one card; the scores read the slots. A skill slot
 * is told from the card by its name: `isSkill(slot)`. */
export { SKILL_IDS, SKILL_OF_FRONT, isSkill, skillOfKind };
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
  // The skill slots ride along: they are scores, not cards to merge.
  const out = {};
  for (const k in entry) if (isSkill(k) && entry[k]) out[k] = entry[k];
  out[CARD] = best;
  return out;
}

/* The skill slots of an entry, and nothing else. */
const skillSlots = (entry) => {
  const out = {};
  for (const k in entry || {}) if (isSkill(k) && entry[k]) out[k] = entry[k];
  return out;
};

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
        // A skill slot was never written in days; only a card can be legacy.
        if (x[dir] && !isSkill(dir) && isLegacyCard(x[dir])) {
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
 * New instead.
 *
 * **Where 100 sits was changed on 2026-09-28**, and the reason is worth
 * keeping. The owner, of the same number shown on a dictionary entry: *"something
 * like ETO or Kak are likely to be quickly mastered words so they should
 * relatively quickly get a score of 100. Be intelligent in how this is
 * calculated."* At a year of stability, 100 was a number nobody would see
 * inside the course. Two changes, both still read off the card:
 *
 *   - **Mastered means a memory expected to hold about three months**
 *     (`FAMILIAR_AT`, 90 days), not the scheduler's one-year ceiling. That is
 *     the horizon a learner acts on.
 *   - **The commonest words reach it sooner** (`masteryHorizon`). «это» is
 *     heard in nearly every sentence, lesson and video the app plays, so its
 *     memory is refreshed far more often than its reviews alone would say; the
 *     horizon falls to `COMMON_AT` (21 days) for the hundred commonest lemmas
 *     and rises with rarity to the full ninety by rank 1,000. Four or five good
 *     reviews take «это» to 100; a rare word still needs months.
 *
 * And a card being relearned after a lapse is held at `RELEARNING_CAP`: its old
 * stability says it was known, and the Again that just happened says it is
 * not, and the score should agree with the Again.
 *
 * **The curve is an asymptote now** (the owner, 2026-11-17: *"a bit more
 * precision in calculating the score. It should be incrementally harder to
 * get a 100. But it's not a rush to get one either… it will come over time.
 * Like ideally it's almost like an asymptote"*). It was log-stability over
 * the horizon, capped: a common word hit 100 the day its stability passed
 * three weeks, in four or five good reviews, and then had nowhere to go. Now
 *
 *     score = 100 · (1 − 4^(−s / h))
 *
 * with `h` the word's horizon. Every good review closes a share of the gap
 * left to 100 and never all of it: the horizon is the 75 mark, twice it is
 * 94, three times 98, and the rounding reaches 100 only once stability is
 * about 3.8 horizons — 80 days for «это», 230 for a rare word, inside the
 * scheduler's year but only just. The bottom is honest too: a day's
 * stability on a common word is 6, on a rare one 1.
 *
 *     common (h 21):  1 d → 6   4 d → 23   10 d → 48   21 d → 75   42 d → 94   80 d → 100
 *     rare   (h 60):  1 d → 1   10 d → 21  30 d → 50   60 d → 75  120 d → 94  230 d → 100
 *
 * The thresholds that read the score moved with the curve (TROUBLE_SCORE,
 * native data.js KNOWN_AT), each re-solved for the stability it meant. */
export const FAMILIAR_AT = 60;
export const COMMON_AT = 21;
export const RELEARNING_CAP = 35;
const COMMON_RANK = 100, RARE_RANK = 1000;
/* Where the horizon sits on the curve: 1 − 1/SCORE_BASE of the way to 100. */
export const SCORE_BASE = 4;

/* Days of stability that count as mastered, for a lemma of this frequency
   rank (1 = commonest; the lemma index is assigned by frequency). No rank — a
   deck card, a sentence — is the full horizon. */
export function masteryHorizon(rank) {
  if (!(rank > 0)) return FAMILIAR_AT;
  if (rank <= COMMON_RANK) return COMMON_AT;
  if (rank >= RARE_RANK) return FAMILIAR_AT;
  const k = (Math.log(rank) - Math.log(COMMON_RANK)) / (Math.log(RARE_RANK) - Math.log(COMMON_RANK));
  return COMMON_AT + k * (FAMILIAR_AT - COMMON_AT);
}

export function familiarity(card, rank) {
  if (!card || card.state === NEW || !(card.s > 0)) return null;
  const score = Math.round(100 * (1 - Math.pow(SCORE_BASE, -card.s / masteryHorizon(rank))));
  return card.state === RELEARNING ? Math.min(score, RELEARNING_CAP) : score;
}
/* The stability a score stands for, on this horizon — the curve read the
   other way, for a threshold that is really about days held. */
export const stabilityFor = (score, rank) =>
  -masteryHorizon(rank) * Math.log(1 - Math.min(99.5, Math.max(0, score)) / 100) / Math.log(SCORE_BASE);

/* The score in words, for the learner reading their own entry. */
export function familiarityLabel(score) {
  if (score === null || score === undefined) return "New";
  if (score >= 100) return "Mastered";
  if (score >= 75) return "Strong";
  if (score >= 45) return "Familiar";
  if (score >= 20) return "Learning";
  return "Just met";
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
 * TROUBLE_MIN_REPS answers — and then only while its familiarity, the 0–100
 * score on the card, is still under TROUBLE_SCORE (the owner, 2026-10-06:
 * "some minimum number of exposures and still the word is under 20%"). The
 * score is stability against the word's own horizon, so it is what the
 * learner sees and it recovers: a word that lapsed three times and has since
 * been held for a month leaves the bank, where the old lapse count kept it
 * there for good. `troubleRank` puts the lowest score first, then the most
 * lapses per answer, and `troubleWords` keeps the worst TROUBLE_CAP. The flag
 * on a card and the "Trouble words" set read the same list. `rank` is the
 * lemma's frequency rank where the caller knows it (familiarity's horizon);
 * without it a word is judged on the full horizon, the stricter reading.
 *
 * TROUBLE_SCORE was 20 on the log curve, which meant a day or so of stability
 * after eight answers; on the asymptote (familiarity, 2026-11-17) a day is a
 * 6 on a common word and a 1 on a rare one, so the bar is 8 — "eight answers
 * and it still holds only a day or three". */
export const TROUBLE_MIN_REPS = 8;
export const TROUBLE_SCORE = 8;
export const TROUBLE_CAP = 20;
export function isTrouble(card, rank) {
  if (!card || (card.reps || 0) < TROUBLE_MIN_REPS) return false;
  const score = familiarity(card, rank);
  return score !== null && score < TROUBLE_SCORE;
}
export const troubleRank = (card, rank) =>
  (card ? (TROUBLE_SCORE - (familiarity(card, rank) || 0)) + ((card.lapses || 0) / Math.max(1, card.reps || 0)) : 0);
export const wordTrouble = (entry, rank) => cardsOf(entry).some(({ card }) => isTrouble(card, rank));
/* The bank: every word whose card is trouble, worst first, at most TROUBLE_CAP.
   `rankOf(word)` gives a word's frequency rank where the caller has one. */
export function troubleWords(seen, rankOf) {
  const out = [];
  for (const w in seen || {}) {
    const card = cardFor(seen[w]);
    const rank = rankOf ? rankOf(w) : undefined;
    if (isTrouble(card, rank)) out.push({ w, r: troubleRank(card, rank) });
  }
  return out.sort((a, b) => b.r - a.r).slice(0, TROUBLE_CAP).map((x) => x.w);
}

/* One graded review applied to learner state, returned as new objects. The
   trouble rule follows the grade: a lapse on a word the scheduler now counts
   as a leech is held against it, and a recall that lifts it back out clears
   it. `direction` is how the card was asked — it is checked, since the log
   row records it, and it does not choose a card: there is one. `prev` is the
   card as it was, for undo. */
/* `skill` is which of the four scores the answer also counts towards
   (core/skills.js): left out, it is the front's (a flashcard); `null` grades
   the card alone; a kind's skill where the caller knows the kind. The skill's
   slot before the grade comes back as `skillPrev`, for undo. */
export function applyGrade(seen, trouble, word, direction, grade, now, opts, skill) {
  if (!isDirection(direction)) throw new Error("not a direction: " + direction);
  const g = gradeOf(grade);
  const entry = mergeEntry((seen && seen[word]) || {});
  const prev = cardFor(entry) || undefined;
  const card = review(prev, g, now, opts);
  const nextEntry = Object.assign(skillSlots(entry), { [CARD]: card });
  const sk = skill === undefined ? SKILL_OF_FRONT[direction] || null : skill;
  let skillPrev;
  if (sk) {
    if (!isSkill(sk)) throw new Error("not a skill: " + sk);
    skillPrev = entry[sk] || undefined;
    nextEntry[sk] = review(skillPrev, g, now, opts);
  }
  const nextSeen = Object.assign({}, seen, { [word]: nextEntry });
  const nextTrouble = Object.assign({}, trouble);
  if (g === 1 && isTrouble(card)) nextTrouble[word] = (nextTrouble[word] || 0) + 1;
  else if (g > 1 && nextTrouble[word] && !wordTrouble(nextEntry)) delete nextTrouble[word];
  return { seen: nextSeen, trouble: nextTrouble, card: card, prev: prev, skill: sk, skillPrev: skillPrev };
}

/* A grade that counts towards one skill and leaves the word's card alone —
   what a form drill does (FORM_KINDS): knowing «книгу» is the accusative says
   nothing about remembering what «книга» means (2026-10-08), but it is what
   "Cases & forms" measures. The entry is created if the word has no card yet;
   `cardFor` still answers null for it, so the word is not in the schedule. */
export function gradeSkill(seen, word, skill, grade, now, opts) {
  if (!isSkill(skill)) throw new Error("not a skill: " + skill);
  const entry = mergeEntry((seen && seen[word]) || {});
  const prev = entry[skill] || undefined;
  const card = review(prev, gradeOf(grade), now, opts);
  const nextEntry = Object.assign({}, entry, { [skill]: card });
  return { seen: Object.assign({}, seen, { [word]: nextEntry }), card: card, prev: prev };
}

/* Each skill's score for a word, 0–100 or null where it has never been asked
   (`familiarity`, against the word's own horizon). */
export function skillScores(entry, rank) {
  const out = {};
  for (const id of SKILL_IDS) out[id] = familiarity(entry ? entry[id] : null, rank);
  return out;
}

/* The score a word shows: everything it has to be known for, not the card
   alone (the owner, 2026-11-23: "I have a score of 100 with brat however my
   score is 0 in cases. Cases/forms/everything should contribute to the overall
   familiarity score"). The mean of its meaning — the two directions, each
   read off the card until it has been asked on its own — its "Cases & forms"
   for a word that inflects (`inflects`), at 0 until a form has been asked, and
   its use in a sentence once that has been asked. Null while the word has no
   card. The schedule still runs on the card: this is what the learner is shown. */
export function overallScore(entry, rank, { inflects = false } = {}) {
  const base = familiarity(cardFor(entry), rank);
  if (base === null) return null;
  const s = skillScores(entry, rank);
  const have = (x) => x !== null && x !== undefined;
  const parts = [((have(s.ru2en) ? s.ru2en : base) + (have(s.en2ru) ? s.en2ru : base)) / 2];
  if (inflects) parts.push(have(s.forms) ? s.forms : 0);
  if (have(s.usage)) parts.push(s.usage);
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/* The skill the word most needs, among `among` (every skill by default): the
   one never asked first, then the lowest stability. Ties keep the table's
   order, so a caller can rely on the answer being stable. */
export function weakestSkill(entry, among) {
  const ids = (among || SKILL_IDS).filter(isSkill);
  let best = null, bestS = Infinity;
  for (const id of ids) {
    const c = entry && entry[id];
    const s = c && c.s > 0 ? c.s : -1;
    if (s < bestS) { best = id; bestS = s; }
  }
  return best;
}

/* The skill slots rebuilt from review-log rows (oldest first), for a profile
   graded before the slots existed: each row's grade goes to the skill its
   kind (`source`) or front names, at the time it was given. The card itself is
   not touched — the log already produced it. Rows whose kind grades no skill
   are passed over. */
export function hasSkillSlots(seen) {
  for (const w in seen || {}) for (const k in seen[w] || {}) if (isSkill(k) && seen[w][k]) return true;
  return false;
}
export function replayLog(seen, rows, opts) {
  let out = seen || {};
  const sorted = (rows || []).slice().sort((a, b) => a.at - b.at);
  for (const r of sorted) {
    if (!r || !r.word) continue;
    const sk = skillOfKind(r.source, r.direction);
    if (!sk) continue;
    out = gradeSkill(out, r.word, sk, r.grade, r.at, opts).seen;
  }
  return out;
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
  // A question about what a video said (VideoQuiz): comprehension, no word graded.
  video: "listen",
};
export const directionOfKind = (kind) => DIRECTION_OF_KIND[kind] || "recognise";

/* The kinds that drill a form rather than a meaning: a case ending, a
   conjugation, an agreement, an aspect partner, where the stress falls, the
   chapter's form question. They grade no word's card (the owner, 2026-10-08:
   *"Familiarity score calculation should largely be based off of performance
   of that card during study card review… it can also stem from exposure and
   success in lessons… it shouldn't grow at all from drills because they're
   not focused on meaning"*). The card is the word's meaning; knowing
   «книгу» is the accusative of «книга» says nothing about remembering what
   «книга» means, and a run of right endings was lifting the familiarity of
   words the learner could not translate. The runners still score them. */
export const FORM_KINDS = new Set(["cases", "agreement", "conjugation", "aspect", "stress", "form"]);
export const gradesCard = (kind) => !FORM_KINDS.has(kind);
