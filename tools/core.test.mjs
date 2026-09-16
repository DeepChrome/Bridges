/* Tests for core/ — the logic both platforms share.
 *
 * The web suites drive the DOM and the browser suite drives layout; neither reaches
 * the rules underneath. Since core/ is now the single implementation of folding,
 * scheduling and question generation, a bug here is a bug in both apps at once.
 *
 *   node tools/core.test.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fold, bare, translit, translitBack, firstSense, shuffle, sample, TOKEN }
  from "../core/util.js";
import { fsrsReview, fsrsPreview, isTrouble, retrievability, gradeFor, applyGrade }
  from "../core/fsrs.js";
import { split, merge, diff, isEmpty, memoryRepo, validLog, cardRow, rowCard, SETTING_KEYS }
  from "../core/repo.js";
import * as S from "../core/scheduler.js";
import { buildSession, requeue, bury, interleave, dailyFor, QUEUE_DEFAULTS } from "../core/queue.js";
import { SCENARIOS } from "../core/scenarios.js";
import { quizPassed, PASS_MARK, RELIEF_MARK, RELIEF_AFTER } from "../core/state.js";
import { SCHEMA_VERSION, MIGRATIONS, migrate, recordAttempt, tagAttempt, speechDefault, ATTEMPT_CAP,
         talkAllowance, startTalkSession, TALK_SESSIONS_PER_DAY, TALK_TURNS }
  from "../core/state.js";
import { compare, words, charDistance } from "../core/compare.js";
import { ERROR_TAGS, TAG_IDS, isTag, tagInfo } from "../core/errortags.js";
import { makeQuestions, DRILL_TYPES, SPEECH_MIX, FORM_MIX, QUIZ_KINDS, PRODUCE_AT,
         lessonSize, LESSON_RAMP, LESSON_SIZE }
  from "../core/questions.js";
import { LETTERS, VOWEL_PAIRS, VOWEL_CHART, soundTip, TRAPS,
         soundPairs, pairDiff, pairLemma } from "../core/alphabet.js";
import { sentenceLemmas, gradeAlignment, feedbackTags, nearMiss, alignmentCredit, SPEECH_SKIP_TOP }
  from "../core/speech.js";
import { describeForm, summarise } from "../core/forms.js";
import { parseDeep } from "../core/search.js";
import { decodeShapes, slotsOf, buildTables } from "../core/paradigm.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { ICONS, ACTIVITY_ICONS, iconFor } from "../core/icons.js";
import { AV, AV_IDS } from "../core/avatars.js";
import { POSES, guideSvg, LINES, MAX_WORDS, guideLine, poseFor } from "../core/guide.js";

import { loadPayload, PARTS } from "./payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = loadPayload(ROOT);

/* The payload stores paradigms and sentences once, shared; entries are filled out
   on the way in. Set up here because more than one group needs it. */
const DEEP = parseDeep(DATA.deep || "");
const DEEP_BY_BARE = makeDeepIndex(DEEP);
const hydrate = makeHydrator({
  deepIndex: () => DEEP_BY_BARE, shapes: DATA.shapes, slots: DATA.slots,
  sent: DATA.sent,
});
// Both apps do exactly this at load, and the drill generators read `w.t` and `w.x`
// straight off the lemma — so the suite has to stand in the same place they do.
DATA.lemmas.forEach(hydrate);

let failures = 0, checks = 0;
const ok = (cond, label, extra) => {
  checks++;
  console.log((cond ? "  pass  " : "  FAIL  ") + label +
              (cond || extra === undefined ? "" : "  → " + extra));
  if (!cond) failures++;
};
const group = (n) => console.log("\n" + n);

/* ------------------------------------------------------------------ util */

group("folding");
ok(fold("Кни́гу") === "книгу", "strips stress and lowercases", fold("Кни́гу"));
ok(fold("ёлка") === "елка", "folds ё to е", fold("ёлка"));
ok(fold("  СЕБЕ ") === "себе", "trims");
ok(fold("во́ду") === fold("воду"), "stressed and plain forms fold together");
ok(bare("кни́га") === "книга", "bare keeps case, drops the accent");

group("tokenising");
{
  // The accent must stay inside the token, or a stressed word splits in two.
  const toks = "Я пью во́ду.".match(TOKEN);
  ok(toks.length === 3, "a stressed sentence yields three tokens", JSON.stringify(toks));
  ok(toks[2] === "во́ду", "the accent stays attached", toks[2]);
}

group("transliteration");
ok(translit("sebe") === "себе", "sebe", translit("sebe"));
ok(translit("kniga") === "книга", "kniga", translit("kniga"));
ok(translit("shchi") === "щи", "multi-letter clusters win", translit("shchi"));
ok(translitBack("щи") === "shchi", "and round-trip back", translitBack("щи"));
ok(firstSense({ e: "tea, tea-party, methinks", b: "чай" }) === "tea",
   "firstSense takes the first gloss only");

group("shuffle and sample");
{
  const src = [1, 2, 3, 4, 5];
  const copy = src.slice();
  const out = sample(src, 3);
  ok(out.length === 3, "sample returns the requested count");
  ok(JSON.stringify(src) === JSON.stringify(copy), "sample does not mutate its input");
  ok(new Set(out).size === 3, "sample does not repeat");
  const big = Array.from({ length: 200 }, (_, i) => i);
  ok(JSON.stringify(shuffle(big.slice())) !== JSON.stringify(big), "shuffle reorders");
}

/* ------------------------------------------------------------------ fsrs */

group("FSRS");
{
  let card, day = 0;
  const ivs = [];
  for (let i = 0; i < 5; i++) {
    card = fsrsReview(card, 3, day);
    ivs.push(card.due - day);
    day = card.due;
  }
  ok(ivs.every((v, i) => i === 0 || v > ivs[i - 1]),
     "repeated Good lengthens the interval each time", ivs.join(", "));
  ok(ivs[0] >= 3 && ivs[0] <= 5, "the first Good lands around 4 days", String(ivs[0]));
  ok(card.d >= 1 && card.d <= 10, "difficulty stays in range", String(card.d));

  const lapsed = fsrsReview(card, 1, day);
  ok(lapsed.s < card.s, "Again reduces stability", `${card.s.toFixed(1)} → ${lapsed.s.toFixed(1)}`);
  ok(lapsed.due === day, "Again schedules the card for the same day");
  ok(lapsed.lapses === 1, "Again records a lapse");

  const hard = fsrsReview(card, 2, day);
  const easy = fsrsReview(card, 4, day);
  ok(hard.due < easy.due, "Hard schedules sooner than Easy",
     `${hard.due - day}d vs ${easy.due - day}d`);

  const fresh = fsrsPreview(undefined, 0);
  ok(fresh[1] === "now" && /d$/.test(fresh[3]),
     "a new card previews Again as now and Good in days", JSON.stringify(fresh));

  let t = undefined;
  for (let i = 0; i < 5; i++) t = fsrsReview(t, 1, i);
  ok(isTrouble(t), "four lapses on kept cards bank a word as trouble");
  ok(!isTrouble(fsrsReview(undefined, 3, 0)), "one good answer does not");
  // A lapse is an Again on a card the learner had kept: same-day repeats are
  // learning steps and count for nothing, and a first Again is not a lapse.
  let n = fsrsReview(undefined, 1, 10);
  n = fsrsReview(n, 1, 10);
  n = fsrsReview(n, 3, 10);
  ok(n.lapses === 0 && !isTrouble(n), "Again, Again, Good on one day is learning, not lapsing",
     JSON.stringify(n));
  ok(n.d === fsrsReview(undefined, 1, 10).d, "and leaves difficulty where the first answer set it");
  const kept = fsrsReview(fsrsReview(undefined, 3, 10), 1, 14);
  ok(kept.lapses === 1, "an Again days later on a kept card is a lapse");

  ok(retrievability(0, 10) === 1, "recall is certain on the day of review");
  ok(retrievability(100, 10) < retrievability(10, 10), "and decays with time");
}

/* --------------------------------------------------------------- grading */
/* gradeFor and applyGrade are the runners' rule, shared by web and native since
   P0.6 — each used to carry its own copy. The flashcard screens (web rateCard, native
   Study) still carry a third rule that clears trouble only on Good or better; that
   divergence is recorded here rather than silently unified. */

group("grading");
{
  ok(gradeFor(true, false) === 3, "a plain right answer is Good");
  ok(gradeFor(true, true) === 2, "right with the table open is Hard — recognised, not recalled");
  ok(gradeFor(false, false) === 1 && gradeFor(false, true) === 1, "wrong is Again either way");

  // Repeated Again makes a leech. isTrouble has two branches — four lapses, or high
  // difficulty after three reviews — and the difficulty branch trips first here, so
  // the bank counts every Again from that point on, not only the fourth.
  let seen = {}, trouble = {};
  for (let i = 0; i < 4; i++) ({ seen, trouble } = applyGrade(seen, trouble, "слово", 1, i));
  ok(isTrouble(seen["слово"]), "four lapses through applyGrade bank the word");
  ok(trouble["слово"] >= 1, "and the bank counts the lapses since it became one",
     String(trouble["слово"]));
  const banked = trouble["слово"];

  // Trouble clears exactly when a recall lifts the card out of leech territory. A
  // word four lapses deep never leaves it — lapses do not decay — so this recall
  // must not clear it.
  const r = applyGrade(seen, trouble, "слово", 3, 5);
  ok(r.card.reps === seen["слово"].reps + 1, "the card advanced");
  ok((r.trouble["слово"] === undefined) === !isTrouble(r.card),
     "trouble clears only when the scheduler no longer calls it a leech");
  ok(r.trouble["слово"] === banked, "and a permanent leech stays banked at its count");

  // Inputs are never mutated: both platforms hand in their live state.
  const s0 = { книга: fsrsReview(undefined, 3, 0) }, t0 = {};
  const out = applyGrade(s0, t0, "книга", 4, 1);
  ok(out.seen !== s0 && out.trouble !== t0, "returns new objects");
  ok(s0["книга"].reps === 1 && out.seen["книга"].reps === 2, "and leaves the originals alone");

  // A grade handed in directly is honoured — including Easy, which the right/wrong
  // mapping can never produce. This is the path a self-scoring activity uses.
  const easy = applyGrade({}, {}, "да", 4, 0).card;
  const good = applyGrade({}, {}, "да", 3, 0).card;
  ok(easy.due > good.due, "grade 4 handed in directly schedules further out than 3");
  ok(applyGrade({}, {}, "да", 9, 0).card.due === easy.due, "grades clamp to 4");
  ok(applyGrade({}, {}, "да", 0, 0).card.due === 0, "and to 1 (Again: due again today)");
}

/* ------------------------------------------------------------ state */
/* The schema lives in core since v5 so the two apps run one set of migrations. */

group("state schema");
{
  ok(SCHEMA_VERSION === 7, "schema is at 7", String(SCHEMA_VERSION));
  ok([1, 2, 3, 4, 5, 6].every((k) => typeof MIGRATIONS[k] === "function"),
     "a migration step exists from every earlier version");

  // A real v4 save: FSRS cards, component lessons, no speech slot.
  const v4 = {
    v: 4, seen: { книга: { s: 3, d: 5, due: 10, last: 6, reps: 3, lapses: 0 } },
    trouble: { стол: 2 }, pinned: ["дом"], xp: 42, streak: 5,
    unit: { core1: { lessons: { 0: { v: true, q: 90 } }, video: true } },
  };
  const v5 = MIGRATIONS[4](v4);
  ok(v5.v === 5, "v4 migrates to v5");
  const latest = migrate(v4, 4);
  ok(latest.v === SCHEMA_VERSION && latest.watched
     && Object.keys(latest.watched).length === 0 && Array.isArray(latest.decks),
     "v4 comes forward with empty watched and decks slots");
  // v7 (ROADMAP P10.4): a word taken from a video keeps where it was heard.
  ok(latest.mined && Object.keys(latest.mined).length === 0,
     "…and an empty mined map");
  ok(migrate({ v: 5, watched: { abc: 3 } }, 5).watched.abc === 3, "an existing watched slot is kept");
  ok(migrate({ v: 6, mined: { дом: { v: "abc", t: 12 } } }, 6).mined["дом"].t === 12,
     "an existing mined map is kept, not reset");
  /* Written against the constants, not against 80 and 79: the mark is a number
     chosen by sweeping (it moved to 75 on 2026-09-11) and a test that pins it
     fails on the change instead of on the rule. What must hold is the rule. */
  ok(quizPassed({ q: PASS_MARK })
     && !quizPassed({ q: PASS_MARK - 1, tries: 2 })
     && quizPassed({ q: RELIEF_MARK, tries: RELIEF_AFTER })
     && !quizPassed({ q: RELIEF_MARK - 1, tries: RELIEF_AFTER + 2 })
     && !quizPassed(undefined),
     "a quiz passes at the mark, or at the relief mark from the third try");
  ok(PASS_MARK > RELIEF_MARK,
     "and relief is relief: the later bar is the lower one",
     `${PASS_MARK} vs ${RELIEF_MARK}`);
  ok(Array.isArray(v5.speech.attempts) && v5.speech.attempts.length === 0 &&
     Object.keys(v5.speech.tagCounts).length === 0, "with an empty speech slot");
  ok(v5.seen["книга"].reps === 3 && v5.trouble["стол"] === 2 && v5.pinned[0] === "дом" &&
     v5.xp === 42, "and everything else untouched");
  ok(v5.unit.core1.lessons[0].q === 90, "lesson components survive");
  ok(v4.speech === undefined, "the input was not mutated");

  // A save that somehow already carries a speech slot keeps it.
  const kept = migrate({ v: 4, speech: { attempts: [{ ts: 1 }], tagCounts: { CASE: 2 } } }, 4);
  ok(kept.speech.attempts.length === 1 && kept.speech.tagCounts.CASE === 2,
     "an existing speech slot is kept, not reset");

  // The oldest shape still comes all the way forward.
  const v1 = migrate({ seen: { да: { n: 4, due: 3 } }, unit: { core1: { lessons: { 0: 80 } } } }, 1);
  ok(v1.v === SCHEMA_VERSION && v1.seen["да"].reps === 4
     && v1.unit.core1.lessons[0].q === 80 && v1.speech && v1.mined,
     `v1 → v${SCHEMA_VERSION} in one pass keeps history and gains the slots`);

  // recordAttempt: newest ATTEMPT_CAP kept, tags counted, nothing mutated.
  let sp = speechDefault();
  for (let i = 0; i < ATTEMPT_CAP + 25; i++) {
    sp = recordAttempt(sp, { ts: i, key: "k", kind: "say", tags: i % 2 ? ["CASE"] : [] });
  }
  ok(sp.attempts.length === ATTEMPT_CAP, "attempts are capped", String(sp.attempts.length));
  ok(sp.attempts[0].ts === 25 && sp.attempts[ATTEMPT_CAP - 1].ts === ATTEMPT_CAP + 24,
     "and it is the oldest that go");
  ok(sp.tagCounts.CASE === Math.floor((ATTEMPT_CAP + 25) / 2),
     "every tag was counted, including from dropped attempts", String(sp.tagCounts.CASE));
  const base = speechDefault();
  const one = recordAttempt(base, { tags: ["ASPECT", "ASPECT"] });
  ok(base.attempts.length === 0 && one.attempts.length === 1 && one.tagCounts.ASPECT === 2,
     "recordAttempt returns a new object and counts repeated tags");
  const budgeted = Object.assign({}, base, { talk: { day: 7, sessions: 2 } });
  ok(recordAttempt(budgeted, { ts: 1, tags: [] }).talk.sessions === 2
     && tagAttempt(recordAttempt(budgeted, { ts: 1, tags: [] }), 1, ["CASE"]).talk.day === 7,
     "an attempt recorded mid-conversation keeps the day's talk budget");
}

