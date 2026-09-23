/* Learner-state schema and migrations, shared by both apps.
 *
 * The web app and the native app each carried a copy of these steps, and the
 * settings sheet moves a profile between them by export and import. Two copies of a
 * migration that must produce identical shapes is how a profile silently corrupts on
 * the way across, so from schema 5 the steps live here and both apps run them.
 *
 * Forward-only. Each step takes the previous shape and returns the next; a save that
 * cannot be read at all is the caller's problem (it falls back to defaults) — a
 * partially readable one is carried forward, never thrown away.
 *
 * Object.assign rather than spread: this file is also inlined into the web app's
 * single classic script, and the rest of core/ keeps to that style.
 */

export const SCHEMA_VERSION = 9;

/* A lesson quiz passes at PASS_MARK. After RELIEF_AFTER attempts it passes at
   RELIEF_MARK instead: the simulated struggling learner failed 15 of 40 lessons
   three times over and left with 84 leeches, and a learner stuck on one lesson
   is not learning. The bar is not lowered for anyone who clears it — only from
   the third try on, and the score itself is still recorded (ROADMAP A29, the
   agent's decision, reversible by setting RELIEF_AFTER to Infinity). One rule
   for both apps and the simulator; `l` is the lesson slot {q, tries}.

   **75, swept rather than chosen** (2026-09-11, `--pass-mark`, three marks ×
   three seeds × 168 lessons). At 80 the mark sat above the quick profile's own
   mean accuracy of .79, and the measurement showed what that actually cost —
   not lessons failed, which relief already absorbed, but repetition:

     mark  quick passed  retakes  steady on relief
      74      168.0        54.7        2.0
      77      167.3       127.7       44.0
      80      167.3       122.7       44.3

   Who passes barely moves. What moves is that at 80 a learner retakes every
   other lesson and **passes most of them on relief** — a rule written for the
   learner who is drowning, doing the everyday work of the two who are not.
   Below ~75 it would start being a mark nobody could miss; 77 is strictly worse
   than both neighbours. Leeches were unchanged within noise (quick 1.0 → 0.0,
   steady 2.0 → 2.0, struggling 9.0 → 11.3). */
export const PASS_MARK = 75;
export const RELIEF_MARK = 70;
export const RELIEF_AFTER = 3;
export const quizPassed = (l) => {
  if (!l || typeof l.q !== "number") return false;
  return l.q >= PASS_MARK || ((l.tries || 0) >= RELIEF_AFTER && l.q >= RELIEF_MARK);
};

/* Reviews come before new words once the backlog is real.
 *
 * The simulated struggling learner took two lessons a day whatever was waiting,
 * reached 239 cards due in one day and 53 days of backlog, and finished the route
 * with 139 leeches — not because the scheduler was wrong but because nothing ever
 * said "stop taking on new words". Anki users do this by hand; the path should say
 * it. Above REVIEW_FIRST due cards, Learn makes Review the primary action and the
 * next lesson the quiet one.
 *
 * It advises, it does not lock: the learner may still press on, which is the same
 * rule the fork and developer mode follow. The number is what one sitting can
 * absorb — the quick learner's busiest day was 58 cards and the steady learner's
 * 74, so 40 leaves an unhurried route untouched and reins in a struggling one.
 */
export const REVIEW_FIRST = 40;
export const reviewFirst = (due) => (due || 0) >= REVIEW_FIRST;

/* …and there is such a thing as enough for one day: `dayDone` in
 * core/scheduler.js, since Phase 2 moved the cards' clock to milliseconds.
 * The rule and the reason are recorded there; in short, a day is done when
 * the learner has answered something today and nothing is waiting — read off
 * the cards a grade stamps, never off `state.day`, which opening the app
 * stamps (touchStreak). */

/* What the speaking activities record. Attempts are capped so state stays a small
   JSON blob; tagCounts is the long-term memory of what kinds of error recur. No
   audio is ever stored here. */
export const ATTEMPT_CAP = 200;
export const speechDefault = () => ({ attempts: [], tagCounts: {} });

