/* The scenario timeline.
 *
 * There is no audio file behind a written conversation, so there is no
 * timeline to read — the one the progress bar and "back five seconds" work
 * against is built from line lengths and then corrected by what each line
 * actually took to speak. That arithmetic is the part that can be wrong
 * silently: a bar that creeps, a back button that lands in the wrong place, a
 * total that never matches what was heard. None of it shows in a render tree,
 * so it is tested here rather than through the screen.
 */

import { estimateMs, timeline, lineAt, clock, GAP_MS, SKIP_MS } from "../src/scenario";

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
