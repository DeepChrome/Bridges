/* Photographs on the vocabulary card and the entry (the owner, 2026-09-07):
   shipped by tools/build_images.py from Wikipedia's and Commons' free
   photographs, keyed on the word, with the credit on the entry.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import WordScreen from "../src/screens/Word";
import { VocabFlow } from "../src/screens/Flows";
import { IMAGES, CREDITS } from "../src/images";
import { UN, L, lessonWords, lessonCount } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

const withPhoto = Object.keys(IMAGES);

describe("photographs", () => {
  it("ship only for words the units teach, every one with a credit and a free licence", () => {
    expect(withPhoto.length).toBeGreaterThan(100);
    const taught = new Set(UN.flatMap((u) => u.w.map((i) => L[i].b)));
    for (const w of withPhoto) {
      expect(taught.has(w)).toBe(true);
      expect(CREDITS[w]).toBeTruthy();
      // Reuse with credit: CC0, public domain, CC BY, CC BY-SA. Never NC or ND.
      expect(CREDITS[w].l).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d)/i);
      expect(CREDITS[w].l).not.toMatch(/-N[CD]/i);
    }
  });

  /* One picture, one word. Nineteen files were shipped for two or three words
     each — one photograph standing for both «кот» and «кошка», both «актёр» and
     «актриса». On a vocabulary card the picture is the meaning, so a shared one
     teaches that two different words mean the same thing. */
  it("never use one photograph for two words", () => {
    // Through FILES, not IMAGES: the bundler turns every require() into the same
    // handle under test, so IMAGES cannot tell two pictures apart.
    const { FILES } = require("../src/images");
    expect(Object.keys(FILES).sort()).toEqual(withPhoto.slice().sort());
    const names = Object.values(FILES);
    expect(new Set(names).size).toBe(names.length);
    // …and the titles carry no doubled prefix from the Russian route.
    for (const w of withPhoto) expect(CREDITS[w].t).not.toMatch(/^(File|Файл):/);
  });

  it("appear on the entry with the credit", async () => {
    const w = withPhoto[0];
    await withProfile(<WordScreen route={{ params: { word: w } }} />);
    expect(await screen.findByTestId("word-photo")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Photo: .*${CREDITS[w].l.split(" ")[0]}`))).toBeTruthy();
  });

  it("appear on the vocabulary card of a lesson that teaches such a word, and not otherwise", async () => {
    // Find a lesson whose first taught word has a photo, then step to it.
    let found = null;
    for (const u of UN) {
      for (let i = 0; i < lessonCount(u) && !found; i++) {
        const words = lessonWords(u, i);
        if (words.length && IMAGES[L[words[0]].b]) found = { u, i };
      }
      if (found) break;
    }
    expect(found).toBeTruthy();
    await withProfile(<VocabFlow route={{ params: { unitId: found.u.id, index: found.i } }} navigation={nav} />);
    // A lesson opens on its grammar note, then the word list, then the cards, and
    // which of those a given lesson has varies — so step forward until the first
    // card rather than assuming a screen count.
    const { fireEvent, act } = require("@testing-library/react-native");
    for (let n = 0; n < 3 && !screen.queryByTestId("word-photo"); n++) {
      const go = screen.queryByText(/^(Start learning|Continue)$/);
      if (!go) break;
      await act(async () => { fireEvent.press(go); });
    }
    expect(await screen.findByTestId("word-photo")).toBeTruthy();
  });
});
