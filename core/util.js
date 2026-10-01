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

/* A verb's sense is written "to …". OpenRussian glosses most verbs bare —
   163 of the 219 verbs the units teach — so "work" stood for both «работа»
   and «работать», and "judge" for «судья» and «судить», on a word list and on
   an English-front card (the content sweep, 2026-09-30). Comparisons strip
   the "to" again (senseKey in core/questions.js), so this changes what is
   read and never what counts as the same meaning. */
export function asInfinitive(s) {
  return /^(to\b|\()/i.test(s) ? s : `to ${s}`;
}