/* --------------------------------------------------------------- rows */
/* The state as the database holds it (core/repo.js): the split into tables,
   what one save writes, the row a review leaves, and the in-memory store that
   every native suite runs on. The real SQL is native/__tests__/sqlite.test.js. */

group("the state as rows");
{
  const canon = (x) => (Array.isArray(x) ? x.map(canon)
    : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

  const DAY = S.DAY, T0 = 20700 * DAY + 12 * 3600000;    // a noon, in ms
  const st = {
    v: 7, dev: true, theme: "auto", talkLevel: null, xp: 42, streak: 3, sets: [], pinned: ["дом"],
    trouble: { стол: 2 }, unit: { core1: { lessons: { 0: { v: true, q: 90 } } } }, speech: speechDefault(),
    watched: {}, mined: {},
    seen: { книга: { recognise: { dueAt: T0 + 10 * DAY, lastAt: T0, s: 5, d: 4.2, state: S.REVIEW, steps: 0, reps: 2, lapses: 0, elapsed: 0, scheduled: 10 },
                     produce: { dueAt: T0 + 2 * DAY, lastAt: T0 - DAY, s: 2, d: 6, state: S.REVIEW, steps: 0, reps: 3, lapses: 1, elapsed: 1, scheduled: 3 } },
            нет: { listen: { dueAt: T0 + 3 * DAY, s: 1, d: 5, state: S.REVIEW, steps: 0, reps: 1, lapses: 0, elapsed: 0, scheduled: 0 } } },
    decks: [{ id: "k1", name: "D", cards: [{ ru: "да", en: "yes" }] }],
    later: { unknown: true },      // a key this build has never heard of
    gone: undefined,
  };
  const { gone, ...expected } = st;

  ok(!SETTING_KEYS.includes("decks") && !SETTING_KEYS.includes("seen") && SETTING_KEYS.includes("retention"),
     "the settings are the keys a reset keeps; decks and cards are tables");
  const rows = split(st);
  ok(rows.cards.length === 3 && rows.decks.length === 1
     && Object.keys(rows.settings).sort().join() === "dev,talkLevel,theme"
     && rows.progress.later.unknown === true && !("gone" in rows.progress) && !("seen" in rows.progress),
     "split: a card row per (word, direction), decks, settings and progress; an unknown key kept, undefined dropped");
  ok(same(merge(Object.assign({}, rows, { cards: st.seen })), expected), "merge is split's inverse");
  const нет = cardRow("нет", "listen", st.seen["нет"].listen);
  ok(нет.last === null && нет.due === T0 + 3 * DAY && !("lastAt" in rowCard(нет)) && rowCard(нет).dueAt === T0 + 3 * DAY,
     "a card without `lastAt` is a null column and comes back without the field");

  ok(isEmpty(diff(st, st)), "an unchanged state writes nothing");
  const full = diff(null, st);
  ok(full.cards.put.length === 3 && full.decks.put.length === 1
     && Object.keys(full.progress.put).length === Object.keys(rows.progress).length
     && Object.keys(full.settings.put).length === 3, "from nothing, all of it");
  const now = T0 + 5 * DAY, at = now;
  const r = S.applyGrade(st.seen, st.trouble, "книга", "recognise", 3, now, { fuzz: false });
  const next = Object.assign({}, st, { seen: r.seen, trouble: r.trouble, xp: 43 });
  const d = diff(st, next);
  ok(d.cards.put.length === 1 && d.cards.put[0].word === "книга" && d.cards.put[0].direction === "recognise"
     && d.cards.del.length === 0 && d.decks === null && Object.keys(d.progress.put).join() === "xp"
     && Object.keys(d.settings.put).length === 0,
     "one grade: one card row and the xp key, nothing else", JSON.stringify(d));
  const rebuilt = Object.assign({}, st, { seen: Object.assign({}, st.seen), unit: JSON.parse(JSON.stringify(st.unit)) });
  ok(isEmpty(diff(st, rebuilt)), "new objects with the same content write nothing");
  const fewer = Object.assign({}, next, { seen: { книга: { recognise: next.seen["книга"].recognise } }, decks: [] });
  const d2 = diff(next, fewer);
  ok(d2.cards.del.map((k) => k.word + "/" + k.direction).sort().join() === "книга/produce,нет/listen"
     && d2.decks && d2.decks.del.join() === "k1" && d2.decks.put.length === 0,
     "what went is deleted: two cards, a deck", JSON.stringify(d2.cards.del));
  const d3 = diff(st, Object.assign({}, st, { decks: st.decks.concat([{ id: "k2", name: "E", cards: [] }]) }));
  ok(d3.decks.put.length === 1 && d3.decks.put[0].id === "k2" && d3.decks.put[0].ord === 1 && d3.decks.del.length === 0,
     "a deck added is the only deck written");
  ok(diff(st, expected).progress.del.length === 0 && diff(st, Object.assign({}, expected, { later: undefined })).progress.del.join() === "later",
     "a key removed is deleted; one that was never there is not");

  const one = S.reviewRow(st.seen["книга"].recognise, "книга", "recognise", 3, now, at, "study");
  ok(one.s === 5 && one.d === 4.2 && one.due === T0 + 10 * DAY && one.last === T0 && one.reps === 2 && one.lapses === 0
     && one.elapsed === 5 && one.grade === 3 && one.day === S.dayOf(now) && one.at === at && one.source === "study"
     && one.state === S.REVIEW && one.steps === 0 && one.scheduled === 10 && one.direction === "recognise",
     "a review row is the card before the grade, the grade, and when", JSON.stringify(one));
  const first = S.reviewRow(undefined, "новый", "produce", 1, now, at, null);
  ok(first.s === null && first.elapsed === null && first.reps === 0 && first.source === null && first.state === S.NEW,
     "a first review has no memory to record");
  const two = S.reviewRows(st.seen, [{ word: "книга", direction: "recognise", grade: 1 },
                                     { word: "книга", direction: "recognise", grade: 3 }], now, "run", { fuzz: false });
  ok(two.length === 2 && two[0].at === at && two[1].at === at + 1 && two[1].reps === 3 && two[1].lapses === 1 && two[1].s < 5
     && two[1].state === S.RELEARNING,
     "a card graded twice in one batch: the second row stands on the first's card, one millisecond on", JSON.stringify(two[1]));
  ok(S.reviewRows(st.seen, [{ word: "книга", direction: "sideways", grade: 3 }], now, "run").length === 0,
     "a row with no direction is not a row");
  ok(validLog([{ word: "да", grade: 3, day: 1, at: 5 }, { word: "", grade: 3, day: 1, at: 6 },
               { word: "x", grade: 2.5, day: 1, at: 7 }, { word: "y", grade: 5, day: 1, at: 8 },
               null, "no", { word: "z", grade: 4, day: 1 }]).length === 1
     && validLog(null).length === 0 && validLog("x").length === 0,
     "validLog keeps only rows with the fields a review cannot lack");

  const repo = memoryRepo();
  ok((await repo.load()) === null, "an empty store loads null");
  await repo.replace(st, [one]);
  ok(same(merge(await repo.load()), expected), "replace then load is the state");
  const c = await repo.counts();
  ok(c.cards === 3 && c.decks === 1 && c.deckCards === 1 && c.log === 1 && c.settings === 3, "and the counts say so", JSON.stringify(c));
  await repo.apply(d, [one, Object.assign({}, one, { at: at + 1 })]);
  const after = merge(await repo.load());
  ok((await repo.counts()).log === 2 && after.seen["книга"].recognise.reps === 3 && after.xp === 43,
     "apply writes the diff and ignores a log row it already has");
  ok((await repo.readLog({ since: at + 1 })).length === 1 && (await repo.readLog({ limit: 1 }))[0].at === at
     && (await repo.readLog({ word: "нет" })).length === 0 && (await repo.readLog({ word: "книга" })).length === 2,
     "readLog from a moment on, capped, or for one word");
  await repo.apply(diff(next, next), [], [{ word: "книга", direction: "recognise", at: at + 1 }]);
  ok((await repo.counts()).log === 1, "a dropped row is gone — an undone review");
  ok((await repo.getMeta("x")) === null, "a note never made is null");
  await repo.setMeta("x", 1);
  ok((await repo.getMeta("x")) === "1", "a note is text");
  const loaded = await repo.load();
  loaded.progress.unit.core1 = "changed";
  ok((await repo.load()).progress.unit.core1 !== "changed", "what load returns is the caller's to change");
}

/* ---------------------------------------------------------- scheduler */
/* ts-fsrs behind the app's card (core/scheduler.js): the library's formulas
   are not re-tested here — what is, is the card round trip, the conversion of
   the old shape, what "due" means for each state, and the trouble rule. */

group("the scheduler");
{
  const DAY = S.DAY, MIN = S.MINUTE, T0 = 20700 * DAY + 12 * 3600000;
  const opts = { fuzz: false };
  const fresh = S.newCard(T0);
  ok(fresh.state === S.NEW && fresh.dueAt === T0 && fresh.reps === 0 && fresh.lastAt === undefined,
     "a new card is new, due now, never reviewed");
  ok(S.kindOf(undefined) === "new" && S.kindOf(fresh) === "new" && !S.isDue(fresh, T0),
     "a card that does not exist is new, and new is not due — it is rationed");

  const good = S.review(undefined, 3, T0, opts);
  ok(good.state === S.LEARNING && good.dueAt - T0 === 10 * MIN && good.reps === 1 && good.lastAt === T0 && good.s > 0,
     "Good on a new card is a learning step ten minutes on", JSON.stringify(good));
  ok(S.isDue(good, T0 + 10 * MIN) && !S.isDue(good, T0 + 5 * MIN, 0) && S.isDue(good, T0 + 5 * MIN, 20),
     "a learning card is due at its minute, or inside the learn-ahead window");
  const easy = S.review(undefined, 4, T0, opts);
  ok(easy.state === S.REVIEW && S.dayOf(easy.dueAt) > S.dayOf(T0) + 1, "Easy on a new card graduates it to review, days out");
  ok(!S.isDue(easy, easy.dueAt - 26 * 3600000) && S.isDue(easy, S.dayOf(easy.dueAt) * DAY + 1),
     "a review card is due on its day, from its first minute");

  const pv = S.preview(easy, easy.dueAt, opts);
  ok(pv[2].card.dueAt < pv[3].card.dueAt && pv[3].card.dueAt < pv[4].card.dueAt && pv[1].card.dueAt < pv[2].card.dueAt,
     "intervals are monotonic: Again < Hard < Good < Easy", [1, 2, 3, 4].map((g) => pv[g].label).join(" · "));
  ok(/^\d+m$/.test(pv[1].label) && /^\d+(d|mo)$/.test(pv[4].label), "labels read as minutes, days or months", pv[1].label + " " + pv[4].label);
  ok(S.intervalLabel(30 * 1000) === "now" && S.intervalLabel(10 * MIN) === "10m" && S.intervalLabel(3 * 3600000) === "3h"
     && S.intervalLabel(4 * DAY) === "4d" && S.intervalLabel(60 * DAY) === "2mo" && S.intervalLabel(400 * DAY) === "1.1y",
     "interval labels", [30 * 1000, 10 * MIN, 3 * 3600000, 4 * DAY, 60 * DAY, 400 * DAY].map(S.intervalLabel).join(" "));

  const lapsed = S.review(easy, 1, easy.dueAt, opts);
  ok(lapsed.state === S.RELEARNING && lapsed.lapses === 1 && lapsed.s < easy.s, "Again on a kept card is a lapse and a relearning step");
  const stepAgain = S.review(good, 1, T0 + 10 * MIN, opts);
  ok(stepAgain.lapses === 0 && stepAgain.state === S.LEARNING, "Again inside a learning step is not a lapse");
  ok(S.retrievability(easy, easy.dueAt) < S.retrievability(easy, T0 + DAY) && S.retrievability(undefined, T0) === 0,
     "recall decays with time and a card with no memory has none");

  // The old shape, as every backup and the web app still write it.
  const old = { s: 5, d: 4.2, due: 20710, last: 20700, reps: 2, lapses: 0 };
  const conv = S.fromLegacy(old);
  ok(S.isLegacyCard(old) && !S.isLegacyCard(conv) && conv.dueAt === 20710 * DAY && conv.lastAt === 20700 * DAY
     && conv.state === S.REVIEW && conv.scheduled === 10 && conv.s === 5 && conv.d === 4.2 && conv.reps === 2,
     "a day-numbered card becomes a review card timed in ms", JSON.stringify(conv));
  const v1 = S.fromLegacy({ s: 0, d: 0, due: 0, last: 0, reps: 4, lapses: 0 });
  ok(v1.state === S.NEW && v1.lastAt === undefined && v1.reps === 4, "a card with no memory (the v1 migration's) is new, history kept");
  ok(S.isLegacyCard({ dueAt: 20710, lastAt: 20700, s: 5 }) && S.fromLegacy({ dueAt: 20710, lastAt: 20700, s: 5 }).dueAt === 20710 * DAY,
     "a Phase 1 row read back with day numbers under the new names is the same case");
  const seen = { книга: old, дом: { recognise: conv }, нет: { produce: { s: 1, due: 3, last: 2, reps: 1 } } };
  const ns = S.normaliseSeen(seen);
  ok(ns !== seen && ns["книга"].recognise.dueAt === conv.dueAt && ns["дом"] === seen["дом"]
     && ns["нет"].produce.dueAt === 3 * DAY && !("listen" in ns["книга"]),
     "normaliseSeen: one old card becomes the recognise card, a converted entry is left as it is");
  ok(S.normaliseSeen(ns) === ns && S.normaliseSeen({}) !== null, "and it returns the same object when nothing needed converting");

  // The trouble rule, per card, and the word's entry.
  let e = {}, tr = {};
  let t = T0;
  for (let i = 0; i < 5; i++) { ({ seen: e, trouble: tr } = S.applyGrade(e, tr, "слово", "produce", 1, t, opts)); t += 2 * DAY; }
  ok(S.wordTrouble(e["слово"]) && tr["слово"] >= 1, "repeated Again banks a word as trouble through its direction");
  ok(!S.wordTrouble({ recognise: good }), "a word answered once is not");
  const g2 = S.applyGrade(e, tr, "слово", "recognise", 3, t, opts);
  ok(g2.seen["слово"].recognise && g2.seen["слово"].produce === e["слово"].produce && g2.prev === undefined,
     "a grade in one direction leaves the other's card alone and reports no previous card");
  let threw = false;
  try { S.applyGrade({}, {}, "x", "sideways", 3, T0); } catch (err) { threw = true; }
  ok(threw, "a direction the scheduler does not know is refused");

  // Enough for one day (§30t), on the new clock.
  const day = S.dayOf(T0);
  const worked = { seen: { дом: { recognise: S.review(undefined, 3, T0, opts) } } };
  ok(S.dayDone(worked, 0, day) && !S.dayDone(worked, 7, day) && !S.dayDone({ seen: {} }, 0, day)
     && !S.dayDone({ day: day, seen: { дом: { recognise: S.review(undefined, 3, T0 - DAY, opts) } } }, 0, day),
     "a day is done when something was answered today and nothing is waiting — not when the app was opened");
  ok(S.dueCards(worked.seen, T0 + 10 * MIN, 0).length === 1 && S.dueCards(worked.seen, T0, 0).length === 0
     && S.dueCards(worked.seen, T0).length === 1,
     "dueCards counts the learning step when its minute comes, or inside the learn-ahead window");
  ok(S.strength({ recognise: good, produce: easy }) === Math.max(good.s, easy.s) && S.maxLapses({ produce: lapsed }) === 1,
     "strength is the strongest direction; lapses the worst");
  ok(Object.values(S.DIRECTION_OF_KIND).every(S.isDirection) && S.directionOfKind("choose-en") === "recognise"
     && S.directionOfKind("type") === "produce" && S.directionOfKind("hear") === "listen"
     && S.directionOfKind("nothing") === "recognise",
     "every question kind names a direction");
}

/* ------------------------------------------------------------ session */
/* core/queue.js: the rules the owner's "131 cards, sequential" needed. */

group("the session");
{
  const DAY = S.DAY, T0 = 20700 * DAY + 12 * 3600000;
  const rng = (() => { let a = 7; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
  // 131 review cards, all due today, stored in alphabetical order, with
  // memories of every strength.
  const words = Array.from({ length: 131 }, (_, i) => "w" + String(i).padStart(3, "0"));
  const seen = {};
  words.forEach((w, i) => {
    const s = 1 + ((i * 37) % 60);                       // stability 1–60 days
    seen[w] = { recognise: { dueAt: T0 - DAY, lastAt: T0 - (s + 5) * DAY, s: s, d: 5, state: S.REVIEW, steps: 0, reps: 3, lapses: 0, elapsed: 0, scheduled: s } };
  });
  const fresh = Array.from({ length: 40 }, (_, i) => "n" + i);
  const all = words.concat(fresh);
  const opts = { newPerDay: 15, sessionSize: 20, reviewsPerDay: 200, learnAhead: 20, scheduler: { fuzz: false } };
  const ses = buildSession({ seen, words: all, dirs: ["recognise"], now: T0, daily: null, opts, rng });
  ok(ses.items.length === 20 && ses.due === 131, "a session is twenty of the 131 due", `${ses.items.length} of ${ses.due}`);
  const order = ses.items.map((x) => x.word);
  ok(order.join() !== words.slice(0, 20).join(), "and not in storage order", order.slice(0, 5).join(" "));
  const rOf = (w) => S.retrievability(seen[w].recognise, T0);
  const reviewsIn = ses.items.filter((x) => x.kind === "review");
  const lowest = Math.min(...words.map(rOf));
  ok(rOf(reviewsIn[0].word) === lowest,
     "the first review is a most-forgotten card of the whole pile", `${reviewsIn[0].word} r=${rOf(reviewsIn[0].word).toFixed(3)} vs ${lowest.toFixed(3)}`);
  ok(reviewsIn.every((x, i) => i === 0 || rOf(x.word) >= rOf(reviewsIn[i - 1].word)), "and reviews rise in retrievability");
  const newIn = ses.items.filter((x) => x.kind === "new");
  ok(newIn.length === Math.round(20 * 15 / 146) && newIn.length === 2, "new cards take the day's share of the session", String(newIn.length));
  const newAt = ses.items.map((x, i) => (x.kind === "new" ? i : -1)).filter((i) => i >= 0);
  ok(newAt[0] >= 3 && newAt[1] - newAt[0] >= 8 && newAt[1] - newAt[0] <= 11, "and are spread through it", newAt.join(","));
  ok(ses.remaining === 113 && reviewsIn.length === 18, "eighteen reviews dealt, 113 left for the next chunk", `${reviewsIn.length} / ${ses.remaining}`);

  const only = buildSession({ seen: {}, words: fresh, dirs: ["recognise"], now: T0, daily: null, opts, rng });
  ok(only.items.length === 15 && only.items.every((x) => x.kind === "new") && only.remaining === 0,
     "with nothing due a session is the day's new cards and no more", String(only.items.length));
  const spent = buildSession({ seen: {}, words: fresh, dirs: ["recognise"], now: T0, daily: { day: S.dayOf(T0), new: 15, reviews: 0 }, opts, rng });
  ok(spent.items.length === 0 && spent.newLeft === 0, "…and none once today's have been introduced");
  const aheadS = buildSession({ seen: {}, words: fresh, dirs: ["recognise"], now: T0, daily: { day: S.dayOf(T0), new: 15, reviews: 0 }, opts, rng, ahead: true });
  ok(aheadS.items.length === 20, "unless the learner chose to study ahead");
  const capped = buildSession({ seen, words: all, dirs: ["recognise"], now: T0, daily: { day: S.dayOf(T0), new: 0, reviews: 200 }, opts, rng });
  ok(capped.done && capped.items.filter((x) => x.kind === "review").length === 0,
     "past the day's review cap the day is done");
  ok(dailyFor({ day: S.dayOf(T0) - 1, new: 9, reviews: 50 }, T0).new === 0 && dailyFor({ day: S.dayOf(T0), new: 9 }, T0).new === 9,
     "a new day starts the counts over");

  // Interleave: R reviews, N new, spread evenly.
  const mixed = interleave([], [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ i })), ["a", "b"].map((i) => ({ i })));
  const at = mixed.map((x, i) => (typeof x.i === "string" ? i : -1)).filter((i) => i >= 0);
  ok(mixed.length === 10 && at.length === 2 && at[1] - at[0] === 5, "two new among eight reviews sit five apart", at.join(","));
  ok(interleave([{ i: "L" }], [{ i: 1 }], [])[0].i === "L", "learning steps come first");

  // Siblings and Again.
  const twoDirs = buildSession({ seen: { дом: { recognise: seen.w000.recognise, produce: seen.w001.recognise } },
                                 words: ["дом"], dirs: ["recognise", "produce"], now: T0, daily: null, opts, rng });
  ok(twoDirs.items.length === 2, "both directions of a word are dealt");
  const buried = bury(twoDirs.items, 0, "дом", twoDirs.items[0].direction);
  ok(buried.length === 1 && buried[0] === twoDirs.items[0], "answering one buries the other for the session");
  const again = requeue(twoDirs.items, 0, twoDirs.items[0], 3);
  ok(again.length === 3 && again[2].word === "дом" && again[2].again === true,
     "Again comes back at the end of a short session");
  const long = requeue(ses.items, 0, ses.items[0], 3);
  ok(long[4] !== ses.items[0] && long[4].word === ses.items[0].word && long[4].again && long.length === 21,
     "and after three other cards in a long one");
  ok(bury(again, 2, "дом", again[2].direction).length === 3, "a re-queued copy of the card itself is not a sibling");
  ok(QUEUE_DEFAULTS.sessionSize === 20 && QUEUE_DEFAULTS.newPerDay === 15 && QUEUE_DEFAULTS.reviewsPerDay === 200,
     "the defaults are the playbook's");
  const unset = buildSession({ seen: {}, words: fresh, dirs: ["recognise"], now: T0, daily: null,
                               opts: { newPerDay: undefined, sessionSize: undefined }, rng });
  ok(unset.items.length === 15, "an option left unset is the default, not NaN", String(unset.items.length));
}

/* ----------------------------------------------------- backward build-up */
/* Pimsleur's technique (core/buildup.js): a long word learned from its end.
   The splitting is the whole feature — a fragment nobody can say is worse
   than no drill. */

group("backward build-up");
{
  const { syllables, buildup, worthBuilding, buildupDrill, MIN_SYLLABLES }
    = await import("../core/buildup.js");
  const s = (w) => syllables(w).join("-");

  ok(s("понима́ю") === "по-ни-ма́-ю", "по-ни-ма-ю: a consonant between vowels opens the next syllable", s("понима́ю"));
  ok(s("спаси́бо") === "спа-си́-бо", "спа-си-бо", s("спаси́бо"));
  ok(s("хорошо́") === "хо-ро-шо́", "хо-ро-шо", s("хорошо́"));
  ok(s("ру́сский") === "ру́с-ский", "a doubled consonant splits between the two", s("ру́сский"));
  ok(s("карти́на") === "кар-ти́-на", "a sonorant closes the syllable before it", s("карти́на"));
  ok(s("здра́вствуйте") === "здра́в-ствуй-те", "a cluster of three or more leaves its first behind", s("здра́вствуйте"));
  ok(s("чу́вствовать") === "чу́в-ство-вать", "…which is what makes «чувствовать» sayable", s("чу́вствовать"));
  ok(s("учи́тель") === "у-чи́-тель", "a trailing soft sign stays where it is", s("учи́тель"));
  ok(syllables("дом").length === 1 && syllables("я").length === 1, "one vowel is one syllable");
  ok(syllables("").length === 0, "and nothing is nothing");

  // The stress mark belongs to its vowel; a fragment must never open with one.
  ok(buildup("понима́ю").every((f) => !/^[̀́]/.test(f.normalize("NFD"))),
     "no fragment begins with a floating stress mark");
  ok(s("понима́ю").includes("ма́"), "and the mark stays on the vowel it belongs to");

  const b = buildup("понима́ю");
  ok(b.length === 4 && b[0] === "ю" && b[b.length - 1] === "понима́ю",
     "the build runs ю → ма́ю → нима́ю → понима́ю", b.join(" | "));
  ok(b.every((f, i) => i === 0 || f.endsWith(b[i - 1])),
     "every step ends with the step before it — that is what backwards means");
  ok(b.every((f, i) => i === 0 || f.length > b[i - 1].length), "and each is longer than the last");

  ok(!worthBuilding("дом") && !worthBuilding("до́ма") && worthBuilding("понима́ю"),
     `a word is worth building at ${MIN_SYLLABLES} syllables, not before`);

  const drill = buildupDrill([{ ru: "понима́ю", en: "I understand" }, { ru: "дом", en: "house" },
                              { ru: "спаси́бо", en: "thank you" }], 5);
  ok(drill.length === 2, "the drill takes only the words long enough", String(drill.length));
  ok(drill.every((q) => q.kind === "buildup" && q.steps.length >= MIN_SYLLABLES),
     "each question carries its own fragments");
  ok(drill.every((q) => q.i === undefined),
     "and none carries a lemma index — saying a word is not knowing it (core/alphabet.js says the same)");
  ok(buildupDrill([], 5).length === 0 && buildupDrill(null, 5).length === 0, "nothing in, nothing out");
}

/* ------------------------------------------------- the review round trip */
/* PLAYBOOK 3.1–3.3: every authored string goes out as a CSV, a person
   corrects it, and it comes back by id. The parsing and the planning are
   what stand between a reviewer's spreadsheet and the curated data, so they
   are tested rather than trusted (rule 20.3: those files are hand-authored
   and a rebuild must never clobber them). */

group("the review round trip");
{
  const { parseCsv, locate, plan } = await import("./import_review.mjs");
  const { YO_ONLY, cognate } = await import("./check_scripts.mjs");

  // A reviewer's file is full of commas, quotes and newlines. split(",")
  // would shred it silently, which in a tool that edits curated data is the
  // worst kind of bug.
  const csv = 'id,ru,fix,note\r\n'
    + 'a,"Да, конечно.","Да, конечно!","a comma, and ""quotes"""\r\n'
    + 'b,нет,,"two\nlines"\r\n';
  const rows = parseCsv(csv);
  ok(rows.length === 2, "two rows out of a file with a newline inside a cell", String(rows.length));
  ok(rows[0].ru === "Да, конечно." && rows[0].fix === "Да, конечно!", "a quoted comma survives");
  ok(rows[0].note === 'a comma, and "quotes"', "and a doubled quote is one quote", rows[0].note);
  ok(rows[1].note === "two\nlines", "and a newline inside quotes is not a new row");
  ok(parseCsv("﻿id,ru\r\nx,да\r\n")[0].id === "x", "the BOM Excel needs is not part of the first id");

  ok(locate("script:core1:0:line:3").path.join(".") === "lines.3.ru", "an id names a place in the file");
  ok(locate("script:core1:0:q:2:opt:1").path.join(".") === "questions.2.options.1", "…including an option");
  ok(locate("name:Аня") === null && locate("nonsense") === null,
     "and an id it cannot place is not guessed at");

  const docs = { core1: { lessons: { "core1:0": {
    title: "A title", lines: [{ s: "a", ru: "Это дом.", en: "This is a house." }],
    questions: [{ ask: "Whose?", options: ["His", "Hers"], answer: 0 }],
  } } } };
  const row = (o) => Object.assign({ id: "", ru: "", en: "", fix: "", note: "" }, o);

  const good = plan([row({ id: "script:core1:0:line:0", ru: "Это дом.", fix: "Это мой дом." })], docs);
  ok(good.changes.length === 1 && good.changes[0].before === "Это дом." && good.changes[0].after === "Это мой дом."
     && !good.refused.length, "a correction is planned against what the file holds");
  ok(docs.core1.lessons["core1:0"].lines[0].ru === "Это дом.", "and planning writes nothing");

  const stale = plan([row({ id: "script:core1:0:line:0", ru: "Это была другая строка.", fix: "Это мой дом." })], docs);
  ok(!stale.changes.length && /older export/.test(stale.refused[0]),
     "a row reviewed against an older export is refused, not applied", stale.refused[0]);
  const latin = plan([row({ id: "script:core1:0:line:0", ru: "Это дом.", fix: "Eto moy dom." })], docs);
  ok(!latin.changes.length && /Latin/.test(latin.refused[0]), "and so is a correction typed in Latin letters");
  const gone = plan([row({ id: "script:core1:0:line:9", fix: "Привет." })], docs);
  ok(!gone.changes.length && gone.refused.length, "and a line that is no longer there");
  const same = plan([row({ id: "script:core1:0:line:0", ru: "Это дом.", fix: "Это дом." })], docs);
  ok(!same.changes.length && !same.refused.length, "a row the reviewer left alone is not a change");

  // The two rules added for PLAYBOOK 3.2, each proved to fire.
  ok(YO_ONLY.get("еще") === "ещё" && YO_ONLY.get("ребенок") === "ребёнок",
     "ё is required where the lexicon spells a word only that way");
  ok(!YO_ONLY.has("все"), "…and never where both spellings are real words — «все» is not «всё»");
  ok(cognate("parliament", "parlament") && !cognate("house", "dom") && !cognate("who", "kto"),
     "the cognate test detects the case it is named after, and not everything else");
}

/* ------------------------------------------------------------ compare */
/* A recogniser's transcript against the target sentence, word by word. */

group("transcript compare");
{
  const st = (r) => r.alignment.map((a) => a.status).join(" ");

  let r = compare("Я пью чай без сахара.", "Я пью чай без сахара.");
  ok(r.wer === 0 && st(r) === "ok ok ok ok ok", "identical sentences: no errors", st(r));

  r = compare("я пью чай без сахара", "Я пью́ ча́й без са́хара.");
  ok(r.wer === 0, "stress marks, case and punctuation never count", st(r));

  r = compare("ёлка", "елка");
  ok(r.wer === 0 && r.alignment[0].status === "ok", "ё and е are the same word");

  r = compare("Я пью кофе без сахара", "Я пью чай без сахара");
  ok(r.wer === 0.2 && st(r) === "ok ok sub ok ok", "one wrong word is one substitution", st(r));
  ok(r.alignment[2].said === "кофе" && r.alignment[2].expected === "чай",
     "and the alignment says which word for which");

  r = compare("Я пью без сахара", "Я пью чай без сахара");
  ok(r.wer === 0.2 && st(r) === "ok ok del ok ok", "a dropped word is a deletion", st(r));
  ok(r.alignment[2].said === null && r.alignment[2].expected === "чай", "naming the missing word");

  r = compare("Я пью чай очень без сахара", "Я пью чай без сахара");
  ok(r.wer === 0.2 && st(r) === "ok ok ok ins ok ok", "an added word is an insertion", st(r));
  ok(r.alignment[3].said === "очень" && r.alignment[3].expected === null, "naming the extra word");

  r = compare("", "Я пью чай");
  ok(r.wer === 1 && st(r) === "del del del", "nothing said: everything missing, WER 1", st(r));

  r = compare("что-то", "Я пью чай");
  ok(r.wer === 1, "WER never exceeds 1", String(r.wer));

  ok(words("кто-то, OK 1 hello, кто").join("|") === "кто-то|кто",
     "hyphenated words stay whole; Latin, digits and punctuation are not words",
     words("кто-то, OK 1 hello, кто").join("|"));

  r = compare("Чай пью я", "Я пью чай");
  ok(Math.abs(r.wer - 2 / 3) < 1e-9 && st(r) === "sub ok sub",
     "reordered words: the middle holds, the ends substitute — 2 of 3", st(r) + " " + r.wer);

  r = compare("", "");
  ok(r.wer === 0 && r.alignment.length === 0, "nothing expected, nothing said: no error");

  r = compare("да", "");
  ok(r.wer === 1 && st(r) === "ins", "nothing expected but something said is an insertion");
}

/* --------------------------------------------------------- error tags */
/* The closed vocabulary a feedback model may use. The backend rejects any other
   tag, so the list, the learner-facing text and the grammar links must all hold. */

group("error tags");
{
  const WANT = ["CASE", "NUMBER", "GENDER_AGREE", "ASPECT", "TENSE", "PERSON",
                "WORD_ORDER", "PREPOSITION", "WRONG_WORD", "MISSING_WORD",
                "EXTRA_WORD", "STRESS", "UNCLEAR"];
  ok(TAG_IDS.length === WANT.length && WANT.every((t) => TAG_IDS.includes(t)),
     "exactly the thirteen tags the roadmap names", TAG_IDS.join(","));
  ok(new Set(TAG_IDS).size === TAG_IDS.length, "no tag twice");
  ok(ERROR_TAGS.every((t) => typeof t.en === "string" && t.en.length >= 20),
     "every tag has a description a learner can read");
  ok(ERROR_TAGS.every((t) => t.id === t.id.toUpperCase() && /^[A-Z_]+$/.test(t.id)),
     "ids are upper-case identifiers");

  // A grammar link must point at a unit that exists and has a note to show.
  const unitsWithNotes = new Set(DATA.units.filter((u) => u.g).map((u) => u.id));
  const linked = ERROR_TAGS.filter((t) => t.unit);
  ok(linked.length >= 8, "most tags link to a grammar step", String(linked.length));
  ok(linked.every((t) => unitsWithNotes.has(t.unit)),
     "and every link is to a unit that carries a grammar note",
     linked.filter((t) => !unitsWithNotes.has(t.unit)).map((t) => t.id).join(","));

  ok(isTag("CASE") && !isTag("case") && !isTag("SPELLING") && !isTag(null),
     "isTag is exact and rejects anything outside the list");
  ok(tagInfo("ASPECT").unit === "core8" && tagInfo("NOPE") === null,
     "tagInfo returns the entry, or null");
}

/* ------------------------------------------------------------- artwork */

group("shared artwork");
ok(Object.keys(ICONS).length >= 18, "an icon per subject", String(Object.keys(ICONS).length));
ok(iconFor("core3") === ICONS.core, "core stages fall back to the core mark");
ok(iconFor("nonsense") === ICONS.speech, "an unknown id still yields a path");
/* The drills used to borrow the subjects' icons — `city` for Cases, `art` for
   Stress, `family` for Agreement — so Practice carried pictures about nothing,
   and Stress shared its drawing with Shadowing. An icon that says the wrong
   thing is worse than no icon (§25): each drill draws its own, and no two the
   same. */
{
  const marks = DRILL_TYPES.map((d) => iconFor(d.icon));
  ok(DRILL_TYPES.every((d) => ACTIVITY_ICONS[d.icon]),
     "every drill's icon is one of the activity marks");
  ok(new Set(marks).size === DRILL_TYPES.length,
     "and no two drills are drawn the same", String(new Set(marks).size));
  ok(new Set(Object.values(ACTIVITY_ICONS)).size === Object.keys(ACTIVITY_ICONS).length,
     "no activity mark is a copy of another");
}
ok(AV_IDS.length === 10, "ten avatars", String(AV_IDS.length));
ok(AV_IDS.every((id) => AV[id].svg && AV[id].bg && AV[id].name),
   "each avatar has art, a background and a name");
ok(new Set(AV_IDS.map((id) => AV[id].svg)).size === AV_IDS.length,
   "and no two share the same drawing");

/* ---------------------------------------------------------- questions */

const L = DATA.lemmas, IX = DATA.index, UN = DATA.units, PATH = DATA.path;
const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) out.push({ core: UN[p.u], branches: [] });
    else out[out.length - 1].branches.push(UN[p.u]);
  });
  return out;
})();
// Mirrors native/src/data.js: lessons ramp by chapter through core's lessonSize.
const stageIndexOf = (u) => STAGES.findIndex((s) => s.core === u || s.branches.includes(u));
const sizeOf = (u) => lessonSize(stageIndexOf(u));
const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u)));
const lessonWords = (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u));
const SPEECH = DATA.speech;
const SCRIPTS = DATA.scripts || {};
const Q = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH, SCRIPTS,
                          hasVoice: () => true });
