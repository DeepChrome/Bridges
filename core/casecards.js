/* Case cards: flashcards on the cases, each about one thing, asked in many
 * ways (the owner, 2026-11-23, replacing the paths of three or four cards he
 * tried the same day: "just stick to flashcards similar to the vocab/sentence
 * flashcards except they can all target different parts of cases. Create a
 * LOT of options… prioritize the vocabulary words that the user is familiar
 * with… especially ones where the user has maybe a high recall but a low case
 * performance. Make sure the cards go multiple directions").
 *
 * What a card is about is one of four kinds of thing:
 *   - a trigger (core/triggers.js): «за» meaning behind, «помога́ть»;
 *   - an ending rule (core/caserules.js): the genitive plural of «стол» words;
 *   - a counting rule, or the question a case answers;
 *   - one word's own forms: «кни́га» in the instrumental.
 * The first three each keep an FSRS card in `st.caseCards` under their key
 * (a trigger's id; `end:`, `count:`, `q:` for the rest), so what is due comes
 * back. A word's forms are its "Cases & forms" score (§30by), and the words
 * asked are drawn by how well the learner knows the word against how well
 * they know its forms (`words`, weighted by the screen).
 *
 * Pure: handed the sentences sorted under each trigger (core/questions.js
 * triggerSightings), the learner's cards and words, and a few lookups into
 * the lexicon (`lex`), it returns plain cards. Drawing, checking by touch and
 * saving are the screen's.
 *
 * A card is `{ type, key, check, front, back, … }`:
 *   check   "case" (a tap on one of the five), "choice" (`options`), or
 *           "self" (Show, then the learner's grade)
 *   answer  the case id, for a "case" card
 *   front   { big, sentence: { s, gap }, pills, sub }
 *   back    { answer, speak, line, table, at, headword, example }
 *   word    the word whose forms score a grade moves, or null
 *   s       the real sentence it is built on, if any
 */

import { TRIGGERS, TEACH_ORDER, triggerById, siblingsOf, triggerKind } from "./triggers.js";
import { CASES, caseById } from "./cases.js";
import { ENDING_RULES, COUNT_RULES, COUNT_CHOICES, CASE_QUESTIONS, fits, cellOf, rowOfCase } from "./caserules.js";
import { isDue, retrievability, review } from "./scheduler.js";
import { fold, TOKEN } from "./util.js";

/* A trigger is offered once it has this many sentences, so its cards range
   over many words rather than circling a few. */
export const MIN_SENTENCES = 8;
/* Cards dealt at a time; the stack deals more when they run out. */
export const DEAL = 10;
/* New things (triggers, rules) met in one deal at most, the first and after. */
const NEW_FIRST = 3, NEW_AFTER = 2;
/* Sentences remembered as shown, so the next deals draw others first. */
const RECENT_KEPT = 200;

/* Every kind of card, with how often it is dealt against the others. `about`
   says what it is about, for the options: one trigger practised on its own
   keeps only the trigger cards. */
export const CARD_TYPES = [
  { id: "trigger-case", name: "Trigger → case", about: "trigger", weight: 1 },
  { id: "case-trigger", name: "Case → trigger", about: "trigger", weight: 0.9 },
  { id: "trigger-meaning", name: "Trigger → meaning", about: "trigger", weight: 0.6 },
  { id: "sentence-case", name: "Sentence → case", about: "trigger", weight: 1.2 },
  { id: "sentence-why", name: "What sets the case", about: "trigger", weight: 0.8 },
  { id: "gap", name: "Fill the gap", about: "trigger", weight: 1.2 },
  { id: "phrase", name: "Build the phrase", about: "trigger", weight: 0.8 },
  { id: "make-case", name: "Word → case form", about: "word", weight: 1.5 },
  { id: "form-case", name: "Form → case", about: "word", weight: 1 },
  { id: "ending", name: "Case → ending", about: "rule", weight: 1 },
  { id: "ending-case", name: "Ending → case", about: "rule", weight: 0.6 },
  { id: "counting", name: "Counting", about: "rule", weight: 0.6 },
  { id: "question", name: "Question words", about: "rule", weight: 0.5 },
];
/* What a learner sees of a number. */
export const NUMBERS = [{ id: "sg", name: "Singular" }, { id: "pl", name: "Plural" }];

const caseName = (id) => (caseById(id) || {}).name || id;

/* The triggers with enough sentences to make cards, in teaching order. */
export function offered(sightings) {
  const ok = new Set(TRIGGERS.filter((x) => ((sightings && sightings[x.id]) || []).length >= MIN_SENTENCES)
    .map((x) => x.id));
  return TEACH_ORDER.filter((id) => ok.has(id)).map(triggerById);
}

/* ------------------------------------------------------------ sentences */

/* The phrase a trigger and its noun make, in the sentence's own order, with
   whatever stood between them («без мое́й сестры́»). Lifted from the start of
   a sentence it keeps no capital. */
