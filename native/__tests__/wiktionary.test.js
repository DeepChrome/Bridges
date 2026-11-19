/* Beyond the dictionary: a Russian word the lexicon lacks is looked up on
 * Wiktionary, in the app, on a press (the owner, 2026-11-19). Pinned: the
 * reply is read into text by part of speech; only a Russian word is offered
 * it; the licence rides with the result; offline is nothing, not an error. */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Search from "../src/screens/Search";
import { lookupWiktionary, parseWiktionary, textOf, canLookUp, resetWiktionary, WIKTIONARY_LICENCE } from "../src/wiktionary";

const reply = { ru: [
  { partOfSpeech: "Participle", definitions: [{ definition: "past passive perfective participle of <a>накра́сить</a> (nakrásitʹ)" }] },
  { partOfSpeech: "Adjective", definitions: [{ definition: "<span>made up</span>, painted" }, { definition: "" }] },
] };
const okFetch = async () => ({ ok: true, status: 200, json: async () => reply });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); resetWiktionary(); });
afterEach(async () => { await flushState(); });

it("reads the reply into senses by part of speech, text only", () => {
  expect(textOf("a <b>bold</b> &amp; plain")).toBe("a bold & plain");
  expect(parseWiktionary(reply)).toEqual([
    { pos: "participle", senses: ["past passive perfective participle of накра́сить (nakrásitʹ)"] },
    { pos: "adjective", senses: ["made up, painted"] },
  ]);
  expect(parseWiktionary({ en: [] })).toEqual([]);
});

it("looks up a Russian word only, once, and answers nothing offline", async () => {
  expect(canLookUp("накрашенный")).toBe(true);
  expect(canLookUp("два слова")).toBe(false);
  expect(canLookUp("hello")).toBe(false);
  let calls = 0;
  const r = await lookupWiktionary("Накра́шенный", { fetch: async (u) => { calls++; expect(u).toMatch(/%D0%BD/); return okFetch(); } });
  expect(r.word).toBe("накрашенный");
  expect(r.entries).toHaveLength(2);
  expect(r.url).toMatch(/#Russian$/);
  await lookupWiktionary("накрашенный", { fetch: async () => { calls++; return okFetch(); } });
  expect(calls).toBe(1);
  expect(await lookupWiktionary("другое", { fetch: async () => { throw new Error("offline"); } })).toBeNull();
  expect(await lookupWiktionary("третье", { fetch: async () => ({ ok: false, status: 404 }) })).toBeNull();
});

it("offers the look-up under an empty search for a Russian word, and shows the entry with its licence", async () => {
  global.fetch = jest.fn(okFetch);
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 10, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} } }));
  await render(<SessionProvider><Search navigation={{ navigate: jest.fn() }} /></SessionProvider>);
  const box = await screen.findByTestId("word-search");
  fireEvent.changeText(box, "зюзюка");
  await waitFor(() => expect(screen.getByText(/Nothing for/)).toBeTruthy());
  expect(screen.getByTestId("wiktionary-look")).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByTestId("wiktionary-look")); });
  expect(await screen.findByTestId("wiktionary-entry")).toBeTruthy();
  expect(screen.getByTestId("wiktionary-adjective")).toBeTruthy();
  expect(screen.getByText(WIKTIONARY_LICENCE)).toBeTruthy();
  // An English query with no hit gets no button: Wiktionary's English page
  // would define the English word, not translate it.
  fireEvent.changeText(box, "zzqqxx");
  await waitFor(() => expect(screen.queryByTestId("wiktionary-look")).toBeNull());
});
