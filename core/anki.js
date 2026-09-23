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

/* There was a writing half here until 2026-09-22: APKG_SCHEMA, apkgRows and
   toTsv, which built a fresh Anki collection so the app could hand a deck
   back out. The owner removed the export (§30ap) and the reading half above
   is what is left — a deck comes in, and the studying happens here. Version
   control is the museum (§12); nothing else imported any of it.

   If it ever comes back, it comes back with a caller. Keeping ninety lines of
   schema alive on the chance is how a codebase stops meaning what it says. */
