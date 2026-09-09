/* Learner state on AsyncStorage.
 *
 * Same schema and the same migrations as the web app — a profile exported from one
 * imports into the other. The difference that matters: AsyncStorage is async, so the
 * state is read once at boot into memory and written back through a debounced save
 * rather than synchronously on every keystroke like localStorage allowed.
 *
 * Two rules protect the month of FSRS history that lives here (rule 20.4):
 *
 *  - A row that cannot be read is never overwritten. loadState says so
 *    (`bad`), the raw value is copied aside, and nothing is written until the
 *    learner acts. It used to return a fresh profile that the boot path saved
 *    back 250 ms later, over the top of the unreadable one.
 *  - Imported Anki decks live in their own rows, in chunks. Android reads a
 *    row through a 2 MB cursor window, and a 20,000-card deck inline in the
 *    profile row is 2.4 MB: the write succeeds, the next read fails, and rule
 *    one's failure follows. `st.decks` is still the whole array in memory;
 *    only the storage layout changed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { today } from "@core/util";
import { SCHEMA_VERSION, migrate, speechDefault } from "@core/state";

/* The schema and its migrations live in core/state.js since v5, shared with the web
   app so an exported profile imports into either without two copies of the steps
   having to agree. Re-exported: callers here import them from the store. */
export { SCHEMA_VERSION, migrate };
export const ACC_KEY = "rb.accounts";
const stateKey = (id) => "rb.state." + id;
const deckIndexKey = (id) => "rb.decks." + id;
const deckChunkKey = (id, deckId, n) => `rb.deck.${id}.${deckId}.${n}`;
const badKey = (id) => `rb.state.${id}.bad-${Date.now()}`;
/* Cards per row: 4,000 of the owner's real cards measure ~500 KB, a quarter of
   the window. */
export const DECK_CHUNK = 4000;

export const DEFAULTS = {
  v: SCHEMA_VERSION,
  dev: true,            // ships on, as on the web
  theme: "auto",
  dir: 0,
  sets: [],
  seen: {},             // word -> FSRS card {s, d, due, last, reps, lapses}
  trouble: {},
  pinned: [],
  unit: {},             // unitId -> {best, done, video, lessons:{i:{v,q}}}
  drills: {},
  recent: [],           // dictionary history, newest first; keyed on the word itself
  name: "",
  xp: 0,
  day: null,
  streak: 0,
  speech: speechDefault(),   // the speaking activities' record; never audio
  watched: {},          // video id -> day watched (the Immerse library)
  decks: [],            // imported Anki decks: {id, name, cards:[{ru, en}]}
  speed: "normal",      // how fast Russian is read: normal, slower, slowest
  cue: "bell",          // the sound a right answer makes (audio.js CUE_NAMES)
  osk: false,           // an on-screen Russian keyboard for typed answers
  offline: false,       // download a unit's audio when it is opened (cache.js)
  talkLevel: null,      // how the Talk tutor pitches its Russian; null = by chapter reached
  talkSpeed: "normal",  // how fast the tutor is read out (audio.js SPEEDS)
  talkEn: true,         // English under the tutor's turns
};

/* The keys that are settings, not progress: what "Reset progress" keeps. */
export const SETTING_KEYS = ["dev", "theme", "dir", "name", "decks", "speed", "cue", "osk",
                             "offline", "talkLevel", "talkSpeed", "talkEn"];

export function normalise(raw, assumedVersion) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  return { ...DEFAULTS, ...migrate(raw, raw.v || assumedVersion || 2), v: SCHEMA_VERSION };
}

/* ---------------------------------------------------------------- profiles */

export async function loadAccounts() {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(ACC_KEY)) || "null");
    if (raw && Array.isArray(raw.list)) return raw;
  } catch (e) { /* fall through */ }
  return { list: [], active: null };
}

export async function saveAccounts(accounts) {
  try { await AsyncStorage.setItem(ACC_KEY, JSON.stringify(accounts)); } catch (e) {}
}

