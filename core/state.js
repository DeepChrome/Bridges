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

export const SCHEMA_VERSION = 5;

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
  return { attempts: kept, tagCounts: tagCounts };
}