function phraseOf(s) {
  const spans = [...s.ru.matchAll(TOKEN)];
  if (s.j < 0 || !spans[s.j] || !spans[s.k]) return s.said;
  const [a, b] = s.j < s.k ? [s.j, s.k] : [s.k, s.j];
  const phrase = s.ru.slice(spans[a].index, spans[b].index + spans[b][0].length);
  return a === 0 ? phrase[0].toLowerCase() + phrase.slice(1) : phrase;
}

/* One sentence from a trigger's list: never one used this deal, not one shown
   lately where there is another, the easier and the better-known words first,
   shuffled a little so two deals differ. */
function pickSighting(list, ctx, pred) {
  let best = null, bestScore = Infinity;
  for (const s of list) {
    if (ctx.usedRu.has(s.ru) || (pred && !pred(s))) continue;
    const score = s.ease - 4 * Math.min(1, ctx.known(s.i)) + (ctx.recent.has(s.ru) ? 50 : 0)
      + (ctx.usedWords.has(s.i) ? 20 : 0) + ctx.rng() * 6;
    if (score < bestScore) { best = s; bestScore = score; }
  }
  return best;
}

/* ------------------------------------------------------------ the cards
 *
 * Every card says what it asks (`front.ask`), and every back says the rule
 * that makes the answer right, in a sentence (`back.why`), with an example in
 * Russian and English and the noun's table where there is a noun (the owner,
 * 2026-11-23: "confusing what's even being asked but more confusing that we
 * don't know the rule that makes the answer correct"; "the learner needs the
 * ability to review why they were wrong"). A wrong pick says what it would
 * have been (`misses`, keyed by the case or the option picked). Russian in a
 * sentence goes in «guillemets», which the screen draws loud (ui.js Marked).
 */

const lower = (id) => caseName(id).toLowerCase();
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const numName = (n) => (n === "pl" ? "plural" : n === "sg" ? "singular" : "");
const meaningOf = (ctx, i) => (ctx.lex.meaning && i !== undefined && i !== null ? ctx.lex.meaning(i) || null : null);

const titleOf = (x, s, lex) => {
  if (x.words) return x.words[0];
  if (x.preds) return s ? s.gov.toLowerCase() : x.preds[0];
  if (x.verbs) return s ? lex.lemma(s.gov) : lex.stress(x.verbs[0]);
  return s ? `${lex.lemma(s.gov)} + …` : x.gov === "noun" ? "noun + …" : "verb + …";
};

/* The rule a trigger is, as a sentence. */
function triggerWhy(x, s, lex) {
  const c = lower(x.case);
  if (x.words) return `«${x.words[0]}» meaning ${x.en} takes the ${c}. It answers «${x.ask}».`;
  if (x.preds) return `With «${s ? s.gov.toLowerCase() : x.preds[0]}» (${x.en}), the person it is about is in the ${c}.`;
  if (x.verbs) return `«${titleOf(x, s, lex)}» (${x.en}) takes the ${c}.`;
  const g = s ? lex.lemma(s.gov) : null;
  if (x.gov === "noun") return `A noun that belongs to another noun${g ? ` (here after «${g}»)` : ""} is in the genitive: 'of'.`;
  return `A verb's direct object${g ? `, here of «${g}»,` : ""} is in the accusative.`;
}
/* What the marked noun is: «до́ме» is «дом» (house) in the prepositional
   singular. */
function nounLine(s, ctx) {
  const w = ctx.lex.word(s.i);
  if (!w) return null;
  const m = meaningOf(ctx, s.i);
  const num = s.pronoun ? "" : ` ${numName(s.plural ? "pl" : "sg")}`;
  return `«${s.said}» is «${w.w}»${m ? ` (${m})` : ""} in the ${lower(s.trigger ? triggerById(s.trigger).case : "")}${num}.`;
}
const exampleOf = (s) => ({ ru: s.ru, en: s.en, hl: [s.token, s.gov] });
const sentenceNum = (s) => (s.pronoun ? null : s.plural ? "pl" : "sg");

/* A wrong case, for a card with a noun: what the noun would have been in the
   case picked, read off its own table. */
function caseMisses(t, at, answer) {
  const out = {};
  if (!t || !at) return out;
  const rightCell = (t.rows[at[0]] || [])[at[1]] || [];
  for (const c of CASES) {
    if (c.id === answer) continue;
    const row = t.rows.find((r) => r[0] === c.row);
    const cell = row && row[at[1]];
    if (!cell || !cell.length) continue;
    out[c.id] = cell.some((f) => rightCell.some((g) => fold(f) === fold(g)))
      ? `«${cell[0]}» looks the same in the ${c.name.toLowerCase()}; here the word in front decides it is the ${lower(answer)}.`
      : `In the ${c.name.toLowerCase()} it would be «${cell[0]}».`;
  }
  return out;
}
const withTable = (back, s, w) => ({ ...back, table: s.table, at: s.at, headword: w ? w.w : null });

