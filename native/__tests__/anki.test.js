/* Anki decks in and out (the owner, 2026-09-07): the parsing in core, the import
   through a fake collection, the export as a real zip holding a collection built
   through a fake SQLite, and the flashcards drawing from an imported deck.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study, { buildQueue, cardsOfSets } from "../src/screens/Study";
import { importDeck, apkgBytes, exportDeck, readCollection } from "../src/anki";
import { cardFromFields, decksFromNotes, parseTextDeck, apkgRows, toTsv } from "@core/anki";
import { UN, L } from "../src/data";

const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {}, decks: [],
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

/* A fake collection: enough of SQLite for readCollection, both schemas. */
function fakeDb(rows) {
  return {
    getAllAsync: async (sql) => {
      if (/from col/.test(sql)) return [rows.col];
      if (/from decks/.test(sql)) return rows.decks || [];
      if (/from cards/.test(sql)) return rows.cards;
      if (/from notes/.test(sql)) return rows.notes;
      return [];
    },
    closeAsync: jest.fn(async () => {}),
  };
}

describe("core parsing", () => {
  it("takes the Russian and English fields, cleaned of Anki's markup", () => {
    expect(cardFromFields(["<b>кни́га</b>[sound:x.mp3]", "book&nbsp;(noun)"]))
      .toEqual({ ru: "кни́га", en: "book (noun)" });
    expect(cardFromFields(["the book", "книга"])).toEqual({ ru: "книга", en: "the book" });
    expect(cardFromFields(["only english", "more english"])).toBeNull();
  });

  it("groups notes by deck and drops duplicates within one", () => {
    const decks = decksFromNotes([
      { flds: "стол\x1ftable", deck: "Russian::Home" },
      { flds: "Стол\x1ftable again", deck: "Russian::Home" },
      { flds: "хлеб\x1fbread", deck: "Food" },
      { flds: "nothing russian\x1fhere", deck: "Food" },
    ]);
    expect(decks).toEqual([
      { name: "Russian::Home", cards: [{ ru: "стол", en: "table" }] },
      { name: "Food", cards: [{ ru: "хлеб", en: "bread" }] },
    ]);
  });

  it("reads Anki's text export and writes one back", () => {
    const text = "#separator:tab\n#html:false\nдом\thouse\n\"вода\";\"water\"\n";
    expect(parseTextDeck(text, "Mine")).toEqual([{ name: "Mine",
      cards: [{ ru: "дом", en: "house" }, { ru: "вода", en: "water" }] }]);
    expect(toTsv([{ ru: "дом", en: "house" }])).toBe("дом\thouse\n");
  });

  it("builds a legacy collection: one model, one deck, a note and a card per word", () => {
    const rows = apkgRows("Test", [{ ru: "дом", en: "house" }, { ru: "кот", en: "cat" }], 1700000000000);
    expect(rows.col[4]).toBe(11);                                     // schema version
    const models = JSON.parse(rows.col[9]);
    const model = Object.values(models)[0];
    expect(model.flds.map((f) => f.name)).toEqual(["Front", "Back"]);
    const decks = JSON.parse(rows.col[10]);
    expect(Object.values(decks)[0].name).toBe("Test");
    expect(rows.notes).toHaveLength(2);
    expect(rows.notes[0][6]).toBe("дом\x1fhouse");
    expect(rows.cards).toHaveLength(2);
    expect(rows.cards[1][1]).toBe(rows.notes[1][0]);                  // card -> its note
    expect(new Set(rows.notes.map((n) => n[1])).size).toBe(2);        // distinct guids
  });
});

