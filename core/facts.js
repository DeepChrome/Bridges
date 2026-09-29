/* What can be said about one word, read off its own paradigm (2026-09-28).
 *
 * The owner: *"All drills you must be able to reference the proper guide. If
 * it's irregular, it should say that it's irregular. There can be details
 * about identifying stems, masculine vs feminine etc."*
 *
 * The reference sheet used to show a table and nothing about it. A table
 * answers "what is the form"; these answer "why is it that form", which is
 * the thing that transfers to the next word.
 *
 * **Everything here is derived, not curated**, and that is deliberate (§6 —
 * do not hardcode what the data can say). The lexicon carries every form with
 * its stress mark, so the facts that matter are all readable: which
 * conjugation a verb follows is in its ты and они endings, whether its stress
 * moves is in where the acute sits, whether its stem changes is the
 * infinitive against the present. A curated list of irregular verbs would go
 * stale the moment the curriculum re-cut; a rule read off the paradigm cannot.
 *
 * **And "irregular" is mostly the wrong word**, which the measurement said
 * before this was written. 46 of the 209 curriculum verbs build their present
 * tense off something other than the infinitive stem — and reading the list,
 * fourteen are «-овать» verbs swapping -ова- for -у- and seven are ordinary
 * first-conjugation consonant mutation. Those are *rules*, and naming the
 * rule teaches something; calling «атакова́ть» irregular teaches nothing and
 * is not even true. So a stem change is classified where its class is known
 * and only described where it is not.
 */

import { fold } from "./util.js";

const VOWELS = "аеёиоуыэюя";
const VELAR = "кгх";
const HUSH = "жчшщ";
/* The seven letters the spelling rule turns on: after these, и is written
   where ы would be expected, and an unstressed о becomes е. It is the single
   reason most "irregular" plurals look irregular (core/grammar.js, stems). */
const SPELLING_SEVEN = VELAR + HUSH;

const acute = "́";
const cell = (c) => (Array.isArray(c) ? c[0] : c) || "";
const table = (w, re) => ((w && w.t) || []).find((t) => re.test(t.title)) || null;
const rowOf = (t, re) => (t ? t.rows.find((r) => re.test(r[0])) : null);
const formOf = (t, re) => {
  const r = rowOf(t, re);
  return r ? cell(r[1]) : "";
};

/* Which syllable carries the stress, counting vowels from the left. -1 when
   the word carries no mark (a one-syllable word needs none). */
export function stressAt(word) {
  const s = String(word || "").normalize("NFC");
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === acute) return n - 1;
    if (VOWELS.includes(s[i].toLowerCase())) n++;
  }
  return -1;
}

/* Does the stress move across a table's forms? Only counted where at least
   two forms carry a mark, so a paradigm the lexicon never marked is reported
   as unknown rather than as fixed (§26 — represent the uncertainty). */
export function stressMoves(t) {
  if (!t) return null;
  const at = t.rows.map((r) => stressAt(cell(r[1]))).filter((n) => n >= 0);
  if (at.length < 2) return null;
  return at.some((n) => n !== at[0]);
}

const lastConsonant = (stem) => {
  const s = fold(stem);
  for (let i = s.length - 1; i >= 0; i--) if (!VOWELS.includes(s[i])) return s[i];
  return "";
};

const INF_END = /(ться|тись|ти|ть|чь)$/;
const PRES_END = /(ются|утся|ятся|атся|ют|ут|ят|ат)$/;

/* How a verb's present stem relates to its infinitive: the classes first,
   because a class is a rule and a rule transfers. */
export function stemChange(w) {
  const t = table(w, /Present/);
  const they = fold(formOf(t, /они/)).replace(/ся$/, "");
  const inf = fold(w && w.b).replace(/ся$/, "");
  if (!they || !inf) return null;
  const infStem = inf.replace(INF_END, "");
  const preStem = they.replace(PRES_END, "");
  if (!infStem || !preStem) return null;
  if (infStem.startsWith(preStem) || preStem.startsWith(infStem)) return null;

  /* -ева- becomes -ю- after a vowel («воева́ть» → «вою́ют»), -у- elsewhere:
     one rule, two spellings. */
  if (/ова$|ева$/.test(infStem) && (preStem === infStem.replace(/(ова|ева)$/, "у")
                                    || preStem === infStem.replace(/ева$/, "ю"))) {
    return { kind: "ova", note: "Verbs in -овать and -евать swap -ова-/-ева- for -у- (-ю-) in the present." };
  }
  /* ск and ст become щ right through the present («иска́ть» → «ищу́»): a
     mutation of two letters into one, which the single-letter check below
     cannot see. */
  const bare2 = infStem.replace(/[аеёиоуыэюя]$/, "");
  if (/(ск|ст)$/.test(bare2) && preStem === bare2.replace(/(ск|ст)$/, "щ")) {
    return { kind: "mutation", from: bare2.slice(-2), to: "щ",
             note: `The stem's ${bare2.slice(-2)} becomes щ right through the present.` };
  }
  /* A mutation is the same stem with its last consonant swapped — «писа́ть»
     to «пишу́». Checked by length as well as by letter, so a wholly different
     stem is not mislabelled as a sound change. */
  const a = infStem.replace(/[аеёиоуыэюя]$/, "");
  if (a.length === preStem.length && a.slice(0, -1) === preStem.slice(0, -1)
      && lastConsonant(a) !== lastConsonant(preStem)) {
    return { kind: "mutation", from: lastConsonant(a), to: lastConsonant(preStem),
             note: `The last consonant of the stem changes: ${lastConsonant(a)} becomes ${lastConsonant(preStem)} right through the present.` };
  }
  return { kind: "other", note: "The present tense is built on a different stem from the infinitive — one to learn whole." };
}

