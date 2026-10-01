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
  return [lemma.p, lemma.g && (GENDER_NAMES[lemma.g] || lemma.g), lemma.a].filter(Boolean);
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
