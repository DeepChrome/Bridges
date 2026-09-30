/* Learner state: one database per profile, memory as the working copy.
 *
 * Same schema and the same migrations as the web app — a profile exported from
 * one imports into the other. The state is read once at boot into memory and
 * written back through a debounced save; what changed on 2026-09-15 (the
 * playbook's Phase 1) is where it is written: an SQLite file (sqlite.js, on
 * the contract in core/repo.js) instead of one JSON row in AsyncStorage. A
 * save writes only what changed, and a review's log row lands in the same
 * transaction as the card it changed — the log is what the scheduler's
 * optimiser needs and the one thing a card cannot give back.
 *
 * Two rules protect the month of FSRS history that lives here (rule 20.4):
 *
 *  - A row that cannot be read is never overwritten. loadState says so
 *    (`bad`), the raw value is copied aside, and nothing is written until the
 *    learner acts. It used to return a fresh profile that the boot path saved
 *    back 250 ms later, over the top of the unreadable one.
 *  - The JSON row a profile lived in before the database is read once, moved
 *    into the database, and left exactly as it was. It is the copy that
 *    survives a migration that turns out wrong; ROADMAP 13.20 says when it
 *    goes. Nothing writes to AsyncStorage but the profile list.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { today } from "@core/util";
import { SCHEMA_VERSION, migrate, speechDefault } from "@core/state";
import { SETTING_KEYS, merge, diff, isEmpty } from "@core/repo";
import { normaliseSeen, DEFAULT_FRONTS } from "@core/scheduler";
import { openRepo } from "./db";

/* The schema and its migrations live in core/state.js since v5, shared with the web
   app so an exported profile imports into either without two copies of the steps
   having to agree. Re-exported: callers here import them from the store. */
export { SCHEMA_VERSION, migrate, SETTING_KEYS };
export const ACC_KEY = "rb.accounts";
const stateKey = (id) => "rb.state." + id;
const deckIndexKey = (id) => "rb.decks." + id;
const deckChunkKey = (id, deckId, n) => `rb.deck.${id}.${deckId}.${n}`;
const badKey = (id) => `rb.state.${id}.bad-${Date.now()}`;

export const DEFAULTS = {
  v: SCHEMA_VERSION,
  /* Off since 2026-09-23 (the owner: the path is walked from the top; only
     the placement test may open chapters ahead). The switch stays in
     Settings. The frozen web app still ships it on. */
  dev: false,
  faves: {},            // video id -> day favourited (Immerse)
  notices: {},          // one-time notes seen, by id (Immerse's creators note)
  theme: "auto",
  /* Where the flashcards' *new* cards come from: `__path__` (the units the
     learner has reached), chapters, decks. What is due is always dealt,
     whatever is ticked (core/queue.js, 2026-09-28). */
  sets: ["__path__"],
  cardKinds: ["words"],   // words, sentences, or both (core/queue.js cardKind)
  seen: {},             // word -> { recognise, produce, listen }: a card each (core/scheduler.js)
  trouble: {},
  daily: { day: null, new: 0, reviews: 0 },   // today's counts (core/queue.js dailyFor)
  /* The scheduler's settings (docs/PLAYBOOK.md 2.3): which fronts the
     flashcards ask through, the daily rations, the retention asked of the
     scheduler, and how far ahead a learning step may be taken, in minutes.
     One front by default — the Russian — since a word is one card
     (core/scheduler.js, 2026-09-23). */
  flash: DEFAULT_FRONTS.slice(),
  newPerDay: 5,
  retention: 0.9,
  learnAhead: 20,
  pinned: [],
  unit: {},             // unitId -> {best, done, video, lessons:{i:{v,q}}}
  drills: {},
  recent: [],           // dictionary history, newest first; keyed on the word itself
  name: "",
  day: null,
  streak: 0,
  speech: speechDefault(),   // the speaking activities' record; never audio
  watched: {},          // video id -> day watched (the Immerse library)
  mined: {},            // word -> {v, t, s}: taken from a video, and where from
  decks: [],            // imported Anki decks: {id, name, cards:[{ru, en}]}
  speed: "normal",      // how fast Russian is read: normal, slower, slowest
  cue: "bell",          // the sound a right answer makes (audio.js CUE_NAMES)
  osk: false,           // an on-screen Russian keyboard for typed answers
  /* Drill answers written rather than chosen. On by default: four options is
     the easier question, and §30j found production is what keeps a word. Some
     drill shapes have nothing to produce and ignore it (core/questions.js). */
  typedDrills: true,
  /* What each drill asks about and where its words come from, chosen from the
     cog on the drill (Flows.js DrillOptions): drill id -> { only, chapters }.
     Absent, a drill runs as it always did. */
  drillPrefs: {},
  /* One short paragraph from the Worker under a wrong answer, saying why
     (2026-09-26). On unless turned off; nothing is asked without a Worker. */
  explain: true,
  /* The last wrong answers, newest first, as { kind, prompt, answer, said, at }
     (Run.js): what the tutor is handed so "drill me on what I get wrong" has
     something to go on. Capped at MISSES_KEPT. */
  misses: [],
  /* What the tutor asked to remember about this learner across conversations
     (screens/Tutor.js) — a preference, a recurring confusion. Kept here, not
     on the Worker, like every other piece of learner state. */
  tutorNotes: [],
  talkLevel: null,      // how the Talk tutor pitches its Russian; null = by chapter reached
  talkSpeed: "normal",  // how fast the tutor is read out (audio.js SPEEDS)
  talkEn: true,         // English under the tutor's turns
  /* The phone's answer to an answer (haptics.js). On by default: it is the
     feedback that arrives before the sound and before the colour, and a
     learner studying with the volume down has nothing else. */
  haptics: true,
  /* Which "something new is open" notes have been shown (core/openings.js).
     Progress, not a setting: it belongs to this learner's journey through the
     route and a reset should start it over. */
  met: [],
};