/* First conjugation, second, or mixed. Read from two endings rather than one:
   «хоте́ть» takes first-conjugation endings in the singular and second in the
   plural, and that is exactly what a learner needs told. */
export function conjugation(w) {
  const t = table(w, /Present/);
  if (!t) return null;
  const you = fold(formOf(t, /ты/)).replace(/ся$/, "");
  const they = fold(formOf(t, /они/)).replace(/ся$/, "");
  if (!you || !they) return null;
  const a = /(ешь|ёшь)$/.test(you) ? 1 : /ишь$/.test(you) ? 2 : 0;
  const b = /(ют|ут)$/.test(they) ? 1 : /(ят|ат)$/.test(they) ? 2 : 0;
  if (!a || !b) return null;
  return a === b ? a : "mixed";
}

/* A noun's stem is soft when the nominative ends in a soft sign, -й, or a
   soft vowel. It is what decides which column of every ending table the word
   takes (core/grammar.js, "So every ending has two shapes"). */
export function nounStem(bare) {
  const s = fold(bare);
  if (/[ьйяею]$/.test(s)) return "soft";
  return "hard";
}

/* The vowel that is there in the nominative and gone in every other case:
   «день» → «дня». Detected by the stem shortening, never by a list. */
function fleeting(w) {
  const t = table(w, /Declension/);
  if (!t || w.g === undefined) return false;
  const nom = fold(cell((rowOf(t, /Nominative/) || [])[1]));
  const gen = fold(cell((rowOf(t, /Genitive/) || [])[1]));
  if (!nom || !gen) return false;
  const nomStem = nom.replace(/[аяоеьй]$/, "");
  const genStem = gen.replace(/[аяуюыиеё]$/, "");
  if (genStem.length >= nomStem.length || !nomStem.startsWith(genStem[0] || "")) return false;
  // Exactly one vowel short, and the rest of the letters in order.
  const dropped = nomStem.length - genStem.length;
  return dropped === 1 && [...nomStem].filter((c) => VOWELS.includes(c)).length
                        > [...genStem].filter((c) => VOWELS.includes(c)).length;
}

/* **Where a word breaks the rules** (the owner, 2026-09-29: "more attention
 * on irregular words/verbs/nouns/forms… that break rules… clearly flagged on
 * the full entries, on the answer card, and have options to drill them").
 *
 * Read off the word's own tables like everything else here, never a list:
 * a curated list of irregulars goes stale on the next re-cut, and these can
 * all be seen in the forms. What counts is what a learner applying the rules
 * would get wrong — the classes the rules already cover (-овать, a consonant
 * mutation, a fleeting vowel) are *not* here, because §30az's point stands:
 * naming the rule teaches, calling it irregular does not.
 *
 * Each item is { kind, label, note }; an empty list is a regular word. */
