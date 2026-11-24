/* The rules a case card can ask about on its own, beside the triggers of
 * core/triggers.js: a case's endings by kind of noun, the counting words, and
 * the question each case answers (the owner, 2026-11-23: "some cards can even
 * just be like… plural genitive ending", "specific rules (amount of
 * something…)").
 *
 * Hand-authored, beside core/cases.js. The Russian here is endings, question
 * words and counting words only. Every example a card shows is a real noun's
 * own form read off its table at runtime (`fits`), and a noun whose form does
 * not end the way the rule says — «друг», «друзе́й» — is never shown under it,
 * so an irregular word cannot illustrate a regular rule.
 */

import { fold } from "./util.js";

/* What kind of noun a dictionary form is, by its ending, which is what the
   endings follow: «па́па» declines as «ма́ма» does. */
const NOUN_CLASSES = ["m-hard", "m-hush", "m-soft", "m-j", "a", "ya", "f-soft", "n-o", "n-e", "ii-f", "ii-n", "ii-m"];
const M = ["m-hard", "m-hush", "m-soft", "m-j"];
const ALL = NOUN_CLASSES;

/* One rule: the case and number (`num` "sg" or "pl"), the kinds of noun it is
   for (`cls`, and `anim` where being alive decides), the nouns named on the
   card (`who`), the answer as shown (`label`), and how to check a noun's own
   form against it — `ends` (folded endings), `same` (the row it equals) or
   `zero` (no ending). `cue` is the ending as the front of an "ending → case"
   card, set only where no other case of a noun ends that way. */
export const ENDING_RULES = [
  // prepositional
  { id: "prep-sg", case: "prepositional", num: "sg", cls: [...M, "a", "ya", "n-o", "n-e"], who: "most nouns", label: "-е", ends: ["е"] },
  { id: "prep-sg-soft", case: "prepositional", num: "sg", cls: ["f-soft"], who: "feminine -ь", label: "-и", ends: ["и"] },
  { id: "prep-sg-ii", case: "prepositional", num: "sg", cls: ["ii-f", "ii-n", "ii-m"], who: "-ия, -ие, -ий", label: "-ии", ends: ["ии"] },
  { id: "prep-pl", case: "prepositional", num: "pl", cls: ALL, who: "all nouns", label: "-ах / -ях", ends: ["ах", "ях"], cue: "-ах / -ях" },
  // accusative
  { id: "acc-sg-a", case: "accusative", num: "sg", cls: ["a", "ya", "ii-f"], who: "nouns in -а, -я", label: "-у / -ю", ends: ["у", "ю"] },
  { id: "acc-sg-m-inan", case: "accusative", num: "sg", cls: M, anim: false, who: "masculine, a thing", label: "= nominative", same: "Nominative" },
  { id: "acc-sg-m-anim", case: "accusative", num: "sg", cls: M, anim: true, who: "masculine, alive", label: "= genitive", same: "Genitive" },
  { id: "acc-sg-n", case: "accusative", num: "sg", cls: ["n-o", "n-e", "ii-n"], who: "neuter", label: "= nominative", same: "Nominative" },
  { id: "acc-sg-soft", case: "accusative", num: "sg", cls: ["f-soft"], who: "feminine -ь", label: "= nominative", same: "Nominative" },
  { id: "acc-pl-inan", case: "accusative", num: "pl", cls: ALL, anim: false, who: "things", label: "= nominative", same: "Nominative" },
  { id: "acc-pl-anim", case: "accusative", num: "pl", cls: ALL, anim: true, who: "people and animals", label: "= genitive", same: "Genitive" },
  // genitive
  { id: "gen-sg-mn", case: "genitive", num: "sg", cls: [...M, "n-o", "n-e", "ii-n", "ii-m"], who: "masculine and neuter", label: "-а / -я", ends: ["а", "я"] },
  { id: "gen-sg-a", case: "genitive", num: "sg", cls: ["a", "ya"], who: "nouns in -а, -я", label: "-ы / -и", ends: ["ы", "и"] },
  { id: "gen-sg-soft", case: "genitive", num: "sg", cls: ["f-soft", "ii-f"], who: "feminine -ь, -ия", label: "-и", ends: ["и"] },
  { id: "gen-pl-m", case: "genitive", num: "pl", cls: ["m-hard"], who: "masculine, hard consonant", label: "-ов", ends: ["ов"], cue: "-ов" },
  { id: "gen-pl-hush", case: "genitive", num: "pl", cls: ["m-hush", "m-soft", "f-soft"], who: "ж ш ч щ, or -ь", label: "-ей", ends: ["ей"] },
  { id: "gen-pl-j", case: "genitive", num: "pl", cls: ["m-j"], who: "masculine -й", label: "-ев", ends: ["ев"], cue: "-ев" },
  { id: "gen-pl-zero", case: "genitive", num: "pl", cls: ["a", "ya", "n-o"], who: "nouns in -а, -я, -о", label: "no ending", zero: true },
  { id: "gen-pl-ii", case: "genitive", num: "pl", cls: ["ii-f", "ii-n"], who: "-ия, -ие", label: "-ий", ends: ["ий"] },
  // dative
  { id: "dat-sg-mn", case: "dative", num: "sg", cls: [...M, "n-o", "n-e", "ii-n", "ii-m"], who: "masculine and neuter", label: "-у / -ю", ends: ["у", "ю"] },
  { id: "dat-sg-a", case: "dative", num: "sg", cls: ["a", "ya"], who: "nouns in -а, -я", label: "-е", ends: ["е"] },
  { id: "dat-sg-soft", case: "dative", num: "sg", cls: ["f-soft", "ii-f"], who: "feminine -ь, -ия", label: "-и", ends: ["и"] },
  { id: "dat-pl", case: "dative", num: "pl", cls: ALL, who: "all nouns", label: "-ам / -ям", ends: ["ам", "ям"], cue: "-ам / -ям" },
  // instrumental
  { id: "ins-sg-mn", case: "instrumental", num: "sg", cls: [...M, "n-o", "n-e", "ii-n", "ii-m"], who: "masculine and neuter", label: "-ом / -ем", ends: ["ом", "ем"], cue: "-ом" },
  { id: "ins-sg-a", case: "instrumental", num: "sg", cls: ["a", "ya", "ii-f"], who: "nouns in -а, -я", label: "-ой / -ей", ends: ["ой", "ей"], cue: "-ой" },
  { id: "ins-sg-soft", case: "instrumental", num: "sg", cls: ["f-soft"], who: "feminine -ь", label: "-ью", ends: ["ью"], cue: "-ью" },
  { id: "ins-pl", case: "instrumental", num: "pl", cls: ALL, who: "all nouns", label: "-ами / -ями", ends: ["ами", "ями"], cue: "-ами / -ями" },
];

