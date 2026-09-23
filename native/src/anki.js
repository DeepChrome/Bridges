/* Anki decks in and out: the device side (the owner, 2026-09-07).
 *
 * Import takes an .apkg (a zip holding the collection as SQLite — zstd-compressed
 * `collection.anki21b` from current Anki and AnkiDroid, plain `.anki21`/`.anki2`
 * from older ones) or Anki's plain-text export, and returns decks of { ru, en }
 * cards through core/anki.js. Export writes a legacy-schema .apkg and hands it to
 * the share sheet. The collection is read and written in memory — nothing is
 * left on disk but the shared file in the cache.
 *
 * `deps` lets tests substitute the picker, the file reader, SQLite and sharing.
 */

import { unzipSync, strFromU8 } from "fflate";
import { decompress as zstd } from "fzstd";
import * as SQLite from "expo-sqlite";
import * as Picker from "expo-document-picker";
import { File } from "expo-file-system";
import { decksFromNotes, parseTextDeck } from "@core/anki";

const defaultDeps = {
  pick: () => Picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false,
                                        type: ["application/octet-stream", "application/zip", "text/*", "*/*"] }),
  readBytes: async (uri) => new Uint8Array(await new File(uri).bytes()),
  openBytes: (bytes) => SQLite.deserializeDatabaseAsync(bytes),
};

/* Notes with their deck name out of an Anki collection database, whichever
   schema it carries: the JSON blobs in `col` before schema 15, tables after. */
export async function readCollection(db) {
  const [col] = await db.getAllAsync("select ver, decks from col");
  const ver = col ? Number(col.ver) : 11;
  let deckName = {};
  if (ver >= 15) {
    for (const d of await db.getAllAsync("select id, name from decks")) {
      // Subdeck names are joined with U+001F in the new schema.
      deckName[d.id] = String(d.name).split("\x1f").join("::");
    }
  } else {
    const decks = JSON.parse(col.decks || "{}");
    for (const id in decks) deckName[id] = decks[id].name;
  }
  const deckOfNote = {};
  for (const c of await db.getAllAsync("select nid, min(did) as did from cards group by nid")) {
    deckOfNote[c.nid] = deckName[c.did];
  }
  const notes = await db.getAllAsync("select id, flds from notes");
  return notes.map((n) => ({ flds: n.flds, deck: deckOfNote[n.id] || "Imported" }));
}

const isZip = (b) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

/* -> { decks: [{ name, cards }], source } or { cancelled: true } or { error } */
export async function importDeck(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  let res;
  try { res = await d.pick(); } catch (e) { return { error: "The file could not be opened." }; }
  if (!res || res.canceled || !res.assets || !res.assets[0]) return { cancelled: true };
  const asset = res.assets[0];
  let bytes;
  try { bytes = await d.readBytes(asset.uri); } catch (e) { return { error: "The file could not be read." }; }
  try {
    if (isZip(bytes)) {
      const files = unzipSync(bytes);
      let data = files["collection.anki21b"];
      if (data) data = zstd(data);
      else data = files["collection.anki21"] || files["collection.anki2"];
      if (!data) return { error: "No Anki collection inside this file." };
      const db = await d.openBytes(data);
      let notes;
      try { notes = await readCollection(db); } finally { if (db.closeAsync) await db.closeAsync(); }
      const decks = decksFromNotes(notes);
      return decks.length ? { decks, source: asset.name }
        : { error: "No cards with Russian on them in this deck." };
    }
    const text = strFromU8(bytes);
    const name = String(asset.name || "Imported").replace(/\.(txt|csv|tsv)$/i, "");
    const decks = parseTextDeck(text, name);
    return decks.length ? { decks, source: asset.name }
      : { error: "No lines with Russian in this file." };
  } catch (e) {
    return { error: "This file is not a deck Bridges can read." };
  }
}

/* `apkgBytes` and `exportDeck` stood here and went with the export itself on
   2026-09-22 (§30ap), along with the schema and row builders they used in
   core/anki.js. A deck comes in; nothing goes back out. */