export function irregularities(w) {
  if (!w) return [];
  const out = [];
  const bare = fold(w.b);
  if (w.p === "verb") {
    const t = table(w, /Present/);
    const c = conjugation(w);
    if (c === "mixed") {
      out.push({ kind: "conjugation", label: "Mixed conjugation",
                 note: "It takes first-conjugation endings in some persons and second in others." });
    } else if (t && c === null && fold(formOf(t, /ты/))) {
      out.push({ kind: "conjugation", label: "Irregular endings",
                 note: `Its endings follow neither pattern: «${formOf(t, /ты/)}», «${formOf(t, /они/)}». Learn the table whole.` });
    }
    const sc = stemChange(w);
    if (sc && sc.kind === "other") {
      out.push({ kind: "stem", label: "Irregular stem", note: sc.note });
    }
    /* The past is the infinitive's stem plus -л. Where it is built on
       something else — «идти́» → «шёл», «прийти́» → «пришёл» — the rule gives
       a word that does not exist. */
    const pastT = table(w, /Past/);
    const pastM = fold(formOf(pastT, /^он/)).replace(/ся$|сь$/, "");
    const infStem = bare.replace(/ся$|сь$/, "").replace(INF_END, "");
    const keep = Math.max(2, infStem.length - 1);
    if (pastM && infStem && !pastM.startsWith(infStem.slice(0, keep))
        && !infStem.startsWith(pastM.replace(/л$/, ""))) {
      out.push({ kind: "past", label: "Irregular past",
                 note: `The past is not the infinitive's stem plus -л: «${formOf(pastT, /^он/)}».` });
    }
  }
  if (w.p === "noun" && !w.pl) {
    const t = table(w, /Declension/);
    const nomRow = rowOf(t, /Nominative/) || [];
    const sg = fold(cell(nomRow[1])), pl = fold(cell(nomRow[2]));
    const plRaw = cell(nomRow[2]).normalize("NFC");
    if (/мя$/.test(bare)) {
      out.push({ kind: "declension", label: "-мя noun",
                 note: "One of ten neuter nouns in -мя: -ени in the other cases, -ена in the plural." });
    } else if (pl && sg) {
      const sgStem = sg.replace(/[аяоеьйы]$/, "");
      const plStem = pl.replace(/(ья|ья|ы|и|а|я|е)$/, "");
      const gen = fold(cell((rowOf(t, /Genitive/) || [])[1]));
      const genStem = gen.replace(/[аяуюыиеё]$/, "");
      /* -ья is only a quirk when the ь is not already the stem's: «пла́тье»
         → «пла́тья» is an ordinary -е noun. */
      if (/ья$/.test(pl) && !/ь[её]$/.test(sg)) {
        out.push({ kind: "plural", label: "Plural in -ья", note: `The plural is «${cell(nomRow[2])}», not the ordinary -ы/-и.` });
      } else if (w.g === "m" && /[ая]́$/.test(plRaw)) {
        out.push({ kind: "plural", label: "Plural in -а", note: `A stressed -а/-я plural: «${cell(nomRow[2])}», not -ы/-и.` });
      } else if (!fleeting(w) && sgStem.length > 2 && !plStem.startsWith(sgStem.slice(0, 2))
                 && !(genStem && plStem === genStem)) {
        // A plural on the genitive's stem is a vowel that dropped out («лёд»
        // → «льда», «льды»), not a different word.
        out.push({ kind: "plural", label: "Different plural", note: `The plural is a different word: «${cell(nomRow[2])}».` });
      }
      if (gen && sgStem && gen.startsWith(sgStem) && gen.length - sgStem.length >= 3 && /ер/.test(gen.slice(sgStem.length))) {
        out.push({ kind: "declension", label: "Stem grows", note: `It adds -ер- in every case but the nominative: «${cell((rowOf(t, /Genitive/) || [])[1])}».` });
      }
    }
  }
  if (w.p === "adjective") {
    const comp = fold(formOf(table(w, /Comparison/), /Comparative/));
    const stem = bare.replace(/(ый|ий|ой)$/, "");
    if (comp && stem.length >= 3 && !comp.startsWith(stem.slice(0, 3))) {
      out.push({ kind: "comparative", label: "Irregular comparative",
                 note: `"More ${String(w.e || "").split(/[,;]/)[0].trim()}" is «${formOf(table(w, /Comparison/), /Comparative/)}», a different stem.` });
    }
  }
  return out;
}
export const isIrregular = (w) => irregularities(w).length > 0;

const GENDER_NAME = { m: "Masculine", f: "Feminine", n: "Neuter" };

/* Why this noun has the gender it has — read off the word's own ending, never
 * off its gender. Looking the reason up by gender is how «вре́мя» came to be
 * told it is neuter "because nouns ending in -о or -е are neuter", which is
 * false about the word in front of the learner (§7).
 *
 * Returns null where the ending genuinely does not decide it, and the caller
 * says so rather than inventing a rule.
 */
export function genderWhy(bare, g) {
  const s = fold(bare);
  if (/мя$/.test(s)) return "One of the ten nouns in -мя: neuter, and it grows -ен- in the other cases.";
  if (/ь$/.test(s)) return "A noun ending in -ь can be either gender — this one has to be learned.";
  if (g === "f" && /[ая]$/.test(s)) return "Nouns ending in -а or -я are feminine.";
  if (g === "n" && /[ое]$/.test(s)) return "Nouns ending in -о or -е are neuter.";
  if (g === "m" && /[йь]$/.test(s)) return "Nouns ending in -й are masculine.";
  if (g === "m" && !VOWELS.includes(s.slice(-1))) return "Nouns ending in a consonant are masculine.";
  /* A man by meaning rather than by ending — «па́па», «дя́дя» — and any other
     word whose ending points the wrong way. */
  if (g === "m" && /[ая]$/.test(s)) return "It ends like a feminine noun and declines like one, but it is masculine because it names a man.";
  return null;
}

