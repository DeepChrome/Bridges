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

/* Day number. Scheduling works in whole days, like Anki. */
export const today = () => Math.floor(Date.now() / 86400000);

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
  for (let i = 0; i < gloss.length; i++) {
    const c = gloss[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if ((c === "," || c === ";") && depth === 0) {
      const s = gloss.slice(0, i).trim();
      return s || w.b;
    }
  }
  return gloss.trim() || w.b;
}
