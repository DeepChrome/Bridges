/* The learner's state as rows, and the store that holds them.
 *
 * Memory is the working copy: every screen reads `st` and the whole of it is
 * a few hundred kilobytes. What changed on 2026-09-15 (the playbook's Phase 1)
 * is what the copy is written *to*. It used to be one JSON row; it is now a
 * database, so a review can leave a log row beside the card it changed and
 * the two land together or not at all. The scheduler's optimiser fits its
 * weights to that log, and nothing else in the app can recover it: a card is
 * overwritten by every grade.
 *
 * This file is the part both stores share, with no SQL in it:
 *
 *   - `split` / `merge`   the state object as five kinds of row and back
 *   - `diff`              what one save has to write, given what was written
 *   - `memoryRepo`        the contract, kept in memory — tests and the tools
 *
 * `native/src/sqlite.js` is the same contract on expo-sqlite. A repo is:
 *
 *   load()                -> rows or null when nothing was ever written
 *   replace(state, log)   -> everything, in one transaction (a restore, a migration)
 *   apply(diff, log)      -> one save's changes, in one transaction
 *   readLog({since,limit}) -> review rows, oldest first
 *   counts()              -> how many of each, for a gate and a migration stamp
 *   getMeta(k) / setMeta(k, v)   notes about the store itself, not the learner
 *   close()
 *
 * Progress and settings are JSON text keyed by the state's own key names, so
 * a key this file has never heard of still round-trips — the shape is
 * `core/state.js`'s to change, and a store must not lose what it does not
 * understand. The card table has a `direction` column held at one value:
 * Phase 2 splits a word's memory by direction without a schema change.
 */

/* The keys that are settings rather than progress: what "Reset progress"
   keeps and what the settings table holds. Imported decks are kept by a reset
   too, but they are their own table, not a setting. */
export const SETTING_KEYS = ["dev", "theme", "dir", "name", "speed", "cue", "osk",
                             "typedDrills", "offline", "talkLevel", "talkSpeed", "talkEn"];

/* One card serves both directions today. */
export const DIRECTION = "both";

const CARD_FIELDS = ["s", "d", "due", "last", "reps", "lapses"];
const LOG_FIELDS = ["word", "grade", "day", "at", "s", "d", "due", "last", "reps", "lapses", "elapsed", "source"];

/* A card as a row: every column present, null where the card has no field.
   The two counters are 0 rather than null, which is what every reader makes
   of a missing one (`card.reps || 0`) and what the table's NOT NULL means. */
export function cardRow(word, c) {
  const r = { word: word };
  for (const k of CARD_FIELDS) r[k] = c && c[k] !== undefined ? c[k] : null;
  r.reps = (c && c.reps) || 0;
  r.lapses = (c && c.lapses) || 0;
  return r;
}

/* A row as a card. A null column is a field the card never had, and it must
   come back absent rather than null: fsrsReview reads `card.last === undefined`
   to mean "never reviewed", and a null there would make the first review look
   like one after `now` days. */
export function rowCard(r) {
  const c = {};
  for (const k of CARD_FIELDS) if (r[k] !== null && r[k] !== undefined) c[k] = r[k];
  return c;
}

const sameCard = (a, b) => CARD_FIELDS.every((k) => a[k] === b[k]);

/* -> { cards, decks, progress, settings }. `undefined` values are dropped:
   they are not JSON, and a store that tried to keep one would fail to bind it. */
export function split(state) {
  const cards = {}, progress = {}, settings = {};
  for (const k in state) {
    if (k === "seen" || k === "decks" || state[k] === undefined) continue;
    (SETTING_KEYS.includes(k) ? settings : progress)[k] = state[k];
  }
  const seen = state.seen || {};
  for (const w in seen) if (seen[w]) cards[w] = seen[w];
  return { cards: cards, decks: state.decks || [], progress: progress, settings: settings };
}

/* The rows a store loaded, back as one state object — the shape `normalise`
   in the native store and the web app's loader both expect. */
export function merge(rows) {
  return Object.assign({}, rows.settings, rows.progress, { seen: rows.cards, decks: rows.decks });
}

/* What one save must write.
 *
 * `prev` is the state as the store last wrote it (null: nothing yet, so all
 * of it), `next` the state now. Cards are compared field by field once their
 * identity differs, so a grade writes one card; progress and settings by
 * their JSON once identity differs; decks by identity, since a deck object is
 * only ever replaced on import or removal and comparing twenty thousand cards
 * to learn nothing changed is what identity is for.
 *
 *   { cards:    { put: [row], del: [word] },
 *     decks:    { put: [{ id, ord, name, n, json }], del: [id] }  — null when untouched
 *     progress: { put: { key: json }, del: [key] },
 *     settings: { put: { key: json }, del: [key] } }
 */
