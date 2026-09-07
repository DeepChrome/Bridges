/* Anki decks in and out (the owner, 2026-09-07): the pure parts.
 *
 * Reading: a note's fields become one card, the first Cyrillic field the Russian
 * and the first non-Cyrillic one the English; HTML and Anki's [sound:] tags are
 * stripped. Writing: the rows of a legacy Anki collection (schema 11, which every
 * Anki since 2.0 and AnkiDroid import) with one Basic note type — Front the
 * Russian, Back the English — and one card per note. The platform module
 * (native/src/anki.js) does the files, the zip and the SQLite; nothing here
 * touches a device.
 */

import { fold } from "./util.js";

const CYRILLIC = /[а-яёА-ЯЁ]/;
const FIELD_SEP = "\x1f";

/* One field's text, as a learner would read it. */
export function cleanField(s) {
  return String(s || "")
    .replace(/\[sound:[^\]]*\]/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

/* A card from a note's fields, or null when no field holds Russian. */
export function cardFromFields(fields) {
  const clean = (fields || []).map(cleanField);
  const ru = clean.find((f) => CYRILLIC.test(f));
  if (!ru) return null;
  const en = clean.find((f) => f && !CYRILLIC.test(f)) || "";
  return { ru, en };
}

export const splitFields = (flds) => String(flds || "").split(FIELD_SEP);

/* Cards from note rows [{ flds, deck }], grouped by deck and deduplicated on the
   folded Russian; a deck's name is its last "::" segment's parent chain kept —
   "Russian::Food" stays as written, since that is the name the learner knows. */
export function decksFromNotes(notes) {
  const decks = new Map();
  for (const n of notes) {
    const card = cardFromFields(splitFields(n.flds));
    if (!card) continue;
    const name = (n.deck || "Imported").trim() || "Imported";
    if (!decks.has(name)) decks.set(name, { name, cards: [], keys: new Set() });
    const d = decks.get(name);
    const key = fold(card.ru);
    if (d.keys.has(key)) continue;
    d.keys.add(key);
    d.cards.push(card);
  }
  return [...decks.values()].filter((d) => d.cards.length)
    .map((d) => ({ name: d.name, cards: d.cards }));
}

/* Anki's own text export ("Notes in plain text"): tab- or semicolon-separated,
   comment lines starting with #, an optional header. One deck. */
export function parseTextDeck(text, name) {
  const cards = [], keys = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const card = cardFromFields(line.split(sep).map((f) => f.replace(/^"|"$/g, "")));
    if (!card) continue;
    const key = fold(card.ru);
    if (keys.has(key)) continue;
    keys.add(key);
    cards.push(card);
  }
  return cards.length ? [{ name: name || "Imported", cards }] : [];
}

/* ------------------------------------------------------------- writing */

export const APKG_SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const MODEL_ID = 1700000000001;
const DECK_ID_BASE = 1700000000100;

/* SHA1 is what Anki uses for csum; a stable 32-bit hash of the sort field is
   enough for a fresh import — Anki recomputes on its side. */
function hash32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function guid(seed) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";
  let h = hash32("g" + seed), out = "";
  for (let i = 0; i < 10; i++) { out += chars[h % chars.length]; h = (Math.imul(h, 1103515245) + 12345) >>> 0; }
  return out;
}

/* The col row and the note/card rows for one deck of { ru, en } cards, as bind
   parameter arrays in the order of APKG_SCHEMA's columns. `now` is ms. */
export function apkgRows(deckName, cards, now) {
  const sec = Math.floor(now / 1000);
  const deckId = DECK_ID_BASE + (hash32(deckName) % 1000);
  const model = {
    id: MODEL_ID, name: "Bridges (Russian → English)", type: 0, mod: sec, usn: -1, sortf: 0,
    did: deckId, tmpls: [{ name: "Card 1", ord: 0, qfmt: "{{Front}}",
      afmt: "{{FrontSide}}<hr id=answer>{{Back}}", bqfmt: "", bafmt: "", did: null, bfont: "", bsize: 0 }],
    flds: [{ name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
           { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [] }],
    css: ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }",
    latexPre: "", latexPost: "", latexsvg: false, req: [[0, "any", [0]]], tags: [], vers: [],
  };
  const deck = {
    id: deckId, name: deckName, mod: sec, usn: -1, lrnToday: [0, 0], revToday: [0, 0],
    newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false,
    desc: "Exported from Bridges", dyn: 0, conf: 1, extendNew: 10, extendRev: 50,
  };
  const dconf = {
    1: { id: 1, name: "Default", mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true,
      new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
      rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }, dyn: false },
  };
  const conf = {
    nextPos: cards.length + 1, estTimes: true, activeDecks: [deckId], sortType: "noteFld",
    timeLim: 0, sortBackwards: false, addToCur: true, curDeck: deckId, newBury: true,
    newSpread: 0, dueCounts: true, curModel: String(MODEL_ID), collapseTime: 1200,
  };
  const col = [1, sec, sec, sec * 1000, 11, 0, 0, 0, JSON.stringify(conf),
               JSON.stringify({ [MODEL_ID]: model }), JSON.stringify({ [deckId]: deck }),
               JSON.stringify(dconf), "{}"];
  const notes = [], cardRows = [];
  cards.forEach((c, k) => {
    const nid = now + k;
    const flds = c.ru + FIELD_SEP + (c.en || "");
    notes.push([nid, guid(c.ru + k), MODEL_ID, sec, -1, "", flds, c.ru, hash32(c.ru), 0, ""]);
    cardRows.push([nid + 500000, nid, deckId, 0, sec, -1, 0, 0, k + 1, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
  });
  return { col, notes, cards: cardRows };
}

/* Anki's text import format, for a spreadsheet or an older Anki. */
export function toTsv(cards) {
  return cards.map((c) => `${c.ru}\t${c.en || ""}`).join("\n") + "\n";
}
