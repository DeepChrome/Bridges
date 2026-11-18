/* Shared helpers for both the web build and the React Native app.
 *
 * Nothing here may touch the DOM, localStorage, or any browser global — this file
 * is inlined into the web bundle by tools/build_site.py and imported directly by
 * native/. If it needs a platform, it belongs in the platform, not here.
 *
 * fold() in particular is the join key for the whole system and must stay identical
 * to the Python one in tools/panel.py: NFD -> strip U+0300/U+0301 -> NFC -> lower ->
 * ё to е -> trim.
 */

export const ACC = /[̀́]/g;

export const fold = (s) =>
  String(s).normalize("NFD").replace(ACC, "").normalize("NFC")
    .toLowerCase().replace(/ё/g, "е").trim();

export const bare = (s) =>
  String(s).normalize("NFD").replace(ACC, "").normalize("NFC");

/* Cyrillic word, keeping internal hyphens and any combining stress mark. Without
   the accents in the class a stressed word splits in two and the mark is stranded. */
export const TOKEN = /[а-яёА-ЯЁ̀́]+(?:-[а-яёА-ЯЁ̀́]+)*/g;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (a, n) => shuffle(a.slice()).slice(0, n);

/* Day number. Scheduling works in whole days, like Anki.
 *
 * **Where the day starts is configurable, and it is not UTC midnight.** It was,
 * and for the owner in Los Angeles that put the boundary at 5 pm: his streak
 * ticked over mid-afternoon, his new-cards ration reset while he was at work,
 * and an evening session landed on the *next* day's square in the calendar
 * (ROADMAP 13.24).
 *
 * `setDayStart` is called once at boot from the device's own clock
 * (native/App.js), the way playback and haptics are configured — no call site
 * decides this for itself. Unconfigured it is exactly the old behaviour, which
 * is what keeps the frozen web app and every existing test unchanged.
 *
 * The rollover is **4 am local**, Anki's convention and for Anki's reason: a
 * session at one in the morning is the end of a long day, not the start of a
 * new one, and a learner who studies late should not lose a streak for it.
 */
const DAY_MS = 86400000;
let dayShift = 0;

export function setDayStart({ offsetMinutes, rolloverHour = 4 } = {}) {
  /* `offsetMinutes` is `Date.prototype.getTimezoneOffset()`: minutes to ADD to
     local time to reach UTC, so it is +420 for UTC−7. Local ms is therefore
     `ms − offset`, and the rollover moves the boundary later still. */
  const off = typeof offsetMinutes === "number" && isFinite(offsetMinutes) ? offsetMinutes : 0;
  const roll = typeof rolloverHour === "number" && isFinite(rolloverHour)
    ? Math.max(0, Math.min(23, rolloverHour)) : 4;
  dayShift = off * 60000 + roll * 3600000;
}
export const dayOf = (ms) => Math.floor((ms - dayShift) / DAY_MS);
export const today = () => dayOf(Date.now());

/* Latin -> Cyrillic, so a keyboard without Russian still works. Longest match first. */
const TR = [["shch", "щ"], ["sch", "щ"], ["yo", "ё"], ["zh", "ж"], ["kh", "х"],
            ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["ya", "я"],
            ["ye", "е"], ["j", "й"], ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"],
            ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["k", "к"], ["l", "л"],
            ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"],
            ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"], ["y", "ы"], ["c", "к"],
            ["w", "в"], ["x", "кс"], ["'", "ь"]];

export function translit(s) {
  let out = "", i = 0;
  const low = String(s).toLowerCase();
  outer: while (i < low.length) {
    for (const [a, b] of TR) {
      if (low.startsWith(a, i)) { out += b; i += a.length; continue outer; }
    }
    out += low[i++];
  }
  return out;
}

/* Rough Cyrillic -> Latin, only used for the "you can type it like this" hint. */
const BACK = { "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh",
  "з":"z","и":"i","й":"j","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
  "с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"shch",
  "ъ":"","ы":"y","ь":"'","э":"e","ю":"yu","я":"ya" };

export function translitBack(s) {
  return Array.from(bare(s).toLowerCase())
    .map((c) => (c in BACK ? BACK[c] : c)).join("");
}

/* First dictionary sense — glosses run long and trail into archaic readings.
 *
 * Splits on top-level separators only. A comma inside a bracket is part of the
 * sense, not the end of it: «ты» is glossed "you (singular, informal)" and a
 * naive split showed the learner **"you (singular"** — an unclosed bracket on a
 * first-chapter card, and on the graded answer, since firstSense is what
 * "Choose the Russian" and "Write it in Russian" ask for. */
export function firstSense(w) {
  const gloss = (w.e || "");
  let depth = 0;
  let s = "";
  for (let i = 0; i < gloss.length; i++) {
    const c = gloss[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if ((c === "," || c === ";") && depth === 0) { s = gloss.slice(0, i).trim(); break; }
  }
  if (!s) s = gloss.trim();
  if (!s) return w.b;
  return w.p === "verb" ? asInfinitive(s) : s;
}

/* The English a question asks *from* (choose the Russian, type it). A first
   sense of a letter or two — «к» "to", «я» "I" — read on its own as a
   question with nothing in it (the owner, 2026-10-04: "the question is missing
   completely"), and "to" fits к, в and на alike. So a sense that short brings
   the rest of its group with it: "to, towards", "I, me". */
/* The examples that use a word in the meaning it is taught in: those whose
   English carries a word of the first sense («вилка» is taught as "fork", and
   a sentence about a plug is another word to a learner — the owner,
   2026-10-05). All of them when none do, since a translation may say it with
   a synonym and a word should not lose its sentences over that. A prefix
   match, so "fork" finds "forks". */
export function onSense(w, examples) {
  const list = examples || [];
  const keys = String(firstSense(w) || "").toLowerCase().replace(/^to\s+/, "")
    .replace(/\([^)]*\)/g, " ").split(/[^a-z]+/).filter((k) => k.length >= 3);
  if (!keys.length) return list;
  const fits = list.filter((ex) => {
    const en = String((ex && ex.en) || "").toLowerCase().split(/[^a-z]+/);
    return keys.some((k) => en.some((e) => e.startsWith(k)));
  });
  return fits.length ? fits : list;
}