export function diff(prev, next) {
  const out = { cards: { put: [], del: [] }, decks: null,
                progress: { put: {}, del: [] }, settings: { put: {}, del: [] } };
  const ps = (prev && prev.seen) || {}, ns = next.seen || {};
  if (ps !== ns) {
    for (const w in ns) {
      if (!ns[w]) continue;
      if (!ps[w] || (ps[w] !== ns[w] && !sameCard(ps[w], ns[w]))) out.cards.put.push(cardRow(w, ns[w]));
    }
    for (const w in ps) if (ps[w] && !ns[w]) out.cards.del.push(w);
  }
  const pd = (prev && prev.decks) || null, nd = next.decks || [];
  if (!prev || pd !== nd) {
    const before = new Map((pd || []).map((d) => [d.id, d]));
    const put = [], keep = new Set();
    nd.forEach((d, i) => {
      keep.add(d.id);
      if (before.get(d.id) !== d) put.push(deckRow(d, i));
    });
    const del = [...before.keys()].filter((id) => !keep.has(id));
    if (put.length || del.length) out.decks = { put: put, del: del };
  }
  for (const k in next) {
    if (k === "seen" || k === "decks" || next[k] === undefined) continue;
    const slot = SETTING_KEYS.includes(k) ? out.settings : out.progress;
    if (prev && prev[k] === next[k]) continue;
    const json = JSON.stringify(next[k]);
    if (prev && prev[k] !== undefined && JSON.stringify(prev[k]) === json) continue;
    slot.put[k] = json;
  }
  if (prev) {
    for (const k in prev) {
      if (k === "seen" || k === "decks" || prev[k] === undefined) continue;
      if (next[k] === undefined) (SETTING_KEYS.includes(k) ? out.settings : out.progress).del.push(k);
    }
  }
  return out;
}

export function deckRow(d, ord) {
  return { id: d.id, ord: ord, name: d.name || "", n: (d.cards || []).length, json: JSON.stringify(d) };
}

export function isEmpty(d) {
  return !d.cards.put.length && !d.cards.del.length && !d.decks
    && !Object.keys(d.progress.put).length && !d.progress.del.length
    && !Object.keys(d.settings.put).length && !d.settings.del.length;
}

/* A review row from outside — a backup file — is kept only when it has the
   fields a log row cannot do without. Anything else is dropped rather than
   stored as a row the optimiser would trip on. */
export function validLog(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === "object" && typeof r.word === "string" && r.word
    && Number.isFinite(r.at) && Number.isFinite(r.day)
    && r.grade >= 1 && r.grade <= 4 && (r.grade | 0) === r.grade);
}

/* A log row with every column present, null where absent, the counters 0.
   Refuses what the table's own rules would refuse — a grade outside 1–4, no
   word, no time — so the store in memory and the one on disk fail alike, and
   before anything is written. */
export function logRow(r) {
  const out = { direction: (r && r.direction) || DIRECTION };
  for (const k of LOG_FIELDS) out[k] = r && r[k] !== undefined ? r[k] : null;
  out.reps = (r && r.reps) || 0;
  out.lapses = (r && r.lapses) || 0;
  if (!(out.grade >= 1 && out.grade <= 4) || typeof out.word !== "string" || !out.word
      || !Number.isFinite(out.at) || !Number.isFinite(out.day)) {
    throw new Error("not a review row: " + JSON.stringify(r));
  }
  return out;
}

/* The contract, in memory. Values are kept as JSON text exactly as SQLite
   keeps them, so a store that appeared to work here because it shared an
   object with the caller cannot exist. */
export function memoryRepo() {
  const cards = new Map(), decks = new Map(), progress = new Map(), settings = new Map(), meta = new Map();
  const log = [], logKeys = new Set();
  const logKey = (r) => `${r.word}${r.direction}${r.at}`;
  /* Rows are checked before anything is applied, so a bad one leaves the
     store as it was — the transaction SQLite gives for nothing. */
  const checked = (rows) => (rows || []).map(logRow);
  const append = (rows) => {
    for (const r of rows) {
      const k = logKey(r);
      if (logKeys.has(k)) continue;
      logKeys.add(k);
      log.push(Object.assign({ id: log.length + 1 }, r));
    }
  };
  const applyDiff = (d) => {
    for (const r of d.cards.put) cards.set(r.word, Object.assign({}, r));
    for (const w of d.cards.del) cards.delete(w);
    if (d.decks) {
      for (const r of d.decks.put) decks.set(r.id, Object.assign({}, r));
      for (const id of d.decks.del) decks.delete(id);
    }
    for (const k in d.progress.put) progress.set(k, d.progress.put[k]);
    for (const k of d.progress.del) progress.delete(k);
    for (const k in d.settings.put) settings.set(k, d.settings.put[k]);
    for (const k of d.settings.del) settings.delete(k);
  };
  const parsed = (m) => {
    const o = {};
    for (const [k, v] of m) o[k] = JSON.parse(v);
    return o;
  };
  return {
    async load() {
      if (!progress.has("v")) return null;
      const c = {};
      for (const [w, r] of cards) c[w] = rowCard(r);
      const ds = [...decks.values()].sort((a, b) => a.ord - b.ord).map((r) => JSON.parse(r.json));
      return { cards: c, decks: ds, progress: parsed(progress), settings: parsed(settings) };
    },
    async replace(state, rows) {
      const ok = checked(rows);
      cards.clear(); decks.clear(); progress.clear(); settings.clear();
      applyDiff(diff(null, state));
      append(ok);
    },
    async apply(d, rows) {
      const ok = checked(rows);
      applyDiff(d);
      append(ok);
    },
    async readLog(opts) {
      const o = opts || {};
      let rows = log.filter((r) => o.since === undefined || r.at >= o.since);
      if (o.limit !== undefined) rows = rows.slice(0, o.limit);
      return rows.map((r) => Object.assign({}, r));
    },
    async counts() {
      let deckCards = 0;
      for (const r of decks.values()) deckCards += r.n;
      return { cards: cards.size, decks: decks.size, deckCards: deckCards, log: log.length,
               progress: progress.size, settings: settings.size };
    },
    async getMeta(k) { return meta.has(k) ? meta.get(k) : null; },
    async setMeta(k, v) { meta.set(k, String(v)); },
    async close() {},
  };
}