describe("import", () => {
  const pickFile = (name) => async () => ({ canceled: false, assets: [{ uri: "file:///x/" + name, name }] });

  it("reads a current .apkg (zstd collection, schema 18) into decks", async () => {
    const zstdBytes = strToU8("zstd-blob");
    const zip = zipSync({ "collection.anki21b": zstdBytes, media: strToU8("{}") });
    const db = fakeDb({
      col: { ver: 18, decks: "{}" },
      decks: [{ id: 1, name: "Russian\x1fFood" }, { id: 2, name: "Other" }],
      cards: [{ nid: 10, did: 1 }, { nid: 11, did: 2 }],
      notes: [{ id: 10, flds: "хлеб\x1fbread" }, { id: 11, flds: "plain\x1ftext" }],
    });
    const openBytes = jest.fn(async () => db);
    jest.spyOn(require("fzstd"), "decompress").mockImplementationOnce((b) => b);
    const res = await importDeck({ pick: pickFile("food.apkg"), readBytes: async () => zip, openBytes });
    expect(res.decks).toEqual([{ name: "Russian::Food", cards: [{ ru: "хлеб", en: "bread" }] }]);
    expect(res.source).toBe("food.apkg");
    expect(db.closeAsync).toHaveBeenCalled();
  });

  it("reads a legacy .apkg (schema 11, JSON decks)", async () => {
    const zip = zipSync({ "collection.anki2": strToU8("sqlite"), media: strToU8("{}") });
    const db = fakeDb({
      col: { ver: 11, decks: JSON.stringify({ 5: { name: "Verbs" } }) },
      cards: [{ nid: 1, did: 5 }], notes: [{ id: 1, flds: "идти\x1fto go" }],
    });
    const res = await importDeck({ pick: pickFile("v.apkg"), readBytes: async () => zip, openBytes: async () => db });
    expect(res.decks).toEqual([{ name: "Verbs", cards: [{ ru: "идти", en: "to go" }] }]);
  });

  it("reads a text export, and says so plainly when a file is not a deck", async () => {
    const res = await importDeck({ pick: pickFile("words.txt"),
                                   readBytes: async () => strToU8("дом\thouse\n") });
    expect(res.decks).toEqual([{ name: "words", cards: [{ ru: "дом", en: "house" }] }]);
    const bad = await importDeck({ pick: pickFile("x.txt"), readBytes: async () => strToU8("no russian\n") });
    expect(bad.error).toMatch(/No lines with Russian/);
    const cancelled = await importDeck({ pick: async () => ({ canceled: true }) });
    expect(cancelled.cancelled).toBe(true);
    const nocol = await importDeck({ pick: pickFile("z.apkg"),
                                     readBytes: async () => zipSync({ media: strToU8("{}") }) });
    expect(nocol.error).toMatch(/No Anki collection/);
  });
});

describe("export", () => {
  it("writes an .apkg: a zip with the serialised collection and a media manifest", async () => {
    const sql = [];
    const db = {
      execAsync: jest.fn(async (s) => { sql.push(s); }),
      runAsync: jest.fn(async (s, params) => { sql.push([s, params]); }),
      serializeAsync: jest.fn(async () => strToU8("SQLITE")),
      closeAsync: jest.fn(async () => {}),
    };
    const shared = [];
    const out = await exportDeck("Food & Drink", [{ ru: "хлеб", en: "bread" }],
      { openMemory: async () => db, writeShare: async (name, bytes) => shared.push([name, bytes]) });
    expect(out).toEqual({ file: "Food  Drink.apkg", cards: 1 });
    expect(shared).toHaveLength(1);
    const files = unzipSync(shared[0][1]);
    expect(strFromU8(files["collection.anki2"])).toBe("SQLITE");
    expect(strFromU8(files.media)).toBe("{}");
    expect(sql[0]).toMatch(/CREATE TABLE col/);
    expect(db.runAsync).toHaveBeenCalledTimes(3);                      // col, note, card
    expect(db.closeAsync).toHaveBeenCalled();
    const bytes = await apkgBytes("x", [], { openMemory: async () => db });
    expect(unzipSync(bytes)["collection.anki2"]).toBeTruthy();
  });
});

describe("flashcards from a deck", () => {
  const deck = { id: "k1", name: "My deck", cards: [{ ru: "привет", en: "hi" }, { ru: "пока", en: "bye" }], added: 1 };

  it("queues a deck's cards under their Russian, alongside a unit's", () => {
    const st = { ...base, decks: [deck], sets: ["deck:k1"] };
    const q = buildQueue(st);
    expect(q.map((c) => c.b)).toEqual(["привет", "пока"]);
    const both = buildQueue({ ...st, sets: ["deck:k1", UN[0].id] });
    expect(both.length).toBe(2 + UN[0].w.length);
    expect(cardsOfSets(st, ["deck:k1"])).toEqual(deck.cards);
    expect(cardsOfSets(st, [UN[0].id])[0]).toEqual({ ru: L[UN[0].w[0]].b, en: L[UN[0].w[0]].e });
  });

  it("shows a deck card, grades it into the schedule, and lists the deck in the picker", async () => {
    await withProfile(<Study />, { decks: [deck], sets: ["deck:k1"] });
    expect(await screen.findByText("привет")).toBeTruthy();
    expect(screen.getByText("2 cards")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByText("Good")); });
    const st = await saved();
    expect(st.seen["привет"].reps).toBe(1);
    await act(async () => { fireEvent.press(screen.getByText("Change")); });
    expect((await screen.findAllByText("My deck")).length).toBeGreaterThanOrEqual(2);  // the set row and the picker
    expect(screen.getByText("Import")).toBeTruthy();
    expect(screen.getByText("Export selected as an Anki deck")).toBeTruthy();
  });
});
