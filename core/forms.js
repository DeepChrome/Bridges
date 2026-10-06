/* What a word *is*, at the moment you meet it.
 *
 * A learner tapping «книгу» in a sentence is not asking for the dictionary yet. They
 * are asking a smaller question — which word is this, and which form of it? The
 * paradigm tables already hold the answer: the cell that contains the surface form
 * names its own case and number, or person, or tense. Reading the answer back out of
 * the table means there is no second grammatical description to keep in step with the
 * first, which is the same reason panel.py is the only place that builds them.
 *
 * Shared, because the web app and the native app must describe a form identically.
 */

import { fold, firstSense } from "./util.js";

/* Columns that carry no information of their own — the row label is the whole
   answer, so "Present / Future · я" reads better than "я form". */
export const GENERIC_COLUMN = /^(form|forms)?$/i;

/* Which cell of which table holds this surface form.
 *
 * Returns null when the form is not in the paradigm, which is normal and not an
 * error: indeclinables have no tables, and a word may be recognised through the
 * lexicon index without OpenRussian carrying its paradigm. */
export function describeForm(lemma, surface) {
  const target = fold(surface || "");
  if (!target || !lemma || !Array.isArray(lemma.t)) return null;

  for (const table of lemma.t) {
    const columns = table.columns || [];
    for (const row of table.rows || []) {
      // Column 0 is the row's label, never a form.
      for (let ci = 1; ci < row.length; ci++) {
        const cell = row[ci];
        const forms = Array.isArray(cell) ? cell : [cell];
        if (!forms.some((f) => f && fold(f) === target)) continue;

        const label = String(row[0] || "").trim();
        const column = String(columns[ci] || "").trim();
        const generic = GENERIC_COLUMN.test(column);
        return {
          table: table.title,
          label,
          column,
          // "Accusative singular" · "Present / Future · я"
          text: generic
            ? [table.title, label].filter(Boolean).join(" · ")
            : `${label} ${column.toLowerCase()}`.trim(),
        };
      }
    }
  }
  return null;
}

/* A gender as a reader says it. The glance used to show the lexicon's code — a
   lone "f" pill beside "noun" (the walkthrough, 2026-09-30) — while the full
   entry spelled it out from its own copy of this table; one table now. */
export const GENDER_NAMES = { m: "masculine", f: "feminine", n: "neuter", pl: "plural" };

/* The standing grammatical facts about the lemma itself, as short tags. */
export function grammarTags(lemma) {
  if (!lemma) return [];
  /* "other" is OpenRussian's bin for everything that is not a noun, verb or
     adjective — prepositions, particles, numerals — and says nothing to a
     reader («после» flagged "other", the owner, 2026-10-04). Left out. */
  return [lemma.p !== "other" && lemma.p, lemma.g && (GENDER_NAMES[lemma.g] || lemma.g), lemma.a].filter(Boolean);
}

/* Every cell of the word's tables that holds this form — an inanimate noun's
   accusative is its nominative, so «вы́пуск» is honestly both (§26: represent
   the uncertainty, never invent certainty). */
function formCells(lemma, surface) {
  const target = fold(surface || "");
  const out = [];
  if (!target || !lemma || !Array.isArray(lemma.t)) return out;
  for (const table of lemma.t) {
    for (const row of table.rows || []) {
      for (let ci = 1; ci < row.length; ci++) {
        const forms = Array.isArray(row[ci]) ? row[ci] : [row[ci]];
        if (forms.some((f) => f && fold(f) === target)) {
          out.push({ table: table.title || "", label: String(row[0] || "").trim(),
                     column: String((table.columns || [])[ci] || "").trim() });
        }
      }
    }
  }
  return out;
}

const PERSON = {
  "я": ["1st person", "singular"], "ты": ["2nd person", "singular"], "он / она": ["3rd person", "singular"],
  "мы": ["1st person", "plural"], "вы": ["2nd person", "plural"], "они": ["3rd person", "plural"],
};
const PAST_SUBJECT = { "он": "masculine", "она": "feminine", "оно": "neuter", "они": "plural" };
const SHORT = { m: "masculine", f: "feminine", n: "neuter", pl: "plural" };

