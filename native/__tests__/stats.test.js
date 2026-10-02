/* The statistics screen, and the calendar of days worked.
 *
 * Stats shipped in Phase 2 with no suite at all, so the four functions it
 * draws from were unasserted. They are pure and they are the screen's whole
 * meaning, which makes them worth more coverage than the layout.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { forecast, retentionOf, perDay, studiedDays, runOf, dayReport, monthGrid, mastery, LEVELS }
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

  /* The month as a calendar of what was studied and roughly how long
     (the owner, 2026-10-02). */
  it("names a day by what was studied most, and estimates the time", () => {
    const d = dayOf(now);
    const min = 60000;
    const rows = [
      { day: d, at: now, word: "a", source: "type" },
      { day: d, at: now + 1 * min, word: "b", source: "type" },
      { day: d, at: now + 10 * min, word: "c", source: "cases" },  // a long read: capped at 3
      // A second sitting, an hour later: its gap is not counted.
      { day: d, at: now + 70 * min, word: "d", source: "type" },
    ];
    const topic = (r) => (r.source === "cases" ? "Dative case" : "Food & Drink");
    const rep = dayReport(rows, topic).get(d);
    expect(rep.n).toBe(4);
    expect(rep.topic).toBe("Food & Drink");
    expect(rep.topics).toEqual(["Food & Drink", "Dative case"]);
    // 1 (lead) + 1 + 3 (capped) + 1 (a new sitting's lead) = 6 minutes.
    expect(rep.minutes).toBe(6);
    expect(dayReport([], topic).size).toBe(0);
  });

  it("lays a month out in whole weeks, Sunday first, each date its day", () => {
    const weeks = monthGrid(2026, 9);              // October 2026 starts on a Thursday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 4).every((c) => c === null)).toBe(true);
    expect(weeks[0][4].date).toBe(1);
    const dates = weeks.flat().filter(Boolean);
    expect(dates).toHaveLength(31);
    // Consecutive dates are consecutive scheduler days.
    dates.forEach((c, k) => { if (k) expect(c.day - dates[k - 1].day).toBe(1); });
  });
});