export function normalise(raw, assumedVersion) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const s = { ...DEFAULTS, ...migrate(raw, raw.v || assumedVersion || 2), v: SCHEMA_VERSION };
  // Cards from before Phase 2 — one a word, timed in days — become the
  // recognise card, timed in milliseconds. Untouched when already so.
  s.seen = normaliseSeen(s.seen);
  return s;
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

/* ------------------------------------------------------------ the database */

/* One open profile at a time. `saved` is the state as the database has it,
   which is what a save is diffed against; null means the next save writes all
   of it. Opening another profile closes this one and forgets `saved` with it. */
let cur = { id: null, repo: null, saved: null, recovered: null };

async function repoFor(id) {
  if (cur.repo && cur.id === id) return cur.repo;
  const old = cur.repo;
  cur = { id: null, repo: null, saved: null, recovered: null };
  if (old) { try { await old.close(); } catch (e) { /* a handle that will not close is not this profile's problem */ } }
  const { repo, recovered } = await openRepo(id);
  cur = { id: id, repo: repo, saved: null, recovered: recovered };
  return repo;
}

/* The review log, for a backup. Empty when no profile is open. */
export async function readLog(opts) {
  return cur.repo ? cur.repo.readLog(opts) : [];
}

/* --------------------------------------------- the row it used to live in */

/* Read only. A profile saved by an older build is one JSON row, its decks in
   chunked rows beside it — Android reads a row through a 2 MB cursor window,
   and a 20,000-card deck inline was a row that wrote and then would not read.
   The database has no such window, so a deck is one row there. */
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

/* -> { state, bad }, or null when there is no row. `bad` is the raw row when
   it could not be read, and the state is then the defaults — to show, not to
   save. */
