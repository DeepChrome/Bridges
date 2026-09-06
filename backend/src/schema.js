/* The shape a feedback reply must have, enforced before anything reaches the app.
 *
 * Hand-rolled rather than a JSON-schema library: the schema is small, the Worker
 * has no dependencies, and an error message that names the field beats a generic
 * validator's. Tags are checked against core/errortags.js — the same closed list
 * the app renders and the trouble bank counts — so the model cannot invent one.
 */

import { isTag } from "../../core/errortags.js";

const STATUSES = ["ok", "sub", "del", "ins"];
const OVERALL = ["ok", "minor", "major"];
const NOTE_WORDS = 20;
const PRAISE_WORDS = 12;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const isStr = (x) => typeof x === "string";
const strOrNull = (x) => x === null || isStr(x);

/* -> { ok: true, value } or { ok: false, errors: [string] } */
export function validate(raw) {
  const errors = [];
  const bad = (m) => { errors.push(m); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["reply is not an object"] };
  }

  if (!Array.isArray(raw.words)) bad("words: not an array");
  else raw.words.forEach((w, i) => {
    if (!w || typeof w !== "object") return bad(`words[${i}]: not an object`);
    if (!strOrNull(w.said)) bad(`words[${i}].said: not a string or null`);
    if (!strOrNull(w.expected)) bad(`words[${i}].expected: not a string or null`);
    if (!isStr(w.lemma)) bad(`words[${i}].lemma: not a string`);
    if (!STATUSES.includes(w.status)) bad(`words[${i}].status: ${JSON.stringify(w.status)}`);
    if (!Array.isArray(w.tags)) bad(`words[${i}].tags: not an array`);
    else w.tags.forEach((t) => { if (!isTag(t)) bad(`words[${i}].tags: unknown tag ${JSON.stringify(t)}`); });
  });

  if (!Array.isArray(raw.grammar)) bad("grammar: not an array");
  else raw.grammar.forEach((g, i) => {
    if (!g || typeof g !== "object") return bad(`grammar[${i}]: not an object`);
    if (!isTag(g.tag)) bad(`grammar[${i}].tag: unknown tag ${JSON.stringify(g.tag)}`);
    if (!isStr(g.note)) bad(`grammar[${i}].note: not a string`);
    else if (words(g.note) > NOTE_WORDS) bad(`grammar[${i}].note: over ${NOTE_WORDS} words`);
  });

  if (!Array.isArray(raw.wordChoice)) bad("wordChoice: not an array");
  else raw.wordChoice.forEach((c, i) => {
    if (!c || typeof c !== "object") return bad(`wordChoice[${i}]: not an object`);
    if (!isStr(c.said)) bad(`wordChoice[${i}].said: not a string`);
    if (!isStr(c.better)) bad(`wordChoice[${i}].better: not a string`);
    if (!isStr(c.note)) bad(`wordChoice[${i}].note: not a string`);
    else if (words(c.note) > NOTE_WORDS) bad(`wordChoice[${i}].note: over ${NOTE_WORDS} words`);
  });

  if (!OVERALL.includes(raw.overall)) bad(`overall: ${JSON.stringify(raw.overall)}`);

  if (raw.praise === undefined || raw.praise === null) raw.praise = "";
  if (!isStr(raw.praise)) bad("praise: not a string");
  else if (words(raw.praise) > PRAISE_WORDS) bad(`praise: over ${PRAISE_WORDS} words`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      words: raw.words, grammar: raw.grammar, wordChoice: raw.wordChoice,
      overall: raw.overall, praise: raw.praise,
    },
  };
}

/* Models wrap JSON in prose or fences despite instructions; take the outermost
   object. Returns null when there is no parseable object at all. */
export function extractJson(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}
