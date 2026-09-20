/* What each lesson has to work with — the brief an author of a listening script
 * needs (§30l).
 *
 * For every lesson on the path it prints the chapter, the unit, the grammar the
 * chapter has introduced by then, the words this lesson adds, and the palette a
 * script may draw on: the words a learner is *guaranteed* to have met by this
 * point. Side quests are optional, so the guarantee is the spine up to here plus
 * this unit's own earlier lessons — never another branch's words.
 *
 *   node tools/lesson_brief.mjs                 -> a summary
 *   node tools/lesson_brief.mjs --out DIR       -> one JSON per chapter
 *   node tools/lesson_brief.mjs --chapter 3     -> that chapter to stdout
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { lessonSize } from "../core/questions.js";
import { firstSense } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = loadPayload(ROOT);
const L = DATA.lemmas, UN = DATA.units, PATH = DATA.path;

/* The scaffolding every sentence needs, free from the first lesson.
 *
 * A rank cutoff was the obvious rule and the wrong one: the hundred commonest
 * lemmas include «любить», «город» and «работать», so a "free" top-100 would
 * have let lesson one write sentences about loving a new city. What is actually
 * free is the closed classes — pronouns, prepositions, conjunctions, question
 * words, the copula — because they carry no meaning a learner is here to
 * acquire and they appear on screen from the first card. Content words are
 * gated, always, and that gate is what makes the passage level-matched. */
export const FREE_WORDS = [
  "я", "ты", "он", "она", "оно", "мы", "вы", "они", "себя",
  "это", "этот", "тот", "такой", "весь", "все", "быть", "нет", "да",
  "мой", "твой", "наш", "ваш", "свой", "его", "её", "их",
  "не", "и", "а", "но", "или", "же", "ли", "бы", "как", "так", "тоже", "также",
  "в", "на", "с", "у", "к", "за", "из", "по", "о", "от", "для", "до", "при", "про",
  "что", "кто", "где", "когда", "какой", "почему", "сколько", "чей",
  "тут", "там", "здесь", "вот", "очень", "ещё", "уже", "только", "чтобы", "если",
];

/* Resolved once against the shipped lemma list; a word the curriculum does not
   carry simply is not free, rather than silently becoming a hole in the gate.
   *Every* lemma with the bare form, not the first: «мой» is two entries and
   «его» three, and taking `findIndex` left the resolver's own choice outside
   the free set — the gate then reported a word as untaught against itself. */
export const FREE = (() => {
  const want = new Set(FREE_WORDS);
  const out = new Set();
  L.forEach((w, i) => { if (want.has(w.b)) out.add(i); });
  return out;
})();

export const STAGES = (() => {
  const out = [];
  PATH.forEach((p) => {
    if (p.c === 0 || !out.length) out.push({ core: UN[p.u], branches: [], cn: p.cn, ch: p.ch });
    else out[out.length - 1].branches.push(UN[p.u]);
  });
  return out;
})();

const stageIndexOf = (u) => STAGES.findIndex((s) => s.core === u || s.branches.includes(u));
export const sizeOf = (u) => lessonSize(stageIndexOf(u));
export const lessonCount = (u) => Math.max(1, Math.ceil(u.w.length / sizeOf(u)));
export const lessonWords = (u, i) => u.w.slice(i * sizeOf(u), (i + 1) * sizeOf(u));

const word = (i) => {
  const w = L[i];
  return { i, b: w.b, w: w.w, p: w.p, e: firstSense(w), full: w.e,
           ...(w.a ? { aspect: w.a, partner: w.pt } : {}) };
};

