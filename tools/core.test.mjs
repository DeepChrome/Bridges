/* Tests for core/ — the logic both platforms share.
 *
 * The web suites drive the DOM and the browser suite drives layout; neither reaches
 * the rules underneath. Since core/ is now the single implementation of folding,
 * scheduling and question generation, a bug here is a bug in both apps at once.
 *
 *   node tools/core.test.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fold, bare, translit, translitBack, firstSense, shuffle, sample, TOKEN }
  from "../core/util.js";
import { fsrsReview, fsrsPreview, isTrouble, retrievability, gradeFor, applyGrade }
  from "../core/fsrs.js";
import { SCENARIOS } from "../core/scenarios.js";
import { quizPassed } from "../core/state.js";
import { SCHEMA_VERSION, MIGRATIONS, migrate, recordAttempt, tagAttempt, speechDefault, ATTEMPT_CAP,
         talkAllowance, startTalkSession, TALK_SESSIONS_PER_DAY, TALK_TURNS }
  from "../core/state.js";
import { compare, words, charDistance } from "../core/compare.js";
import { ERROR_TAGS, TAG_IDS, isTag, tagInfo } from "../core/errortags.js";
import { makeQuestions, DRILL_TYPES, SPEECH_MIX, FORM_MIX, QUIZ_KINDS, PRODUCE_AT,
         lessonSize, LESSON_RAMP, LESSON_SIZE }
  from "../core/questions.js";
import { LETTERS, VOWEL_PAIRS, VOWEL_CHART, soundTip, TRAPS } from "../core/alphabet.js";
import { sentenceLemmas, gradeAlignment, feedbackTags, nearMiss, alignmentCredit, SPEECH_SKIP_TOP }
  from "../core/speech.js";
import { describeForm, summarise } from "../core/forms.js";
import { parseDeep } from "../core/search.js";
import { decodeShapes, slotsOf, buildTables } from "../core/paradigm.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { ICONS, iconFor } from "../core/icons.js";
import { AV, AV_IDS } from "../core/avatars.js";

import { loadPayload } from "./payload.mjs";

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
  ok(quizPassed({ q: 80 }) && !quizPassed({ q: 79, tries: 2 }) && quizPassed({ q: 70, tries: 3 })
     && !quizPassed({ q: 69, tries: 5 }) && !quizPassed(undefined),
     "a quiz passes at the mark, or at the relief mark from the third try");
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
    const own = new Set(lessonWords(plural.core, 0));
    const able = [...own].some((i) => Q.formPrompt(plural.core, 0, i));
    ok(!able || own.has(q.i), "asked about one of the lesson's own words when one has the form");
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
  // Two shapes now share the kind: the corpus scene, which is short and every
  // sentence of which has a real recording, and the passage written for the
  // lesson (§30j), which is longer and read by the device voice because nobody
  // has ever said it. A scene must be one or the other, never a corpus scene
  // claiming to be written or a written one claiming a recording it lacks.
  if (s.written) {
    ok(s.rows.length >= 4 && s.rows.length <= 5, "a written passage is four or five sentences", String(s.rows.length));
    ok(s.topic && s.level, "and says what it is about and where it is from", `${s.topic} / ${s.level}`);
  } else {
    ok(s.rows.length >= 2 && s.rows.length <= 3, "two or three sentences", String(s.rows.length));
    ok(s.rows.every((r) => DATA.audio.files[fold(r.ru)]), "every sentence has a recording");
  }
  ok(s.questions.length >= s.rows.length, "a question per sentence at least");
  ok(s.questions.every((q) => q.options.length === 4 && q.options.filter((o) => o.right).length === 1),
     "four options, one right, on every question");
  s.rows.forEach((r, k) => {
    const q = s.questions[k];
    ok(q.row === k && q.options.find((o) => o.right).label === r.en,
       `question ${k + 1} asks the meaning of sentence ${k + 1}`);
    ok(new Set(q.options.map((o) => o.label)).size === 4, "and its options are distinct");
  });
  const heardQ = s.questions.find((q) => typeof q.i === "number");
  if (heardQ) {
    ok(s.lemmas.includes(heardQ.i) && !heardQ.options.some((o) => !o.right && s.lemmas.includes(o.i)),
       "the heard word was said and the wrong ones were not");
  }
  ok(!s.autoplay, "nothing plays before the learner presses Play");
  ok(!answerable({ kind: "scene", questions: [{}] }), "a scene without options is not answerable");

  const drill = Q.listeningDrill(Q.unitsUpTo(later), 4);
  ok(drill.length === 4 && new Set(drill.map((d) => d.rows[0].ru)).size === 4,
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

/* The written lesson passages (§30j). tools/check_scripts.mjs is what proves the
   Russian stays inside the lesson's vocabulary; this proves the app turns one
   into a scene a learner can actually answer, and that it is preferred over the
   corpus scene wherever a lesson has one. */
