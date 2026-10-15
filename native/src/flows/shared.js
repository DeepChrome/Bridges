/* What every flow does with a finished run: turn it into a mark, and keep the
 * best under its key. Shared by the files in this directory and nothing else. */

import { touchStreak } from "../store";

/* The mark for a run: partial credit summed over first attempts, as a percentage. */
export const scoreOf = (r) => (r.total ? Math.round(r.credit / r.total * 100) : 0);

/* Best and runs for a practice run, keyed like the grammar drills. */
export const bestOf = (prev, key, score) => {
  const drills = { ...(prev.drills || {}) };
  const cur = drills[key] || { best: 0, runs: 0 };
  drills[key] = { best: Math.max(cur.best || 0, score), runs: (cur.runs || 0) + 1 };
  return touchStreak({ ...prev, drills });
};