export function newId() {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

/* ------------------------------------------------------------------ decks */

async function loadDecks(accountId) {
  const raw = await AsyncStorage.getItem(deckIndexKey(accountId));
  if (!raw) return null;
  const index = JSON.parse(raw);
  const decks = [];
  for (const d of index) {
    const cards = [];
    for (let n = 0; n < (d.chunks || 0); n++) {
      const part = await AsyncStorage.getItem(deckChunkKey(accountId, d.id, n));
      if (part) cards.push(...JSON.parse(part));
    }
    decks.push({ ...d, chunks: undefined, cards });
  }
  return decks;
}

async function saveDecks(accountId, decks) {
  const index = [];
  const keep = new Set();
  for (const d of decks || []) {
    const cards = d.cards || [];
    const chunks = Math.ceil(cards.length / DECK_CHUNK);
    for (let n = 0; n < chunks; n++) {
      const k = deckChunkKey(accountId, d.id, n);
      keep.add(k);
      await AsyncStorage.setItem(k, JSON.stringify(cards.slice(n * DECK_CHUNK, (n + 1) * DECK_CHUNK)));
    }
    index.push({ ...d, cards: undefined, chunks });
  }
  await AsyncStorage.setItem(deckIndexKey(accountId), JSON.stringify(index));
  // Rows of a deck that was removed or shrank.
  const prefix = `rb.deck.${accountId}.`;
  const all = await AsyncStorage.getAllKeys();
  const stale = all.filter((k) => k.startsWith(prefix) && !keep.has(k));
  if (stale.length) await AsyncStorage.multiRemove(stale);
}

/* ------------------------------------------------------------------ state */

/* -> { state, bad }: `bad` is the raw row when it could not be read, and the
   state is then the defaults — to show, not to save. A missing row is simply a
   new profile (`bad` null). */
export async function loadState(accountId) {
  let raw = null;
  try {
    raw = await AsyncStorage.getItem(stateKey(accountId));
  } catch (e) {
    return { state: { ...DEFAULTS }, bad: `(unreadable: ${e && e.message})` };
  }
  if (!raw) return { state: { ...DEFAULTS }, bad: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  } catch (e) {
    return { state: { ...DEFAULTS }, bad: raw };
  }
  let decks = null;
  try { decks = await loadDecks(accountId); } catch (e) { decks = null; }
  const state = normalise(parsed);
  // Decks in their own rows win; a profile saved before the split still
  // carries them inline and is read as it was.
  if (decks) state.decks = decks;
  return { state, bad: null };
}

/* Keep the unreadable row where a person can find it, out of the way of the
   next save. */
export async function setAside(accountId, raw) {
  try { await AsyncStorage.setItem(badKey(accountId), String(raw)); } catch (e) {}
}

/* Writes are coalesced: grading a card touches state several times in a frame, and
   AsyncStorage is a real round trip. Decks are written only when the array
   changed — they are the bulk, and they change on an import. */
let pending = null, timer = null;
let lastDecks = null;
const writeListeners = new Set();
export function onWriteError(fn) { writeListeners.add(fn); return () => writeListeners.delete(fn); }

async function write(job) {
  const { decks, ...rest } = job.state;
  try {
    await AsyncStorage.setItem(stateKey(job.accountId), JSON.stringify(rest));
    if (decks !== lastDecks) {
      await saveDecks(job.accountId, decks);
      lastDecks = decks;
    }
  } catch (e) {
    writeListeners.forEach((fn) => fn(e));
  }
}

export function saveState(accountId, state) {
  pending = { accountId, state };
  if (timer) return;
  timer = setTimeout(async () => {
    const job = pending;
    timer = null;
    pending = null;
    await write(job);
  }, 250);
}

export async function flushState() {
  if (!pending) return;
  const job = pending;
  clearTimeout(timer);
  timer = null;
  pending = null;
  await write(job);
}

/* A profile switch must not carry the last profile's deck reference over. */
export function forgetDecks() { lastDecks = null; }

export function touchStreak(state) {
  const t = today();
  if (state.day === t) return state;
  // Imported or migrated state knows the streak but not when it last advanced;
  // adopt it rather than resetting to 1.
  const streak = (state.day === null || state.day === undefined)
    ? (state.streak || 1)
    : (state.day === t - 1 ? (state.streak || 0) + 1 : 1);
  return { ...state, streak, day: t };
}