const answerable = (q) =>
  q.options || q.typed || q.pairs || q.kind === "hear" || q.kind === "say"
  || (q.kind === "scene" && q.questions && q.questions.every((x) => x.options));
const SPEECH_KINDS = ["hear", "say", "scene"];

group("lesson ramp");
{
  ok(lessonSize(0) === LESSON_RAMP[0] && lessonSize(1) === LESSON_RAMP[1]
     && lessonSize(2) === LESSON_SIZE && lessonSize(7) === LESSON_SIZE && lessonSize(-1) === LESSON_SIZE,
     "five, six, then seven words a lesson, and seven for anything unplaced");
  ok(LESSON_RAMP.every((n, k) => k === 0 || n >= LESSON_RAMP[k - 1]) && LESSON_RAMP[LESSON_RAMP.length - 1] <= LESSON_SIZE,
     "the ramp only ever rises");
  const c1 = STAGES[0].core, c3 = STAGES[2].core;
  ok(lessonWords(c1, 0).length === 5 && lessonCount(c1) === Math.ceil(c1.w.length / 5),
     `chapter 1 lessons carry five words (${lessonCount(c1)} lessons)`);
  ok(lessonWords(c3, 0).length === 7, "chapter 3 lessons carry seven");
  ok(lessonWords(STAGES[0].branches[0], 0).length === 5, "a chapter's side quests ramp with it");
  // The web bundle repeats the numbers (core/questions.js is not inlined there),
  // and a profile moved between the apps keys on lesson indices: the two must agree.
  const web = readFileSync(join(ROOT, "tools/app/app.js"), "utf8").match(/const LESSON_RAMP = (\[[^\]]*\])/);
  ok(web && JSON.stringify(JSON.parse(web[1])) === JSON.stringify(LESSON_RAMP),
     "the web app's LESSON_RAMP matches core's", web && web[1]);
}