/* The counting words and what they want of the noun after them. The answer is
   a case and a number, so these are asked with those four choices. */
export const COUNT_CHOICES = [
  { id: "nom-sg", label: "Nominative singular" },
  { id: "gen-sg", label: "Genitive singular" },
  { id: "gen-pl", label: "Genitive plural" },
  { id: "nom-pl", label: "Nominative plural" },
];
/* `say` is the number a card counts a real noun with (core/casecards.js puts
   «оди́н» and «два» in the noun's gender); `why` is the rule as the back of
   the card states it. */
export const COUNT_RULES = [
  { id: "one", words: "оди́н, одна́, одно́", wants: "nom-sg", say: "оди́н", en: "one",
    why: "After «оди́н», «одна́», «одно́» the noun stays in the nominative singular, and the number matches its gender." },
  { id: "two-four", words: "два, три, четы́ре", wants: "gen-sg", say: "три", en: "three",
    why: "After «два», «три», «четы́ре» the noun is in the genitive singular." },
  { id: "five-up", words: "пять, шесть… два́дцать", wants: "gen-pl", say: "пять", en: "five",
    why: "From «пять» up to «два́дцать», the noun is in the genitive plural." },
  { id: "many", words: "мно́го, ма́ло, ско́лько", wants: "gen-pl", say: "мно́го", en: "many", note: "a noun you count",
    why: "After «мно́го», «ма́ло», «ско́лько», a noun you can count is in the genitive plural." },
  { id: "twenty-one", words: "два́дцать оди́н", wants: "nom-sg", say: "два́дцать оди́н", en: "twenty-one",
    why: "A number that ends in «оди́н» counts like «оди́н»: the noun stays nominative singular." },
  { id: "twenty-two", words: "два́дцать два", wants: "gen-sg", say: "два́дцать два", en: "twenty-two",
    why: "A number that ends in «два», «три» or «четы́ре» counts like them: genitive singular." },
];

/* The question each case answers. A pair, because «кого́?» alone is the
   genitive and the accusative both. */
export const CASE_QUESTIONS = {
  prepositional: "о ком? о чём?",
  accusative: "кого́? что?",
  genitive: "кого́? чего́?",
  dative: "кому́? чему́?",
  instrumental: "кем? чем?",
};

/* ------------------------------------------------------------ the nouns */