/* Everything worth saying about one word, as short labelled lines. Shape:
   { label, note } — the label is a pill, the note one sentence. The caller
   decides how many to draw. */
export function wordFacts(w) {
  if (!w) return [];
  const out = [];
  const bare = fold(w.b);
  const stemEnd = lastConsonant(bare.replace(/[ьйаяоеуюыи]$/, ""));

  if (w.p === "noun") {
    if (w.pl) {
      out.push({ label: "Plural only", note: "This noun has no singular, so it has no gender either." });
    } else if (GENDER_NAME[w.g]) {
      out.push({
        label: GENDER_NAME[w.g],
        note: genderWhy(bare, w.g) || "Its ending does not say which gender it is — learn it with the word.",
      });
    }
    /* The -мя nouns are their own declension, so the hard/soft line would be
       a rule that does not apply to them; the gender note above already says
       what they do. */
    if (!/мя$/.test(bare)) {
      const stem = nounStem(bare);
      out.push({
        label: stem === "soft" ? "Soft stem" : "Hard stem",
        note: stem === "soft"
          ? "Soft stems take the soft column of every ending: -я, -ю, -и, -е."
          : "Hard stems take the hard column of every ending: -а, -у, -ы, -о.",
      });
    }
    /* The spelling rule is named only where the paradigm *shows* it. «друг»
       ends in г and its plural is «друзья», so asserting "-и, never -ы" off
       the stem alone told the learner something untrue about the word they
       were looking at. */
    const plural = fold(cell(((rowOf(table(w, /Declension/), /Nominative/) || [])[2])));
    if (SPELLING_SEVEN.includes(stemEnd) && /и$/.test(plural)) {
      out.push({
        label: "Spelling rule",
        note: `The stem ends in ${stemEnd}, so the plural is -и and never -ы.`,
      });
    }
    if (fleeting(w)) {
      out.push({ label: "Fleeting vowel", note: "The vowel before the last consonant drops out in every case but the nominative." });
    }
  }

  if (w.p === "adjective") {
    const soft = /ий$/.test(bare), stressed = /ой$/.test(bare);
    if (SPELLING_SEVEN.includes(stemEnd) && soft) {
      out.push({
        label: "Hard stem",
        note: `Spelled -ий because the stem ends in ${stemEnd}, but it takes the hard endings.`,
      });
    } else if (soft) {
      out.push({ label: "Soft stem", note: "A soft adjective: -ий, -яя, -ее, -ие." });
    } else if (stressed) {
      out.push({ label: "Stressed ending", note: "The -ой type: hard endings, and the stress is on them." });
    } else {
      out.push({ label: "Hard stem", note: "The ordinary type: -ый, -ая, -ое, -ые." });
    }
  }

  if (w.p === "verb") {
    if (w.a === "imperfective" || w.a === "perfective") {
      const partner = w.pt && w.pt !== "-" ? w.pt : null;
      out.push({
        label: w.a === "perfective" ? "Perfective" : "Imperfective",
        note: (w.a === "perfective"
          ? "One completed act. Its present-tense forms mean the future."
          : "The process, or something repeated.")
          + (partner ? ` Its partner is «${partner}».` : ""),
      });
    }
    const c = conjugation(w);
    if (c === 1) out.push({ label: "First conjugation", note: "The -е- pattern: -ешь in the ты form, -ут or -ют in the они form." });
    if (c === 2) out.push({ label: "Second conjugation", note: "The -и- pattern: -ишь in the ты form, -ат or -ят in the они form." });
    // Mixed and wholly different stems are irregularities, said first (below).
    const sc = stemChange(w);
    if (sc && sc.kind !== "other") out.push({ label: "Stem change", note: sc.note });
    if (stressMoves(table(w, /Present/))) {
      out.push({ label: "Stress moves", note: "The stress is not in the same place in every person — listen for where it falls." });
    }
    if (/ся$|сь$/.test(bare)) {
      out.push({ label: "Reflexive", note: "Conjugate it as normal, then add -ся after a consonant and -сь after a vowel." });
    }
  }
  /* What breaks the rules goes first, marked `irregular` so a screen can
     draw it apart. The -мя note is left to the gender line, which says the
     same thing. */
  const odd = irregularities(w).filter((x) => x.label !== "-мя noun")
    .map((x) => ({ label: x.label, note: x.note, irregular: true }));
  return odd.concat(out);
}
