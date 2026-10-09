/* What a wrong answer shows: the answer, its audio and More, and nothing
 * else (the owner, 2026-10-08: "Remove the bloat in the pop-up. Don't need
 * forced AI responses. Instead, just leave the answer, the audio, and the
 * full entry"). The Worker's explanation, the derived one and the chapter's
 * rule card used to come under a miss; the sparkle beside the question is
 * where a learner asks why now. The miss is still kept for the tutor.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, missOf, MISSES_KEPT } from "../src/screens/Run";
import { splitMarked } from "../src/ui";
import { forgetToken } from "../src/lib/feedback";
import { L } from "../src/data";

const URL_KEY = "EXPO_PUBLIC_FEEDBACK_URL";
// A word with tables, so More has an entry to open.
const wi = L.findIndex((w) => w.t && w.t.length);
const chosen = {
  kind: "choose-en", ask: "Pick the word", prompt: L[wi].w, cyr: true, i: wi,
  note: { title: "Nouns", body: "Russian nouns carry gender." },
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

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); await forgetToken(); jest.clearAllMocks();
  global.fetch = jest.fn();
  // A Worker is configured, so not asking it is the code's choice, not the build's.
  process.env[URL_KEY] = "https://w.example";
  process.env.EXPO_PUBLIC_APP_TOKEN = "tok";
});
afterEach(async () => {
  await flushState();
  delete process.env[URL_KEY];
  delete process.env.EXPO_PUBLIC_APP_TOKEN;
});

test("a miss shows the answer, its audio and More, asks the Worker nothing, and is kept", async () => {
  global.__players = []; global.__spoke = [];
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("verdict");
  expect(screen.getByText("Answer: book")).toBeTruthy();
  expect(screen.getByTestId("verdict-speaker")).toBeTruthy();
  // More needs the word provider, which this harness does not mount; its own
  // test covers it.
  for (const id of ["why", "why-pending", "why-cap", "standard-why", "rule-note"]) {
    expect(screen.queryByTestId(id)).toBeNull();
  }
  expect(screen.queryByText("Russian nouns carry gender.")).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
  // The right form is still read out as the verdict lands.
  await waitFor(() => expect(global.__players.length + global.__spoke.length).toBeGreaterThan(0));
  const st = await saved();
  expect(st.misses).toHaveLength(1);
  expect(st.misses[0]).toMatchObject({ kind: "choose-en", answer: "book", said: "table" });
});

test("a typed miss keeps what was written", async () => {
  await withRunner([typed]);
  const input = await screen.findByTestId("type-input");
  fireEvent.changeText(input, "книгу");
  await waitFor(() => expect(input.props.value).toBe("книгу"));
  await act(async () => { fireEvent.press(screen.getByText("Check")); });
  await screen.findByTestId("verdict");
  expect(global.fetch).not.toHaveBeenCalled();
  expect((await saved()).misses[0]).toMatchObject({ kind: "cases", said: "книгу", answer: "книги" });
});

test("a right answer records nothing", async () => {
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("book")); });
  await screen.findByTestId("verdict");
  expect(((await saved()).misses || [])).toEqual([]);
});

test("misses are shaped for the tutor and capped", () => {
  const m = missOf(chosen, "table");
  expect(m).toMatchObject({ kind: "choose-en", answer: "book", said: "table" });
  expect(missOf(typed, null).said).toBeNull();
  expect(MISSES_KEPT).toBe(30);
});

/* The formatting rule every note about Russian rests on: the Russian is the
   loud part, whether or not the model remembered its guillemets. */
describe("Marked", () => {
  it("sets «guillemet» content apart and drops the marks", () => {
    expect(splitMarked("Use «книгу», the accusative.")).toEqual([
      { text: "Use " }, { text: "книгу", mark: true }, { text: ", the accusative." },
    ]);
  });

  it("falls back to the Cyrillic runs when the model forgot them", () => {
    expect(splitMarked("Use книгу here")).toEqual([
      { text: "Use " }, { text: "книгу", mark: true }, { text: " here" },
    ]);
    expect(splitMarked("кни́гу").map((p) => p.mark)).toEqual([true]);
    expect(splitMarked("что-то").map((p) => p.text)).toEqual(["что-то"]);
  });

  it("leaves English alone and survives nothing at all", () => {
    expect(splitMarked("Nothing Russian here")).toEqual([{ text: "Nothing Russian here" }]);
    expect(splitMarked("")).toEqual([]);
    expect(splitMarked(null)).toEqual([]);
    expect(splitMarked(undefined)).toEqual([]);
  });

  it("marks only what was quoted when anything was quoted", () => {
    const parts = splitMarked("«нет» governs книги");
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(["нет"]);
  });
});
