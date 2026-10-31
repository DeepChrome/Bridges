/* Has one direction run ahead of the other?
 *
 * The owner, 2026-10-31: *"When the Russian to English or English to Russian
 * gets too far ahead of the other, there should be a gentle nudge to switch
 * modes… calculate this by assessing the individual score difference on a
 * card… don't make the reminders obnoxious."*
 *
 * The two meaning skills (core/skills.js) are scored per word, so the question
 * is answered word by word and then summed with care:
 *
 *   - **Per word, the difference** between its Russian → English score and its
 *     English → Russian score. A skill never asked counts as **0**, because
 *     that is the case the nudge exists for — weeks of cards met from the
 *     Russian side only leave every word's other side untouched, and a score
 *     of "not asked yet" is exactly as far behind as a score of nothing.
 *   - **Weighted by evidence**: a word answered twenty times says more about
 *     how the learner studies than one answered once. The weight is the log of
 *     the answers across both skills, so a few much-drilled words cannot carry
 *     the whole verdict either.
 *   - **Trimmed**: the most extreme tenth at each end is dropped before the
 *     mean, so a handful of words that happen to lean hard one way are not the
 *     reason anyone is told to switch.
 *   - **Two tests, not one**: the trimmed weighted mean must be at least
 *     `LEAN_GAP` points, *and* at least `LEAN_SHARE` of the words must lean the
 *     same way by that much. A lean that is one big gap on a third of the
 *     words and nothing on the rest is not a habit to correct.
 *   - **Enough words** (`LEAN_MIN_WORDS`), or nothing is said at all: twelve
 *     cards on day two are not evidence of anything.
 *
 * And the nudge itself (`leanNudge`) is quiet by construction: only when the
 * behind direction is not already among the learner's fronts (two fronts
 * ticked already alternate towards the weaker skill — core/queue.js
 * frontFor), only on the Study options, and after a day it was shown, not
 * again for `LEAN_EVERY_DAYS`. One line and a link; no sheet, no badge.
 */

import { FRONT_OF_SKILL } from "./skills.js";
import { skillScores, cardFor, dayOf, DEFAULT_FRONTS } from "./scheduler.js";

export const LEAN_MIN_WORDS = 20;
export const LEAN_GAP = 25;
export const LEAN_SHARE = 0.6;
const LEAN_TRIM = 0.1;
export const LEAN_EVERY_DAYS = 3;

/* The lean across a learner's cards. `rankOf(word)` is the word's frequency
   rank, as `familiarity` reads it (optional). Returns `{ ahead, behind, gap,
   share, words }`: the skill ahead and the one behind (both null when the two
   are level or the evidence is thin), the trimmed weighted mean advantage in
   points, the share of words leaning that way by `LEAN_GAP`, and how many
   words were weighed. */
export function leanOf(seen, rankOf) {
  const rows = [];
  for (const w of Object.keys(seen || {})) {
    const e = seen[w];
    const card = cardFor(e);
    if (!card || !(card.reps > 0)) continue;
    const s = skillScores(e, rankOf ? rankOf(w) : undefined);
    if (s.ru2en === null && s.en2ru === null) continue;
    const reps = ((e.ru2en && e.ru2en.reps) || 0) + ((e.en2ru && e.en2ru.reps) || 0);
    rows.push({ d: (s.ru2en || 0) - (s.en2ru || 0), weight: Math.log1p(Math.max(1, reps)) });
  }
  const none = { ahead: null, behind: null, gap: 0, share: 0, words: rows.length };
  if (rows.length < LEAN_MIN_WORDS) return none;
  rows.sort((a, b) => a.d - b.d);
  const cut = Math.floor(rows.length * LEAN_TRIM);
  const kept = rows.slice(cut, rows.length - cut);
  let sum = 0, weight = 0;
  for (const r of kept) { sum += r.d * r.weight; weight += r.weight; }
  const gap = weight ? sum / weight : 0;
  if (Math.abs(gap) < LEAN_GAP) return { ...none, gap: Math.round(gap) };
  const sign = gap > 0 ? 1 : -1;
  const share = rows.filter((r) => r.d * sign >= LEAN_GAP).length / rows.length;
  if (share < LEAN_SHARE) return { ...none, gap: Math.round(gap), share };
  return {
    ahead: sign > 0 ? "ru2en" : "en2ru", behind: sign > 0 ? "en2ru" : "ru2en",
    gap: Math.round(Math.abs(gap)), share, words: rows.length,
  };
}

/* Whether to say so now. `fronts` is the learner's `flash`; `nudged` is the
   last nudge shown, `{ day, skill }`, kept in the profile; `now` the clock.
   Null means say nothing. Otherwise the skill behind, the front that
   practises it, and the lean's numbers. */
export function leanNudge({ seen, rankOf, fronts, nudged, now = Date.now() }) {
  const lean = leanOf(seen, rankOf);
  if (!lean.behind) return null;
  const front = FRONT_OF_SKILL[lean.behind];
  if ((fronts && fronts.length ? fronts : DEFAULT_FRONTS).includes(front)) return null;
  const day = dayOf(now);
  // Shown through the day it first appears; quiet for the days after.
  if (nudged && nudged.skill === lean.behind && day > nudged.day && day - nudged.day < LEAN_EVERY_DAYS) return null;
  return { skill: lean.behind, front, gap: lean.gap, share: lean.share, words: lean.words };
}
