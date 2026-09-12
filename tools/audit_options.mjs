/* How guessable is a multiple-choice question without knowing the Russian?
 *
 * The owner, 2026-09-11: *"selecting the perfective pair is obvious because one
 * option usually shares the root word. We need more plausible distractors or a
 * different mechanism… make sure our multiple choice options throughout aren't
 * brainless."*
 *
 * A question is brainless when something other than the meaning picks the answer
 * out. This draws a large sample from every generator and counts the tells a
 * learner would use without knowing anything:
 *
 *   root      the answer shares a long stem with the prompt and no distractor
 *             does — the aspect pair, exactly as he describes it
 *   alone     the answer is the only option of its word class (the tell §30o
 *             measured for the quiz: 23.7 % before it was fixed)
 *   length    the answer is the longest or shortest by a clear margin
 *   script    the answer is the only one in Cyrillic, or the only one not
 *   shape     the answer is the only option ending as the asked-for form does
 *   dupes     two options that are the same word (a free elimination)
 *
 * It reports per generator, because the fix differs per generator. `--sample`
 * sets how many questions to draw; `--show cases` prints examples of the worst.
 *
 * This measures guessability, not difficulty. A question can be perfectly fair
 * and still hard; what it must not be is answerable by shape alone.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "./payload.mjs";
import { makeQuestions, DRILL_TYPES, lessonSize } from "../core/questions.js";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { fold } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const SAMPLE = parseInt(arg("--sample", "400"), 10);
const SHOW = arg("--show", null);

const data = loadPayload(ROOT);
const L = data.lemmas;

/* The drills read `w.t` and `w.x` straight off the lemma, and both are rebuilt
   on the way in rather than shipped (P9.24). Without this the paradigm drills
   generate nothing at all and the audit reports on three of the six. */
const DEEP_BY_BARE = makeDeepIndex(parseDeep(data.deep || ""));
const hydrate = makeHydrator({
  deepIndex: () => DEEP_BY_BARE, shapes: data.shapes, slots: data.slots, sent: data.sent,
});
L.forEach(hydrate);

/* The same wiring core.test.mjs uses: the generators want the chapters and the
   lesson slicing, which live in the app rather than in the payload. */
const STAGES = (() => {
  const out = [];
  data.path.forEach((p) => {
    if (p.c === 0 || !out.length) {
      out.push({ core: data.units[p.u], branches: [], n: p.cn || out.length + 1, title: p.ch || "" });
    } else {
      out[out.length - 1].branches.push(data.units[p.u]);
    }
  });
  return out;
})();
const stageIndex = (u) => Math.max(0, STAGES.findIndex(
  (s) => s.core.id === u.id || s.branches.some((b) => b.id === u.id)));
const sizeOf = (u) => lessonSize(stageIndex(u));
const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u)));
const lessonWords = (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u));

const Q = makeQuestions({
  L, IX: data.index, UN: data.units, STAGES, lessonWords, lessonCount,
  SPEECH: data.speech, SCRIPTS: data.scripts || {}, hasVoice: () => true,
});

const bare = (s) => fold(String(s || ""));
const isCyr = (s) => /[а-яё]/i.test(String(s || ""));

/* How much two Russian words look alike — which is not the same as how much
 * they share from the left.
 *
 * The first cut of this counted the common leading prefix, and it was wrong
 * about Russian: «вступить» and «выступать» share one letter at the front and
 * the whole of their root, and to a learner choosing between them by shape they
 * are as alike as two words get. Counting from the left called them unrelated
 * and so called a perfectly fair question a giveaway.
 *
 * So: the longer of the common prefix and the common prefix of the two stems,
 * a stem being the word with any verbal prefix and the reflexive «-ся» taken
 * off. The prefix list is the audit's own copy; core/questions.js owns the one
 * the generator uses, and they are allowed to drift — this one only has to be
 * good enough to judge.
 */
const common = (x, y) => {
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
};

/* The longest run of letters two words share, ignoring the infinitive ending.
 * Prefix-stripping was tried first and is ambiguous in Russian — «вступать»
 * loses «вс» and «наступать» loses «на», so one root becomes two stems. The
 * ending is not ambiguous, and cutting it is what stops every pair of
 * infinitives looking related through «-вать». */