group("lesson generation");
{
  const unit = UN.find((u) => u.id === "food");
  const steps = Q.vocabSteps(unit, 0);
  ok(steps[0].t === "grammar", "the first lesson opens on the unit's grammar note");
  // The whole list before the cards (the owner, 2026-09-10).
  const listAt = steps.findIndex((s) => s.t === "list");
  ok(listAt >= 0 && listAt < steps.findIndex((s) => s.t === "word"),
     "the lesson's words are listed together before the first card");
  ok(steps[listAt].words.join() === lessonWords(unit, 0).join(),
     "and the list is exactly this lesson's words");
  for (const u of UN) {
    for (let li = 0; li < lessonCount(u); li++) {
      const s = Q.vocabSteps(u, li);
      if (s.filter((x) => x.t === "list").length !== 1) {
        ok(false, `${u.id}/${li}: exactly one list step`); break;
      }
    }
  }
  ok(true, "every lesson on the route opens on its word list");
  ok(steps.filter((s) => s.t === "word").length === lessonWords(unit, 0).length,
     "every new word is presented");
  ok(steps.some((s) => s.options), "questions are interleaved between the words");
  const wordAt = steps.findIndex((s) => s.t === "word");
  const qAt = steps.findIndex((s) => s.options);
  ok(wordAt < qAt, "a word is always taught before it is asked");

  const quiz = Q.quizSteps(unit, 0);
  const speechN = quiz.filter((q) => SPEECH_KINDS.includes(q.kind)).length;
  const formN = quiz.filter((q) => q.kind === "form").length;
  ok(quiz.length === 8 + speechN + formN, "a lesson quiz is 8 questions plus its speech and form steps",
     String(quiz.length));
  ok(quiz.every(answerable), "every quiz question is answerable");
  ok(quiz.every((q) => !q.options || q.options.filter((o) => o.right).length === 1),
     "each has exactly one right answer");

  // Over many quizzes: never the same word twice in a row, and a short last lesson
  // is topped up from the unit's earlier words rather than left short.
  let adjacent = 0, quizzes = 0;
  for (const u of UN) {
    for (let li = 0; li < lessonCount(u); li++) {
      const qs = Q.quizSteps(u, li);
      quizzes++;
      for (let k = 1; k < qs.length; k++) {
        if (typeof qs[k].i === "number" && qs[k].i === qs[k - 1].i) adjacent++;
      }
    }
  }
  ok(adjacent === 0, `no quiz asks the same word twice in a row (${quizzes} quizzes)`, String(adjacent));

  // Gap-fills: the hole is a whole word, and the sentence is one the learner can
  // read — every word resolvable, the shortest such example.
  let insideWord = 0, unresolved = 0, clozes = 0;
  const letter = /[а-яёА-ЯЁ]/;
  for (let i = 0; i < L.length; i++) {
    const c = Q.clozeFor(i);
    if (!c) continue;
    clozes++;
    const q = Q.present({ t: "cloze", i, ex: c.ex, token: c.token, pool: [] });
    const at = q.prompt.indexOf("_____");
    if (letter.test(q.prompt[at - 1] || " ") || letter.test(q.prompt[at + 5] || " ")) insideWord++;
    const toks = c.ex.ru.match(TOKEN) || [];
    if (toks.some((t) => !IX[fold(t)]) && L[i].x.some((ex) => {
      const tt = ex.ru.match(TOKEN) || [];
      return tt.length >= 3 && tt.every((t) => IX[fold(t)]) && tt.some((t) => (IX[fold(t)] || []).includes(i));
    })) unresolved++;
  }
  ok(insideWord === 0, `the gap never opens inside another word (${clozes} clozes)`, String(insideWord));
  ok(unresolved === 0, "a fully readable example is chosen whenever the word has one", String(unresolved));
  ok(Q.present({ t: "cloze", i: 0, ex: { ru: "Это явление в фокусе.", en: "" }, token: "в", pool: [] }).prompt
     === "Это явление _____ фокусе.", "«в» leaves «явление» whole");
  const small = UN.find((u) => u.w.length % 7 && u.w.length > 7);
  const lastQuiz = Q.quizSteps(small, lessonCount(small) - 1);
  ok(lastQuiz.filter((q) => q.kind !== "hear" && q.kind !== "say").length >= 8,
     `${small.id}: a short last lesson still gets a full quiz`, String(lastQuiz.length));
  const own = new Set(lessonWords(small, lessonCount(small) - 1));
  ok(lastQuiz.some((q) => typeof q.i === "number" && !own.has(q.i)),
     "topped up with the unit's earlier words");
}

/* The listening step rides on the quiz from SPEECH_MIX.hear on — the first
   chapter's third lesson (P9.22), once a few words have been met. */
group("hearing");
{
  const first = STAGES[0].core;
  const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.hear.fromStage
                                   && (SPEECH.listen[s.core.id] || []).length).core;
  const lesson = Q.stageOf(later) === SPEECH_MIX.hear.fromStage ? (SPEECH_MIX.hear.fromLesson || 0) : 0;
  ok(!Q.quizSteps(first, 0).some((q) => q.kind === "hear"),
     "the first lesson's quiz is reading-only");
  ok(SPEECH_MIX.hear.fromStage === 0 && SPEECH_MIX.hear.fromLesson === 2,
     "listening joins in chapter 1 from the third lesson");
  const quiz = Q.quizSteps(later, lesson);
  const hears = quiz.filter((q) => q.kind === "hear");
  ok(hears.length === SPEECH_MIX.hear.perQuiz, `${later.id}: one hear step per quiz`,
     String(hears.length));
  ok(quiz[0].kind !== "hear", "and never first — the quiz opens on a word");
  const h = hears[0];
  ok(h.autoplay === h.target && h.en && h.unit === later.id,
     "it plays the target, carries the meaning and the unit");
  ok(!h.sub && !h.say, "but shows no meaning and offers no speaker before the answer");
  const unlocked = Q.unitsUpTo(later).flatMap((u) => SPEECH.listen[u.id] || []);
  ok(unlocked.some((i) => SPEECH.rows[i][0] === h.target),
     "the sentence comes from a listening pool unlocked by this unit");
  const beyond = UN.filter((u) => !Q.unitsUpTo(later).includes(u))
    .flatMap((u) => SPEECH.listen[u.id] || []);
  ok(!beyond.some((i) => SPEECH.rows[i][0] === h.target) || unlocked.some((i) => SPEECH.rows[i][0] === h.target),
     "and never from a unit further along the route");

  // The route up to a unit: earlier chapters whole, this chapter up to the unit.
  const s1 = STAGES[1];
  const upToBranch = Q.unitsUpTo(s1.branches[0]);
  ok(upToBranch[0] === STAGES[0].core && upToBranch.includes(s1.core)
     && upToBranch[upToBranch.length - 1] === s1.branches[0]
     && !upToBranch.includes(s1.branches[1] || null),
     "unitsUpTo stops at the unit itself", upToBranch.map((u) => u.id).join(","));

  // The first chapter's spine has sayable sentences of its own.
  const firstPool = (SPEECH.speak[first.id] || []).map((i) => SPEECH.rows[i]);
  ok(firstPool.length > 0 && firstPool.every((r) => r[2] <= 12),
     `${first.id}: has sayable sentences of its own`, String(firstPool.length));
  ok(!!DATA.audio.files[fold(h.target)], "and has a recording — the pool guarantees one");
  ok(h.lemmas.length > 0 && h.lemmas.every((i) => L[i]),
     "the lemmas it grades are real curriculum entries");

  // The prompt leans toward the lesson's own words when the pool has any.
  const want = new Set(lessonWords(later, lesson));
  let leaning = 0;
  for (let k = 0; k < 20; k++) {
    const row = Q.speechPrompt("hear", later, lesson).row;
    if (sentenceLemmas(row[0], IX).some((i) => want.has(i))) leaning++;
  }
  const possible = SPEECH.listen[later.id]
    .some((i) => sentenceLemmas(SPEECH.rows[i][0], IX).some((x) => want.has(x)));
  ok(!possible || leaning === 20,
     "every pick contains a lesson word when any pool sentence does", `${leaning}/20`);

  // No pools at all — the web app today — means no speech steps, not blank ones.
  const dry = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice: () => true });
  ok(dry.quizSteps(later, 0).every((q) => !SPEECH_KINDS.includes(q.kind)),
     "without pools a quiz is the eight vocabulary questions");
}