/* The whole prompt is measured, so a verb's "to go" stands as it is — the
   "to" is what says it is a verb (asInfinitive) — and only a bare "to" or "I"
   grows. */
export function askSense(w) {
  const s = firstSense(w);
  if (s.replace(/[^\p{L}]/gu, "").length >= 3) return s;
  const group = String(w.e || "").split(";")[0].trim();
  if (!group || group.length <= s.length) return s;
  return w.p === "verb" ? asInfinitive(group) : group;
}

/* A verb's sense is written "to …". OpenRussian glosses most verbs bare —
   163 of the 219 verbs the units teach — so "work" stood for both «работа»
   and «работать», and "judge" for «судья» and «судить», on a word list and on
   an English-front card (the content sweep, 2026-09-30). Comparisons strip
   the "to" again (senseKey in core/questions.js), so this changes what is
   read and never what counts as the same meaning. */
export function asInfinitive(s) {
  return /^(to\b|\()/i.test(s) ? s : `to ${s}`;
}

/* The meaning a *card* shows (§30db).
 *
 * Wiktionary defines a function word by explaining it — «по» opens "used
 * broadly to indicate action, typically involving movement, across a surface
 * or across several things in a generally flat plane; across, on, along…" —
 * and a noun by glossing and then defining in brackets: «выстрел» "shot,
 * gunshot (launching or firing of a projectile; the sound of the firing…)".
 * A dictionary entry wants all of that. A flashcard answered in three seconds
 * wants the translation, and drawn whole on the English front of a produce
 * card the explanation was the largest text on the screen (the owner,
 * 2026-11-11, of «такой»: "out of control and looks extremely
 * unprofessional"; of «по»: "says the same thing in white and grey").
 *
 * So on a card a sense is cut back to its translation: the text before a
 * bracketed definition («нет» "there is not, there are no [with genitive…]"),
 * or after a colon that introduces one («же» "Marks an objection…: after all,
 * but"), and a list of translations trimmed to the ones that fit. A head that
 * is itself an explanation — five words or more before its first comma, a
 * quotation left open, Russian inside it («то» 'Optional part of "е́сли…') —
 * is refused, because a cut explanation is worse than a long one.
 *
 * `cardSenses` applies it to a word's list: a later sense with no translation
 * in it is left off the card; a *first* sense with none sends the whole card
 * back to OpenRussian's gloss (null), which is always a list of translations.
 * Both fronts of one card read through this, so they still name one meaning
 * (§30cm); the entry and the AI's view of the card keep the full senses. */
export const CARD_GLOSS = 60;
/* How Wiktionary opens a definition that is not a translation: "used with a
   pronoun…", "Marks an objection…", "Generic demonstrative pronoun…". A
   translation can start with "used" too («подержанный» "used, second-hand"),
   so it is the word *after* it that tells them apart. */
const DEFINES = /^(used (with|in|to|as|before|after|broadly|for|when|only|of|at|by|on)\b|marks\b|indicates?\b|expresses\b|denotes\b|emphasi[sz]es\b|generic\b|optional\b|translated\b|refers to\b|introduces\b|placed\b|(a|the|an) (word|particle|form|suffix|prefix)\b)/i;
const EXPLAINS = (head) => {
  const first = head.split(/[,;]/)[0].trim();
  return first.split(/\s+/).length >= 5
    || DEFINES.test(first)
    || (head.match(/"/g) || []).length % 2 === 1
    || /[Ѐ-ӿ]/.test(head);
};
export function cardGloss(g) {
  const s = String(g || "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length <= CARD_GLOSS && !EXPLAINS(s)) return s;
  let head = s.replace(/\s*[(\[].*$/s, "").replace(/[\s,;:—-]+$/, "");
  if (head.length > CARD_GLOSS) {
    const colon = head.lastIndexOf(": ");
    const tail = colon >= 0 ? head.slice(colon + 2).trim() : "";
    if (tail && tail.length <= CARD_GLOSS && !EXPLAINS(tail)) return tail;
    // A list of translations keeps the ones that fit, never half an item.
    const items = head.split(/,\s*/);
    let kept = "";
    for (const it of items) {
      const next = kept ? `${kept}, ${it}` : it;
      if (next.length > CARD_GLOSS) break;
      kept = next;
    }
    head = kept;
  }
  if (!head || head.length < 2 || EXPLAINS(head)) return null;
  return head;
}
export function cardSenses(senses) {
  if (!senses || !senses.length) return null;
  const first = cardGloss(senses[0].g);
  if (!first) return null;
  // Two senses cut to one translation are one line on a card («такой»: "such
  // (a), such, that/this kind…" and "such (a), such (used to indicate…)").
  const out = [], seen = new Set();
  senses.forEach((s, k) => {
    const g = k === 0 ? first : cardGloss(s.g);
    if (!g || seen.has(g.toLowerCase())) return;
    seen.add(g.toLowerCase());
    out.push(g === s.g ? s : { ...s, g });
  });
  return out;
}