async function loadBlob(accountId) {
  let raw = null;
  try {
    raw = await AsyncStorage.getItem(stateKey(accountId));
  } catch (e) {
    return { state: { ...DEFAULTS }, bad: `(unreadable: ${e && e.message})` };
  }
  if (!raw) return null;
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

/* ------------------------------------------------------------------ state */

/* -> { state, bad, recovered }.
 *
 * The database first. Failing that, the JSON row: read through the same
 * migrations as ever, written into the database in one transaction with a
 * stamp saying so, and left untouched. Failing that, a new profile.
 *
 * `bad` is the raw row when a row could not be read (the state is then the
 * defaults, to show and never save — session.js). `recovered` is a note when
 * the database file could not be opened and was set aside (db.js): the older
 * row then stands in, and the learner is told what happened rather than
 * shown a fresh start with no word. */
export async function loadState(accountId) {
  let repo;
  try {
    repo = await repoFor(accountId);
  } catch (e) {
    return { state: { ...DEFAULTS }, bad: `(database: ${e && e.message})`, recovered: null };
  }
  let rows;
  try {
    rows = await repo.load();
  } catch (e) {
    return { state: { ...DEFAULTS }, bad: `(database: ${e && e.message})`, recovered: null };
  }
  if (rows) {
    cur.saved = merge(rows);
    /* The database answered, so the old row may have had its week (below).
       Awaited rather than fired off: the common path is one `meta` read that
       returns early, and a boot that half-finished a tidy-up is a boot that
       leaves a deck index without its chunks. */
    await retireBlob(accountId, repo);
    return { state: normalise(cur.saved), bad: null, recovered: cur.recovered };
  }
  const legacy = await loadBlob(accountId);
  if (legacy && legacy.bad) return { ...legacy, recovered: null };
  if (legacy) {
    try {
      await repo.replace(legacy.state, []);
      const c = await repo.counts();
      const stamp = { at: Date.now(), cards: c.cards, decks: c.decks, deckCards: c.deckCards };
      await repo.setMeta("migrated", JSON.stringify(stamp));
      cur.saved = legacy.state;
      console.log(`[store] ${accountId}: moved into the database — ${c.cards} cards, ${c.decks} decks (${c.deckCards} cards); the row is kept`);
    } catch (e) {
      // The row is intact and the state is on screen; the next save writes all of it.
      cur.saved = null;
      writeListeners.forEach((fn) => fn(e));
    }
    return { state: legacy.state, bad: null, recovered: cur.recovered };
  }
  cur.saved = null;
  if (cur.recovered) {
    // A database set aside and no older row to stand in: this is the fresh start.
    return { state: { ...DEFAULTS }, bad: `(database set aside: ${cur.recovered})`, recovered: null };
  }
  return { state: { ...DEFAULTS }, bad: null, recovered: null };
}

/* How long the JSON row is kept after the database takes over (ROADMAP 13.20).
 *
 * Phase 1 moved the learner's state into SQLite and **left the row alone** —
 * rule 20.4: FSRS state is high-integrity data and the copy that survives a
 * wrong migration is worth more than the bytes it costs. But two copies where
 * only one is written is a thing that rots: the row is a month out of date
 * within a month, and a future reader who finds it has to work out which is
 * real.
 *
 * So it retires itself. A week of the database actually answering, on the
 * learner's own phone, is the evidence that the migration held — and a week is
 * long enough that a bad migration would have been noticed and restored from a
 * backup by then (Settings → Back up progress writes a file the row could never
 * be recovered from anyway).
 *
 * Deliberately not a prompt, and deliberately not on the migration itself. */
export const BLOB_KEEP_MS = 7 * 86400000;

async function retireBlob(accountId, repo) {
  try {
    const raw = await repo.getMeta("migrated");
    if (!raw) return;                      // never migrated: nothing of ours to drop
    const stamp = JSON.parse(raw);
    if (!stamp || !stamp.at || Date.now() - stamp.at < BLOB_KEEP_MS) return;
    /* The database has to be carrying something. A migration that produced an
       empty database and a week of silence is exactly the case where the row
       is the only copy left, and dropping it then would be the bug this whole
       delay exists to avoid.
       `counts()` rather than the loaded rows: `load()` hands back `cards` as
       the nested `seen` object, not a list, so `rows.cards.length` is
       `undefined` and a length check on it silently never fires. It did
       exactly that until the tests said so. */
    const c = await repo.counts();
    if (!c || !c.cards) return;
    const keys = [stateKey(accountId), deckIndexKey(accountId)];
    const all = await AsyncStorage.getAllKeys();
    const chunk = `rb.deck.${accountId}.`;
    for (const k of all) if (k.startsWith(chunk)) keys.push(k);
    await AsyncStorage.multiRemove(keys);
    await repo.setMeta("migrated", JSON.stringify({ ...stamp, retired: Date.now() }));
    console.log(`[store] ${accountId}: the pre-database row retired after ${Math.round((Date.now() - stamp.at) / 86400000)} days, ${keys.length} keys`);
  } catch (e) {
    /* Never fatal. Failing to tidy up is not a reason to fail a boot, and the
       next launch tries again. */
  }
}

/* Keep the unreadable row where a person can find it, out of the way of the
   next save. */
export async function setAside(accountId, raw) {
  try { await AsyncStorage.setItem(badKey(accountId), String(raw)); } catch (e) {}
}

/* Writes are coalesced: grading a card touches state several times in a frame,
   and a write is a real round trip. They are also serialised — a flush on the
   way to the background must not start a transaction while the timer's write
   is still inside one. Review rows queue beside the state and ride with the
   next write; a write that fails keeps them for the one after. */
let pending = null, timer = null, pendingLog = [], pendingDrops = [];
let chain = Promise.resolve();
const writeListeners = new Set();
export function onWriteError(fn) { writeListeners.add(fn); return () => writeListeners.delete(fn); }

async function write(job) {
  const rows = pendingLog, drops = pendingDrops;
  pendingLog = [];
  pendingDrops = [];
  try {
    const repo = await repoFor(job.accountId);
    const d = diff(cur.saved, job.state);
    if (isEmpty(d) && !rows.length && !drops.length) return;
    await repo.apply(d, rows, drops);
    cur.saved = job.state;
  } catch (e) {
    pendingLog = rows.concat(pendingLog);
    pendingDrops = drops.concat(pendingDrops);
    writeListeners.forEach((fn) => fn(e));
  }
}

function enqueue(job) {
  chain = chain.then(() => write(job));
  return chain;
}

/* `log` rows ride with the next write; `drops` are log rows to remove — an
   undone review (core/scheduler.js reviewRow's key: word, direction, at). */
export function saveState(accountId, state, log, drops) {
  if (log && log.length) pendingLog = pendingLog.concat(log);
  if (drops && drops.length) pendingDrops = pendingDrops.concat(drops);
  pending = { accountId, state };
  if (timer) return;
  timer = setTimeout(() => {
    const job = pending;
    timer = null;
    pending = null;
    enqueue(job);
  }, 250);
}

export async function flushState() {
  if (pending) {
    const job = pending;
    clearTimeout(timer);
    timer = null;
    pending = null;
    enqueue(job);
  }
  await chain;
}

/* For the test setup only: forget the open profile and anything waiting, so
   one test's store cannot leak into the next. */
export function resetStore() {
  clearTimeout(timer);
  timer = null;
  pending = null;
  pendingLog = [];
  pendingDrops = [];
  cur = { id: null, repo: null, saved: null, recovered: null };
}

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