/* The form question (P9.20): the chapter's grammar is asked, not only shown —
   the form the card teaches, from the word's own paradigm, one per quiz. */
group("form questions");
{
  const paradigmHas = (w, label) => (w.t || []).some((t) => t.rows.some((r) =>
    r.slice(1).some((c) => (Array.isArray(c) ? c : [c]).some((f) => f && fold(f) === fold(label)))));
  const isForm = (spec) => (q) => (spec.drill ? q.kind === spec.drill : q.kind === "form");
  ok(!Q.formSpec(STAGES[0].core), "chapter 1's card teaches nothing a table can ask");
  ok(!Q.quizSteps(STAGES[0].core, 1).some((q) => q.kind === "form"), "so chapter 1 has no form question");
  ok(STAGES.slice(1).every((s) => Q.formSpec(s.core)), "every later chapter's card says what form it teaches",
     STAGES.slice(1).filter((s) => !Q.formSpec(s.core)).map((s) => s.core.id).join(","));
  let firstNotFirst = true, answersInParadigm = true, namesTheForm = true, neverHeadword = true;
  STAGES.slice(1).forEach((s, k) => {
    const spec = Q.formSpec(s.core);
    const quiz = Q.quizSteps(s.core, 0);
    const forms = quiz.filter(isForm(spec));
    ok(forms.length === FORM_MIX.perQuiz, `${s.core.id}: one form question per quiz (${spec.drill || spec.table})`,
       String(forms.length));
    if (quiz[0] && isForm(spec)(quiz[0])) firstNotFirst = false;
    if (spec.drill) return;
    const q = forms[0];
    const typed = k + 1 >= FORM_MIX.typedFromStage;
    ok(!!q && (typed ? q.typed && q.target && q.answer : q.options && q.options.length === 4),
       `${s.core.id}: ${typed ? "typed" : "chosen"}, as the chapter index says`);
    if (!q) return;
    const right = typed ? q.answer : q.options.find((o) => o.right).label;
    if (!paradigmHas(L[q.i], right)) answersInParadigm = false;
    if (!q.table || q.table.title !== spec.table || !/^(Choose|Write) the /.test(q.ask)) namesTheForm = false;
    if (fold(right) === fold(L[q.i].w)) neverHeadword = false;
  });
  ok(firstNotFirst, "never first — the quiz opens on a word");
  ok(answersInParadigm, "the right answer is a form of the word asked about");
  ok(namesTheForm, "the question names the form and can show the table");
  ok(neverHeadword, "the form asked for is never the headword on screen");

  // …and no option repeats the prompt, which would be a free elimination.
  let promptAsOption = 0, drawn = 0;
  for (const s of STAGES.slice(1)) {
    const spec = Q.formSpec(s.core);
    if (!spec || spec.drill) continue;
    for (let k = 0; k < 40; k++) {
      const q = Q.formPrompt(s.core, 0);
      if (!q || !q.options) continue;
      drawn++;
      if (q.options.some((o) => fold(o.label) === fold(q.prompt))) promptAsOption++;
    }
  }
  ok(drawn > 0 && promptAsOption === 0,
     `no option repeats the word on screen (${drawn} chosen form questions)`, String(promptAsOption));

  // The chapter's card names the form; the words are the lesson's when any has it.
  const plural = STAGES.find((s) => (Q.formSpec(s.core) || {}).rows && Q.formSpec(s.core).rows[0] === "Nominative");
  ok(!!plural, "a chapter teaches the plural");
  if (plural) {
    const q = Q.quizSteps(plural.core, 0).find((x) => x.kind === "form");
    ok(q && /nominative plural/.test(q.ask), "core4 asks for the nominative plural", q && q.ask);
    /* The lesson's words are preferred, not required. Requiring them was the
       bug (P11.8): the tiers were a fallback chain, so a chapter whose card
       names a cell few of its words carry asked about the same one or two words
       for ever — chapter 6 could produce seven distinct questions across five
       lessons and every retake. What must hold now is that the lesson's own
       words are still the likeliest subject, and that the pool is wider than
       they are. */
    const own = new Set(lessonWords(plural.core, 0));
    const able = [...own].filter((i) => Q.formPrompt(plural.core, 0, i));
    const drawnAt = [];
    for (let k = 0; k < 200; k++) {
      const d = Q.formPrompt(plural.core, 0);
      if (d && typeof d.i === "number") drawnAt.push(d.i);
    }
    const mine = drawnAt.filter((i) => own.has(i)).length;
    ok(!able.length || mine > drawnAt.length * 0.3,
       "the lesson's own words are the likeliest subject of its form question",
       `${mine} of ${drawnAt.length}`);
    ok(new Set(drawnAt).size > able.length,
       "and the question is not confined to them",
       `${new Set(drawnAt).size} distinct words, ${able.length} in the lesson`);
    const branch = plural.branches[0];
    ok(Q.formSpec(branch) === Q.formSpec(plural.core) || branch.g.form, "a branch inherits its chapter's form or names its own");
  }
  const past = STAGES.find((s) => (Q.formSpec(s.core) || {}).table === "Past");
  if (past) {
    const q = Q.quizSteps(past.core, 0).find((x) => x.kind === "form");
    ok(q && /^Write the past for “(он|она|оно|они)”$/.test(q.ask), "the past is asked by subject, typed", q && q.ask);
  }
  const imperative = STAGES.find((s) => (Q.formSpec(s.core) || {}).table === "Imperative");
  if (imperative) {
    const q = Q.quizSteps(imperative.core, 0).find((x) => x.kind === "form");
    ok(q && /^Write the imperative for “(ты|вы)”$/.test(q.ask), "the imperative by ты or вы", q && q.ask);
  }
  const future = STAGES.find((s) => (Q.formSpec(s.core) || {}).aspect === "perfective");
  if (future) {
    const q = Q.quizSteps(future.core, 0).find((x) => x.kind === "form");
    ok(q && L[q.i].a === "perfective" && /the future for/.test(q.ask), "the future is a perfective verb's present table", q && q.ask);
  }

  // The Cases drill asks only for what the route has taught.
  const reached = (n) => STAGES.slice(0, n).flatMap((s) => [s.core].concat(s.branches));
  ok(Q.formsIntroduced(reached(3)).length === 0, "after three chapters no case has been introduced");
  const c4 = Q.formsIntroduced(reached(4));
  ok(c4.length === 1 && c4[0].row === "Nominative" && c4[0].col === "Plural", "chapter 4 introduces the nominative plural", JSON.stringify(c4));
  const c6 = Q.formsIntroduced(reached(6));
  ok(c6.some((c) => c.row === "Genitive") && !c6.some((c) => c.row === "Instrumental"),
     "chapter 6's branch adds the genitive; the instrumental waits", JSON.stringify(c6));
  ok(Q.drillQuestions("cases", 6, null, []).length === 0, "with nothing introduced the cases drill has no question");
  const gated = Q.drillQuestions("cases", 8, null, [{ row: "Prepositional", col: "Singular" }]);
  ok(gated.length === 8 && gated.every((q) => q.ask === "Choose prepositional singular"),
     "gated, it asks for that cell alone", gated.map((q) => q.ask).join("|"));

  // The learner's own quiz may ask for forms; a unit whose chapter teaches none
  // falls back to the meaning rather than asking nothing.
  ok(QUIZ_KINDS.some((k) => k.id === "form"), "Forms is a kind the custom quiz offers");
  const prep = STAGES.find((s) => (Q.formSpec(s.core) || {}).rows && Q.formSpec(s.core).rows[0] === "Prepositional");
  const custom = Q.customQuiz({ units: [prep.core], kinds: ["form"], n: 10 });
  ok(custom.length === 10 && custom.filter((q) => q.kind === "form").length >= 5,
     "a Forms-only quiz is mostly form questions", custom.map((q) => q.kind).join(","));
  const none = Q.customQuiz({ units: [STAGES[0].core], kinds: ["form"], n: 5 });
  ok(none.length === 5 && none.every((q) => q.kind === "choose-en"), "and meanings where the chapter teaches no form");
}

/* Listening scenes: a few sentences, questions readable before the audio, and a
   quiz of the learner's own choosing (the owner, 2026-09-07). */
group("scenes and custom quizzes");
{
  const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.scene.fromStage
                                   && (SPEECH.listen[s.core.id] || []).length >= 5).core;
  const quiz = Q.quizSteps(later, 0);
  const scenes = quiz.filter((q) => q.kind === "scene");
  ok(scenes.length === SPEECH_MIX.scene.perQuiz, `${later.id}: one scene per quiz`, String(scenes.length));
  ok(!Q.quizSteps(STAGES[0].core, 0).some((q) => q.kind === "scene"), "none in the first chapter");
  const s = scenes[0];
  /* Two shapes share the kind. The **scenario** (§30k) is the one a lesson
     with a script gets: a written conversation between named people and five
     questions about the situation, read by the device voices. The **corpus
     scene** is the fallback where no script exists — a few pooled sentences,
     each with a recording, each with a meaning question. A scene must be one
     or the other, never a corpus scene claiming to be written or a written one
     claiming a recording it lacks. */
  if (s.scenario) {
    ok(s.lines.length >= 8 && s.lines.length <= 16, "a scenario is a conversation of 8-16 turns", String(s.lines.length));
    ok(s.cast.length >= 2 && s.lines.every((l) => s.cast.some((c) => c.id === l.s)),
       "with a cast, and every line belongs to one of them", s.cast.map((c) => c.ru).join(", "));
    ok(s.questions.length === 5, "and five questions about what happened", String(s.questions.length));
    ok(s.topic && s.level, "and says what it is about and where it is from", `${s.topic} / ${s.level}`);
  } else {
    ok(s.lines.length >= 2 && s.lines.length <= 3, "two or three sentences", String(s.lines.length));
    ok(s.lines.every((r) => DATA.audio.files[fold(r.ru)]), "every sentence has a recording");
  }
  ok(s.questions.every((q) => q.options.length === 4 && q.options.filter((o) => o.right).length === 1),
     "four options, one right, on every question");
  ok(s.questions.every((q) => new Set(q.options.map((o) => o.label)).size === 4),
     "and no question offers the same answer twice");
  if (!s.scenario) {
    ok(s.questions.length >= s.lines.length, "a question per sentence at least");
    s.lines.forEach((r, k) => {
      const q = s.questions[k];
      ok(q.row === k && q.options.find((o) => o.right).label === r.en,
         `question ${k + 1} asks the meaning of sentence ${k + 1}`);
    });
    const heardQ = s.questions.find((q) => typeof q.i === "number");
    if (heardQ) {
      ok(s.lemmas.includes(heardQ.i) && !heardQ.options.some((o) => !o.right && s.lemmas.includes(o.i)),
         "the heard word was said and the wrong ones were not");
    }
  }
  ok(!s.autoplay, "nothing plays before the learner presses Play");
  ok(!answerable({ kind: "scene", questions: [{}] }), "a scene without options is not answerable");

  const drill = Q.listeningDrill(Q.unitsUpTo(later), 4);
  ok(drill.length === 4 && new Set(drill.map((d) => d.lines[0].ru)).size === 4,
     "a listening drill of four distinct scenes", String(drill.length));

  const units = Q.unitsUpTo(later);
  const own = Q.customQuiz({ units, kinds: ["choose-en", "type"], n: 10 });
  ok(own.length === 10 && own.every((q) => q.kind === "choose-en" || q.kind === "type"),
     "a custom quiz asks only the chosen kinds", own.map((q) => q.kind).join(","));
  const wordSet = new Set(units.flatMap((u) => u.w));
  ok(own.every((q) => wordSet.has(q.i)), "and only about the chosen sections' words");
  const mixed = Q.customQuiz({ units, kinds: ["choose-ru", "hear", "scene"], n: 12 });
  ok(mixed.some((q) => q.kind === "hear") && mixed.some((q) => q.kind === "scene"),
     "sentence kinds join when chosen", mixed.map((q) => q.kind).join(","));
  ok(mixed.filter((q) => q.kind === "hear" || q.kind === "scene").length <= 5,
     "and take about a third of the quiz");
  ok(Q.customQuiz({ units, kinds: [], n: 10 }).length === 0
     && Q.customQuiz({ units: [], kinds: ["type"], n: 10 }).length === 0,
     "nothing chosen, nothing asked");
  ok(Q.customQuiz({ units, kinds: ["scene"], n: 3 }).every((q) => q.kind === "scene"),
     "scenes alone make a listening-only quiz");
}

/* The written lesson passages (§30l). tools/check_scripts.mjs is what proves the
   Russian stays inside the lesson's vocabulary; this proves the app turns one
   into a scene a learner can actually answer, and that it is preferred over the
   corpus scene wherever a lesson has one. */
/* The three question-quality bugs the second review measured (ROADMAP P11.4 and
   P11.7). Each is asserted as a rate over a population, not on one example: they
   were all found by measuring and none of them shows on a single question. */