/* Four options, the right one among them, in an order that says nothing. */
function optionsOf(right, wrong, rng) {
  const all = [{ label: right, right: true }].concat(wrong.map((label) => ({ label, right: false })));
  for (let k = all.length - 1; k > 0; k--) { const m = Math.floor(rng() * (k + 1)); [all[k], all[m]] = [all[m], all[k]]; }
  return all;
}
function threeFrom(list, not, rng) {
  const seen = new Set(not.map(fold));
  const out = [];
  const pool = list.slice();
  while (pool.length && out.length < 3) {
    const v = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (v && !seen.has(fold(v))) { seen.add(fold(v)); out.push(v); }
  }
  return out.length === 3 ? out : null;
}

/* Cases a preposition also takes in a use the catalogue does not list, so it
   is never offered as the wrong answer for them: «под стол» (motion), «о
   сте́ну», «по по́яс», «с неде́лю», «ме́жду двух огне́й». */
const ALSO = { "под": ["accusative"], "о": ["accusative"], "об": ["accusative"], "по": ["accusative", "prepositional"],
               "с": ["accusative"], "между": ["genitive"] };
/* Every trigger word and «на́до»-like word, so a "what makes it this case?"
   card never offers another governor as a wrong answer. */
const GOVERNORS = new Set(TRIGGERS.flatMap((x) => (x.words || []).concat(x.preds || [])));
/* The cases a word takes, for a wrong option on "which takes it?". */
const casesOfWord = (w) => [...new Set(TRIGGERS.filter((y) => (y.words || y.verbs || y.preds || []).includes(fold(w)))
  .map((y) => lower(y.case)).concat((ALSO[fold(w)] || []).map(lower)))];

