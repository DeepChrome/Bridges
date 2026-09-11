/* The scenario timeline.
 *
 * Where a conversation has no bought track — a corpus scene, or a lesson whose
 * text has moved on from its audio — it is read by the device voices and there
 * is no timeline to read either: the one the progress bar and "back five
 * seconds" work against is built from line lengths and then corrected by what
 * each line actually took to speak. That arithmetic is the part that can be
 * wrong silently: a bar that creeps, a back button that lands in the wrong
 * place, a total that never matches what was heard. None of it shows in a
 * render tree, so it is tested here rather than through the screen.
 *
 * And the switch between the two is itself a silent failure: a track played
 * against lines it was not made from would say different words from the ones
 * the questions ask about, and look perfectly normal doing it.
 */

import { estimateMs, timeline, lineAt, clock, msFor, GAP_MS, SKIP_MS, trackWhenCurrent }
  from "../src/scenario";
import { TRACKS } from "../src/scenetracks";
import { hash } from "../src/audio";
import { SCRIPTS } from "../src/data";

const LINES = [
  { s: "a", ru: "Кто это?" },
  { s: "b", ru: "Это я, и это мой брат." },
  { s: "a", ru: "Да." },
];

describe("estimating a line", () => {
  it("grows with the line", () => {
    expect(estimateMs("Да.")).toBeLessThan(estimateMs("Это я, и это мой брат."));
  });

  it("gives even the shortest line room to be said", () => {
    // A one-word answer still takes a beat; an estimate near zero would make
    // the bar jump and "back five seconds" skip whole turns.
    expect(estimateMs("Да.")).toBeGreaterThan(400);
  });

  it("survives nothing at all", () => {
    expect(estimateMs()).toBeGreaterThan(0);
    expect(timeline([]).total).toBe(0);
  });
});

describe("the timeline", () => {
  it("lays the lines end to end with a breath between them", () => {
    const { spans, total } = timeline(LINES);
    expect(spans[0].start).toBe(0);
    expect(spans[1].start).toBe(spans[0].ms + GAP_MS);
    expect(spans[2].start).toBe(spans[1].start + spans[1].ms + GAP_MS);
    // The gap after the last line is not part of the conversation.
    expect(total).toBe(spans[2].start + spans[2].ms);
  });

  it("takes a measured line over its estimate", () => {
    const real = timeline(LINES, { 0: 9000 });
    expect(real.spans[1].start).toBe(9000 + GAP_MS);
    expect(real.total).toBeGreaterThan(timeline(LINES).total);
  });

  /* "The total must not change once a line has been measured" is a rule of the
     hook, not of this arithmetic, and it cannot be asserted here: under test the
     speech mock returns on the next tick, so nothing is ever measured and any
     such test would pass for the wrong reason. It was found on the emulator —
     the total shrank from 0:30 to 0:28 on a replay — and the guard is in
     `useScenario`, with the reason written beside it. */
});

describe("finding a place in it", () => {
  const { spans, total } = timeline(LINES);

  it("answers with the line sounding at that moment", () => {
    expect(lineAt(spans, 0)).toBe(0);
    expect(lineAt(spans, spans[1].start + 10)).toBe(1);
    expect(lineAt(spans, total)).toBe(2);
  });

  it("never falls off either end", () => {
    expect(lineAt(spans, -5000)).toBe(0);
    expect(lineAt(spans, 10 * 60 * 1000)).toBe(2);
  });

  it("puts five seconds back at the start of a sentence, not inside one", () => {
    /* Speech cannot be resumed mid-sentence, so the back button lands on a line
       boundary. From the third line, five seconds back is the start of an
       earlier line — never a point the app cannot actually play from. */
    const from = Math.max(0, spans[2].start - SKIP_MS);
    const k = lineAt(spans, from);
    expect(k).toBeLessThan(2);
    expect(spans[k].start).toBeLessThanOrEqual(from);
  });
});

describe("pressing the bar", () => {
  it("lands where the finger did", () => {
    expect(msFor(0, 200, 30_000)).toBe(0);
    expect(msFor(100, 200, 30_000)).toBe(15_000);
    expect(msFor(200, 200, 30_000)).toBe(30_000);
    expect(msFor(50, 200, 30_000)).toBe(7500);
  });

  it("cannot be dragged off either end", () => {
    expect(msFor(-40, 200, 30_000)).toBe(0);
    expect(msFor(9999, 200, 30_000)).toBe(30_000);
  });

  /* Before a layout has been measured the width is zero, and a scenario with no
     track has no total until it has been heard. Neither may divide. */
  it("is nothing at all when there is nothing to divide by", () => {
    expect(msFor(100, 0, 30_000)).toBe(0);
    expect(msFor(100, 200, 0)).toBe(0);
    expect(msFor(100, undefined, undefined)).toBe(0);
  });
});

describe("the clock", () => {
  it("reads as minutes and seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(9_000)).toBe("0:09");
    expect(clock(75_000)).toBe("1:15");
  });

  it("never shows a negative position", () => {
    expect(clock(-4000)).toBe("0:00");
  });
});

describe("the bought track", () => {
  const keys = Object.keys(TRACKS);
  const first = keys[0];
  const linesOf = (key) => (SCRIPTS[key] || { lines: [] }).lines;

  it("ships one per written scenario, with a span for every line", () => {
    expect(keys.length).toBe(Object.keys(SCRIPTS).length);
    for (const [k, t] of Object.entries(TRACKS)) {
      expect(t.lines.length).toBe(SCRIPTS[k].lines.length);
      expect(t.total).toBeGreaterThan(15_000);
      // Every line ends inside the file, and they run in order.
      let prev = -1;
      for (const [start, ms] of t.lines) {
        expect(start).toBeGreaterThan(prev);
        expect(start + ms).toBeLessThanOrEqual(t.total + 200);
        prev = start;
      }
    }
  });

  /* The whole point of the hash: the shipped audio and the shipped text are
     built from the same file, and this is what says they still agree. It fails
     if a script is edited and the audio tools are not re-run — which is the
     one way this feature can go wrong without anything looking wrong. */
  it("matches the text of every lesson that ships", () => {
    const stale = keys.filter((k) => !trackWhenCurrent(k, linesOf(k)));
    expect(stale).toEqual([]);
  });

  it("is refused when the script has moved on from the audio", () => {
    const lines = linesOf(first);
    const changed = lines.map((l, i) => (i ? l : { ...l, ru: `${l.ru} и ещё` }));
    expect(trackWhenCurrent(first, changed)).toBe(null);
    expect(trackWhenCurrent(first, lines.concat([{ s: "a", ru: "Да." }]))).toBe(null);
  });

  it("is refused for a lesson that has none", () => {
    expect(trackWhenCurrent("nosuch:9", LINES)).toBe(null);
    expect(trackWhenCurrent(null, LINES)).toBe(null);
  });

  it("hashes the lines, not their order", () => {
    // Guard on the guard: two different conversations must not share a hash.
    const a = hash(linesOf(keys[0]).map((l) => l.ru).join("|"));
    const b = hash(linesOf(keys[1]).map((l) => l.ru).join("|"));
    expect(a).not.toBe(b);
  });
});