group("question quality");
{
  // P11.7a — the answer must not be the only option of its own word class, or
  // the ending gives it away without knowing the word. Was 23.7 % of option sets.
  let sets = 0, lone = 0, second = 0, short = 0;
  const senseKey = (s) => fold(String(s || "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim());
  const allSenses = (w) => new Set(String(w.e || "").split(/[;,]/).map(senseKey).filter(Boolean));
  for (const u of UN) {
    const pool = u.w.length >= 8 ? u.w : UN.flatMap((x) => x.w).slice(0, 400);
    for (const i of u.w.slice(0, 12)) {
      for (const kind of ["choose-en", "choose-ru"]) {
        const q = Q.present({ t: kind, i, pool });
        if (!q || !q.options) continue;
        sets++;
        if (q.options.length < 4) short++;
        const wrong = q.options.filter((o) => !o.right).map((o) => (kind === "choose-en"
          ? L.find((x) => firstSense(x) === o.label)
          : L.find((x) => x.w === o.label))).filter(Boolean);
        if (wrong.length && wrong.every((x) => x.p !== L[i].p)) lone++;
        if (wrong.some((x) => allSenses(L[i]).has(senseKey(firstSense(x)))
                           || allSenses(x).has(senseKey(firstSense(L[i]))))) second++;
      }
    }
  }
  ok(sets > 500, `${sets} option sets measured`);
  ok(lone / sets < 0.08, "the answer is rarely the only option of its own class",
     `${(lone / sets * 100).toFixed(1)}%`);
  ok(second / sets < 0.005, "and almost never has a second right answer among the wrong ones",
     `${(second / sets * 100).toFixed(1)}%`);
  ok(short === 0, "no option set lost a fourth option to the stricter rules", String(short));

  // P11.7c — a typed answer accepts any Russian word with the meaning shown, not
  // only one from the same unit. «тут» for "here" was marked wrong because the
  // unit happened to teach «здесь».
  const here = L.findIndex((w) => w.b === "здесь");
  if (here >= 0) {
    const typed = Q.present({ t: "type", i: here, pool: [here] });
    ok(typed.alts.length > 0, "a typed answer accepts synonyms from outside its own unit",
       typed.alts.join(", "));
  }

  // P11.4 — a retake asked a quarter of the quiz as the same shape about the
  // same word, half of it word for word.
  let same = 0, total = 0;
  for (const s of STAGES) {
    for (const u of [s.core].concat(s.branches)) {
      for (let li = 0; li < lessonCount(u); li++) {
        const a = Q.quizSteps(u, li);
        const b = Q.quizSteps(u, li, null, null, Q.stepKeys(a));
        const before = new Set(Q.stepKeys(a));
        for (const k of Q.stepKeys(b)) { total++; if (before.has(k)) same++; }
      }
    }
  }
  ok(total > 1000 && same / total < 0.08,
     "a retake rarely repeats the same shape about the same word",
     `${(same / total * 100).toFixed(1)}% of ${total}`);

  // P11.4 — and the gap-fill was unreachable in the guaranteed production slots,
  // because `find(type) || find(cloze)` can never reach its second branch.
  const shapes = new Set();
  for (const s of STAGES.slice(0, 4)) {
    for (let d = 0; d < 40; d++) {
      Q.quizSteps(s.core, 0).forEach((q) => shapes.add(q.kind));
    }
  }
  ok(shapes.has("cloze") && shapes.has("type"),
     "both production shapes are reachable in a lesson quiz",
     [...shapes].join(", "));
}

/* The minimal pairs the pronunciation drill is built from (P10.8). The point of
   this group is that neither word of a pair can be invented: they were written
   by an author who is not a native speaker, and a pair whose second member is
   not a real word teaches a wrong word beside a right one. */
group("minimal pairs");
{
  const pairs = soundPairs();
  ok(pairs.length >= 12, `${pairs.length} pairs`, String(pairs.length));
  const deepWords = new Set(parseDeep(DATA.deep || "").map((x) => fold(x.b)));
  const known = (w) => deepWords.has(fold(pairLemma(w))) || !!IX[fold(pairLemma(w))];

  const missing = pairs.flatMap((p) => [p.a, p.b]).filter((w) => !known(w));
  ok(!missing.length, "every word of every pair is in the dictionary", missing.join(", "));

  const notMinimal = pairs.filter((p) => pairDiff(p.a, p.b) < 0)
    .map((p) => `${p.a}/${p.b}`);
  ok(!notMinimal.length, "and each pair differs in exactly one place", notMinimal.join(", "));

  ok(pairs.every((p) => p.gloss && p.gloss.length === 2 && p.gloss.every(Boolean)),
     "each side is glossed, so a learner can tell which word they heard");
  ok(pairs.every((p) => p.about && p.about.length > 20),
     "and each pair says what the contrast is");
  const dup = pairs.map((p) => `${p.a}/${p.b}`).filter((k, i, a) => a.indexOf(k) !== i);
  ok(!dup.length, "no pair is listed twice", dup.join(", "));
  // A pair whose two words fold to the same key cannot be told apart by the
  // recogniser or by the audio table, so it is not a usable contrast here.
  const folded = pairs.filter((p) => fold(p.a) === fold(p.b)).map((p) => `${p.a}/${p.b}`);
  ok(!folded.length, "and no pair collapses under fold()", folded.join(", "));
}

/* Yuri (§30m). The art is judged by eye; what a suite can hold is that every
   pose actually draws, that he recolours with the theme, and that his one line
   of copy stays one line. */
group("the guide");
{
  ok(POSES.length === 5 && new Set(POSES).size === 5, "five distinct poses", POSES.join(", "));
  const bad = POSES.filter((p) => {
    const svg = guideSvg(p, "#4D45E6");
    return !svg || svg.length < 400 || !/<circle cx="48" cy="32"/.test(svg);
  });
  ok(!bad.length, "every pose draws a whole figure", bad.join(", "));
  ok(new Set(POSES.map((p) => guideSvg(p))).size === POSES.length,
     "and no two poses are the same drawing");
  ok(guideSvg("idle", "#AABBCC").includes("#AABBCC")
     && !guideSvg("idle", "#AABBCC").includes("#4D45E6"),
     "the scarf takes the accent it is given");
  ok(guideSvg("nonsense") === guideSvg("idle"), "an unknown pose falls back to idle");

  // The cap is the point: mascot copy grows a word at a time until it is a
  // paragraph, and this app's rule is labels, not prose (rule 20.7).
  const long = Object.entries(LINES).flatMap(([k, ls]) =>
    ls.filter((l) => l.split(/\s+/).length > MAX_WORDS).map((l) => `${k}: ${l}`));
  ok(!long.length, `no line runs past ${MAX_WORDS} words`, long.join(" | "));
  ok(Object.values(LINES).every((ls) => ls.length >= 2),
     "every situation has more than one line, so a repeat run is not word-for-word");
  ok(guideLine("passed", 3) === guideLine("passed", 3), "a line is stable for a given seed");
  ok(guideLine("nope", 0) === null, "an unknown situation says nothing");
  ok(Object.keys(LINES).every((k) => POSES.includes(poseFor(k))),
     "every situation maps to a pose that exists");
  ok(poseFor("failed") !== poseFor("passed"), "and failing does not get the cheer");
}

group("written listening scenarios");
{
  const keys = Object.keys(SCRIPTS);
  ok(keys.length > 0, "the payload ships them", String(keys.length));
  ok(keys.every((k) => /^[a-z0-9_]+:\d+$/.test(k)), "each keyed unit and lesson index");

  // Every script names a lesson that exists, and every one of them builds.
  const byId = new Map(UN.map((u) => [u.id, u]));
  const orphan = keys.filter((k) => {
    const [id, i] = k.split(":");
    const u = byId.get(id);
    return !u || Number(i) >= lessonCount(u);
  });
  ok(!orphan.length, "none names a lesson off the path", orphan.slice(0, 4).join(", "));

  let built = 0, bad = [];
  for (const k of keys) {
    const [id, i] = k.split(":");
    const scene = Q.scriptScene(byId.get(id), Number(i));
    if (!scene) { bad.push(k); continue; }
    built++;
    if (scene.lines.length !== SCRIPTS[k].lines.length) bad.push(`${k}: lost a line`);
    if (!scene.written || !scene.scenario) bad.push(`${k}: not marked as a written scenario`);
    if (scene.questions.length !== 5) bad.push(`${k}: ${scene.questions.length} questions`);
    if (!scene.cast.length) bad.push(`${k}: no cast`);
    if (scene.lines.some((l) => !scene.cast.some((c) => c.id === l.s))) bad.push(`${k}: a line with no speaker`);
    for (const q of scene.questions) {
      if (q.options.length !== 4) bad.push(`${k}: ${q.options.length} options`);
      if (q.options.filter((o) => o.right).length !== 1) bad.push(`${k}: not one right answer`);
      if (new Set(q.options.map((o) => o.label)).size !== 4) bad.push(`${k}: a repeated option`);
    }
  }
  ok(built === keys.length, "every one of them builds into a scenario", `${built} of ${keys.length}`);
  ok(!bad.length, "and each is answerable: four distinct options, one right", bad.slice(0, 4).join(" | "));

  /* The options are shuffled on the way out, and that is load-bearing.
   *
   * All 840 authored questions put the answer at index 0 — it is the file's
   * convention, and `scenarioFor` shuffling is the only reason it is not also
   * the app's behaviour. Nothing asserted it, so "tap the first option" would
   * have scored 100 % on every listening exercise in the product and every
   * suite would still have been green. Checked over the whole corpus rather
   * than one lesson: a shuffle of four can leave the answer in place, and with
   * 840 of them the right answer lands first about a quarter of the time by
   * chance and essentially never much more. */
  {
    const authored = keys.every((k) =>
      SCRIPTS[k].questions.every((q) => (q.answer || 0) === 0));
    ok(authored, "every authored answer is written first, as the files' convention");
    let firstOfFour = 0, total = 0;
    for (const k of keys) {
      const [id, i] = k.split(":");
      for (const q of Q.scriptScene(byId.get(id), Number(i)).questions) {
        total++;
        if (q.options[0].right) firstOfFour++;
      }
    }
    const share = firstOfFour / total;
    ok(share < 0.45, "and the app shuffles them, so the answer is not always first",
       `${(share * 100).toFixed(0)}% first of ${total}`);
  }

  // A scripted lesson's quiz gets the written passage, not a corpus scene.
  const scripted = keys.map((k) => k.split(":")).find(([id, i]) => {
    const u = byId.get(id);
    return u && Q.stageOf(u) >= SPEECH_MIX.scene.fromStage;
  });
  if (scripted) {
    const u = byId.get(scripted[0]);
    const step = Q.speechPrompt("scene", u, Number(scripted[1]));
    ok(step && step.scene.written,
       `${scripted.join(":")}: the lesson's own passage is what the quiz asks`);
  }

  // Practice's Listening draws on the lessons actually finished, and never on
  // one that has not been reached.
  const units = Q.unitsUpTo(STAGES[2].core);
  const p = Q.writtenPassage(units, () => 2);
  ok(p && p.written && p.lines.length >= 4, "Practice draws a written scenario too");
  const first = Q.writtenPassage([STAGES[0].core], (u) => 1);
  ok(first && first.unit === STAGES[0].core.id && first.lines.length >= 4,
     "one lesson in, the first lesson's scenario is available");
  ok(Q.writtenPassage(units, () => 0) === null, "no lessons finished, no passage");
}

/* The speaking step joins a chapter later than hearing, and is prompted in English. */
group("speaking");
{
  ok(SPEECH_MIX.say.fromStage > SPEECH_MIX.hear.fromStage,
     "recognition before production: say starts after hear");
  const early = STAGES[SPEECH_MIX.say.fromStage - 1].core;
  ok(!Q.quizSteps(early, 0).some((q) => q.kind === "say"),
     `${early.id}: no speaking step yet`);
  const unit = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.say.fromStage
                                  && (SPEECH.speak[s.core.id] || []).length).core;
  const says = Q.quizSteps(unit, 0).filter((q) => q.kind === "say");
  ok(says.length === SPEECH_MIX.say.perQuiz, `${unit.id}: one say step per quiz`,
     String(says.length));
  const s = says[0];
  ok(s.prompt === s.en && !s.cyr, "the prompt is the English");
  ok(!s.autoplay && !s.say, "nothing is played before the attempt — that would be copying");
  ok(SPEECH.speak[unit.id].some((i) => SPEECH.rows[i][0] === s.target),
     "the sentence comes from the unit's speaking pool");
  ok(!!DATA.audio.files[fold(s.target)], "and has a recording to hear afterwards");
  ok(s.lemmas.length > 0, "and lemmas to grade");
}

/* Conversation sessions are budgeted in the learner's own state. */
group("talk allowance");
{
  let sp = speechDefault();
  ok(talkAllowance(sp, 100).left === TALK_SESSIONS_PER_DAY && talkAllowance(sp, 100).turns === TALK_TURNS,
     "a fresh day has every session and twelve turns each");
  sp = startTalkSession(sp, 100);
  sp = startTalkSession(sp, 100);
  ok(talkAllowance(sp, 100).used === 2 && talkAllowance(sp, 100).left === TALK_SESSIONS_PER_DAY - 2,
     "each session started is one fewer left");
  // No cap since 2026-09-07: a fourth session is spent and counted like the rest.
  sp = startTalkSession(sp, 100);
  const fourth = startTalkSession(sp, 100);
  ok(fourth !== sp && talkAllowance(fourth, 100).used === 4 && talkAllowance(fourth, 100).left === Infinity,
     "sessions are counted without a limit");
  ok(talkAllowance(sp, 101).used === 0, "a new day starts the count over");
  ok(SCENARIOS.length === 10 && SCENARIOS.every((s) => s.id && s.unit && s.prompt && s.title && s.en),
     "ten scenarios, each tied to a unit and carrying a prompt");
  ok(SCENARIOS.every((s) => UN.some((u) => u.id === s.unit)), "every scenario's unit exists");
}

/* Tags that arrive after the attempt: the feedback service is slower than the verdict. */
group("late tags");
{
  let sp = recordAttempt(speechDefault(), { ts: 10, key: "а", kind: "say", tags: [] });
  sp = recordAttempt(sp, { ts: 20, key: "б", kind: "say", tags: ["CASE"] });
  const before = sp;
  sp = tagAttempt(sp, 10, ["CASE", "ASPECT", "CASE"]);
  ok(sp !== before && before.attempts[0].tags.length === 0, "returns new objects, leaves the old alone");
  ok(sp.attempts[0].tags.join() === "CASE,ASPECT", "the matching attempt gains the tags, once each",
     sp.attempts[0].tags.join());
  ok(sp.attempts[1].tags.join() === "CASE", "the other attempt is untouched");
  ok(sp.tagCounts.CASE === 2 && sp.tagCounts.ASPECT === 1, "counts add to what recordAttempt counted",
     JSON.stringify(sp.tagCounts));
  const again = tagAttempt(sp, 10, ["CASE"]);
  ok(again.tagCounts.CASE === 2, "tagging the same attempt with the same tag again counts nothing");
  const gone = tagAttempt(sp, 999, ["TENSE"]);
  ok(gone.tagCounts.TENSE === 1 && gone.attempts.length === 2,
     "an attempt no longer held still has its tags counted");
  ok(tagAttempt(sp, 10, []) === sp && tagAttempt(sp, 10, null) === sp, "no tags: same object back");
}

/* The first lemma under a shared form key is the word a speaker means by it —
   every consumer takes IX[key][0] (word links, grading, cloze labels, search),
   and until 2026-09-08 «нет» opened «житься» and «лет» credited «лёт»
   (CLAUDE.md §23; panel.py resolve()). */
group("lookup index order");
{
  const first = (k) => L[IX[k][0]];
  for (const [k, want] of [["нет", "нет"], ["уже", "уже"], ["после", "после"], ["при", "при"],
                           ["лет", "год"], ["два", "два"], ["три", "три"], ["потом", "потом"],
                           ["надо", "надо"], ["почти", "почти"], ["были", "быть"], ["день", "день"]]) {
    ok(IX[k] && first(k).b === want, `«${k}» resolves first to «${want}»`, IX[k] && first(k).b);
  }
  ok(IX["тут"] && first("тут").p !== "noun", "«тут» is the adverb, not the mulberry", first("тут").p);
  ok(IX["есть"] && first("есть").p !== "verb", "«есть» is \"there is\" before \"eat\"", first("есть").p);
  // No inflection dressed as a headword is taught as a word of its own.
  const stub = /^\s*(\w+\s+)?(form|case|plural|singular|dative|accusative|genitive|genetive|instrumental|prepositional|nominative)\b.*\bof\b/i;
  const stubs = UN.flatMap((u) => u.w).filter((i) => stub.test(L[i].e)).map((i) => L[i].b);
  ok(stubs.length === 0, "no unit teaches a case-form stub", stubs.join(" "));
  for (const b of ["лёт", "быль", "деть", "лета", "житься", "двух"]) {
    ok(!UN.some((u) => u.w.some((i) => L[i].b === b)), `«${b}» is not on the path`);
  }
}

/* Per-word grades from an alignment: what the speech activities hand the scheduler. */
group("speech grading");
{
  const idx = (w) => IX[fold(w)][0];
  ok(idx("чай") >= SPEECH_SKIP_TOP && idx("сахар") >= SPEECH_SKIP_TOP && idx("не") < SPEECH_SKIP_TOP,
     "the fixtures: «чай» and «сахар» are content words, «не» is not");
  const r = compare("Я пью кофе без сахара", "Я пью чай без сахара");
  let g = gradeAlignment(r.alignment, IX, { perfect: false, firstTry: true });
  const by = Object.fromEntries(g.map((x) => [x.i, x.grade]));
  ok(by[idx("чай")] === 1, "a substituted word is Again");
  ok(by[idx("сахар")] === 3, "a correct word in an imperfect sentence is Good");
  ok(g.every((x) => x.grade >= 1 && x.grade <= 4 && L[x.i] && x.i >= SPEECH_SKIP_TOP),
     "grades are 1–4 on real content lemmas; «я», «пью», «без» are no evidence");

  g = gradeAlignment(compare("Я пью чай", "Я пью чай").alignment, IX,
                     { perfect: true, firstTry: true });
  ok(g.length >= 1 && g.every((x) => x.grade === 3),
     "a perfect first attempt is Good — capped, one sentence is not Easy for every word");
  g = gradeAlignment(compare("Я пью чай", "Я пью чай").alignment, IX,
                     { perfect: true, firstTry: false });
  ok(g.every((x) => x.grade === 3), "perfect on a retry is Good too");

  g = gradeAlignment(compare("Я пью чай очень", "Я пью чай").alignment, IX, {});
  ok(!g.some((x) => x.i === idx("очень")), "an inserted word grades nothing");
  g = gradeAlignment(compare("Я пью чай", "Я пью чай").alignment, IX,
                     { perfect: true, firstTry: true, hinted: true });
  ok(g.every((x) => x.grade === 2), "with a hint a right word is Hard, even when perfect");

  // A letter off on the same word — the ending, not the word — is a near miss:
  // Hard, and half credit.
  const near = compare("Я пью чая", "Я пью чай");
  ok(near.alignment.some((a) => nearMiss(a, IX)), "«чая» for «чай» is a near miss");
  ok(gradeAlignment(near.alignment, IX, {}).find((x) => x.i === idx("чай")).grade === 2,
     "and grades Hard, not Again");
  const c = alignmentCredit(near.alignment, IX);
  ok(c.near === 1 && c.ok === 2 && Math.abs(c.credit - 2.5 / 3) < 1e-9,
     "credit counts it half", JSON.stringify(c));
  ok(!compare("Я пью кофе", "Я пью чай").alignment.some((a) => nearMiss(a, IX)),
     "a different word is not a near miss");

  ok(JSON.stringify(feedbackTags({ grammar: [{ tag: "CASE" }, { tag: "ASPECT" }],
                                   words: [{ tags: ["CASE"] }, { tags: [] }, {}] }))
     === '["CASE","ASPECT"]', "a slip tagged on the word and in the note counts once");
  ok(feedbackTags(null).length === 0, "no feedback, no tags");

  ok(charDistance("книга", "книгу") === 1 && charDistance("книга", "кни́га") === 0
     && charDistance("стол", "книга") > 1, "charDistance: a letter off is 1, stress is 0");

  g = gradeAlignment(compare("Я пью чай, ты пьёшь чай", "Я пью чай, ты пьёшь чай").alignment, IX,
                     { perfect: false });
  ok(g.filter((x) => x.i === idx("чай")).length === 1 && g.find((x) => x.i === idx("чай")).grade === 3,
     "a lemma met twice is graded once");
  g = gradeAlignment(compare("Я пью чай, ты пьёшь кофе", "Я пью чай, ты пьёшь чай").alignment, IX, {});
  ok(g.find((x) => x.i === idx("чай")).grade === 1,
     "and takes its worst grade — right once and dropped once is Again");
  g = gradeAlignment(compare("Я не знаю, хочу", "Я не знаю, не хочу").alignment, IX, {});
  ok(!g.some((x) => x.i === idx("не")), "a function word dropped is not a lapse on «не»");

  ok(sentenceLemmas("Я пью чай.", IX).length === 3, "sentenceLemmas: every studied word once");
  ok(sentenceLemmas("Я не знаю, не хочу.", IX).filter((i) => i === idx("не")).length === 1,
     "a repeated word appears once");
}

group("placement");
{
  const p = Q.placementQuestions();
  ok(p.length === 50, "placement is 50 questions", String(p.length));
  ok(p.every((q) => typeof q.stage === "number"),
     "every question carries the stage it came from — nothing can unlock without it");
  ok(new Set(p.map((q) => q.stage)).size === STAGES.length,
     "all stages are sampled", String(new Set(p.map((q) => q.stage)).size));

  const s = Q.sectionQuestions(UN.find((u) => u.id === "core2"));
  ok(s.length === 30, "a section test is 30 questions", String(s.length));
  ok(s.every((q) => typeof q.lesson === "number"), "each tagged with its sub-lesson");
}

group("drills");
for (const d of DRILL_TYPES) {
  const qs = Q.drillQuestions(d.id);
  ok(qs.length === 10, `${d.id}: generates a full set`, String(qs.length));
  ok(qs.every((q) => q.options && q.options.length >= 3),
     `${d.id}: every question has options`);
  ok(qs.every((q) => q.options.filter((o) => o.right).length === 1),
     `${d.id}: exactly one right answer each`);
  if (d.id === "cases") {
    ok(qs.every((q) => q.table), "cases: every question can show its table");
    ok(qs.every((q) => !q.options.some(
      (o) => o.right && fold(o.label) === fold(q.prompt))),
      "cases: never asks for the form already on screen");
  }
  if (d.id === "stress") {
    ok(qs.every((q) => q.options.every((o) => fold(o.label) === fold(q.prompt))),
       "stress: all options are the same word, differing only in accent");
  }
  if (d.id === "aspect") {
    ok(qs.every((q) => q.note), "aspect: the rule is available as a hint");
    /* The multiple-choice partner question scores about 1,400 candidates each
       time. Measured at 5.7 ms a question before the candidates were cached
       with their stems (2026-09-15); the budget docs/PLAYBOOK.md set is a
       hundred questions in 50 ms, and holding it here is what stops a later
       change to the scoring from quietly costing a drill a tenth of a second. */
    let n = 0;
    const t0 = performance.now();
    while (n < 100) {
      const got = Q.drillQuestions("aspect", 20, null, null, false);
      if (!got.length) break;
      n += got.length;
    }
    const ms = performance.now() - t0;
    ok(n >= 100 && ms < 50, "aspect: a hundred partner questions inside 50 ms",
       `${n} in ${ms.toFixed(1)} ms`);
  }
}

/* Listening passages (ROADMAP P10.3): half a minute of one speaker, ranked
   against what the learner actually knows rather than assigned a chapter. */
group("listening passages");
{
  const P = DATA.listening || [];
  ok(P.length > 200, "the build ships passages", String(P.length));
  ok(P.every((p) => p.v && p.start >= 0 && p.end > p.start && p.title),
     "each names a video and a span inside it");
  const lengths = P.map((p) => p.end - p.start);
  ok(Math.min(...lengths) >= 30000 && Math.max(...lengths) <= 62000,
     "every passage is between thirty seconds and a minute",
     `${Math.min(...lengths)}–${Math.max(...lengths)} ms`);
  ok(P.every((p) => Object.keys(p.words).length >= 12),
     "and says at least a dozen curriculum words");
  // Every word shipped is a real curriculum word, said at a time inside the span.
  const taught = new Set();
  for (const u of UN) for (const i of u.w) taught.add(L[i].b);
  let stray = 0, outside = 0;
  for (const p of P) {
    for (const w in p.words) {
      if (!taught.has(w)) stray++;
      if (p.words[w].some((ms) => ms < p.start || ms > p.end)) outside++;
    }
  }
  ok(stray === 0, "every word listed is one the curriculum teaches", String(stray));
  ok(outside === 0, "and every moment falls inside the passage", String(outside));

  // No two passages from one video overlap: three windows on the same half minute
  // would be one passage offered three times.
  let overlaps = 0;
  const byVideo = {};
  for (const p of P) (byVideo[p.v] = byVideo[p.v] || []).push(p);
  for (const v in byVideo) {
    const list = byVideo[v].slice().sort((a, b) => a.start - b.start);
    for (let k = 1; k < list.length; k++) if (list[k].start < list[k - 1].end) overlaps++;
  }
  ok(overlaps === 0, "passages from one video never overlap", String(overlaps));

  /* Ranked by fit, and a learner who knows nothing is offered nothing rather
     than a passage they cannot touch. */
  ok(Q.passagesFor(P, new Set(), 10).length === 0, "no words known, nothing offered");
  const someWords = new Set(UN.slice(0, 12).flatMap((u) => u.w).map((i) => L[i].b));
  const fitted = Q.passagesFor(P, someWords, 10);
  ok(fitted.length > 0, "a learner part-way along is offered some", String(fitted.length));
  const fits = fitted.map((p) => Q.passageFit(p, someWords));
  ok(fits.every((f, k) => k === 0 || fits[k - 1] >= f), "best fit first", fits.join(","));
  ok(fits.every((f) => f >= 6), "and never one with almost nothing they know");

  /* The questions: about what was caught, and answerable — both the answer and
     the wrong options are words this learner has met. */
  const p = fitted[0];
  const qs = Q.passageQuestions(p, someWords);
  ok(qs.length >= 2 && qs.length <= 5, "up to five questions a passage", String(qs.length));
  ok(qs.every((x) => x.options.filter((o) => o.right).length === 1),
     "exactly one right answer each");
  // Folded on both sides: an option is printed as the stressed headword, and a
  // capitalised one («Россия») is not its own bare form.
  const knownFolded = new Set([...someWords].map(fold));
  ok(qs.every((x) => x.options.every((o) => knownFolded.has(fold(o.label)))),
     "every option is a word the learner has met",
     qs.flatMap((x) => x.options.map((o) => o.label))
       .filter((l) => !knownFolded.has(fold(l))).join(","));
  const right = qs.map((x) => fold(x.options.find((o) => o.right).label));
  ok(right.every((b) => b in p.words || qs.find((x) => x.ask === "Which came first?")),
     "and the right answer is a word the passage says");
  ok(qs.every((x) => typeof x.at === "number" && x.at >= p.start && x.at <= p.end),
     "each carries the moment its word went by, for playing it back");

  /* A wrong option must not be a word the passage says. `words` alone was not
     enough: it holds only the forms the resolver could settle, so «его» went by,
     «он» was offered as not said, and hearing correctly was marked wrong — a
     quarter of the questions. `maybe` carries what the form could have been. */
  let claimedUnsaid = 0, checked = 0;
  for (const pp of Q.passagesFor(P, someWords, 40)) {
    const spoken = new Set(Object.keys(pp.words).concat(pp.maybe || []));
    for (const x of Q.passageQuestions(pp, someWords)) {
      if (x.ask !== "Which of these did you hear?") continue;   // order asks about two spoken words
      for (const o of x.options) {
        if (o.right) continue;
        checked++;
        if (spoken.has(fold(o.label))) claimedUnsaid++;
      }
    }
  }
  ok(checked > 50 && claimedUnsaid === 0,
     `no wrong option is a word the passage says (${checked} checked)`, String(claimedUnsaid));
  ok(P.every((x) => Array.isArray(x.maybe)), "every passage ships what its forms might have been");

  /* And the answers are words worth listening for. Counting «и» and «в» made
     the ranking a function-word density ranking and 95 % of answers a function
     word (PASSAGE_SKIP_TOP). */
  const funcAnswer = Q.passagesFor(P, someWords, 20).flatMap((pp) =>
    Q.passageQuestions(pp, someWords).map((x) => x.options.find((o) => o.right).label))
    .filter((lab) => ((IX[fold(lab)] || [])[0] ?? 0) < 100);
  ok(funcAnswer.length === 0, "and never a function word", funcAnswer.join(","));
  ok(new Set(qs.map((x) => x.ask + "|" + right)).size >= 1
     && qs.filter((x) => x.ask === "Which of these did you hear?").length >= 1,
     "the bulk ask what was heard");
}

/* The alphabet and the sounds under it (ROADMAP P10.2). Hand-authored teaching
   content, so what is checked is that it is complete and internally consistent —
   a missing letter or a pair that does not pair is a lesson that teaches a
   falsehood. */
group("the writing system");
{
  ok(LETTERS.length === 33, "all 33 letters", String(LETTERS.length));
  ok(LETTERS.every((x) => x.l && x.name && x.ipa && x.like && x.kind),
     "each carries a name, a sound, an English comparison and a class");
  const vowels = LETTERS.filter((x) => x.kind === "vowel");
  const signs = LETTERS.filter((x) => x.kind === "sign");
  ok(vowels.length === 10, "ten vowel letters", String(vowels.length));
  ok(signs.length === 2, "the hard and soft signs", String(signs.length));
  ok(LETTERS.filter((x) => x.kind === "consonant").length === 21, "twenty-one consonants");
  // Alphabetical order, by the Russian alphabet's own sequence.
  const order = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
  ok(LETTERS.map((x) => x.l[0]).join("") === order, "in alphabetical order");
  const bare = new Set(LETTERS.map((x) => x.l.split(" ")[1]));
  ok(bare.size === 33, "no letter listed twice", String(bare.size));

  ok(VOWEL_PAIRS.length === 5, "five hard/soft vowel pairs", String(VOWEL_PAIRS.length));
  // Every pair's letters are real vowel letters, and every vowel is in a pair.
  const paired = VOWEL_PAIRS.flatMap((p) => [p.hard, p.soft]);
  ok(paired.every((v) => bare.has(v)), "the pairs use real letters");
  ok(new Set(paired).size === 10 && vowels.every((v) => paired.includes(v.l.split(" ")[1])),
     "and every vowel letter is in exactly one pair");
  ok(VOWEL_PAIRS.every((p) => p.example.length === 2 && p.gloss.length === 2
                              && p.example[0] !== p.example[1]),
     "each pair contrasts two real words");

  ok(VOWEL_CHART.length === 6, "six vowel sounds on the chart", String(VOWEL_CHART.length));
  ok(VOWEL_CHART.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1),
     "every one placed inside the chart");
  // и front and close, у back and close, а open: if these drift the picture lies.
  const at = (v) => VOWEL_CHART.find((x) => x.v === v);
  ok(at("и").x < at("ы").x && at("ы").x < at("у").x, "и is front, ы central, у back");
  ok(at("а").y > at("э").y && at("э").y > at("и").y, "а is the open one, и the closed");

  ok(TRAPS.length === 6, "six letters that look Latin and are not",
     TRAPS.map((x) => x.l[0]).join(""));
  ok(TRAPS.every((x) => x.note && /looks like/i.test(x.note)),
     "each says what it is mistaken for");
  // The tip a word earns.
  ok(/\bv\b/.test(soundTip("врач") || ""), "«врач» warns about в", soundTip("врач"));
  ok(/tongue back/.test(soundTip("ты") || ""), "«ты» explains ы", soundTip("ты"));
  ok(soundTip("да") === null, "a word with nothing tricky gets no tip", String(soundTip("да")));
  ok(soundTip("") === null && soundTip(undefined) === null, "and neither does nothing");
}