const TRIGGER_MAKERS = {
  /* The trigger → which case. A verb trigger shows the verb this sentence
     used, so the cards range across all of «дава́ть», «показа́ть», «купи́ть». */
  "trigger-case": (x, ctx) => {
    const s = pickSighting(ctx.sightings[x.id], ctx);
    if (!s) return null;
    const w = ctx.lex.word(s.i);
    return { check: "case", answer: x.case, s,
             front: { ask: x.gov ? "Which case is the noun after it?" : "Which case does it take?",
                      big: titleOf(x, s, ctx.lex), sub: x.words ? x.en : null },
             back: withTable({ line: { case: x.case }, why: [triggerWhy(x, s, ctx.lex), nounLine(s, ctx)],
                               example: exampleOf(s), speak: s.ru }, s, w),
             misses: caseMisses(s.table, s.at, x.case) };
  },
  /* The case → which of four words takes it. The wrong ones never take it in
     any meaning, so «за» is right for the instrumental and never wrong for it. */
  "case-trigger": (x, ctx) => {
    if (x.gov) return null;
    const s = pickSighting(ctx.sightings[x.id], ctx);
    if (!s) return null;
    const right = titleOf(x, s, ctx.lex);
    const takes = new Set(TRIGGERS.filter((y) => y.case === x.case).flatMap((y) => y.words || y.verbs || y.preds || [])
      .concat(Object.keys(ALSO).filter((w) => ALSO[w].includes(x.case))));
    const asVerb = !x.words;
    const wrong = threeFrom(TRIGGERS.filter((y) => y.case !== x.case && (asVerb ? y.verbs : y.words && triggerKind(y) === triggerKind(x))
                                                 && !(x.case === "genitive" && y.id === "davat"))
      .flatMap((y) => (asVerb ? y.verbs : y.words).filter((w) => !takes.has(w)).slice(0, asVerb ? 2 : 1))
      .map((w) => (asVerb ? ctx.lex.stress(w) : w)), [right], ctx.rng);
    if (!wrong) return null;
    const misses = {};
    for (const w of wrong) {
      const cs = casesOfWord(w);
      if (cs.length) misses[w] = `«${w}» takes the ${cs.join(" or ")}, not the ${lower(x.case)}.`;
    }
    return { check: "choice", options: optionsOf(right, wrong, ctx.rng), s, misses,
             front: { ask: "Which of these takes this case?", big: caseName(x.case) },
             back: withTable({ line: { case: x.case }, why: [triggerWhy(x, s, ctx.lex)], example: exampleOf(s), speak: s.ru },
                             s, ctx.lex.word(s.i)) };
  },
  /* A preposition and its case → what it means: «за» + instrumental is
     behind, + accusative for. The sibling's meaning is always among the
     wrong ones, since telling the two apart is the point. */
  "trigger-meaning": (x, ctx) => {
    if (triggerKind(x) !== "prep" || !x.words) return null;
    const s = pickSighting(ctx.sightings[x.id], ctx);
    if (!s) return null;
    const sibs = siblingsOf(x).map((y) => y.en);
    // «в» + prepositional is "in (where)" and "in (a month)" both: neither may
    // stand as the other's wrong answer.
    const twin = (y) => y.case === x.case && ((y.words || []).some((w) => x.words.includes(w)) || y.ask === x.ask);
    const others = TRIGGERS.filter((y) => y !== x && triggerKind(y) === "prep" && !sibs.includes(y.en) && !twin(y))
      .map((y) => y.en);
    const wrong = sibs.slice(0, 1).concat(threeFrom(others, [x.en].concat(sibs), ctx.rng) || []).slice(0, 3);
    if (wrong.length < 3) return null;
    const misses = {};
    for (const m of wrong) {
      const y = TRIGGERS.find((z) => z.en === m);
      if (y) misses[m] = `'${m}' is «${y.words ? y.words[0] : ""}» with the ${lower(y.case)}.`;
    }
    return { check: "choice", options: optionsOf(x.en, wrong, ctx.rng), s, misses,
             front: { ask: "What does it mean with this case?", big: x.words[0], pills: [caseName(x.case)] },
             back: withTable({ line: { case: x.case }, why: [triggerWhy(x, s, ctx.lex)], example: exampleOf(s), speak: s.ru },
                             s, ctx.lex.word(s.i)) };
  },
  /* A real sentence, its noun marked → which case. */
  "sentence-case": (x, ctx) => {
    const s = pickSighting(ctx.sightings[x.id], ctx, ctx.numOk);
    if (!s) return null;
    return { check: "case", answer: x.case, s, word: null,
             front: { ask: "Which case is the coloured word?", sentence: { s }, sub: s.en },
             back: withTable({ line: { case: x.case }, why: [nounLine(s, ctx), triggerWhy(x, s, ctx.lex)],
                               speak: s.ru, linked: true }, s, ctx.lex.word(s.i)),
             misses: caseMisses(s.table, s.at, x.case) };
  },
  /* The sentence and its case → which word makes it that case. The options
     are words of the sentence itself, so it is read, not recognised. */
  "sentence-why": (x, ctx) => {
    const s = pickSighting(ctx.sightings[x.id], ctx, (t) => t.j >= 0 && ctx.numOk(t));
    if (!s) return null;
    const toks = s.ru.match(TOKEN) || [];
    const right = toks[s.j].toLowerCase();
    const others = toks.filter((t, k) => k !== s.k && k !== s.j && !GOVERNORS.has(fold(t))).map((t) => t.toLowerCase());
    const wrong = threeFrom(others, [right, s.token], ctx.rng);
    if (!wrong) return null;
    const misses = Object.fromEntries(wrong.map((w) => [w, `«${w}» does not decide the case of «${s.token}»; «${right}» does.`]));
    return { check: "choice", options: optionsOf(right, wrong, ctx.rng), s, misses,
             front: { ask: `Which word puts the coloured word in the ${lower(x.case)}?`, sentence: { s, plain: true }, sub: s.en },
             back: withTable({ line: { case: x.case }, why: [triggerWhy(x, s, ctx.lex), nounLine(s, ctx)],
                               speak: s.ru, linked: true }, s, ctx.lex.word(s.i)) };
  },
  /* The sentence with a gap, the dictionary form given → the form in place. */
  "gap": (x, ctx) => {
    const s = pickSighting(ctx.sightings[x.id], ctx, ctx.numOk);
    if (!s) return null;
    const w = ctx.lex.word(s.i);
    return { check: "self", s, word: w ? w.b : null,
             front: { ask: "Put the word in the form the gap needs", sentence: { s, gap: true },
                      pills: [w ? w.w : s.token].concat(s.plural ? ["plural"] : []), sub: s.en },
             back: withTable({ answer: s.said, speak: s.ru, line: { case: x.case },
                               why: [triggerWhy(x, s, ctx.lex), nounLine(s, ctx)], example: exampleOf(s) }, s, w) };
  },
  /* The trigger + the dictionary form → the phrase. */
  "phrase": (x, ctx) => {
    const s = pickSighting(ctx.sightings[x.id], ctx, (t) => t.j >= 0 && Math.abs(t.k - t.j) === 1 && ctx.numOk(t));
    if (!s) return null;
    const w = ctx.lex.word(s.i);
    const parts = [s.gov.toLowerCase(), w ? w.w : s.token];
    if (s.j > s.k) parts.reverse();
    const m = meaningOf(ctx, s.i);
    return { check: "self", s, word: w ? w.b : null,
             front: { ask: "Join them in the right form", big: parts.join(" + "),
                      pills: (x.words ? [x.en] : []).concat(s.plural ? ["plural"] : []), sub: m },
             back: withTable({ answer: phraseOf(s), speak: phraseOf(s), line: { case: x.case },
                               why: [triggerWhy(x, s, ctx.lex)], example: exampleOf(s), tableOpen: true }, s, w) };
  },
};