/* The first n written sentences in route order, as the app walks them. */
function routeOpening(n) {
  const out = [];
  for (const s of STAGES) {
    for (const u of [s.core].concat(s.branches || [])) {
      for (let i = 0; i < lessonCount(u) && out.length < n; i++) {
        const x = SCRIPTS[`${u.id}:${i}`];
        if (x) out.push(...x.rows.map((r) => r.en));
      }
    }
  }
  return out.slice(0, n);
}

group("written lesson passages");
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
    if (scene.rows.length !== SCRIPTS[k].rows.length) bad.push(`${k}: lost a sentence`);
    if (!scene.written) bad.push(`${k}: not marked written`);
    if (scene.questions.length < scene.rows.length) bad.push(`${k}: too few questions`);
    for (const q of scene.questions) {
      if (q.options.length !== 4) bad.push(`${k}: ${q.options.length} options`);
      if (q.options.filter((o) => o.right).length !== 1) bad.push(`${k}: not one right answer`);
      if (new Set(q.options.map((o) => o.label)).size !== 4) bad.push(`${k}: a repeated option`);
    }
  }
  ok(built === keys.length, "every one of them builds into a scene", `${built} of ${keys.length}`);
  ok(!bad.length, "and each is answerable: four distinct options, one right", bad.slice(0, 4).join(" | "));

  // The Russian distractors in "which word did you hear?" are words on screen,
  // so they must be words this learner has met — the English ones may come from
  // anywhere, because English gives no Russian away.
  const offLevel = [];
  for (const k of keys.slice(0, 40)) {
    const [id, i] = k.split(":");
    const u = byId.get(id);
    const met = new Set(Q.unitsUpTo(u).flatMap((x) => x.w));
    const scene = Q.scriptScene(u, Number(i));
    for (const q of (scene.questions || [])) {
      if (typeof q.i !== "number") continue;
      for (const o of q.options) if (typeof o.i === "number" && !met.has(o.i)) offLevel.push(`${k}: ${o.label}`);
    }
  }
  ok(!offLevel.length, "no Russian option is a word the learner has not reached",
     offLevel.slice(0, 4).join(", "));

  // The very first lesson has nothing behind it to draw wrong answers from, so
  // it borrows from the front of the route rather than the whole file. Borrowing
  // at large put "Our customer is an entrepreneur from Moscow." beside «Это я.»
  // on the emulator, and the right answer was simply the short one.
  {
    const opener = STAGES[0].core;
    const scene = Q.scriptScene(opener, 0);
    // A generous window on purpose: the contract is "early in the route", not an
    // exact slice. Forty sentences is the first seven or eight lessons; a
    // chapter-10 sentence about entrepreneurs is nowhere near it.
    const early = new Set(routeOpening(40));
    const far = [];
    for (const q of scene.questions) {
      if (typeof q.i === "number") continue;
      for (const o of q.options) {
        if (!o.right && !early.has(o.label) && !SCRIPTS[`${opener.id}:0`].rows.some((r) => r.en === o.label)) {
          far.push(o.label);
        }
      }
    }
    ok(!far.length, "the first lesson's wrong answers come from the opening of the route",
       far.slice(0, 2).join(" | "));
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
  ok(p && p.written && p.rows.length >= 4, "Practice draws a written passage too");
  const first = Q.writtenPassage([STAGES[0].core], (u) => 1);
  ok(first && first.unit === STAGES[0].core.id && first.rows.length >= 4,
     "one lesson in, the first lesson's passage is available");
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
  for (const i of words) known[L[i].b] = { s: PRODUCE_AT + 2, d: 5, due: 0, last: -1, reps: 4, lapses: 0 };
  const mature = kindsFor(known);
  ok(!RECOGNITION.some((k) => mature.has(k)),
     "a word the scheduler holds is never asked by multiple choice", [...mature].join(","));
  ok(mature.has("type") || mature.has("cloze"),
     "it is typed or filled into a gap instead", [...mature].join(","));

  // Just below the line it is still recognition: the rule is stability, not age.
  const young = {};
  for (const i of words) young[L[i].b] = { s: PRODUCE_AT - 1, d: 5, due: 0, last: -1, reps: 2, lapses: 0 };
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
