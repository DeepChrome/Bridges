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
import { SCHEMA_VERSION, MIGRATIONS, migrate, recordAttempt, tagAttempt, speechDefault, ATTEMPT_CAP }
  from "../core/state.js";
import { compare, words } from "../core/compare.js";
import { ERROR_TAGS, TAG_IDS, isTag, tagInfo } from "../core/errortags.js";
import { makeQuestions, DRILL_TYPES, SPEECH_MIX } from "../core/questions.js";
import { sentenceLemmas, gradeAlignment } from "../core/speech.js";
import { describeForm, summarise } from "../core/forms.js";
import { parseDeep } from "../core/search.js";
import { decodeShapes, slotsOf, buildTables } from "../core/paradigm.js";
import { makeHydrator } from "../core/entry.js";
import { ICONS, iconFor } from "../core/icons.js";
import { AV, AV_IDS } from "../core/avatars.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = JSON.parse(readFileSync(join(ROOT, "native/assets/data.json"), "utf8"));

/* The payload stores paradigms and sentences once, shared; entries are filled out
   on the way in. Set up here because more than one group needs it. */
const DEEP = parseDeep(DATA.deep || "");
const DEEP_BY_BARE = new Map();
for (const d of DEEP) if (!DEEP_BY_BARE.has(d.b)) DEEP_BY_BARE.set(d.b, d);
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
  for (let i = 0; i < 4; i++) t = fsrsReview(t, 1, i);
  ok(isTrouble(t), "four lapses bank a word as trouble");
  ok(!isTrouble(fsrsReview(undefined, 3, 0)), "one good answer does not");

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
  ok(applyGrade({}, {}, "да", 0, 0).card.lapses === 1, "and to 1");
}

/* ------------------------------------------------------------ state */
/* The schema lives in core since v5 so the two apps run one set of migrations. */

group("state schema");
{
  ok(SCHEMA_VERSION === 5, "schema is at 5", String(SCHEMA_VERSION));
  ok([1, 2, 3, 4].every((k) => typeof MIGRATIONS[k] === "function"),
     "a migration step exists from every earlier version");

  // A real v4 save: FSRS cards, component lessons, no speech slot.
  const v4 = {
    v: 4, seen: { книга: { s: 3, d: 5, due: 10, last: 6, reps: 3, lapses: 0 } },
    trouble: { стол: 2 }, pinned: ["дом"], xp: 42, streak: 5,
    unit: { core1: { lessons: { 0: { v: true, q: 90 } }, video: true } },
  };
  const v5 = migrate(v4, 4);
  ok(v5.v === 5, "v4 migrates to v5");
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
  ok(v1.v === 5 && v1.seen["да"].reps === 4 && v1.unit.core1.lessons[0].q === 80 && v1.speech,
     "v1 → v5 in one pass keeps history and gains the slot");

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
const LESSON_SIZE = 7;
const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / LESSON_SIZE));
const lessonWords = (u, i) => u.w.slice(i * LESSON_SIZE, (i + 1) * LESSON_SIZE);
const SPEECH = DATA.speech;
const Q = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH,
                          hasVoice: () => true });
const answerable = (q) =>
  q.options || q.typed || q.pairs || q.kind === "hear" || q.kind === "say";

group("lesson generation");
{
  const unit = UN.find((u) => u.id === "food");
  const steps = Q.vocabSteps(unit, 0);
  ok(steps[0].t === "grammar", "the first lesson opens on the unit's grammar note");
  ok(steps.filter((s) => s.t === "word").length === lessonWords(unit, 0).length,
     "every new word is presented");
  ok(steps.some((s) => s.options), "questions are interleaved between the words");
  const wordAt = steps.findIndex((s) => s.t === "word");
  const qAt = steps.findIndex((s) => s.options);
  ok(wordAt < qAt, "a word is always taught before it is asked");

  const quiz = Q.quizSteps(unit, 0);
  const speechN = quiz.filter((q) => q.kind === "hear" || q.kind === "say").length;
  ok(quiz.length === 8 + speechN, "a lesson quiz is 8 questions plus its speech steps",
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

/* The listening step rides on the quiz from the second chapter on. */
group("hearing");
{
  const first = STAGES[0].core;
  const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.hear.fromStage
                                   && (SPEECH.listen[s.core.id] || []).length).core;
  ok(!Q.quizSteps(first, 0).some((q) => q.kind === "hear"),
     "the first chapter's quiz is reading-only");
  const quiz = Q.quizSteps(later, 0);
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
  const want = new Set(lessonWords(later, 0));
  let leaning = 0;
  for (let k = 0; k < 20; k++) {
    const row = Q.speechPrompt("hear", later, 0).row;
    if (sentenceLemmas(row[0], IX).some((i) => want.has(i))) leaning++;
  }
  const possible = SPEECH.listen[later.id]
    .some((i) => sentenceLemmas(SPEECH.rows[i][0], IX).some((x) => want.has(x)));
  ok(!possible || leaning === 20,
     "every pick contains a lesson word when any pool sentence does", `${leaning}/20`);

  // No pools at all — the web app today — means no speech steps, not blank ones.
  const dry = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice: () => true });
  ok(dry.quizSteps(later, 0).every((q) => q.kind !== "hear" && q.kind !== "say"),
     "without pools a quiz is the eight vocabulary questions");
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

/* Per-word grades from an alignment: what the speech activities hand the scheduler. */
group("speech grading");
{
  const idx = (w) => IX[fold(w)][0];
  const r = compare("Я пью кофе без сахара", "Я пью чай без сахара");
  let g = gradeAlignment(r.alignment, IX, { perfect: false, firstTry: true });
  const by = Object.fromEntries(g.map((x) => [x.i, x.grade]));
  ok(by[idx("чай")] === 1, "a substituted word is Again");
  ok(by[idx("пью")] === 3, "a correct word in an imperfect sentence is Good");
  ok(g.every((x) => x.grade >= 1 && x.grade <= 4 && L[x.i]), "grades are 1–4 on real lemmas");

  g = gradeAlignment(compare("Я пью чай", "Я пью чай").alignment, IX,
                     { perfect: true, firstTry: true });
  ok(g.every((x) => x.grade === 4), "a perfect first attempt is Easy for every word");
  g = gradeAlignment(compare("Я пью чай", "Я пью чай").alignment, IX,
                     { perfect: true, firstTry: false });
  ok(g.every((x) => x.grade === 3), "perfect on a retry is Good, not Easy");

  g = gradeAlignment(compare("Я пью чай очень", "Я пью чай").alignment, IX, {});
  ok(!g.some((x) => x.i === idx("очень")), "an inserted word grades nothing");

  g = gradeAlignment(compare("Я не знаю, не хочу", "Я не знаю, не хочу").alignment, IX,
                     { perfect: false });
  const ne = g.find((x) => x.i === idx("не"));
  ok(g.filter((x) => x.i === idx("не")).length === 1 && ne.grade === 3,
     "a lemma met twice is graded once");
  g = gradeAlignment(compare("Я не знаю, хочу", "Я не знаю, не хочу").alignment, IX, {});
  ok(g.find((x) => x.i === idx("не")).grade === 1,
     "and takes its worst grade — right once and dropped once is Again");

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
    const rec = byBare.get(s.b);
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
  const onDisk = JSON.parse(readFileSync(join(ROOT, "native/assets/data.json"), "utf8"))
    .lemmas.find((x) => x.b === "книга");
  ok(onDisk && onDisk.t === undefined && onDisk.x === undefined,
     "the payload no longer carries a second copy of tables or sentences");
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
