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
import { SCHEMA_VERSION, migrate } from "@core/state";
import { SETTING_KEYS, merge, diff, isEmpty } from "@core/repo";
import { applyOps } from "@core/sync";
import { replayLog, schedulerOpts } from "@core/scheduler";
import { DEFAULTS, normalise, touchStreak } from "@core/defaults";
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

/* A fresh profile and the reading of a saved one live in core/defaults.js
   since 2026-11-07 (the desktop starts a profile from the same shape). */
export { DEFAULTS, normalise };

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

/* The open profile's repository, for the sync client (src/sync.js): it
   reads the outbox and the link from it and writes pulled rows into it. */
export const profileRepo = (id) => repoFor(id);

/* Ops pulled from the server and already written by the repository
   (core/sqlrepo.js applyOps): folded into the copy a save is diffed against,
   so the next save does not read them as this device's own changes and
   push them straight back. session.js folds the same ops into `st`. */
export function absorbOps(accountId, ops) {
  if (cur.id === accountId && cur.saved && ops && ops.length) cur.saved = applyOps(cur.saved, ops);
}

/* Told after every write that landed: what the sync client pushes on. */
const wroteListeners = new Set();
export function onWrote(fn) { wroteListeners.add(fn); return () => wroteListeners.delete(fn); }

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
    const state = await seedSkills(accountId, repo, normalise(cur.saved));
    return { state, bad: null, recovered: cur.recovered };
  }
  const legacy = await loadBlob(accountId);
  if (legacy && legacy.bad) return { ...legacy, recovered: null };
  if (legacy) {
    try {
      await repo.replace(legacy.state, []);
      const c = await repo.counts();
      const stamp = { at: Date.now(), cards: c.cards, decks: c.decks, deckCards: c.deckCards };
      await repo.setMeta("migrated", JSON.stringify(stamp));
      // A row carried no log, so there is nothing to seed the scores from;
      // stamped so the next boot does not replay what this build writes.
      await repo.setMeta("skills", JSON.stringify({ at: Date.now(), rows: 0 }));
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

/* **The four scores, filled in from the review log once** (core/skills.js,
 * 2026-10-29). A profile graded before the skill slots existed has months of
 * answers in its log, each row naming the question kind (`source`) and the
 * front; `replayLog` grades the slots from them, so the breakdown is not
 * four "Not asked yet" on the day the feature arrives, and the drills have
 * something to choose on. Done once, stamped in `meta` under `skills`, and
 * written straight away rather than left for the next save: a boot that
 * seeded and then crashed before a grade would otherwise replay the whole
 * log again on top of the slots it had already written. The form drills
 * never wrote a log row (they graded nothing), so "Cases & forms" starts
 * empty for everyone. Never fatal — a profile that cannot be seeded is a
 * profile whose scores start today. */
async function seedSkills(accountId, repo, state) {
  try {
    if (await repo.getMeta("skills")) return state;
    const rows = await repo.readLog();
    const seen = replayLog(state.seen, rows, schedulerOpts(state));
    const seeded = seen === state.seen ? state : { ...state, seen };
    if (seeded !== state) {
      await repo.apply(diff(cur.saved, seeded), [], []);
      cur.saved = seeded;
    }
    await repo.setMeta("skills", JSON.stringify({ at: Date.now(), rows: rows.length }));
    if (rows.length) console.log(`[store] ${accountId}: skill scores seeded from ${rows.length} log rows`);
    return seeded;
  } catch (e) {
    return state;
  }
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
    wroteListeners.forEach((fn) => { try { fn(job.accountId); } catch (e2) { /* a listener's problem, not the save's */ } });
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

export { touchStreak };
