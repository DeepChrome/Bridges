/* The explanation a wrong answer gets without the model (2026-09-29).
 *
 * The owner: *"for anything that relies solely on an AI fix, we need to
 * generate standard incorrect responses. These responses should just provide
 * the correct answer, the relevant rules (with links), and the justification
 * for the correct answer. Keep it organized though and rely on references."*
 *
 * So it is three parts and no prose of its own:
 *
 *   what      which form the answer is — «кни́гу», accusative singular of
 *             «кни́га» — read off the paradigm cell the question was built on;
 *   why       the facts about the word that decide it (core/facts.js), what
 *             breaks the rules first;
 *   rule      the section of the grammar reference that states the rule, so
 *             the justification points at a reference rather than restating it.
 *
 * Nothing here is written about a particular word, and nothing is invented:
 * every line is the word's own paradigm or a sentence core/facts.js already
 * says about any word of its shape. It is what shows when the model is not
 * there — the setting off, the day's allowance spent, no connection — and it
 * is complete on its own.
 */

import { wordFacts } from "./facts.js";
import { topicById } from "./grammar.js";

const cell = (c) => (Array.isArray(c) ? c[0] : c) || "";
const CASES = ["Nominative", "Genitive", "Dative", "Accusative", "Instrumental", "Prepositional"];

/* The reference section a form is taught in: a topic id and a heading that
   exists in core/grammar.js (core.test.mjs holds that they do). */
function sectionFor(kind, table, row, col) {
  const title = (table && table.title) || "";
  if (/Declension/.test(title)) {
    if (kind === "agreement" || (col && /Masculine|Feminine|Neuter/.test(col) && /Plural/.test(String(table.columns)))) {
      return { topic: "adjectives", heading: "It copies its noun" };
    }
    if (col === "Plural") return { topic: "cases", heading: "The plural endings" };
    const c = CASES.find((x) => x === row);
    if (c) return { topic: "cases", heading: c };
  }
  if (/Present/.test(title)) return { topic: "verbs", heading: "Two patterns" };
  if (/Past/.test(title)) return { topic: "verbs", heading: "The past agrees with the subject" };
  if (/Imperative/.test(title)) return { topic: "verbs", heading: "Asking for something" };
  if (kind === "aspect") return { topic: "verbs", heading: "Two aspects" };
  if (kind === "agreement") return { topic: "adjectives", heading: "It copies its noun" };
  return null;
}

/* What the form is, in words a learner reads: "accusative singular",
   "the ты form, present tense". */
function formName(table, row, col) {
  const title = (table && table.title) || "";
  if (/Declension/.test(title)) {
    return [row, col].filter(Boolean).join(" ").toLowerCase();
  }
  if (/Present/.test(title)) return `the ${row} form, ${/Future/.test(title) ? "present or future" : "present"} tense`;
  if (/Past/.test(title)) return `past tense, ${row}`;
  if (/Imperative/.test(title)) return `the imperative, to ${row}`;
  if (/Short/.test(title)) return `the short form, ${row}`;
  if (/Comparison/.test(title)) return String(row || "").toLowerCase();
  return [row, col].filter(Boolean).join(" ").toLowerCase();
}

/* Which facts justify this answer: the rule-breakers always, then the one or
   two facts about the word that the form turns on — gender and stem for a
   noun, the conjugation for a verb, the stem type for an adjective. At most
   three, so it stays a list a learner reads rather than a page. */
function reasons(w, kind) {
  const facts = wordFacts(w);
  const odd = facts.filter((f) => f.irregular);
  const want = kind === "aspect" ? /Perfective|Imperfective/
    : w.p === "verb" ? /conjugation|Stem change|Reflexive/
    : w.p === "noun" ? /Masculine|Feminine|Neuter|stem|Spelling rule|Fleeting|Plural only/
    : w.p === "adjective" ? /stem|Stressed/ : /$^/;
  const rest = facts.filter((f) => !f.irregular && want.test(f.label));
  return odd.concat(rest).slice(0, 3);
}

/* -> { answer, what, why: [{label, note, irregular}], rule: {topic, title, heading} | null }
      or null when there is nothing to say beyond the answer itself. */
export function standardExplanation(q, w) {
  if (!q) return null;
  const answer = q.answer || "";
  let what = null, rule = null;
  if (w && q.table && q.at) {
    const [r, c] = q.at;
    const row = cell(q.table.rows[r] && q.table.rows[r][0]);
    const col = q.table.columns[c];
    what = `«${answer}» is ${formName(q.table, row, col)} of «${w.w || w.b}».`;
    rule = sectionFor(q.kind, q.table, row, col);
  } else if (w && q.kind === "aspect") {
    what = `«${answer}» is the ${w.a === "perfective" ? "imperfective" : "perfective"} partner of «${w.w || w.b}».`;
    rule = sectionFor("aspect");
  } else if (w && w.e && /^(type|choose-ru|choose-en|listen|hear)$/.test(q.kind)) {
    what = `«${w.w || w.b}» means "${String(w.e).split(/[;]/)[0].trim()}".`;
  }
  const why = w ? reasons(w, q.kind) : [];
  if (rule) {
    const topic = topicById(rule.topic);
    rule = topic && topic.sections.some((s) => s.heading === rule.heading)
      ? { topic: topic.id, title: topic.title, heading: rule.heading } : null;
  }
  if (!what && !why.length && !rule) return null;
  return { answer, what, why, rule };
}