const verbStem = (w) => bare(w).replace(/(ться|тся|ть|ти|чь)$/, "");
function run(a, b) {
  const x = verbStem(a), y = verbStem(b);
  let best = 0;
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      let n = 0;
      while (i + n < x.length && j + n < y.length && x[i + n] === y[j + n]) n++;
      if (n > best) best = n;
    }
  }
  return best;
}
const shared = (a, b) => Math.max(common(bare(a), bare(b)), run(a, b));

/* The lemma behind an option label, when the label is a word we ship. */
const byForm = new Map();
for (let i = 0; i < L.length; i++) byForm.set(bare(L[i].b), i);
const posOf = (label) => {
  const i = byForm.get(bare(label));
  return i === undefined ? null : L[i].p;
};

function tells(q) {
  const opts = (q.options || []).map((o) => o.label);
  if (opts.length < 2) return null;
  const right = (q.options.find((o) => o.right) || {}).label;
  if (right === undefined) return null;
  const wrong = opts.filter((o) => o !== right);
  const out = [];

  // root: the answer is the only option built on the prompt's stem.
  if (q.prompt && isCyr(q.prompt) && isCyr(right)) {
    const mine = shared(q.prompt, right);
    const theirs = Math.max(0, ...wrong.map((w) => shared(q.prompt, w)));
    if (mine >= 4 && mine - theirs >= 2) out.push("root");
  }

  // alone: the only option of its word class, where the classes are known.
  const classes = opts.map(posOf);
  const rp = posOf(right);
  if (rp && classes.filter(Boolean).length >= 3
      && !wrong.some((w) => posOf(w) === rp)) out.push("alone");

  // length: longer or shorter than every distractor by three characters.
  const len = (s) => bare(s).length;
  if (wrong.length && (len(right) - Math.max(...wrong.map(len)) >= 3
                       || Math.min(...wrong.map(len)) - len(right) >= 3)) out.push("length");

  // script: the only Cyrillic option, or the only Latin one.
  const cyr = opts.filter(isCyr).length;
  if ((isCyr(right) && cyr === 1) || (!isCyr(right) && cyr === opts.length - 1)) out.push("script");

  /* same: two options that mean the same thing, differing only in how they are
     written. A scene's wrong answers are other sentences' English, and the
     collection holds one English over two Russian sentences often enough to
     matter — «Он наконец нашёл работу» and «Она наконец нашла работу» share a
     translation, so one of them appears as a wrong answer to the other and is
     not wrong. Exact-match filtering does not see it through a full stop. */
  /* Lower-cased and stripped of punctuation, but **not folded**: folding takes
     the stress mark off, and the stress drill's options are one word with the
     stress in four places. That is the third time a metric here has been caught
     folding away the thing being tested. */
  const plain = (s) => String(s).toLowerCase().replace(/[.,!?;:"'«»]/g, "").replace(/\s+/g, " ").trim();
  if (wrong.some((w) => plain(w) === plain(right))) out.push("same");

  /* dupes: two options that read the same **on screen**.
     Not folded: folding strips the stress mark, and the stress drill's whole
     question is which vowel carries it — «сто́ла» and «стола́» are two different
     answers and comparing them folded said every stress question was broken.
     A metric that cannot tell the skill from the flaw is worse than none. */
  const seen = new Set();
  for (const o of opts) {
    const s = String(o).trim();
    if (seen.has(s)) { out.push("dupes"); break; }
    seen.add(s);
  }

  /* kin: how many distractors are built on the prompt's own stem. Not a tell in
     itself — it is the opposite, the measure of whether the wrong answers are
     even in the running. A paradigm question draws them from the word's own
     table and scores 3; the aspect pair draws them from unrelated verbs and
     scores 0, which is what makes its answer the only word that looks like the
     prompt at all. */
  let kin = null;
  if (q.prompt && isCyr(q.prompt) && wrong.every(isCyr)) {
    kin = wrong.filter((w) => shared(q.prompt, w) >= 4).length;
  }
  return { tells: out, q, right, wrong, kin };
}

function sampleDrill(type) {
  const out = [];
  while (out.length < SAMPLE) {
    const got = Q.drillQuestions(type, Math.min(40, SAMPLE - out.length));
    if (!got.length) break;
    out.push(...got);
  }
  return out;
}

function sampleQuiz() {
  const out = [];
  for (let pass = 0; out.length < SAMPLE * 4 && pass < 12; pass++) {
    for (const u of data.units) {
      for (let i = 0; i < lessonCount(u) && out.length < SAMPLE * 4; i++) {
        for (const q of Q.quizSteps(u, i) || []) out.push(q);
      }
    }
  }
  return out;
}

const TELLS = ["root", "alone", "length", "script", "dupes", "same"];

/* A scene is one step holding five questions of its own, so its options were
   invisible to this until now — the very place a second correct answer was
   known to be hiding (ROADMAP P12.5). */
const flatten = (qs) => qs.flatMap((q) => (Array.isArray(q.questions)
  ? q.questions.map((sub) => ({ ...sub, kind: q.kind, prompt: sub.prompt || "",
                                authored: !!q.scenario }))
  : [q]));

function report(name, questions) {
  const mc = flatten(questions).filter((q) => q.options && q.options.length >= 2);
  if (!mc.length) return null;
  const rows = mc.map(tells).filter(Boolean);
  const counts = Object.fromEntries(TELLS.map((t) => [t, 0]));
  let any = 0;
  for (const r of rows) {
    if (r.tells.length) any++;
    for (const t of r.tells) counts[t]++;
  }
  const withKin = rows.filter((r) => r.kin !== null);
  const kin = withKin.length
    ? (withKin.reduce((a, r) => a + r.kin, 0) / withKin.length).toFixed(1)
    : " - ";
  const pct = (n) => `${((n / rows.length) * 100).toFixed(0)}%`.padStart(4);
  console.log(`${name.padEnd(14)} ${String(rows.length).padStart(5)} asked  `
    + TELLS.map((t) => `${t} ${pct(counts[t])}`).join("  ")
    + `   any ${pct(any)}   kin ${String(kin).padStart(3)}/3`);
  /* Where a generator mixes authored options with generated ones — the scene
     does: a written scenario carries five questions somebody wrote, and the
     corpus fallback builds its own from other sentences' English. They fail in
     different ways and a single percentage hides which. */
  const authored = rows.filter((r) => r.q.authored);
  if (authored.length && authored.length < rows.length) {
    const share = (xs, t) => `${((xs.filter((r) => r.tells.includes(t)).length / xs.length) * 100).toFixed(0)}%`;
    console.log(`${"".padEnd(14)} ${String(authored.length).padStart(5)} authored  `
      + TELLS.map((t) => `${t} ${share(authored, t).padStart(4)}`).join("  "));
  } else if (authored.length) {
    console.log(`${"".padEnd(14)}       (all ${authored.length} of them authored, not generated)`);
  }
  return { name, rows, counts, any };
}

console.log(`sampling ~${SAMPLE} questions per generator\n`);
console.log("".padEnd(14) + "        " + "".padEnd(0));

const results = [];
for (const d of DRILL_TYPES) {
  const r = report(d.id, sampleDrill(d.id));
  if (r) results.push(r);
}
const quiz = sampleQuiz();
if (argv.includes("--kinds")) {
  const n = {};
  for (const q of quiz) n[q.kind] = (n[q.kind] || 0) + 1;
  console.log("kinds drawn:", JSON.stringify(n), "\n");
}
const byKind = {};
for (const q of quiz) (byKind[q.kind] = byKind[q.kind] || []).push(q);
for (const kind of Object.keys(byKind).sort()) {
  const r = report(kind, byKind[kind]);
  if (r) results.push(r);
}

if (SHOW) {
  const r = results.find((x) => x.name === SHOW);
  if (!r) console.log(`\nno generator called ${SHOW}`);
  else {
    console.log(`\n${SHOW}: the ones a learner could answer blind\n`);
    for (const row of r.rows.filter((x) => x.tells.length).slice(0, 12)) {
      console.log(`  [${row.tells.join(",")}] ${row.q.ask}`);
      console.log(`     prompt  ${row.q.prompt || "(none)"}`);
      console.log(`     answer  ${row.right}`);
      console.log(`     against ${row.wrong.join(", ")}\n`);
    }
  }
}
