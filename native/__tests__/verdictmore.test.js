/* More on the verdict (the owner, 2026-10-06: "it should give the option for
 * the user to review the word… a 'more' button next to the speaker that will
 * pull up the full detail entry for that word so the learner can see all
 * conjugations"). Own file: it mocks the words context.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("../src/words", () => {
  const actual = jest.requireActual("../src/words");
  const ctx = { open: jest.fn(), openFull: jest.fn(), lookup: jest.fn(), close: jest.fn() };
  global.__wordsCtx = ctx;
  return { ...actual, useWords: () => ctx };
});

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { idxOfWord } from "../src/data";

async function withRunner(steps) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  return await render(
    <SessionProvider>
      <Runner steps={steps} onFinish={jest.fn()} gradeWords={false} />
    </SessionProvider>
  );
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

const i = idxOfWord("книга");
const step = {
  kind: "choose-en", ask: "Pick the word", prompt: "книга", cyr: true, i,
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};

test("the verdict opens the word's whole entry, right or wrong", async () => {
  expect(i).toBeGreaterThanOrEqual(0);
  await withRunner([step]);
  expect(screen.queryByTestId("verdict-more")).toBeNull();   // not before an answer
  fireEvent.press(await screen.findByText("table"));
  fireEvent.press(await screen.findByTestId("verdict-more"));
  expect(global.__wordsCtx.openFull).toHaveBeenCalledWith(i);
});

test("a question with no word behind it offers none", async () => {
  await withRunner([{ ...step, i: undefined }]);
  fireEvent.press(await screen.findByText("book"));
  await screen.findByTestId("verdict");
  expect(screen.queryByTestId("verdict-more")).toBeNull();
});
