/* Sync: one profile on more than one device (2026-11-07).
 *
 * The owner asked for a computer version that "synchronizes with a user's
 * profile", and that the learning attach to the profile rather than to the
 * phone. Until now the Worker deliberately held no learner state (§30d); it
 * holds it now, per account, in a Durable Object with its own SQLite
 * (backend/src/sync.js). This file is the part every device and the server
 * share, with no storage and no network in it:
 *
 *   - an **op** is one row of the learner's state and when it last changed:
 *       { k: "card" | "kv" | "deck" | "log", id, v, at }
 *     `id` names the row (`rid`), `v` is its JSON text, or null when the row
 *     was deleted, `at` the clock when that happened. The same four kinds the
 *     repository keeps (core/repo.js), nothing invented for the wire.
 *   - **last write wins** per row (`newer`): a row arriving with a later `at`
 *     replaces the one held; the same `at` is settled by the text, so two
 *     stores given the same ops in any order end up identical.
 *   - `opsOf(diff, log, drops, at)` turns one save into ops — the outbox a
 *     device pushes — and `applyOps(state, ops)` folds pulled ops into a
 *     state object, which is how a change made on the phone reaches the
 *     memory the desktop's screens read, and the other way round.
 *
 * Review-log rows are ops too (a review is a row, an undone review deletes
 * it), so the optimiser's record travels with the cards.
 *
 * What is deliberately not here: a merge of two edits to the same card.
 * A card is one memory and the later grade is the one that happened last;
 * a progress key (`unit`, `drills`) is one JSON blob and the later save of
 * it wins whole. Two devices used offline at once on different lessons can
 * therefore lose one device's lesson flag; splitting `unit` by unit id is
 * the fix if that ever bites, and it is a change to the kv keys alone.
 */

import { cardRow, rowCard, deckRow, logRow } from "./repo.js";

export const SEP = "\u0001";
export const KINDS = ["card", "kv", "deck", "log"];

/* The protocol version a device sends; a server that does not know it
   refuses rather than guessing. */
export const PROTOCOL = 1;
/* How many ops one pull returns at most; `more` says to ask again. */
export const PAGE = 2000;

/* ------------------------------------------------------------- row ids */

export const cardId = (word, direction) => `${word}${SEP}${direction}`;
export const kvId = (table, key) => `${table}${SEP}${key}`;
export const logId = (word, direction, at) => `${word}${SEP}${direction || "recognise"}${SEP}${at}`;

export function parseId(k, id) {
  const p = String(id).split(SEP);
  if (k === "card") return { word: p[0], direction: p[1] };
  if (k === "kv") return { table: p[0], key: p.slice(1).join(SEP) };
  if (k === "log") return { word: p[0], direction: p[1], at: Number(p[2]) };
  return { id: id };
}

/* ------------------------------------------------------------- the ops */

const text = (v) => (v === undefined ? null : JSON.stringify(v));

export const opCard = (word, direction, card, at) =>
  ({ k: "card", id: cardId(word, direction), v: card ? text(rowCard(cardRow(word, direction, card))) : null, at });
export const opKv = (table, key, json, at) => ({ k: "kv", id: kvId(table, key), v: json === undefined ? null : json, at });
export const opDeckRow = (row, at) => ({ k: "deck", id: row.id, v: text({ ord: row.ord, json: row.json }), at });
export const opDeckDel = (id, at) => ({ k: "deck", id, v: null, at });
export const opLog = (row) => {
  const r = logRow(row);
  return { k: "log", id: logId(r.word, r.direction, r.at), v: text(r), at: r.at };
};
export const opLogDel = (key, at) => ({ k: "log", id: logId(key.word, key.direction, key.at), v: null, at });

/* Whether `a` should replace `b`: later wins; the same moment is settled by
   the text so that every store agrees, and a deletion loses to a value at
   the same instant (a row written and undone in one ms keeps the write,
   which is the harmless way round). */
export function newer(a, b) {
  if (!b) return true;
  if (a.at !== b.at) return a.at > b.at;
  if (a.v === b.v) return false;
  if (a.v === null) return false;
  if (b.v === null) return true;
  return a.v > b.v;
}

/* One save as ops: what `diff` (core/repo.js) put and deleted, the review
   rows it carried, and the rows it dropped — all stamped `at`, except a log
   row, which carries the moment it was reviewed. */
