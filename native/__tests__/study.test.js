/* The study pile's rules.
 *
 * One is the owner's, 2026-09-11, about a set of cards appearing that the
 * learner did not ask for and could not switch off: "Due today" is switched
 * on by the path's Review button and had no row in the picker. `cardsIn` is
 * what decides a set's contents, and what proves the session is only ever
 * the ticked sets. The session's order is core/queue.js's business, proved in
 * core.test.mjs; here it is that the screen hands the builder the right words.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { cardsIn, sessionFor, sentencesFor } from "../src/screens/Study";
import { DAY, REVIEW, NEW } from "@core/scheduler";
import { SPEECH, STAGES } from "../src/data";
import { hasRealAudio } from "../src/audio";

const now = Date.now();
const UNIT_WITH_WORDS = STAGES[0].core.id;
const review = (plus, s = 1) => ({ dueAt: now + plus * DAY, lastAt: now - s * DAY, s, d: 5, state: REVIEW, steps: 0, reps: 2, lapses: 0 });
const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, decks: [],
  flash: ["recognise"], newPerDay: 15, reviewsPerDay: 200, learnAhead: 20,
};

describe("which cards a set holds", () => {
  const st = {
    ...base,
    seen: {
      "я": { recognise: review(-1) },
      "не": { recognise: review(0) },
      "город": { recognise: review(30, 9) },
      // Added by the learner (Read, or a video): new, and wanted.
      "дом": { recognise: { dueAt: now, s: 0, d: 0, state: NEW, steps: 0, reps: 0, lapses: 0 } },
    },
  };

  it("gives Due today exactly what the scheduler wants today", () => {
    const due = cardsIn(st, ["__due__"]).map((c) => c.b).sort();
    expect(due).toEqual(["дом", "не", "я"]);
  });

  /* The set the Review button switches on is a set like any other, which is the
     whole point: the picker can now untick it. */
  it("holds nothing when nothing is ticked", () => {
    expect(cardsIn(st, [])).toEqual([]);
    expect(sessionFor({ ...st, sets: [] }).items).toEqual([]);
  });

  it("deals the session from the ticked sets and no others", () => {
    const s = sessionFor({ ...st, sets: ["__due__"] });
    const words = s.items.map((x) => x.word).sort();
    expect(words).toEqual(["дом", "не", "я"]);
    expect(s.items.find((x) => x.word === "дом").kind).toBe("new");
    expect(s.items.filter((x) => x.kind === "review").map((x) => x.word).sort()).toEqual(["не", "я"]);
    // Not due, so not asked — and not in the set at all.
    expect(words).not.toContain("город");
    expect(s.due).toBe(2);
  });

  /* Whole sentences as cards (the owner, 2026-09-16: *"Complete sentences are
     very helpful"*). Drawn from the speech pool rather than the corpus at
     large, which is what makes every one of them level-matched and audible. */
  it("offers sentences the learner has reached, and every one can be heard", () => {
    // Far enough along that several units are open.
    const far = { ...base, unit: Object.fromEntries(STAGES.slice(0, 3).flatMap((s) =>
      [s.core, ...s.branches].map((u) => [u.id, { lessons: { 0: { v: true, q: 100 } } }]))) };
    const sentences = sentencesFor(far);
    expect(sentences.length).toBeGreaterThan(20);
    for (const c of sentences.slice(0, 15)) {
      // It is a sentence, it keys on itself (rule 20.4), and it has a real
      // recording — the whole reason this pool is the source.
      expect(c.sentence).toBe(true);
      expect(c.b).toBe(c.w);
      expect(c.w.split(/\s+/).length).toBeGreaterThan(1);
      expect(c.e).toBeTruthy();
      expect(hasRealAudio(c.b)).toBe(true);
    }
    // No duplicates: the listen and speak pools share rows by design.
    const keys = sentences.map((c) => c.b);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts sentences in the pile only when their set is ticked", () => {
    const far = { ...base, unit: Object.fromEntries(STAGES.slice(0, 3).flatMap((s) =>
      [s.core, ...s.branches].map((u) => [u.id, { lessons: { 0: { v: true, q: 100 } } }]))) };
    expect(cardsIn(far, ["__sentences__"]).every((c) => c.sentence)).toBe(true);
    expect(cardsIn(far, [UNIT_WITH_WORDS]).some((c) => c.sentence)).toBe(false);
  });

  it("deals a word once per direction the learner studies", () => {
    const both = sessionFor({ ...st, sets: ["__due__"], flash: ["recognise", "produce"] });
    const дом = both.items.filter((x) => x.word === "дом");
    expect(дом.map((x) => x.direction).sort()).toEqual(["produce", "recognise"]);
    expect(both.items.filter((x) => x.word === "я" && x.direction === "produce")[0].kind).toBe("new");
  });
});