const cellOf = (t, row, num) => {
  const r = t.rows.find((x) => x[0] === row);
  if (!r) return null;
  const col = num === "pl" ? t.columns.findIndex((c) => /plural/i.test(c)) : t.columns.findIndex((c) => /singular|form/i.test(c));
  return col > 0 && r[col] && r[col].length ? { cell: r[col], at: [t.rows.indexOf(r), col] } : null;
};
export { cellOf };

/* The kind of noun, read off its nominative singular and gender. Null for
   what the rules do not cover («вре́мя», «ко́фе»). */
function nounClass(w, t) {
  const n = cellOf(t, "Nominative", "sg");
  if (!n) return null;
  const nom = fold(n.cell[0]);
  if (/ия$/.test(nom)) return "ii-f";
  if (/ие$/.test(nom)) return "ii-n";
  if (/ий$/.test(nom) && w.g === "m") return "ii-m";
  if (/а$/.test(nom)) return "a";
  if (/я$/.test(nom)) return w.g === "n" ? null : "ya";
  if (w.g === "m") {
    if (/[жшчщ]$/.test(nom)) return "m-hush";
    if (/ь$/.test(nom)) return "m-soft";
    if (/й$/.test(nom)) return "m-j";
    if (/[бвгдзклмнпрстфхц]$/.test(nom)) return "m-hard";
    return null;
  }
  if (w.g === "f") return /ь$/.test(nom) ? "f-soft" : null;
  if (w.g === "n") return /о$/.test(nom) ? "n-o" : /е$/.test(nom) ? "n-e" : null;
  return null;
}

/* Alive, as the accusative reads it: the accusative equals the genitive and
   not the nominative. */
function alive(t, num) {
  const acc = cellOf(t, "Accusative", num), gen = cellOf(t, "Genitive", num), nom = cellOf(t, "Nominative", num);
  if (!acc || !gen || !nom) return null;
  const f = (c) => fold(c.cell[0]);
  if (f(gen) === f(nom)) return null;
  return f(acc) === f(gen) ? true : f(acc) === f(nom) ? false : null;
}

const ROW = { prepositional: "Prepositional", accusative: "Accusative", genitive: "Genitive", dative: "Dative",
              instrumental: "Instrumental" };
export const rowOfCase = (id) => ROW[id];

/* Whether a noun follows a rule, its own form checked against it. Returns the
   cell (`{ cell, at }`) when it does. */
export function fits(rule, w, t) {
  if (!t || !rule.cls.includes(nounClass(w, t))) return null;
  if (rule.anim !== undefined && alive(t, rule.num) !== rule.anim) return null;
  const got = cellOf(t, ROW[rule.case], rule.num);
  if (!got) return null;
  const form = fold(got.cell[0]);
  if (rule.same) {
    const other = cellOf(t, rule.same, rule.num);
    return other && fold(other.cell[0]) === form ? got : null;
  }
  if (rule.zero) {
    const nom = fold(cellOf(t, "Nominative", "sg").cell[0]);
    return !/[аеиоуыэюя]$/.test(form) && !/(ов|ев|ей)$/.test(form) && form.length < nom.length + 2 ? got : null;
  }
  return rule.ends.some((e) => form.endsWith(e)) ? got : null;
}

/* The endings a cue names, folded: "-ах / -ях" is «ах», «ях». */
const cueEnds = (r) => (r.cue || "").split("/").map((x) => fold(x.replace("-", "").trim())).filter(Boolean);

/* The shape the rules promise: an id once, a real case, a way to check. */
export function checkCaseRules() {
  const errors = [];
  const ids = new Set();
  for (const r of ENDING_RULES) {
    if (ids.has(r.id)) errors.push(`${r.id}: twice`);
    ids.add(r.id);
    if (!ROW[r.case]) errors.push(`${r.id}: no case ${r.case}`);
    if ([r.ends, r.same, r.zero].filter(Boolean).length !== 1) errors.push(`${r.id}: wants one of ends, same, zero`);
    if (r.cls.some((c) => !NOUN_CLASSES.includes(c))) errors.push(`${r.id}: unknown class`);
  }
  // A cue is only for an ending no other case of a noun shares.
  for (const r of ENDING_RULES.filter((x) => x.cue)) {
    const ends = cueEnds(r);
    for (const o of ENDING_RULES) {
      if (o.case === r.case || !o.ends) continue;
      if (o.ends.some((e) => ends.includes(e))) errors.push(`${r.id}: cue ${r.cue} is also ${o.id}`);
    }
  }
  for (const c of COUNT_RULES) if (!COUNT_CHOICES.some((x) => x.id === c.wants)) errors.push(`${c.id}: wants ${c.wants}`);
  for (const id of Object.keys(ROW)) if (!CASE_QUESTIONS[id]) errors.push(`no question for ${id}`);
  return errors;
}
