/* The statistics screen, and the calendar of days worked.
 *
 * Stats shipped in Phase 2 with no suite at all, so the four functions it
 * draws from were unasserted. They are pure and they are the screen's whole
 * meaning, which makes them worth more coverage than the layout.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { forecast, retentionOf, perDay, studiedDays, runOf, calendar, CAL_WEEKS, mastery, LEVELS }
  from "../src/screens/Stats";
import { DAY, dayOf, NEW, REVIEW } from "@core/scheduler";

const at = (ms) => ({ day: dayOf(ms), at: ms });
const now = Date.UTC(2026, 8, 16, 18, 0, 0);       // a Wednesday

describe("what is coming", () => {
  it("piles everything overdue onto today and ignores a card never seen", () => {
    const seen = {
      late: { recognise: { state: REVIEW, dueAt: now - 9 * DAY } },
      alsoLate: { recognise: { state: REVIEW, dueAt: now - 1 * DAY } },
      soon: { recognise: { state: REVIEW, dueAt: now + 2 * DAY } },
      never: { recognise: { state: NEW, dueAt: now } },
      // Past the window: real, but not part of this week's answer.
      far: { recognise: { state: REVIEW, dueAt: now + 30 * DAY } },
    };
    expect(forecast(seen, now)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});

describe("how much sticks", () => {
  it("counts only cards that had a memory to lose", () => {
    const rows = [
      { ...at(now), grade: 3, s: 4 },       // remembered
      { ...at(now), grade: 1, s: 9 },       // forgotten
      { ...at(now), grade: 1, s: 0 },       // a first sight: not a failure of memory
      { ...at(now), grade: 4, s: null },
    ];
    expect(retentionOf(rows)).toBe(0.5);
    expect(retentionOf([])).toBeNull();
    // Nothing but first sights is not 0 % retention, it is no answer at all.
    expect(retentionOf([{ ...at(now), grade: 1, s: 0 }])).toBeNull();
  });

  it("lays the week out oldest first, with today at the end", () => {
    const rows = [at(now), at(now), at(now - 6 * DAY), at(now - 20 * DAY)];
    expect(perDay(rows, now)).toEqual([1, 0, 0, 0, 0, 0, 2]);
  });
});

describe("where the words stand", () => {
  /* The same levels the card and the entry show, from the same score. */
  it("counts every word into one level, new ones as New", () => {
    const seen = {
      a: { recognise: { state: NEW, dueAt: now } },
      b: { recognise: { state: REVIEW, s: 0.3, dueAt: now } },
      c: { recognise: { state: REVIEW, s: 400, dueAt: now } },
    };
    const m = mastery(seen, () => 5);
    expect(m.New).toBe(1);
    expect(m.Mastered).toBe(1);
    expect(Object.values(m).reduce((x, y) => x + y, 0)).toBe(3);
    expect(Object.keys(m)).toEqual(LEVELS.map(([name]) => name));
  });
});

describe("the calendar of days worked", () => {
  /* It is drawn from the review log, never from `st.streak`: that is stamped by
     the session loader, so it counts *opening the app* (§30t). A calendar off
     it would light a day nobody studied, which is the one lie this cannot
     tell. */
  it("counts a run back from today, and lets yesterday end it", () => {
    const d = dayOf(now);
    const three = studiedDays([at(now), at(now - DAY), at(now - 2 * DAY)]);
    expect(three.get(d)).toBe(1);
    expect(runOf(three, now)).toBe(3);

    // Not sat down yet today: the run is still alive until the day is over.
    expect(runOf(studiedDays([at(now - DAY), at(now - 2 * DAY)]), now)).toBe(2);
    // A gap of a whole day ends it.
    expect(runOf(studiedDays([at(now - 2 * DAY), at(now - 3 * DAY)]), now)).toBe(0);
    expect(runOf(studiedDays([]), now)).toBe(0);
  });

  it("marks the rest of this week as unhappened, not as unstudied", () => {
    const weeks = calendar(studiedDays([at(now), at(now), at(now - 8 * DAY)]), now);
    expect(weeks).toHaveLength(CAL_WEEKS);
    expect(weeks.every((w) => w.length === 7)).toBe(true);

    const today = dayOf(now);
    const flat = weeks.flat();
    /* A zero and a day that has not arrived are not the same thing, and the
       grid draws them differently — an empty square for the back half of this
       week reads as "you missed four days" otherwise. */
    expect(flat.filter((c) => c.future).every((c) => c.day > today)).toBe(true);
    expect(flat.some((c) => c.future)).toBe(true);
    expect(flat.find((c) => c.day === today)).toEqual({ day: today, n: 2, future: false });
    expect(flat.find((c) => c.day === today - 8)).toMatchObject({ n: 1 });

    // Columns are whole Sunday-to-Saturday weeks, in order, ending in this one.
    for (const w of weeks) expect(new Date(w[0].day * DAY).getUTCDay()).toBe(0);
    expect(weeks[CAL_WEEKS - 1].some((c) => c.day === today)).toBe(true);
  });
});
