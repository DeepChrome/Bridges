/* Speak Russian, read it back in English (screens/Translate.js, 2026-09-22).
 *
 * The thing worth pinning is the split: the **transcript** is the phone's and
 * is owed whatever happens, word-linked and offline; the **sentence** is the
 * Worker's and may not arrive. A failure has to leave the Russian on screen,
 * because the Russian with its glosses is still the better half of the answer.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import Translate from "../src/screens/Translate";
import { forgetToken } from "../src/lib/feedback";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const URL_KEY = "EXPO_PUBLIC_FEEDBACK_URL";
const accounts = { list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" };

async function open() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
    speech: { attempts: [], tagCounts: {} }, streak: 0,
  }));
  return await render(
    <SessionProvider><WordsProvider><Translate navigation={nav} /></WordsProvider></SessionProvider>,
  );
}

/* Hold, let go, and let the recogniser deliver. */
async function say(ru) {
  const hold = await screen.findByTestId("say-hold");
  await act(async () => { fireEvent(hold, "pressIn"); });
  await act(async () => { fireEvent(hold, "pressOut"); });
  await act(async () => {
    global.__stt.emit("result", { isFinal: true, results: [{ transcript: ru, confidence: 0.9 }] });
  });
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  await forgetToken();
  jest.clearAllMocks();
  if (global.__stt) global.__stt.reset();
  global.fetch = jest.fn();
  process.env[URL_KEY] = "https://w.example";
  process.env.EXPO_PUBLIC_APP_TOKEN = "tok";
});
afterEach(async () => {
  await flushState();
  delete process.env[URL_KEY];
  delete process.env.EXPO_PUBLIC_APP_TOKEN;
});

const answers = (body) => {
  global.fetch.mockImplementation(async () => ({
    ok: true, status: 200, json: async () => body,
  }));
};

it("turns what was said into English, and keeps every word tappable", async () => {
  answers({ ok: true, en: "I want tea.", note: "" });
  await open();
  expect(screen.getByTestId("translate-empty")).toBeTruthy();
  await say("я хочу чай");

  expect(await screen.findByTestId("translate-en")).toHaveTextContent("I want tea.");
  expect(screen.queryByTestId("translate-empty")).toBeNull();
  // The transcript is `Linked`, so each word is a two-press dictionary entry
  // (§30b) — which is the half that works with no network at all.
  expect(screen.getByLabelText("хочу, open word")).toBeTruthy();

  // What went to the Worker is the transcript and nothing else.
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(sent).toEqual({ ru: "я хочу чай" });
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/v1\/translate$/);
});

it("says when the Russian was odd, without correcting it", async () => {
  answers({ ok: true, en: "I wants tea.", note: "verb does not agree" });
  await open();
  await say("я хочет чай");
  expect(await screen.findByTestId("translate-note")).toHaveTextContent("verb does not agree");
  // The transcript is untouched: it translated what was said.
  expect(screen.getByLabelText("хочет, open word")).toBeTruthy();
});

/* A failure loses the sentence, never the Russian. */
it("keeps the transcript when the translation cannot be fetched", async () => {
  global.fetch.mockImplementation(async () => { throw new Error("offline"); });
  await open();
  await say("я хочу чай");
  expect(await screen.findByTestId("translate-failed")).toBeTruthy();
  expect(screen.queryByTestId("translate-en")).toBeNull();
  expect(screen.getByLabelText("чай, open word")).toBeTruthy();
});

/* A build with no Worker in it asks for nothing and says so once, rather than
   waiting out a timeout it already knows the answer to. */
it("offers the word-by-word reading alone when the build knows no Worker", async () => {
  delete process.env[URL_KEY];
  await open();
  await say("я хочу чай");
  expect(await screen.findByTestId("translate-offline")).toBeTruthy();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("хочу, open word")).toBeTruthy();
});

/* Nothing is scored and nothing is remembered: it is a tool, not an exercise. */
it("puts no word into the schedule and keeps no history", async () => {
  answers({ ok: true, en: "Tea.", note: "" });
  await open();
  await say("чай");
  await screen.findByTestId("translate-en");
  await flushState();
  const saved = await global.__db.saved("p1");
  expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
  expect((saved && saved.speech && saved.speech.attempts) || []).toEqual([]);
});
