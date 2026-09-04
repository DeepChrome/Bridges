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
import { fsrsReview, fsrsPreview, isTrouble, retrievability } from "../core/fsrs.js";
import { makeQuestions, DRILL_TYPES } from "../core/questions.js";
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
const Q = makeQuestions({ L, IX, UN, STAGES, lessonWords, lessonCount, hasVoice: () => true });

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
  ok(quiz.length === 8, "a lesson quiz is 8 questions", String(quiz.length));
  ok(quiz.every((q) => q.options || q.typed || q.pairs),
     "every quiz question is answerable");
  ok(quiz.every((q) => !q.options || q.options.filter((o) => o.right).length === 1),
     "each has exactly one right answer");
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
  ok(all.every((q) => q.options || q.typed || q.pairs),
     "and offers a way to answer");
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