/* Recognition to meet a word, production to keep it (ROADMAP P10.1). */
group("production on a known word");
{
  const unit = UN.find((u) => u.id === "food");
  const words = lessonWords(unit, 0);
  const RECOGNITION = ["choose-en", "choose-ru", "listen"];
  const kindsFor = (seen) => {
    const out = new Set();
    for (let k = 0; k < 40; k++) {
      for (const q of Q.quizSteps(unit, 0, [], seen)) {
        // The chapter's `form` question has its own chosen-then-typed rule
        // (FORM_MIX) and is not drawn from candidates().
        if (q.kind !== "form" && typeof q.i === "number" && words.includes(q.i)) out.add(q.kind);
      }
    }
    return out;
  };
  const fresh = kindsFor({});
  ok(RECOGNITION.some((k) => fresh.has(k)),
     "a word just met is asked by recognition", [...fresh].join(","));

  // The same words, now held by the scheduler past PRODUCE_AT.
  const known = {};
  for (const i of words) known[L[i].b] = { recognise: { s: PRODUCE_AT + 2, d: 5, dueAt: 0, state: 2, reps: 4, lapses: 0 } };
  const mature = kindsFor(known);
  ok(!RECOGNITION.some((k) => mature.has(k)),
     "a word the scheduler holds is never asked by multiple choice", [...mature].join(","));
  ok(mature.has("type") || mature.has("cloze"),
     "it is typed or filled into a gap instead", [...mature].join(","));

  // Just below the line it is still recognition: the rule is stability, not age.
  const young = {};
  for (const i of words) young[L[i].b] = { produce: { s: PRODUCE_AT - 1, d: 5, dueAt: 0, state: 2, reps: 2, lapses: 0 } };
  ok(RECOGNITION.some((k) => kindsFor(young).has(k)),
     `below ${PRODUCE_AT} days of stability recognition is still offered`);
  // And a platform that passes no schedule behaves exactly as before.
  ok(RECOGNITION.some((k) => kindsFor(undefined).has(k)),
     "with no schedule given, nothing changes");
}