export const MIGRATIONS = {
  // v1 used Leitner counters: seen[word] = {n, due}. FSRS needs stability and
  // difficulty, which cannot be derived from a repetition count — so reps are kept
  // as history and the word re-enters scheduling as new rather than inventing a
  // memory state that was never measured.
  1: (s) => {
    const seen = {};
    for (const w in (s.seen || {})) {
      const old = s.seen[w] || {};
      seen[w] = { s: 0, d: 0, due: old.due || 0, last: 0, reps: old.n || 0, lapses: 0 };
    }
    return Object.assign({}, s, { seen: seen, trouble: {}, pinned: [], v: 2 });
  },
  // v2 -> v3 only adds fields that the defaults already supply.
  2: (s) => Object.assign({}, s, { v: 3 }),
  // v3 -> v4: a lesson stopped being a single score and became three components.
  // An existing score means the quiz was passed, which means the words were seen.
  3: (s) => {
    const unit = {};
    for (const id in (s.unit || {})) {
      const u = s.unit[id];
      const lessons = {};
      for (const k in (u.lessons || {})) {
        const old = u.lessons[k];
        lessons[k] = typeof old === "number" ? { v: true, q: old } : old;
      }
      unit[id] = Object.assign({}, u, { lessons: lessons });
    }
    return Object.assign({}, s, { unit: unit, v: 4 });
  },
  // v4 -> v5: the speaking activities get somewhere to record what happened.
  4: (s) => Object.assign({}, s, { speech: s.speech || speechDefault(), v: 5 }),
  // v5 -> v6: the video library outgrew the units, so watching is recorded per
  // video (id -> day watched) as well as per unit; and imported Anki decks
  // ([{ id, name, cards: [{ ru, en }] }]) get a slot. Their cards are scheduled
  // in `seen` under the Russian string like any other word.
  5: (s) => Object.assign({}, s, { watched: s.watched || {}, decks: s.decks || [], v: 6 }),
  // v7 adds `mined`: a word taken from a video keeps where it was heard, so the
  // flashcard can send you back to the second it was said (ROADMAP P10.4).
  6: (s) => Object.assign({}, s, { mined: s.mined || {}, v: 7 }),
  // v8: developer mode stops shipping on (the owner, 2026-09-23: the path is
  // walked from the top, and only the placement test may open chapters
  // ahead). Every profile so far had it on because that was the default, not
  // because anyone chose it, and the two cannot be told apart — so it is off
  // for all, and the switch in Settings is where it is turned back on. Also
  // `faves` (favourite videos, id -> day) and `notices` (which one-time
  // notes have been seen), both new slots.
  7: (s) => Object.assign({}, s, { dev: false, faves: s.faves || {}, notices: s.notices || {}, v: 8 }),
  // v9: a word is one card again (the owner, 2026-09-23), and the flashcards
  // default to the Russian on the front. `flash` had defaulted to all three
  // fronts and nobody chose that, so it is set to the new default for all;
  // the cards themselves are merged on the way in (core/scheduler.js
  // normaliseSeen), which needs no step here.
  8: (s) => Object.assign({}, s, { flash: ["recognise"], v: 9 }),
};

export function migrate(raw, from) {
  let s = raw, v = from;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v = s.v || v + 1;
  }
  return s;
}

/* One attempt into the speech slot, returned as a new object. Keeps the newest
   ATTEMPT_CAP attempts and counts every tag the attempt carried. An attempt is
   { ts, key, kind, transcript, target, wer, tags, grade, latencyMs }; nothing here
   inspects it beyond `tags`, so a future field costs no migration. */
export function recordAttempt(speech, attempt) {
  const cur = speech || speechDefault();
  const attempts = (cur.attempts || []).concat([attempt]);
  const overflow = attempts.length - ATTEMPT_CAP;
  const kept = overflow > 0 ? attempts.slice(overflow) : attempts;
  const tagCounts = Object.assign({}, cur.tagCounts || {});
  for (const t of (attempt && attempt.tags) || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
  // Spread, not rebuild: the slot also carries the day's talk budget, and an
  // attempt recorded mid-conversation must not reset it.
  return Object.assign({}, cur, { attempts: kept, tagCounts: tagCounts });
}

/* Conversation sessions are budgeted (ROADMAP P6.5): at most TALK_SESSIONS_PER_DAY
   a day and TALK_TURNS per session, counted here in the learner's own state so the
   picker can say what is left before the Worker's counter would refuse. `day` is
   the day number from util.today(). */
/* Unlimited since 2026-09-07 (the owner: "remove the three limit for now");
   sessions are still counted, and the Worker keeps a backstop cap of its own. */
export const TALK_SESSIONS_PER_DAY = Infinity;
export const TALK_TURNS = 12;

export function talkAllowance(speech, day) {
  const t = (speech && speech.talk) || {};
  const used = t.day === day ? (t.sessions || 0) : 0;
  return { used, left: Math.max(0, TALK_SESSIONS_PER_DAY - used), turns: TALK_TURNS };
}

/* Spend one session; returns a new speech slot, or the same one when nothing is
   left — the caller checks talkAllowance first and shows why. */
export function startTalkSession(speech, day) {
  const cur = speech || speechDefault();
  const a = talkAllowance(cur, day);
  if (!a.left) return cur;
  return Object.assign({}, cur, { talk: { day: day, sessions: a.used + 1 } });
}

/* Tags that arrive after the attempt was recorded — the feedback service answers
   seconds later, and the attempt must not wait for it. Finds the attempt by its
   timestamp, adds the tags it did not have yet, and counts exactly those. An
   attempt already rotated out of the cap still gets its tags counted. */
export function tagAttempt(speech, ts, tags) {
  const cur = speech || speechDefault();
  const list = (tags || []).filter((t, i, a) => typeof t === "string" && a.indexOf(t) === i);
  if (!list.length) return cur;
  const tagCounts = Object.assign({}, cur.tagCounts || {});
  const attempts = (cur.attempts || []).map((a) => {
    if (!a || a.ts !== ts) return a;
    const had = a.tags || [];
    const fresh = list.filter((t) => !had.includes(t));
    return fresh.length ? Object.assign({}, a, { tags: had.concat(fresh) }) : a;
  });
  const hit = (cur.attempts || []).find((a) => a && a.ts === ts);
  const counted = hit ? list.filter((t) => !(hit.tags || []).includes(t)) : list;
  for (const t of counted) tagCounts[t] = (tagCounts[t] || 0) + 1;
  return Object.assign({}, cur, { attempts: attempts, tagCounts: tagCounts });
}
