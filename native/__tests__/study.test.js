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

import { cardsIn, sessionFor, sentencesFor, studyCards, newCardRank } from "../src/screens/Study";
import { DAY, REVIEW, NEW } from "@core/scheduler";
import { SPEECH, STAGES, dueCount } from "../src/data";
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

  /* What is due is dealt whatever is ticked (2026-09-28): the Study badge
     counted ~150 due while a trouble-words tick let the pile hand over twenty
     and then say "Done for today". No tick may narrow the due cards away. */
  it("deals everything due with nothing ticked, and the badge counts the same", () => {
    expect(cardsIn(st, [])).toEqual([]);
    const s = sessionFor({ ...st, sets: [] });
    const words = s.items.map((x) => x.word).sort();
    expect(words).toEqual(["дом", "не", "я"]);
    expect(s.items.find((x) => x.word === "дом").kind).toBe("new");
    // Not due, so not asked.
    expect(words).not.toContain("город");
    expect(s.due).toBe(2);
    expect(dueCount({ ...st, sets: [] })).toBe(2);
  });

  it("deals the due cards even when only the trouble words were ticked", () => {
    const s = sessionFor({ ...st, sets: ["__trouble__"] });
    expect(s.items.map((x) => x.word).sort()).toEqual(["дом", "не", "я"]);
  });

  /* Words, sentences, or both — for the due cards as well as the new ones, and
     the badge follows the same choice so it never promises what is not dealt. */
  it("studies the kinds of card chosen, and counts only those as due", () => {
    const withSentence = { ...st, seen: { ...st.seen, "Где книга?": { recognise: review(-1) } } };
    const wordsOnly = sessionFor({ ...withSentence, cardKinds: ["words"] }).items.map((x) => x.word);
    expect(wordsOnly).not.toContain("Где книга?");
    expect(dueCount({ ...withSentence, cardKinds: ["words"] })).toBe(2);
    const sentOnly = sessionFor({ ...withSentence, cardKinds: ["sentences"] }).items.map((x) => x.word);
    expect(sentOnly).toContain("Где книга?");
    expect(sentOnly).not.toContain("я");
    expect(dueCount({ ...withSentence, cardKinds: ["sentences"] })).toBe(1);
  });

  /* A due sentence carries its English (2026-09-29): the schedule knows it only
     by its Russian, and it used to come back with a blank meaning, so its back
     showed the Russian again and nothing else. */
  it("gives a due sentence its English, and a due deck card its own", () => {
    const row = SPEECH.rows.find((r) => r[1]);
    const deck = { id: "k1", name: "d", cards: [{ ru: "Как дела у тебя?", en: "How are you doing?" }] };
    const st2 = { ...st, decks: [deck], cardKinds: ["words", "sentences"],
                  seen: { [row[0]]: { recognise: review(-1) }, "Как дела у тебя?": { recognise: review(-1) } } };
    const cards = studyCards(st2);
    const s = cards.find((c) => c.b === row[0]);
    expect(s.e).toBe(row[1]);
    expect(s.sentence).toBe(true);
    expect(cards.find((c) => c.b === "Как дела у тебя?").e).toBe("How are you doing?");
  });

  /* The trouble round: the trouble words whether or not they are due, worst
     first, as their own session. */
  it("deals a round of trouble words on request, due or not", () => {
    const bad = { dueAt: now + 5 * DAY, lastAt: now - DAY, s: 2, d: 9.5, state: REVIEW, steps: 0, reps: 12, lapses: 5 };
    const s = sessionFor({ ...st, seen: { ...st.seen, "город": { recognise: bad } } }, { round: "trouble" });
    expect(s.practice).toBe(true);
    expect(s.items.map((x) => x.word)).toContain("город");
  });

  /* A round on a list handed in by another screen — a video's words before
     watching it (§30bf): every word, in order, new or not, each with a face
     even when no ticked set carries it. */
  it("deals a round on a list handed in, with a face for every card", () => {
    const words = ["город", "хотеть", "музыка"];
    const s = sessionFor({ ...st, sets: [] }, { round: "list", words, title: "Before the video" });
    expect(s.practice).toBe(true);
    expect(s.title).toBe("Before the video");
    expect(s.items.map((x) => x.word)).toEqual(words);
    for (const w of words) expect(s.faces[w].e).toBeTruthy();
  });

  /* New cards from the path come commonest first, and a sentence is ranked by
     its rarest word (the owner, 2026-09-28: "prioritize more common and useful
     words… same with simpler sentences"). */
  it("introduces the commonest new cards first, simple sentences among them", () => {
    const fresh = { ...base, sets: ["__path__"], newPerDay: 5 };
    const ranks = sessionFor(fresh).items.map((x) => newCardRank(x.word));
    expect(ranks.length).toBeGreaterThan(0);
    const all = studyCards(fresh).filter((c) => !fresh.seen[c.b]).map((c) => newCardRank(c.b)).sort((a, b) => a - b);
    expect(Math.max(...ranks)).toBeLessThanOrEqual(all[ranks.length - 1]);
    expect(newCardRank("Где книга?")).toBeLessThan(newCardRank("Нам нужно установить наблюдение за домом этого человека."));
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

  it("puts new sentences in the pile only when sentences are chosen", () => {
    const far = { ...base, sets: ["__path__"], unit: Object.fromEntries(STAGES.slice(0, 3).flatMap((s) =>
      [s.core, ...s.branches].map((u) => [u.id, { lessons: { 0: { v: true, q: 100 } } }]))) };
    expect(cardsIn(far, ["__sentences__"]).every((c) => c.sentence)).toBe(true);
    // A unit's set carries its video's sentences too (2026-09-29); the chosen
    // kinds are what keep them out of a words-only pile, below.
    const unitSet = cardsIn(far, [UNIT_WITH_WORDS]);
    expect(unitSet.filter((c) => !c.sentence).length).toBe(require("../src/data").UN.find((u) => u.id === UNIT_WITH_WORDS).w.length);
    expect(unitSet.filter((c) => c.sentence).every((c) => c.e && hasRealAudio(c.b))).toBe(true);
    expect(studyCards({ ...far, cardKinds: ["words"] }).some((c) => c.sentence)).toBe(false);
    expect(studyCards({ ...far, cardKinds: ["words", "sentences"] }).some((c) => c.sentence)).toBe(true);
  });

  /* A word is one card (core/scheduler.js CARD, 2026-09-23): two fronts ticked
     deal it once, through whichever front its turn falls on — never twice in a
     session as two cards. */
  it("deals a word once however many fronts are ticked", () => {
    const both = sessionFor({ ...st, sets: ["__due__"], flash: ["recognise", "produce"] });
    for (const w of ["дом", "я"]) {
      expect(both.items.filter((x) => x.word === w).length).toBeLessThanOrEqual(1);
    }
    const mature = { ...st, sets: ["__due__"], flash: ["recognise", "produce"],
                     seen: { ...st.seen, "город": { recognise: review(-1, 30) } } };
    expect(sessionFor(mature).items.filter((x) => x.word === "город").length).toBe(1);
  });
});