/* The rule a word's cell follows, if any: shown on the back of a word card,
   so the form is seen as a pattern and not a one-off. */
const ruleFor = (w, t, caseId, num) => ENDING_RULES.find((r) => r.case === caseId && r.num === num && fits(r, w, t)) || null;
/* An ending rule, as a sentence: "The prepositional plural ends in «-ах» or
   «-ях», for every noun." */
function ruleSentence(r) {
  const what = `the ${lower(r.case)} ${numName(r.num)}`;
  const how = r.same ? `is the same as the ${r.same.toLowerCase()}`
    : r.zero ? "has no ending: the word just loses its last vowel"
    : `ends in ${r.label.split("/").map((e) => `«${e.trim()}»`).join(" or ")}`;
  // "All nouns:" read as a label nobody asked for; the rule leads with the
  // case and says whom it covers after.
  return `${capital(what)} ${how}${r.who === "all nouns" ? ", for every noun" : ` (${r.who})`}.`;
}
/* A name is not a word to decline on a card: «А́нглия». */
/* …nor is a counting word, which the lexicon files as a noun with a wrong
   table («пять», genitive «пя»). */
const COUNTING = new Set(TRIGGERS.filter((x) => triggerKind(x) === "count").flatMap((x) => x.words || []));
const isName = (w) => w.w[0] !== w.w[0].toLowerCase() || COUNTING.has(fold(w.b));
const declension = (w) => (w && w.t ? w.t.find((t) => /Declension/.test(t.title)) : null);
const cellNum = (t, at) => (/plural/i.test(t.columns[at[1]] || "") ? "pl" : /singular/i.test(t.columns[at[1]] || "") ? "sg" : null);

const WORD_MAKERS = {
  /* A word → its form in a case: «кни́га», instrumental → «кни́гой». */
  "make-case": (i, ctx) => {
    const w = ctx.lex.word(i), t = declension(w);
    if (!t || isName(w)) return null;
    const asks = [];
    for (const c of ctx.cases) for (const num of ctx.numbers) {
      const got = cellOf(t, rowOfCase(c), num);
      if (got) asks.push({ c, num: cellNum(t, got.at), got });
    }
    if (!asks.length) return null;
    const a = asks[Math.floor(ctx.rng() * asks.length)];
    const rule = a.num ? ruleFor(w, t, a.c, a.num) : null;
    const m = meaningOf(ctx, i);
    return { check: "self", word: w.b, i,
             front: { ask: "Put the word in this case", big: w.w, sub: m,
                      pills: [caseName(a.c)].concat(a.num === "pl" ? ["plural"] : []) },
             back: { answer: a.got.cell.join(" / "), speak: a.got.cell[0], table: t, at: a.got.at, headword: w.w, tableOpen: true,
                     line: { case: a.c },
                     why: [rule ? ruleSentence(rule)
                       : `«${w.w}» does not follow the usual pattern here: learn «${a.got.cell[0]}» with it.`] } };
  },
  /* A form, out of a sentence → its case. Only a form that is one case in its
     own table: «кни́ге» is dative or prepositional and is never asked. */
  "form-case": (i, ctx) => {
    const w = ctx.lex.word(i), t = declension(w);
    if (!t || isName(w)) return null;
    const rows = new Map();
    t.rows.forEach((r, ri) => r.slice(1).forEach((cell, ci) => (cell || []).forEach((f, fi) => {
      const key = fold(f);
      if (!rows.has(key)) rows.set(key, { f, cases: new Set(), at: fi === 0 ? [ri, ci + 1] : null });
      rows.get(key).cases.add(r[0]);
    })));
    const ok = [...rows.values()].filter((x) => x.cases.size === 1 && x.at && !x.cases.has("Nominative"))
      .map((x) => ({ ...x, c: CASES.find((c) => c.row === [...x.cases][0]) }))
      .filter((x) => x.c && ctx.cases.includes(x.c.id) && (!cellNum(t, x.at) || ctx.numbers.includes(cellNum(t, x.at))));
    if (!ok.length) return null;
    const x = ok[Math.floor(ctx.rng() * ok.length)];
    const num = cellNum(t, x.at);
    const m = meaningOf(ctx, i);
    const rule = num ? ruleFor(w, t, x.c.id, num) : null;
    return { check: "case", answer: x.c.id, word: w.b, i,
             front: { ask: "Which case is this form?", big: x.f },
             back: { speak: x.f, table: t, at: x.at, headword: w.w, tableOpen: true, line: { case: x.c.id },
                     why: [`«${x.f}» is «${w.w}»${m ? ` (${m})` : ""} in the ${lower(x.c.id)}${num ? ` ${numName(num)}` : ""}.`,
                           rule ? ruleSentence(rule) : null] },
             misses: caseMisses(t, x.at, x.c.id) };
  },
};