export function opsOf(d, log, drops, at) {
  const out = [];
  if (d) {
    for (const r of d.cards.put) out.push({ k: "card", id: cardId(r.word, r.direction), v: text(rowCard(r)), at });
    for (const k of d.cards.del) out.push({ k: "card", id: cardId(k.word, k.direction), v: null, at });
    if (d.decks) {
      for (const r of d.decks.put) out.push(opDeckRow(r, at));
      for (const id of d.decks.del) out.push(opDeckDel(id, at));
    }
    for (const t of ["progress", "settings"]) {
      for (const key in d[t].put) out.push(opKv(t, key, d[t].put[key], at));
      for (const key of d[t].del) out.push(opKv(t, key, undefined, at));
    }
  }
  for (const r of log || []) out.push(opLog(r));
  for (const k of drops || []) out.push(opLogDel({ direction: "recognise", ...k }, at));
  return out;
}

/* The whole of a state as ops, for a device's first push to a fresh account
   (and a test's convenience): `split` (core/repo.js) is what one save of
   everything writes, so that is what is sent. */
export function opsOfState(split, log, at) {
  const d = { cards: { put: split.cards, del: [] },
              decks: { put: split.decks.map((x, i) => deckRow(x, i)), del: [] },
              progress: { put: {}, del: [] }, settings: { put: {}, del: [] } };
  for (const k in split.progress) d.progress.put[k] = JSON.stringify(split.progress[k]);
  for (const k in split.settings) d.settings.put[k] = JSON.stringify(split.settings[k]);
  return opsOf(d, log, [], at);
}

/* Fold ops into a state object, newest-known first already applied by the
   caller (a store decides with `newer` which ops to take; this only writes
   the ones it was handed). Returns a new object; the one given is untouched.
   Log ops change nothing here — the log is the repository's, not the
   state's. */
export function applyOps(state, ops) {
  if (!ops || !ops.length) return state;
  const next = Object.assign({}, state);
  let seen = null, decks = null;
  for (const op of ops) {
    if (op.k === "card") {
      const { word, direction } = parseId("card", op.id);
      if (!seen) seen = Object.assign({}, state.seen || {});
      const entry = Object.assign({}, seen[word] || {});
      if (op.v === null) delete entry[direction];
      // The text is the card's own shape; the round trip through a row drops
      // the nulls a store would have kept as columns.
      else entry[direction] = rowCard(cardRow(word, direction, JSON.parse(op.v)));
      if (Object.keys(entry).length) seen[word] = entry;
      else delete seen[word];
    } else if (op.k === "kv") {
      const { key } = parseId("kv", op.id);
      if (op.v === null) delete next[key];
      else next[key] = JSON.parse(op.v);
    } else if (op.k === "deck") {
      if (!decks) decks = new Map((state.decks || []).map((d, i) => [d.id, { ord: i, deck: d }]));
      if (op.v === null) decks.delete(op.id);
      else {
        const { ord, json } = JSON.parse(op.v);
        decks.set(op.id, { ord, deck: JSON.parse(json) });
      }
    }
  }
  if (seen) next.seen = seen;
  if (decks) next.decks = [...decks.values()].sort((a, b) => a.ord - b.ord).map((x) => x.deck);
  return next;
}

/* The log rows among a set of ops, as the repository takes them: rows to
   append and keys to drop. */
export function logOf(ops) {
  const rows = [], drops = [];
  for (const op of ops) {
    if (op.k !== "log") continue;
    if (op.v === null) drops.push(parseId("log", op.id));
    else rows.push(JSON.parse(op.v));
  }
  return { rows, drops };
}

/* A device token on the wire: `s1.<account>.<secret>`. The account names the
   object that holds the profile; the secret is what that object checks.
   Parsed here so the app and the Worker cannot disagree about the shape. */
export function parseToken(token) {
  const m = /^s1\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{20,})$/.exec(String(token || ""));
  return m ? { account: m[1], secret: m[2] } : null;
}
export const makeToken = (account, secret) => `s1.${account}.${secret}`;

/* A pairing code: six digits, shown large on the computer and typed on the
   phone. Digits only, so the phone's number pad does. */
export const PAIR_CODE_LEN = 6;
export const PAIR_TTL_MS = 10 * 60 * 1000;
export const isPairCode = (s) => new RegExp(`^\\d{${PAIR_CODE_LEN}}$`).test(String(s || "").trim());

/* An op from outside is kept only when it has the shape above — a stranger's
   device can send anything, and the store must not hold rows it cannot read. */
export function validOp(op) {
  if (!op || typeof op !== "object") return false;
  if (!KINDS.includes(op.k)) return false;
  if (typeof op.id !== "string" || !op.id || op.id.length > 4000) return false;
  if (op.v !== null && typeof op.v !== "string") return false;
  if (!Number.isFinite(op.at)) return false;
  if (op.k === "log" && op.v !== null) {
    try { logRow(JSON.parse(op.v)); } catch (e) { return false; }
  }
  return true;
}
