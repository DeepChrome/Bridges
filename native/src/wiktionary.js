/* A word the dictionary does not have, looked up on Wiktionary (the owner,
 * 2026-11-19: *"For the search button, anything not in the local dictionary
 * perhaps it can be a query to something external? … display the contents
 * via API query in the app rather than loading their browser"*).
 *
 * The local dictionary stays — 51,808 entries that work on a train — and this
 * is the shelf beyond it: English Wiktionary's definition API, for a Russian
 * word only (its English pages define English words, not translate them).
 * One request per word, on a press rather than on every keystroke, kept for
 * the session. The reply is definitions as HTML; what is shown is their text,
 * by part of speech, with the licence line Wiktionary's terms ask for
 * (CC BY-SA 3.0, rule 20.10). Nothing is stored and nothing enters the
 * scheduler: a word from here is read, not studied.
 *
 * `deps.fetch` for the tests; a build offline simply gets null. */

export const WIKTIONARY_API = "https://en.wiktionary.org/api/rest_v1/page/definition/";
export const WIKTIONARY_PAGE = "https://en.wiktionary.org/wiki/";
export const WIKTIONARY_TIMEOUT_MS = 7000;
export const WIKTIONARY_LICENCE = "From Wiktionary · CC BY-SA 3.0";
/* Wikimedia asks a client to name itself; a generic name, no contact (the
   app has a feedback route of its own). */
const CLIENT = "YaRussianApp/1.0 (language-learning app; dictionary fallback)";
const CYRILLIC = /^[Ѐ-ӿ][Ѐ-ӿ́̀'-]*$/;

const cache = new Map();

/* HTML to text: tags off, entities back, runs of space collapsed. */
export function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

/* The reply's Russian section as { pos, senses: [text] }, empty senses out. */
export function parseWiktionary(json) {
  const ru = json && Array.isArray(json.ru) ? json.ru : [];
  const out = [];
  for (const e of ru) {
    const senses = (e.definitions || []).map((d) => textOf(d && d.definition)).filter(Boolean);
    if (senses.length) out.push({ pos: textOf(e.partOfSpeech).toLowerCase(), senses });
  }
  return out;
}

/* Whether a query is a Russian word worth asking about: one word, Cyrillic. */
export const canLookUp = (q) => CYRILLIC.test(String(q || "").trim());

/* The entries for a word, or null: not Russian, offline, not on Wiktionary. */
export async function lookupWiktionary(word, deps = {}) {
  const w = String(word || "").trim().normalize("NFD").replace(/[̀́]/g, "").normalize("NFC").toLowerCase();
  if (!canLookUp(w)) return null;
  if (cache.has(w)) return cache.get(w);
  const fetchFn = deps.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs || WIKTIONARY_TIMEOUT_MS);
  try {
    const r = await fetchFn(WIKTIONARY_API + encodeURIComponent(w), {
      signal: ctl.signal, headers: { accept: "application/json", "Api-User-Agent": CLIENT } });
    if (!r || !r.ok) { if (r && r.status === 404) cache.set(w, null); return null; }
    const entries = parseWiktionary(await r.json());
    const out = entries.length ? { word: w, entries, url: WIKTIONARY_PAGE + encodeURIComponent(w) + "#Russian" } : null;
    cache.set(w, out);
    return out;
  } catch (e) {
    return null;                     // offline or slow: nothing to show, nothing to say
  } finally {
    clearTimeout(timer);
  }
}

export const resetWiktionary = () => cache.clear();
