/* The app's own dictionary, handed to the AI with a question about Russian,
 * and the AI's answer checked against it (the owner, 2026-11-23: asked whether
 * «время» was feminine, the answer called it «време», neuter in -е, and held
 * to it when he pointed at the я. "The app already shows correct declension
 * tables, so the tutor should use them.").
 *
 * - `groundQuestion` looks up every Russian word the learner wrote, and the
 *   word on screen: headword, part of speech, gender, which cell the written
 *   form is, the facts the entry states (core/facts.js), and the full tables
 *   (about.js tablesText). A word the dictionary does not have goes as
 *   `notWords` — usually the learner's guess, «времы».
 * - `unknownIn` is what the answer wrote in Cyrillic that the dictionary does
 *   not recognise and the learner did not write themselves. The sparkle asks
 *   once more over those (askai.js); what is still unknown is said under the
 *   answer rather than passed off as checked.
 */

import { TOKEN, fold } from "@core/util";
import { describeForm, GENDER_NAMES } from "@core/forms";
import { wordFacts } from "@core/facts";
import { entryOf, linkable } from "./words";
import { tablesText } from "./about";

/* Words looked up for one question: enough for "время or времени?" and the
   word on screen, few enough that every table fits (backend ask.js
   DICTIONARY_CHARS). */
const MAX_WORDS = 4;
const tokens = (s) => String(s || "").match(TOKEN) || [];

export function groundQuestion(question, about = {}) {
  const seen = new Set();
  const asked = [];
  const add = (tok) => {
    const k = fold(tok);
    if (!k || seen.has(k)) return;
    seen.add(k);
    asked.push(tok);
  };
  // The learner's own words first, the longer (the content words) before the
  // little ones; then the word the screen is about.
  tokens(question).slice().sort((a, b) => b.length - a.length).forEach(add);
  tokens(about.word).forEach(add);
  const dictionary = [], notWords = [];
  for (const tok of asked) {
    if (dictionary.length >= MAX_WORDS) break;
    const e = entryOf(tok);
    if (!e || !e.w) {
      if (tok.length > 1) notWords.push(tok);
      continue;
    }
    const w = e.w;
    const cell = describeForm(w, tok);
    dictionary.push({
      asked: tok, word: w.w, pos: w.p, gender: GENDER_NAMES[w.g] || undefined,
      form: cell ? cell.text : undefined,
      facts: wordFacts(w).slice(0, 4).map((f) => `${f.label}: ${f.note}`),
      tables: tablesText(w.t),
    });
  }
  return { dictionary, notWords };
}

/* The Cyrillic words of an answer that nothing vouches for: not a form the
   dictionary links, not a word the learner wrote, not in a table that was
   sent. */
export function unknownIn(answer, question, grounded) {
  const ok = new Set(tokens(question).map(fold));
  for (const d of (grounded && grounded.dictionary) || []) for (const t of tokens(d.tables)) ok.add(fold(t));
  const out = [];
  const text = String(answer || "");
  for (const m of text.matchAll(TOKEN)) {
    const tok = m[0], k = fold(tok);
    // An ending («-ов») is not a word, and a name («Те́дди») is not in a
    // dictionary of words.
    if (text[m.index - 1] === "-" || tok[0] !== tok[0].toLowerCase()) continue;
    if (ok.has(k) || linkable(tok)) continue;
    ok.add(k);
    out.push(tok);
  }
  return out;
}
