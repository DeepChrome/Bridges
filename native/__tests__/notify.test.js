/* The daily reminder (§30af′).
 *
 * What is actually worth asserting here is the **silence**: a reminder that
 * arrives on a day the learner has already studied is the one defect that would
 * make somebody turn notifications off for good, and it leaves nothing in the
 * render tree to look at. So most of this drives `nextTimes`, which is pure, and
 * the rest checks that `arm` lays down exactly what that function returned.
 */
import { nextTimes, arm, clear, askPermission, HORIZON } from "../src/notify";
import { setDayStart, dayOf } from "@core/util";

const AT = 18 * 60;                                   // 18:00
const at = (iso) => new Date(iso);

/* A learner state with a card graded at `ms`, which is what `workedOn` reads —
   never `state.day`, which merely opening the app stamps (§30t). */
const studiedAt = (ms) => ({ seen: { "дом": { recognise: { lastAt: ms, reps: 1 } } } });
const studiedNothing = () => ({ seen: {} });

beforeEach(() => {
  setDayStart({});                                    // plain UTC days unless a test says otherwise
  global.__scheduled = [];
  global.__notifyGranted = true;
});

describe("which days a reminder lands on", () => {
  test("the next free slot is today when today's time has not passed", () => {
    const now = at("2026-09-18T09:00:00");
    const [first] = nextTimes(studiedNothing(), AT, now);
    expect(first.getDate()).toBe(18);
    expect(first.getHours()).toBe(18);
  });

  test("today is skipped once the time has gone by", () => {
    const now = at("2026-09-18T20:00:00");
    const [first] = nextTimes(studiedNothing(), AT, now);
    expect(first.getDate()).toBe(19);
  });

  /* The rule the whole feature exists for. */
  test("a day already worked is skipped", () => {
    const now = at("2026-09-18T09:00:00");
    const st = studiedAt(now.getTime());
    const [first] = nextTimes(st, AT, now);
    expect(first.getDate()).toBe(19);
  });

  test("and only that day — tomorrow is still reminded", () => {
    const now = at("2026-09-18T09:00:00");
    const times = nextTimes(studiedAt(now.getTime()), AT, now);
    expect(times.some((d) => d.getDate() === 19)).toBe(true);
  });

  test("the window is bounded", () => {
    const times = nextTimes(studiedNothing(), AT, at("2026-09-18T09:00:00"));
    expect(times).toHaveLength(HORIZON);
  });

  test("no time chosen means nothing scheduled", () => {
    expect(nextTimes(studiedNothing(), null, at("2026-09-18T09:00:00"))).toEqual([]);
    expect(nextTimes(studiedNothing(), undefined, at("2026-09-18T09:00:00"))).toEqual([]);
  });

  /* §30ad moved the day boundary to 4 am local, so after midnight the clock's
     date and the scheduler's day are different — and an evening reminder
     belongs to the later one. Testing "is this the first iteration" instead of
     reading the study day would drop a reminder the learner is owed. */
  test("after midnight, the evening ahead is a different study day", () => {
    const lateNight = at("2026-09-18T01:00:00");
    /* The offset **at that instant**, which is what App.js passes and what makes
       this hold in any timezone: 01:00 is before a 4 am rollover everywhere.
       Passing 0 instead models a UTC device, applies the rollover in the wrong
       frame, and the test then fails on correct code — which is how this was
       first written. */
    setDayStart({ offsetMinutes: lateNight.getTimezoneOffset(), rolloverHour: 4 });
    // Work done "yesterday" by the scheduler's reckoning, i.e. just now.
    const st = studiedAt(lateNight.getTime());
    expect(workedDay(st)).toBe(dayOf(lateNight.getTime()));
    const [first] = nextTimes(st, AT, lateNight);
    // 18:00 on the 18th is past the 4 am rollover, so it is the *next* study
    // day and must still be reminded.
    expect(first.getDate()).toBe(18);
    expect(first.getHours()).toBe(18);
  });
});

function workedDay(st) {
  const e = Object.values(st.seen)[0];
  return dayOf(e.recognise.lastAt);
}

describe("arming", () => {
  test("lays down one notification per free day", async () => {
    const n = await arm(studiedNothing(), AT);
    expect(n).toBe(HORIZON);
    expect(global.__scheduled).toHaveLength(HORIZON);
  });

  test("says the same short thing every time", async () => {
    await arm(studiedNothing(), AT);
    for (const r of global.__scheduled) {
      expect(r.content.body.split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(r.trigger.type).toBe("date");
    }
  });

  test("turning it off leaves nothing scheduled", async () => {
    await arm(studiedNothing(), AT);
    expect(global.__scheduled.length).toBeGreaterThan(0);
    const n = await arm(studiedNothing(), null);
    expect(n).toBe(0);
    expect(global.__scheduled).toHaveLength(0);
  });

  test("re-arming replaces rather than accumulates", async () => {
    await arm(studiedNothing(), AT);
    await arm(studiedNothing(), AT);
    expect(global.__scheduled).toHaveLength(HORIZON);
  });

  test("clear cancels everything", async () => {
    await arm(studiedNothing(), AT);
    await clear();
    expect(global.__scheduled).toHaveLength(0);
  });
});

describe("permission", () => {
  test("a refusal is reported rather than swallowed", async () => {
    global.__notifyGranted = false;
    expect(await askPermission()).toBe(false);
  });

  test("a grant is reported", async () => {
    expect(await askPermission()).toBe(true);
  });
});