/* Every lesson in route order, each with the palette it may use. */
export function briefs() {
  const out = [];
  STAGES.forEach((stage, si) => {
    // The spine of every earlier chapter, plus this chapter's spine, is the only
    // vocabulary a learner is certain to hold: branches are optional detours.
    const earlierSpine = STAGES.slice(0, si).flatMap((s) => s.core.w);
    const units = [stage.core, ...stage.branches];
    units.forEach((u) => {
      const n = lessonCount(u);
      for (let li = 0; li < n; li++) {
        const mine = lessonWords(u, li);
        /* A spine lesson's palette is its whole unit, not only the lessons so
           far (2026-09-19). The featured conversations sit at lessons 3 and 5
           of a spine, and at lesson 3 of chapter 1 the strict palette was
           fifteen words, two of them content words — which is why every early
           scene was people asking each other where they were (the owner:
           "non sequitur, borderline without substance"). Thirty words the
           learner meets within the same chapter is the smallest palette a
           conversation can be written in; a branch still gets only the spine
           it hangs off, since a side quest is optional. */
        const own = u.kind === "spine" ? u.w : u.w.slice(0, li * sizeOf(u));
        const base = u.kind === "spine" ? earlierSpine : earlierSpine.concat(stage.core.w);
        const palette = Array.from(new Set(base.concat(own, mine)));
        out.push({
          key: `${u.id}:${li}`,
          chapter: stage.cn, chapterName: stage.ch,
          unit: u.id, unitName: u.name, kind: u.kind,
          lesson: li + 1, of: n,
          grammar: u.g ? { title: u.g.title, body: u.g.body } : null,
          chapterGrammar: stage.core.g ? stage.core.g.title : null,
          newWords: mine.map(word),
          palette: palette.map(word),
          free: Array.from(FREE).map(word),
        });
      }
    });
  });
  return out;
}

/* ------------------------------------------------------------------ CLI */

if (process.argv[1] && process.argv[1].endsWith("lesson_brief.mjs")) {
  const argv = process.argv.slice(2);
  const flag = (name) => { const k = argv.indexOf(name); return k < 0 ? null : argv[k + 1]; };
  const all = briefs();
  const only = flag("--chapter");
  const out = flag("--out");

  if (out) {
    /* Markdown, not JSON. The palette repeated under all 169 lessons came to
       4 MB of near-identical text; written once per unit with each lesson
       carrying only what it adds, the same information is 12 KB and can be
       read straight through. */
    mkdirSync(out, { recursive: true });
    const gloss = (w) => `${w.b} = ${w.e}${w.p === "verb" ? ` (${w.aspect === "perfective" ? "pf" : "impf"})` : ""}`;
    const list = (ws) => ws.map(gloss).join("; ");
    for (const stage of STAGES) {
      const rows = all.filter((b) => b.chapter === stage.cn);
      const before = STAGES.slice(0, STAGES.indexOf(stage)).flatMap((s) => s.core.w).map(word);
      const lines = [];
      lines.push(`# Chapter ${stage.cn} — ${stage.ch}`, "");
      // The same number check_scripts.mjs enforces (maxWords); repeated here
      // because the two files import each other.
      lines.push(`Sentences may run to **${6 + stage.cn} words**. ${rows.length} lessons.`, "");
      lines.push(`## Free in every lesson (closed class, never gated)`, "", list(Array.from(FREE).map(word)), "");
      lines.push(`## Carried in from earlier chapters (their spines)`, "",
                 before.length ? list(before) : "_nothing — this is the first chapter_", "");
      let unit = null;
      for (const b of rows) {
        if (b.unit !== unit) {
          unit = b.unit;
          const u = UN.find((x) => x.id === b.unit);
          const base = u.kind === "spine" ? [] : stage.core.w.map(word);
          lines.push(`---`, "", `## ${b.unitName} (${b.kind}) — ${b.of} lessons`, "");
          if (b.grammar) lines.push(`Grammar card: **${b.grammar.title}** — ${b.grammar.body}`, "");
          if (base.length) lines.push(`Also available throughout this unit (this chapter's spine): ${list(base)}`, "");
        }
        lines.push(`### Lesson ${b.lesson} of ${b.of} — key \`${b.key}\``, "",
                   `New: ${list(b.newWords)}`, "");
      }
      writeFileSync(join(out, `chapter-${String(stage.cn).padStart(2, "0")}.md`), lines.join("\n"), "utf8");
    }
    console.log(`${all.length} lessons in ${STAGES.length} chapters -> ${out}`);
  } else if (only) {
    console.log(JSON.stringify(all.filter((b) => String(b.chapter) === only), null, 1));
  } else {
    for (const stage of STAGES) {
      const rows = all.filter((b) => b.chapter === stage.cn);
      const words = rows.reduce((n, b) => n + b.newWords.length, 0);
      console.log(`ch ${String(stage.cn).padStart(2)}  ${String(rows.length).padStart(3)} lessons  `
                  + `${String(words).padStart(4)} words  palette ${String(rows[rows.length - 1].palette.length).padStart(4)}  ${stage.ch}`);
    }
    console.log(`${all.length} lessons total`);
  }
}