/* A noun that follows a rule, from the words the learner knows best first,
   then the course's commonest. */
function exampleFor(rule, ctx) {
  const tryOne = (i) => {
    const w = ctx.lex.word(i), t = declension(w);
    if (!w || w.p !== "noun" || !t || isName(w)) return null;
    const got = fits(rule, w, t);
    return got ? { w, t, got } : null;
  };
  const known = ctx.words.slice().sort((a, b) => b.weight - a.weight + (ctx.rng() - 0.5) * 0.6).map((x) => x.i);
  for (const i of known.concat(ctx.nouns)) {
    if (ctx.usedWords.has(i)) continue;
    const e = tryOne(i);
    if (e) return { ...e, i };
  }
  return null;
}
const wordExample = (e, ctx) => ({ ru: `${e.w.w} → ${e.got.cell[0]}`, en: meaningOf(ctx, e.i) || undefined, hl: [] });

const RULE_MAKERS = {
  /* A case, a number and a kind of noun → the ending, with a word to show it. */
  "ending": (r, ctx) => {
    const e = exampleFor(r, ctx);
    if (!e) return null;
    return { check: "self", i: e.i,
             front: { ask: "Which ending?", big: `${caseName(r.case)} ${numName(r.num)}`, sub: `${capital(r.who)}, like «${e.w.w}»` },
             back: { answer: r.label, speak: e.got.cell[0], line: { case: r.case }, why: [ruleSentence(r)],
                     example: wordExample(e, ctx), table: e.t, at: e.got.at, headword: e.w.w, tableOpen: true } };
  },
  /* An ending → its case: only the endings no other case of a noun has. */
  "ending-case": (r, ctx) => {
    if (!r.cue) return null;
    const e = exampleFor(r, ctx);
    if (!e) return null;
    const misses = {};
    for (const c of CASES) {
      if (c.id === r.case) continue;
      const rules = ENDING_RULES.filter((o) => o.case === c.id && o.num === r.num);
      const ends = [...new Set(rules.filter((o) => o.ends).flatMap((o) => o.label.split("/").map((x) => `«${x.trim()}»`)))];
      const same = [...new Set(rules.filter((o) => o.same).map((o) => o.same.toLowerCase()))];
      const zero = rules.some((o) => o.zero);
      const parts = [];
      if (ends.length) parts.push(`ends in ${ends.join(", ")}`);
      if (zero) parts.push("can have no ending");
      if (same.length) parts.push(`is the same as the ${same.join(" or the ")}`);
      misses[c.id] = `The ${c.name.toLowerCase()} ${numName(r.num)} ${parts.join(", or ") || "ends differently"}.`;
    }
    return { check: "case", answer: r.case, i: e.i, misses,
             front: { ask: "Which case ends like this?", big: r.cue, sub: `A noun's ending, ${numName(r.num)}` },
             back: { line: { case: r.case }, why: [ruleSentence(r)], example: wordExample(e, ctx), speak: e.got.cell[0],
                     table: e.t, at: e.got.at, headword: e.w.w } };
  },
};

/* A counting rule, asked as which case and number, or as the phrase made from
   a known noun: «три + стол». The number agrees with the noun where it has
   a gender («одна́ ло́жка», «две ло́жки»). */
const NUMBER_FORMS = { "один": { m: "оди́н", f: "одна́", n: "одно́" }, "два": { m: "два", f: "две", n: "два" } };
function counted(word, g) {
  const parts = word.split(" ");
  const last = parts[parts.length - 1];
  const forms = NUMBER_FORMS[fold(last)];
  if (forms) parts[parts.length - 1] = forms[g] || forms.m;
  return parts.join(" ");
}
function countingCard(r, ctx) {
  const right = COUNT_CHOICES.find((c) => c.id === r.wants);
  const row = r.wants.startsWith("nom") ? "Nominative" : "Genitive";
  const num = r.wants.endsWith("pl") ? "pl" : "sg";
  let made = null;
  for (const { i } of ctx.words.slice().sort((a, b) => b.weight - a.weight + (ctx.rng() - 0.5))) {
    const w = ctx.lex.word(i), t = declension(w);
    if (!w || w.p !== "noun" || !t || isName(w) || ctx.usedWords.has(i) || !w.g || w.g === "pl") continue;
    const got = cellOf(t, row, num);
    if (got && /singular/i.test(t.columns[1] || "")) { made = { w, t, got, i, n: counted(r.say, w.g) }; break; }
  }
  const phrase = made ? `${made.n} ${made.got.cell[0]}` : null;
  const back = { why: [r.why], speak: phrase || undefined, line: row === "Genitive" ? { case: "genitive" } : undefined,
                 example: made ? { ru: phrase, en: `${r.en} + ${meaningOf(ctx, made.i) || ""}`.trim(), hl: [] } : undefined,
                 table: made ? made.t : undefined, at: made ? made.got.at : undefined, headword: made ? made.w.w : undefined };
  if (made && ctx.rng() < 0.5) {
    return { check: "self", word: made.w.b, i: made.i,
             front: { ask: "Say them together", big: `${made.n} + ${made.w.w}`, sub: meaningOf(ctx, made.i) },
             back: { ...back, answer: phrase, example: undefined, tableOpen: true } };
  }
  const misses = {};
  for (const c of COUNT_CHOICES) {
    if (c === right) continue;
    const by = COUNT_RULES.filter((o) => o.wants === c.id).map((o) => `«${o.words}»`);
    misses[c.label] = by.length ? `${c.label} comes after ${by.join(" and ")}.` : `${c.label} is not what a number takes.`;
  }
  return { check: "choice", misses,
           options: optionsOf(right.label, COUNT_CHOICES.filter((c) => c !== right).map((c) => c.label), ctx.rng),
           front: { ask: "What form does the noun take after these?", big: `${r.words} + …`, sub: r.note || null },
           back };
}

