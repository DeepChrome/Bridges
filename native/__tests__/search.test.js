/* The dictionary: results as you type, and the two tiers behind them.
 *
 * Its own file, for the reason screens.test.js documents — module registries do not
 * bleed across files, and the cumulative matcher timeout starts around the sixth
 * test in one file. Render tests are kept few here for that reason; the ranking
 * rules are asserted directly against core/search.js instead.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Search from "../src/screens/Search";
import { splitTokens, lookup } from "../src/words";
import { L, searchWords, resolveWord } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

async function withProfile(ui, { state } = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  if (state) await AsyncStorage.setItem("rb.state.p1", JSON.stringify(state));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await flushState();
});

describe("lookup rules", () => {
  it("finds a Russian form, an English gloss, and a Latin spelling", () => {
    expect(searchWords("книгу").length).toBeGreaterThan(0);
    expect(searchWords("book").length).toBeGreaterThan(0);
    expect(searchWords("kniga").length).toBeGreaterThan(0);
  });

  it("reaches words the curriculum does not teach", () => {
    // виноград has always been in lexicon.db; it was simply never shipped.
    const hits = searchWords("grapes");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].b).toBe("виноград");
    expect(hits[0].deep).toBe(true);
    expect(resolveWord("виноград")).not.toBeNull();
  });

  it("prefers a meaning over a transliteration that happens to be a word", () => {
    // "war" transliterates to «вар», which really does mean pitch. Someone typing
    // English wants война.
    const hits = searchWords("war");
    expect(hits[0].b).toBe("война");
  });

  it("still takes a Latin spelling when nothing means it in English", () => {
    expect(searchWords("kniga")[0].b).toBe("книга");
  });

  it("ranks a studied word above the same meaning from the wider dictionary", () => {
    const hits = searchWords("book");
    expect(hits[0].deep).toBeUndefined();
  });

  it("returns nothing for a string that is not a word", () => {
    expect(searchWords("zzzzqq")).toEqual([]);
    expect(searchWords("")).toEqual([]);
  });
});

describe("dictionary screen", () => {
  it("shows matches as you type, without a search button", async () => {
    await withProfile(<Search navigation={nav} />);
    const box = await screen.findByPlaceholderText("Russian, English or Latin");
    expect(screen.queryByText("Search")).toBeNull();

    fireEvent.changeText(box, "книгу");
    expect(await screen.findByText(searchWords("книгу")[0].w)).toBeTruthy();
  });

  it("opens the entry for a chosen match and remembers it", async () => {
    await withProfile(<Search navigation={nav} />);
    const box = await screen.findByPlaceholderText("Russian, English or Latin");
    fireEvent.changeText(box, "книгу");

    const top = searchWords("книгу")[0];
    fireEvent.press(await screen.findByText(top.w));
    // Addressed by the word, never by a lemma index — those move on every rebuild.
    expect(nav.navigate).toHaveBeenCalledWith("Word", { word: top.b });
  });

  it("shows no recent shelf for a profile that has never looked anything up", async () => {
    await withProfile(<Search navigation={nav} />);
    await screen.findByPlaceholderText("Russian, English or Latin");
    expect(screen.queryByText("Recent")).toBeNull();
  });
});

/* Pure functions, so they can be asserted without rendering anything. */
describe("word links", () => {
  it("marks the words the lexicon recognises and leaves punctuation alone", () => {
    const parts = splitTokens("Я читаю книгу.");
    const linked = parts.filter((p) => p.i !== undefined);
    expect(linked.length).toBeGreaterThan(0);
    for (const p of linked) expect(p.text).toMatch(/^[А-Яа-яЁё-]+$/);
    expect(parts.map((p) => p.text).join("")).toBe("Я читаю книгу.");
  });

  it("resolves an inflected form to its lemma", () => {
    const i = lookup("книгу");
    expect(i).not.toBeNull();
    expect(L[i].b).toBe("книга");
  });

  it("returns null for something that is not a word", () => {
    expect(lookup("zzzz")).toBeNull();
    expect(lookup("")).toBeNull();
  });
});