/* A drill is a pool of questions, not a handful the learner sees again and again
   (the owner, 2026-09-10). Measured at the point on the route where each opens:
   the numbers below are floors, and a run is DRILL_N. */
group("drill variety");
{
  const route = STAGES.flatMap((s) => [s.core].concat(s.branches));
  const distinct = (type, units) => {
    const pool = [...new Set(units.flatMap((u) => u.w))];
    const seen = new Set();
    for (let k = 0; k < 25; k++) {
      for (const q of Q.drillQuestions(type, 30, pool)) seen.add(Q.drillKey(q));
    }
    return seen.size;
  };
  // Each drill, from the chapter that opens it, must beat a run several times over.
  const FLOOR = 100;
  for (const d of DRILL_TYPES) {
    const at = Q.drillOpensAt(d.id);
    const units = route.slice(0, Math.max(3, (at + 1) * 3));
    const n = distinct(d.id, units);
    ok(n >= FLOOR, `${d.id}: ${n} distinct questions where it opens (floor ${FLOOR})`, String(n));
  }
  // The identity of a question includes its answer: a shape whose content is all
  // in its options carries no prompt, and keying on the prompt let only one of
  // them into a run.
  const bare = Q.drillQuestions("aspect", 10, route.flatMap((u) => u.w))
    .filter((q) => !q.prompt);
  ok(new Set(bare.map(Q.drillKey)).size === bare.length,
     "promptless questions are still told apart", `${bare.length} drawn`);

  /* A drill opens when the route has taught its rule, so nobody drills aspect in
     chapter 1 — where their words could fill fifteen questions. */
  ok(Q.drillOpensAt("aspect") === 7 && Q.drillOpensAt("cases") === 3
     && Q.drillOpensAt("conjugation") === 1 && Q.drillOpensAt("agreement") === 2,
     "each drill opens at the chapter that teaches it",
     DRILL_TYPES.map((d) => `${d.id}:${Q.drillOpensAt(d.id) + 1}`).join(" "));
  ok(Q.drillOpensAt("stress") === -1 && Q.drillOpensAt("grammar") === -1,
     "stress and grammar are open from the start");
  const first = Q.drillsIntroduced(route.slice(0, 3));
  ok(first.has("stress") && first.has("grammar") && !first.has("aspect") && !first.has("cases"),
     "chapter 1 opens two of the six", [...first].join(","));
  ok(Q.drillsIntroduced(route).size === DRILL_TYPES.length,
     "and the whole route opens them all");
}

/* A drill asks only about the learner's own words when given a pool. */
group("drill pool");
{
  const pool = UN.find((u) => u.id === "core1").w.concat(UN.find((u) => u.id === "core2").w);
  const inPool = new Set(pool);
  for (const type of ["cases", "conjugation", "stress"]) {
    const qs = Q.drillQuestions(type, 6, pool);
    ok(qs.every((q) => inPool.has(q.i)), `${type}: every question is about a pooled word`,
       qs.filter((q) => !inPool.has(q.i)).map((q) => q.prompt).join(","));
  }
  const tiny = Q.drillQuestions("cases", 6, [pool[0]]);
  ok(tiny.length <= 1 || tiny.every((q) => q.i === pool[0]),
     "a one-word pool yields at most that word's questions");
  ok(Q.drillQuestions("cases", 6).length === 6, "no pool: the whole curriculum, as before");
}

/* The owner, 2026-09-11: *"fill in the blank allows the user to generate it
   completely rather than guess"*. Every drill question used to be four options,
   which is §30j's point about recognition made against the app itself. */
/* Cyrillic that has been through a PowerShell round trip.
 *
 * §23 has warned about this since the first time it happened, and it happened
 * twice again on 2026-09-11 — once silently mojibaking a test file, once making
 * a measurement report "0 verbs with a partner" and nearly sending the work down
 * a wrong path. Knowing the rule is plainly not the same as being unable to
 * break it, so here is the check instead of another paragraph.
 *
 * UTF-8 Cyrillic read as cp1252 comes out as U+00D0 or U+00D1 followed by more
 * Latin-1 — every Cyrillic letter becomes two characters, the first of them one
 * of those two. U+FFFD is the other direction, a decode that gave up. Neither
 * belongs in a source file.
 *
 * The example is written as code points rather than spelled out, because this
 * check reads this file too: the first run failed on its own comment, which is
 * at least a sign it works. Skipping this file would have been the wrong fix —
 * it is as able to be corrupted as any other. */
group("text that survived the shell");
{
  const roots = ["core", "tools", "native/src", "native/__tests__", "data/curated/scripts"];
  const bad = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) { if (f.name !== "node_modules") walk(rel); continue; }
      if (!/\.(js|mjs|json|py)$/.test(f.name)) continue;
      const s = readFileSync(join(ROOT, rel), "utf8");
      // Built from escapes, so the file that looks for mis-decoded Cyrillic
      // does not contain any. The first run failed on its own regex.
      const m = s.match(new RegExp("[\\u00D0\\u00D1][\\u0080-\\u00BF]|\\uFFFD"));
      if (m) bad.push(`${rel}: ${JSON.stringify(s.slice(Math.max(0, s.indexOf(m[0]) - 20), s.indexOf(m[0]) + 20))}`);
    }
  };
  roots.forEach(walk);
  ok(bad.length === 0, "no source file carries mis-decoded Cyrillic", bad.slice(0, 3).join(" | "));
}

/* The parts list in tools/payload.mjs is a second copy of NATIVE_PARTS in
   build_site.py, and a part missing from it does not fail — every tool simply
   reads the payload without it, and any check written against that part passes
   on nothing. `senses` was missed exactly that way. */
group("the payload the tools read");
{
  const src = readFileSync(join(ROOT, "tools/build_site.py"), "utf8");
  const m = src.match(/NATIVE_PARTS\s*=\s*\[([^\]]*)\]/);
  const named = m ? m[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, "")) : [];
  ok(named.length > 0, "build_site names the parts it writes", named.join(", "));
  ok(named.every((p) => PARTS.includes(p)),
     "and the tools' loader knows every one of them",
     named.filter((p) => !PARTS.includes(p)).join(", ") || "none missing");
}

group("drills the learner writes");
{
  for (const type of ["cases", "agreement", "conjugation", "aspect"]) {
    const qs = Q.drillQuestions(type, 8, null, undefined, true);
    ok(qs.length === 8, `${type}: a written run fills up`, String(qs.length));
    const written = qs.filter((q) => q.typed);
    ok(written.length, `${type}: and is written, not chosen`, `${written.length} of ${qs.length}`);
    ok(written.every((q) => q.target && q.answer && !q.options),
       `${type}: a written question carries its answer and offers no options`);
    ok(written.every((q) => /^Write /.test(q.ask)),
       `${type}: and says so`, written.map((q) => q.ask)[0]);
    // The answer must never be sitting on the screen already.
    ok(written.every((q) => fold(q.target) !== fold(q.prompt || "")),
       `${type}: never asks for the word it is showing`);
  }

  /* Two shapes cannot be written — "which of these is perfective?" and "whose
     form is this?" are questions about a list, and there is nothing to produce.
     They stay as they are rather than being dropped, so a run still fills. */
  for (const type of ["stress", "grammar"]) {
    const qs = Q.drillQuestions(type, 6, null, undefined, true);
    ok(qs.length === 6 && qs.every((q) => !q.typed && q.options),
       `${type}: nothing to write, so it is still chosen`, String(qs.length));
  }

  // Written questions are still told apart, or a run holds one of them.
  const many = Q.drillQuestions("cases", 12, null, undefined, true);
  ok(new Set(many.map(Q.drillKey)).size === many.length,
     "written questions are distinct from each other", `${many.length} drawn`);

  // Any other form in the same cell is right too: «о столе» and «о столу» both.
  ok(many.every((q) => !q.alts || q.alts.every((a) => typeof a === "string")),
     "alternative forms ride along folded, as the typed answer expects");
}

group("question shape");
{
  // Both runners read these fields; a missing one is a blank screen on one platform.
  const all = [].concat(Q.quizSteps(UN[0], 0), Q.drillQuestions("cases", 4));
  ok(all.every((q) => typeof q.ask === "string" && q.ask.length),
     "every question states what is being asked");
  ok(all.every(answerable), "and offers a way to answer");
  ok(all.filter((q) => q.typed).every((q) => q.target && q.answer),
     "typed questions carry both the target and the displayed answer");
}

/* ----------------------------------------------------------------- forms */

group("naming the form a learner just tapped");
{
  // Tables are rebuilt on the way in now, so an entry has to be hydrated before it
  // has any to describe.
  const byBare = (b) => hydrate(DATA.lemmas.find((l) => l.b === b));

  // A noun: the cell knows its own case and number.
  const kniga = byBare("книга");
  if (kniga) {
    const acc = describeForm(kniga, "книгу");
    ok(!!acc, "an inflected noun form is found in the paradigm");
    ok(acc && /singular/i.test(acc.text) && /accusative/i.test(acc.text),
       "and is named by case and number", acc && acc.text);
    ok(describeForm(kniga, "книга").text.toLowerCase().includes("nominative"),
       "the headword itself resolves to the nominative");
  }

  // A verb: the row label is the whole answer, so the generic "Form" column is
  // dropped rather than producing "я form".
  const verb = DATA.lemmas.find((l) => l.p === "verb" && (l.t || []).length);
  if (verb) {
    const cell = verb.t[0].rows.find((r) => (Array.isArray(r[1]) ? r[1][0] : r[1]));
    const one = Array.isArray(cell[1]) ? cell[1][0] : cell[1];
    const d = describeForm(verb, one);
    ok(!!d, "a verb form is found");
    ok(d && !/\bform\b/i.test(d.text), "and is not described as a “form”", d && d.text);
  }

  ok(describeForm(kniga || DATA.lemmas[0], "zzzz") === null,
     "a form that is not in the paradigm returns null rather than guessing");
  ok(describeForm(null, "книгу") === null, "a missing lemma is handled");
  ok(describeForm({ b: "x" }, "x") === null, "a lemma with no tables is handled");

  const s = summarise(kniga || DATA.lemmas[0], "книгу");
  ok(!!s && !!s.gloss, "a summary carries a gloss");
  ok(s.tags.length > 0, "and the standing grammatical tags", s.tags.join(", "));
  const same = summarise(kniga || DATA.lemmas[0], (kniga || DATA.lemmas[0]).b);
  ok(same.surface === null,
     "the surface form is only reported when it differs from the headword");
}

/* -------------------------------------------------- paradigm reconstruction */

group("paradigms rebuilt from shared ending-shapes");
{
  const deep = DEEP;
  const byBare = DEEP_BY_BARE;

  ok(deep.length > 40000, "the dictionary carries every glossed lemma", String(deep.length));
  const withPar = deep.filter((d) => d.shape !== "").length;
  ok(withPar > 40000, "and a paradigm for almost all of them", String(withPar));

  /* The layout lives twice — here and in panel.py, which still serves the CLI. The
     build emits a sample of Python-built tables precisely so drift cannot go
     unnoticed. */
  const sample = DATA.tsample || [];
  ok(sample.length > 0, "the build shipped a table sample to check against",
     String(sample.length));
  let same = 0, differed = null;
  for (const s of sample) {
    const rec = byBare.get(fold(s.b) + "|" + s.p) || byBare.get(fold(s.b));
    if (!rec) continue;
    const mine = buildTables(s.p, slotsOf(rec, decodeShapes(DATA.shapes), DATA.slots));
    if (JSON.stringify(mine) === JSON.stringify(s.t)) same++;
    else if (!differed) differed = s.b + ": " + JSON.stringify(mine).slice(0, 120);
  }
  ok(same === sample.length,
     "core/paradigm.js reproduces panel.py's tables exactly",
     differed || `${same}/${sample.length}`);

  // Stress has to survive the round trip or every table is subtly wrong.
  const kniga = byBare.get("книга");
  if (kniga) {
    const slots = slotsOf(kniga, decodeShapes(DATA.shapes), DATA.slots);
    ok(slots.sg_acc && slots.sg_acc[0] === "кни́гу",
       "an inflected form comes back with its stress intact",
       slots.sg_acc && slots.sg_acc[0]);
  }

  // A word outside the curriculum gets the same treatment as one inside it.
  const vino = byBare.get("виноград");
  ok(!!vino, "a word the curriculum never teaches is in the dictionary");
  if (vino) {
    hydrate(vino);
    ok(vino.t.length > 0, "and it has a paradigm", vino.t.map((t) => t.title).join(", "));
    ok(vino.t[0].rows.length === 6, "with every case", String(vino.t[0].rows.length));
  }

  // Studied lemmas are hydrated from the same store, not from a second copy.
  // Read the file again rather than the in-memory object: hydration mutates, and
  // an earlier group in this file has already filled this one in.
  const fresh = JSON.parse(readFileSync(join(ROOT, "native/assets/data.json"), "utf8")).lemmas;
  const onDisk = fresh.find((x) => x.b === "книга");
  ok(onDisk && onDisk.t === undefined && onDisk.x === undefined,
     "the payload no longer carries a second copy of tables or sentences");
  // …but every studied row carries its compressed record, so the curriculum
  // hydrates without the dictionary: a hydrator that refuses to open it still
  // fills every word out (P9.24). The sentence pool is opened on the first
  // example read, not before.
  let poolOpened = 0;
  const strict = makeHydrator({
    deepIndex: () => { throw new Error("the dictionary was opened to hydrate a studied word"); },
    shapes: DATA.shapes, slots: DATA.slots, sent: () => { poolOpened++; return DATA.sent; },
  });
  ok(fresh.every((w) => w.shape !== undefined), "every studied row carries a paradigm record");
  fresh.forEach(strict);
  ok(poolOpened === 0, "registering the words opens no sentence pool");
  let filled = 0;
  try {
    for (const w of fresh) if (w.t.length || w.x.length) filled++;
  } catch (e) { ok(false, "hydrating the curriculum needs no dictionary", e.message); }
  ok(filled > fresh.length * 0.95, "and nearly every studied word has tables or sentences",
     `${filled}/${fresh.length}`);
  ok(poolOpened === 1, "the sentence pool was opened once, on first use", String(poolOpened));
  const l = DATA.lemmas.find((x) => x.b === "книга");
  hydrate(l);
  ok(l.t.length > 0 && l.x.length > 0,
     "which hydration restores", `${l.t.length} table(s), ${l.x.length} example(s)`);
  ok(describeForm(l, "книгу") !== null,
     "and form description still works off the rebuilt tables");
}

console.log("\n" + checks + " checks · " +
            (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
