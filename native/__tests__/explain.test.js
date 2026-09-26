/* Why a wrong answer was wrong (2026-09-26): the Worker's line under the
 * verdict, and the miss kept in the profile for the tutor. The owner: *"I'd
 * like to get AI feedback on incorrect answers."*
 *
 * What is pinned: a wrong answer asks, with what the learner put; a right one
 * asks nothing; the setting turns it off; a failure leaves the verdict as it
 * was; and the miss is recorded whether or not the Worker answers.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, missOf, MISSES_KEPT } from "../src/screens/Run";
import { forgetToken } from "../src/lib/feedback";

const URL_KEY = "EXPO_PUBLIC_FEEDBACK_URL";
const chosen = {
  kind: "choose-en", ask: "Pick the word", prompt: "книга", cyr: true,
  note: { title: "Nouns", body: "b" },
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};
const typed = {
  kind: "cases", ask: "Write genitive singular", prompt: "книга", sub: "book", cyr: true,
  typed: true, answer: "книги", target: "книги", alts: [],
};

async function withRunner(steps, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, streak: 0, ...state }));
  return await render(
    <SessionProvider><Runner steps={steps} onFinish={jest.fn()} gradeWords={false} /></SessionProvider>,
  );
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
const answers = (body) => {
  global.fetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => body }));
};

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); await forgetToken(); jest.clearAllMocks();
  global.fetch = jest.fn();
  process.env[URL_KEY] = "https://w.example";
  process.env.EXPO_PUBLIC_APP_TOKEN = "tok";
});
afterEach(async () => {
  await flushState();
  delete process.env[URL_KEY];
  delete process.env.EXPO_PUBLIC_APP_TOKEN;
});

test("a wrong option asks why, with what was picked, and shows the answer under the verdict", async () => {
  answers({ ok: true, why: "«книга» is a book; «стол» is the table." });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  expect(await screen.findByTestId("why")).toHaveTextContent(/«книга» is a book/);
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/v1\/explain$/);
  expect(sent).toEqual({ kind: "choose-en", ask: "Pick the word", prompt: "книга", sub: null,
                         answer: "book", said: "table", rule: "Nouns" });
  // …and the miss is in the profile, for the tutor.
  const st = await saved();
  expect(st.misses).toHaveLength(1);
  expect(st.misses[0]).toMatchObject({ kind: "choose-en", prompt: "книга", answer: "book", said: "table" });
});

test("a typed miss sends what was written", async () => {
  answers({ ok: true, why: "Genitive singular of «книга» is «книги»." });
  await withRunner([typed]);
  const input = await screen.findByTestId("type-input");
  fireEvent.changeText(input, "книгу");
  await waitFor(() => expect(input.props.value).toBe("книгу"));
  await act(async () => { fireEvent.press(screen.getByText("Check")); });
  await screen.findByTestId("why");
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(sent.said).toBe("книгу");
  expect(sent.answer).toBe("книги");
  expect(sent.kind).toBe("cases");
});

test("a right answer asks nothing and records nothing", async () => {
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("book")); });
  await screen.findByTestId("verdict");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByTestId("why")).toBeNull();
  expect(((await saved()).misses || [])).toEqual([]);
});

test("the setting turns the explanation off; the miss is still kept", async () => {
  await withRunner([chosen], { explain: false });
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("verdict");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByTestId("why-pending")).toBeNull();
  expect((await saved()).misses).toHaveLength(1);
});

test("a failure leaves the verdict exactly as drawn", async () => {
  global.fetch.mockImplementation(async () => { throw new Error("offline"); });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("verdict");
  await waitFor(() => expect(screen.queryByTestId("why-pending")).toBeNull());
  expect(screen.queryByTestId("why")).toBeNull();
  expect(screen.getByTestId("rule-note")).toBeTruthy();      // the chapter's card still shows
});

test("misses are newest first and capped", () => {
  const m = missOf(chosen, "table");
  expect(m).toMatchObject({ kind: "choose-en", prompt: "книга", answer: "book", said: "table" });
  expect(missOf(typed, null).said).toBeNull();
  expect(MISSES_KEPT).toBe(30);
});
