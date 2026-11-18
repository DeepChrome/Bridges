/* The AI helper on the dictionary entry (the owner, 2026-11-18: "the user
   should be able to pull up the AI helper pretty much constantly… when I'm
   browsing the detailed word definitions/cards, sometimes I have questions
   about the different conjugations"). Two halves: the entry registers its
   tables for the AI to read, and its header carries the same buttons as every
   other screen, the sparkle among them. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFileSync } from "fs";
import { join } from "path";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import WordScreen from "../src/screens/Word";
import { L } from "../src/data";
import { screenAbout, tablesText } from "../src/about";

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), setParams: jest.fn() };
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0,
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

const VERB = L.find((w) => w.p === "verb" && (w.t || []).length >= 3);

describe("tablesText", () => {
  it("writes a table a row to a line, endings unmarked, two forms in a cell joined", () => {
    const s = tablesText([{ title: "Present", columns: ["", "singular", "plural"],
      rows: [["я", "чита|ю", "чита|ем"], ["они", ["чита|ют", "читают"], "x"]] }]);
    expect(s).toBe("Present: singular | plural\nя: читаю | читаем\nони: читают / читают | x");
  });
  it("is nothing for a word with no tables", () => {
    expect(tablesText(undefined)).toBeUndefined();
    expect(tablesText([])).toBeUndefined();
  });
});

describe("the entry", () => {
  it("registers its tables, so a question about a form has the form in view", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
    await render(<SessionProvider><WordScreen route={{ params: { word: VERB.b } }} navigation={nav} /></SessionProvider>);
    await screen.findByTestId("word-status");
    const q = screenAbout().question;
    expect(q.kind).toBe("entry");
    expect(q.word).toBe(VERB.b);
    // The first table's title and a form from its first row, as the screen draws them.
    const first = VERB.t[0];
    expect(q.text).toContain(first.title);
    const cell = first.rows[0][1];
    const form = String(Array.isArray(cell) ? cell[0] : cell).replace(/\|/g, "");
    expect(q.text).toContain(form);
  });

  /* The route's header is declared in App.js, which no test mounts whole
     (routes.test.js reads it the same way): the entry takes HeaderRight, the
     sparkle's home, not a header of its own with the flag alone. */
  it("has the same header as every other screen", () => {
    const src = readFileSync(join(__dirname, "..", "App.js"), "utf8");
    const m = src.match(/const wordTitled = [\s\S]*?\n\};/);
    expect(m).toBeTruthy();
    // Without the app guide's "?", which pushed a centred title off centre.
    expect(m[0]).toMatch(/<HeaderRight navigation=\{navigation\} route=\{route\} help=\{false\} \/>/);
  });
});
