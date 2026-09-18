/* The rule as feedback (§30al): a question that carries a chapter's grammar
 * card shows it under a wrong answer, and only there. The owner, 2026-09-18:
 * "the grammar tips can be feedback after an incorrect answer on a question
 * featuring the grammar tip."
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";

const note = {
  title: "No “a”, no “the”, no “is”",
  body: "Russian has no articles, and it leaves out the present tense of “to be”.",
  examples: [["Я — Джа́ред.", "I am Jared."]],
};
const withRule = {
  kind: "choose-en", ask: "Pick the word", prompt: "книга", cyr: true, note,
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};
const noRule = { ...withRule, note: undefined };

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

test("a wrong answer shows the rule the question is about", async () => {
  await withRunner([withRule]);
  fireEvent.press(await screen.findByText("table"));
  const rule = await screen.findByTestId("rule-note");
  expect(rule).toBeTruthy();
  expect(screen.getByText(note.title)).toBeTruthy();
  expect(screen.getByText(note.body)).toBeTruthy();
});

test("a right answer does not lecture", async () => {
  await withRunner([withRule]);
  fireEvent.press(await screen.findByText("book"));
  await screen.findByTestId("verdict");
  expect(screen.queryByTestId("rule-note")).toBeNull();
});

test("a question with no rule shows none", async () => {
  await withRunner([noRule]);
  fireEvent.press(await screen.findByText("table"));
  await screen.findByTestId("verdict");
  expect(screen.queryByTestId("rule-note")).toBeNull();
});