/* The question a case answers, either way round. */
function questionCard(caseId, ctx) {
  const q = CASE_QUESTIONS[caseId];
  const why = [`«${q}» asks for the ${lower(caseId)}.`];
  if (ctx.rng() < 0.5) {
    const misses = Object.fromEntries(CASES.filter((c) => c.id !== caseId)
      .map((c) => [c.id, `The ${c.name.toLowerCase()} asks «${CASE_QUESTIONS[c.id]}».`]));
    return { check: "case", answer: caseId, misses, front: { ask: "Which case answers this question?", big: q },
             back: { speak: q, line: { case: caseId }, why } };
  }
  return { check: "self", front: { ask: "Which question words ask for this case?", big: caseName(caseId) },
           back: { answer: q, speak: q, line: { case: caseId }, why } };
}

/* -------------------------------------------------------------- the deal */

/* The things of one kind in the order to ask them: what is due, the most
   forgotten first; then new ones in the order given, up to the deal's share;
   then the rest, least recently answered first; and last what this sitting
   has already met. */
function ranked(keys, ctx) {
  const { cards, now } = ctx;
  const met = (k) => ctx.lately.has(k);
  const due = keys.filter((k) => cards[k] && !met(k) && isDue(cards[k], now, 0))
    .sort((a, b) => retrievability(cards[a], now, ctx.schedOpts) - retrievability(cards[b], now, ctx.schedOpts));
  const fresh = keys.filter((k) => !cards[k] && !met(k));
  const rest = keys.filter((k) => cards[k] && !met(k) && !due.includes(k))
    .map((k) => [(cards[k].lastAt || 0) - ctx.rng() * 3 * 86400000, k]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const again = keys.filter(met);
  return { due, fresh, rest, again };
}

/* The next cards of the stack.
     sightings  core/questions.js triggerSightings()
     cards      st.caseCards
     words      [{ i, weight }]: the words to ask about, weighted by the screen
                (a word known well whose forms are not is weighted up)
     nouns      lemma indices to find a rule's example in when `words` has none
     lex        { word(i), index(w), lemma(token), stress(bare) }
     types, cases, numbers, kinds, focus: the options
     recent     sentences shown lately; lately: keys met this sitting
   Returns up to `n` cards, no two on one thing, no type twice running. */
export function caseDeck({ sightings, cards = {}, words = [], nouns = [], lex, now = Date.now(), n = DEAL,
                           types = null, cases = null, numbers = null, kinds = null, focus = null,
                           recent = null, lately = null, first = true, rng = Math.random, schedOpts }) {
  const caseIds = cases && cases.length ? cases : CASES.map((c) => c.id);
  const nums = numbers && numbers.length ? numbers : ["sg", "pl"];
  let enabled = CARD_TYPES.filter((t) => !types || !types.length || types.includes(t.id));
  if (focus) enabled = enabled.filter((t) => t.about === "trigger");
  const triggers = offered(sightings).filter((x) => (focus ? x.id === focus
    : caseIds.includes(x.case) && (!kinds || !kinds.length || kinds.includes(triggerKind(x)))));
  const rules = ENDING_RULES.filter((r) => caseIds.includes(r.case) && nums.includes(r.num));
  const counts = caseIds.includes("genitive") ? COUNT_RULES : [];
  const questions = caseIds;
  const weightOf = new Map(words.map((x) => [x.i, x.weight]));
  const maxWeight = Math.max(1, ...words.map((x) => x.weight));
  const ctx = {
    sightings, cards, now, rng, lex, schedOpts, words, nouns, cases: caseIds, numbers: nums,
    known: (i) => (weightOf.get(i) || 0) / maxWeight,
    recent: recent instanceof Set ? recent : new Set(recent || []),
    lately: new Set(lately || []),
    usedRu: new Set(), usedWords: new Set(), usedKeys: new Set(),
    numOk: (s) => { const k = sentenceNum(s); return !k || nums.includes(k); },
  };
  const lists = {
    trigger: ranked(triggers.map((x) => x.id), ctx),
    end: ranked(rules.map((r) => `end:${r.id}`), ctx),
    count: ranked(counts.map((r) => `count:${r.id}`), ctx),
    q: ranked(questions.map((c) => `q:${c}`), ctx),
  };
  // Each kind of thing has its own share of new ones, so new triggers do not
  // keep the rules from ever being met.
  const newLeft = { trigger: first ? NEW_FIRST : NEW_AFTER, rule: first ? NEW_FIRST : NEW_AFTER };
  // A new trigger is first met as something to look at: its case named, or a
  // sentence with its case to find (structured input first, docs/case-cards.md).
  const FIRST_LOOK = new Set(["trigger-case", "sentence-case", "trigger-meaning"]);

  /* The first thing of a list a type can make a card of. */
  const fromList = (list, type, make) => {
    const order = list.due.concat(list.fresh, list.rest, list.again);
    for (const key of order) {
      // One trigger on its own is asked many ways in one deal; otherwise a
      // thing is asked once a deal.
      if (!focus && ctx.usedKeys.has(key)) continue;
      const isNew = !cards[key] && !ctx.usedKeys.has(key);
      if (isNew && (newLeft[type.about] <= 0 || (type.about === "trigger" && !FIRST_LOOK.has(type.id)))) continue;
      const card = make(key);
      if (!card) continue;
      if (isNew) newLeft[type.about]--;
      return { ...card, key };
    }
    return null;
  };
  const drawWord = (make) => {
    const pool = words.filter((x) => !ctx.usedWords.has(x.i));
    for (let tries = 0; tries < 12 && pool.length; tries++) {
      const total = pool.reduce((a, x) => a + x.weight, 0);
      let r = rng() * total, k = 0;
      while (k < pool.length - 1 && r >= pool[k].weight) { r -= pool[k].weight; k++; }
      const { i } = pool.splice(k, 1)[0];
      const card = make(i);
      if (card) return { ...card, key: `word:${i}` };
    }
    return null;
  };
  const makeOf = (type) => {
    if (type.about === "trigger") {
      return fromList(lists.trigger, type, (id) => TRIGGER_MAKERS[type.id](triggerById(id), ctx));
    }
    if (type.about === "word") return drawWord((i) => WORD_MAKERS[type.id](i, ctx));
    if (type.id === "counting") return fromList(lists.count, type, (key) => countingCard(COUNT_RULES.find((r) => `count:${r.id}` === key), ctx));
    if (type.id === "question") return fromList(lists.q, type, (key) => questionCard(key.slice(2), ctx));
    return fromList(lists.end, type, (key) => RULE_MAKERS[type.id](ENDING_RULES.find((r) => `end:${r.id}` === key), ctx));
  };

  const deck = [];
  const spent = new Set();
  let last = null;
  for (let guard = 0; deck.length < n && guard < n * 4; guard++) {
    const open = enabled.filter((t) => !spent.has(t.id));
    if (!open.length) break;
    const choice = open.filter((t) => t.id !== last);
    const from = choice.length ? choice : open;
    const total = from.reduce((a, t) => a + t.weight, 0);
    let r = rng() * total, k = 0;
    while (k < from.length - 1 && r >= from[k].weight) { r -= from[k].weight; k++; }
    const type = from[k];
    const card = makeOf(type);
    if (!card) { spent.add(type.id); continue; }
    card.type = type.id;
    if (card.word === undefined) card.word = null;
    ctx.usedKeys.add(card.key);
    if (card.s) { ctx.usedRu.add(card.s.ru); ctx.usedWords.add(card.s.i); }
    if (card.i !== undefined) ctx.usedWords.add(card.i);
    deck.push(card);
    last = type.id;
  }
  return deck;
}

/* What an answer says, as one grade: a right case or choice is Good, a wrong
   one Again; a self-graded card is the learner's grade. */
export function gradeOf(card, result) {
  if (typeof result.grade === "number") return result.grade;
  return result.right ? 3 : 1;
}
/* The thing a card's grade reviews in `st.caseCards`, or null for a card
   about one word's forms alone. */
export const itemOf = (card) => (card.key && !card.key.startsWith("word:") ? card.key : null);

/* The case cards after one answer. */
export function gradeItem(cards, key, grade, now, opts) {
  const next = Object.assign({}, cards || {});
  next[key] = review(next[key] || null, grade, now, opts);
  return next;
}

/* The sentences shown, newest last, capped. */
export function keepRecent(was, shown) {
  const set = new Set(shown);
  return (was || []).filter((r) => !set.has(r)).concat(shown).slice(-RECENT_KEPT);
}