/* A table's name as a learner reads it. The lexicon calls a verb's personal
   forms "Present / Future", because which one they are depends on the verb:
   an imperfective's are its present («держу́», I hold), a perfective's its
   future («скажу́», I will say) — a perfective has no present. So the heading
   names the one this verb has (the owner, 2026-10-05: "It would just say
   future for perfective and present for imperfective"); a verb that is both
   keeps both. The title itself stays the key every table lookup uses. */
export function tableLabel(title, aspect) {
  if (title !== "Present / Future") return title;
  if (aspect === "perfective") return "Future";
  if (aspect === "imperfective") return "Present";
  return title;
}

/* What one cell says, in words: case and number for a noun, case and
   gender for an adjective, tense, person and number for a verb. */
function cellFlags(lemma, c) {
  const lower = (s) => s.toLowerCase();
  if (c.table === "Present / Future") {
    return [/^perf/i.test(lemma.a || "") ? "future" : "present", ...(PERSON[c.label] || [])];
  }
  if (c.table === "Past") return ["past", PAST_SUBJECT[c.label]].filter(Boolean);
  if (c.table === "Imperative") return ["imperative", c.label === "вы" ? "plural / polite" : "singular"];
  if (c.table === "Short form") return ["short form", SHORT[c.label]].filter(Boolean);
  if (c.table === "Comparison") return [lower(c.label)];
  const col = GENERIC_COLUMN.test(c.column) ? null : lower(c.column);
  return [lower(c.label), col].filter(Boolean);
}

/* The flags for the form that was met: each kind of fact once, alternatives
   joined where the form fits more than one cell ("nominative / accusative").
   Empty when the form is not in the word's tables. */
export function formFlags(lemma, surface) {
  const cells = formCells(lemma, surface);
  if (!cells.length) return [];
  const lists = cells.map((c) => cellFlags(lemma, c));
  const width = Math.max(...lists.map((l) => l.length));
  const out = [];
  for (let k = 0; k < width; k++) {
    const seen = [...new Set(lists.map((l) => l[k]).filter(Boolean))];
    if (seen.length) out.push(seen.join(" / "));
  }
  return out;
}

/* The grammar line drawn right under a word (the owner, 2026-10-04: "part of
   speech, form, case, etc right under the word… with the associated root
   word… Also aspect"): what the word is — its class, gender or aspect, and an
   aspect partner where the lexicon records one — and, when a form of it was
   tapped, which form, read out of the word's own table. One function so the
   glance, the entry and the flashcard say it in the same words. */
export function grammarLine(lemma, surface) {
  if (!lemma) return null;
  const facts = grammarTags(lemma);
  const partner = lemma.p === "verb" && lemma.pt && lemma.a
    ? { label: /^imperf/i.test(lemma.a) ? "perfective" : "imperfective", word: String(lemma.pt).split(/,\s*/)[0] }
    : null;
  const shown = surface && fold(surface) !== fold(lemma.b) ? surface : null;
  const form = shown || surface ? describeForm(lemma, surface) : null;
  return { facts, partner, surface: shown, form, flags: surface ? formFlags(lemma, surface) : [] };
}

/* Everything the first tap should show, and nothing more. The full entry — every
   table, every example sentence — is what the second tap is for. */
export function summarise(lemma, surface) {
  if (!lemma) return null;
  const form = describeForm(lemma, surface);
  const shown = surface && fold(surface) !== fold(lemma.b) ? surface : null;
  return {
    word: lemma.w || lemma.b,
    bare: lemma.b,
    surface: shown,                       // only when it differs from the headword
    gloss: firstSense(lemma) || lemma.e || "",
    tags: grammarTags(lemma),
    form,
    // An unrecognised form is worth saying out loud rather than implying the
    // headword was what appeared on screen.
    known: !!form || !shown,
  };
}
