/* The lesson opens on its whole word list (the owner, 2026-09-10).
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { VocabFlow } from "../src/screens/Flows";
import { L, UN, lessonWords } from "../src/data";
import { firstSense } from "@core/util";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn() };
const base = { v: 4, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, dev: true };

async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("the lesson's word list", () => {
  // A branch unit, so the first step is the list rather than a grammar card.
  const unit = UN.find((u) => u.id === "food");
  const route = { params: { unitId: unit.id, index: 1 } };

  it("shows every word of the lesson with its meaning, before any card", async () => {
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    const words = lessonWords(unit, 1);
    expect(await screen.findByTestId("vocab-list")).toBeTruthy();
    for (const i of words) {
      expect(screen.getByTestId(`new-${L[i].b}`)).toBeTruthy();
      expect(screen.getAllByText(firstSense(L[i])).length).toBeGreaterThan(0);
    }
    // The count is named, and nothing is being asked yet.
    expect(screen.getByTestId("vocab-list").props.children).toContain(String(words.length));
    expect(screen.queryByText("What does this mean?")).toBeNull();
  });

  it("leads into the cards", async () => {
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    await screen.findByTestId("vocab-list");
    await act(async () => { fireEvent.press(screen.getByText("Start learning")); });
    expect(screen.queryByTestId("vocab-list")).toBeNull();
    // The card used to announce itself with a muted "New word" over the top of
    // the photograph. The step counter already says which step this is and the
    // card is unmistakably about one word, so the label was noise; the card
    // itself is what the list leads into.
    expect(screen.getByTestId("word-card")).toBeTruthy();
  });
});
