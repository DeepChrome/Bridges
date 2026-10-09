/* The answer under a verdict is the way into the word (the owner, 2026-10-09:
 * "Remove the more button and instead put its functionality into clicking
 * the answer itself… clicking the word gives the abridged context… but it
 * also has the full entry option"). The answer is a word link like any
 * other: a tap opens the quick look, whose More opens the whole entry. "Not
 * quite" is gone, and the speaker sits beside the answer it reads.
 */
import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { WordsProvider } from "../src/words";
import { Runner } from "../src/screens/Run";
import { idxOfWord, L } from "../src/data";

async function withRunner(steps) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  return await render(
    <SessionProvider><WordsProvider>
      <Runner steps={steps} onFinish={jest.fn()} gradeWords={false} />
    </WordsProvider></SessionProvider>
  );
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

const i = idxOfWord("книга");
const chooseRu = {
  kind: "choose-ru", ask: "Pick the word", prompt: "book", i,
  options: [{ label: "книга", right: true, cyr: true }, { label: "стол", cyr: true },
            { label: "стул", cyr: true }, { label: "лампа", cyr: true }],
};
const chooseEn = {
  kind: "choose-en", ask: "Pick the meaning", prompt: "книга", cyr: true, i,
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};

test("a wrong answer shows the right one as a link, with its speaker, and no 'Not quite' or More button", async () => {
  await withRunner([chooseRu]);
  fireEvent.press(await screen.findByText("стол"));
  const row = await screen.findByTestId("verdict-answer");
  expect(within(row).getByTestId("verdict-speaker")).toBeTruthy();
  expect(screen.queryByText("Not quite")).toBeNull();
  expect(screen.queryByTestId("verdict-more")).toBeNull();
  // The tap is the word link's: the quick look, which carries More.
  await act(async () => { fireEvent.press(within(row).getAllByRole("link")[0]); });
  expect(await screen.findByTestId("sheet-more")).toBeTruthy();
});

test("an English answer leads with the Russian word it means, linked", async () => {
  await withRunner([chooseEn]);
  fireEvent.press(await screen.findByText("table"));
  const row = await screen.findByTestId("verdict-answer");
  expect(row).toHaveTextContent(/— book/);
  await act(async () => { fireEvent.press(within(row).getAllByRole("link")[0]); });
  expect(await screen.findByTestId("sheet-more")).toBeTruthy();
});

/* The answer's form as little flags (the owner, 2026-10-09: "the case, the
   tense, the plurality, the gender… Just little flags"). */
test("flags the answer's case, number and gender", async () => {
  const typed = { kind: "cases", ask: "Write the accusative singular", prompt: "кни́га", cyr: true, i,
                  typed: true, answer: "кни́гу", target: "кни́гу", alts: [] };
  await withRunner([typed]);
  const input = await screen.findByTestId("type-input");
  fireEvent.changeText(input, "книга");
  const { waitFor } = require("@testing-library/react-native");
  await waitFor(() => expect(input.props.value).toBe("книга"));
  await act(async () => { fireEvent.press(screen.getByText("Check")); });
  const flags = await screen.findByTestId("verdict-flags");
  expect(flags).toHaveTextContent(/accusative/);
  expect(flags).toHaveTextContent(/singular/);
  expect(flags).toHaveTextContent(/feminine/);
});

test("a right answer keeps its heading", async () => {
  await withRunner([chooseRu]);
  fireEvent.press(await screen.findByText("книга"));
  expect(await screen.findByText("Correct")).toBeTruthy();
});
