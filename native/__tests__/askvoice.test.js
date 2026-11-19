/* The sparkle's sheet speaks and listens (the owner, 2026-11-19: "add a voice
 * input option… add conversation mode (almost like the tutor but it's
 * catered for the context of the card/chapter it's on)… make sure we have
 * the option for the AI to receive input in Russian or English").
 *
 *   - a held question goes as the screen's question, with the microphone's
 *     language the toggle chose, and the answer is read aloud: the English in
 *     English, the «Russian» in Teddy's voice;
 *   - the loop sends with `converse` set and listens again once the reply
 *     has been read; stopping it sends nothing;
 *   - the tutor draws a mark as two labelled lines.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import { splitSpoken } from "../src/audio";

let mockConfigured = true;
jest.mock("../src/lib/feedback", () => ({
  ...jest.requireActual("../src/lib/feedback"),
  config: jest.fn(() => (mockConfigured ? { url: "x", base: "x", token: "t" } : null)),
  ask: jest.fn(), tutor: jest.fn(),
}));
jest.mock("../src/about", () => ({
  ...jest.requireActual("../src/about"),
  screenAbout: jest.fn(() => ({ screen: "Cards", title: "Study", params: {},
    question: { kind: "word card", word: "книга", step: "1 of 5" } })),
}));
const fb = require("../src/lib/feedback");
const { AskButton } = require("../src/askai");
const Tutor = require("../src/screens/Tutor").default;

async function seed(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ v: 10, seen: {}, trouble: {}, pinned: [], sets: [],
    drills: {}, unit: {}, speech: { attempts: [], tagCounts: {} }, tutorIntro: { at: Date.now(), skipped: true }, ...state }));
}
const press = async (id) => act(async () => { fireEvent.press(await screen.findByTestId(id)); });
const says = async (text) => act(async () => {
  global.__stt.emit("result", { isFinal: true, results: [{ transcript: text, confidence: 0.9 }] });
});
const pause = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear();
  fb.ask.mockReset(); fb.tutor.mockReset(); mockConfigured = true;
  if (global.__stt) global.__stt.reset();
  global.__spoke = []; global.__spokeOpts = [];
});
afterEach(async () => { await flushState(); });

it("splits a reply into the English and the Russian to be read in two voices", () => {
  expect(splitSpoken("Here «книгу» is the accusative, after «читать».")).toEqual([
    { text: "Here", ru: false }, { text: "книгу", ru: true }, { text: "is the accusative, after", ru: false },
    { text: "читать", ru: true }, { text: ".", ru: false }].filter((p) => /\w|[Ѐ-ӿ]/.test(p.text)));
  expect(splitSpoken("No guillemets, but книга is here.").map((p) => p.ru)).toEqual([false, true, false]);
  expect(splitSpoken("")).toEqual([]);
});

it("takes a held question in the microphone's language and reads the answer back", async () => {
  fb.ask.mockResolvedValueOnce({ ok: true, answer: "It is «книгу» because «читать» takes the accusative." });
  await seed();
  await render(<SessionProvider><AskButton /></SessionProvider>);
  await press("ask-button");
  // The toggle: Russian by default, English on a press.
  expect(screen.getByTestId("ask-lang")).toBeTruthy();
  await press("ask-lang");
  await act(async () => { fireEvent(screen.getByTestId("ask-hold"), "pressIn"); });
  expect(global.__stt.calls[0].lang).toBe("en-US");
  await says("why is it knigu");
  await act(async () => { fireEvent(screen.getByTestId("ask-hold"), "pressOut"); });
  await act(async () => { global.__stt.emit("end", {}); });
  await waitFor(() => expect(fb.ask).toHaveBeenCalledTimes(1));
  expect(fb.ask.mock.calls[0][0].question).toBe("why is it knigu");
  expect(fb.ask.mock.calls[0][0].converse).toBe(true);
  expect(await screen.findByTestId("ask-answer-0")).toBeTruthy();
  // Read aloud: the English parts in English, the Russian in Teddy's voice.
  await waitFor(() => expect(global.__spoke.length).toBeGreaterThanOrEqual(3));
  const langs = global.__spokeOpts.map((o) => o.language);
  expect(langs.some((l) => /^en/.test(l))).toBe(true);
  expect(langs.some((l) => /^ru/.test(l))).toBe(true);
  expect(global.__spoke).toContain("книгу");
});

it("in conversation mode listens again after the reply, sends with converse, and stops on the toggle", async () => {
  fb.ask.mockResolvedValue({ ok: true, answer: "Yes. Now say «я читаю книгу»." });
  await seed();
  await render(<SessionProvider><AskButton /></SessionProvider>);
  await press("ask-button");
  await press("ask-converse");
  expect(global.__stt.calls.length).toBe(1);
  // Both languages are live in the loop, and the language toggle is gone.
  expect(global.__stt.calls[0].androidIntentOptions.EXTRA_ENABLE_LANGUAGE_SWITCH).toBeTruthy();
  expect(screen.queryByTestId("ask-lang")).toBeNull();
  await says("what case is this");
  await pause(1700);                                   // the pause that ends a turn (speech.js SILENCE_MS)
  await waitFor(() => expect(fb.ask).toHaveBeenCalledTimes(1));
  expect(fb.ask.mock.calls[0][0].converse).toBe(true);
  // Read, then the microphone again.
  await waitFor(() => expect(global.__stt.calls.length).toBe(2), { timeout: 3000 });
  await press("ask-loop");
  expect(screen.getByTestId("ask-converse").props.accessibilityState.selected).toBe(false);
  await says("nothing sent");
  await pause(1700);
  expect(fb.ask).toHaveBeenCalledTimes(1);
});

it("the tutor draws a mark as You and Correct, in red and green", async () => {
  fb.tutor.mockResolvedValueOnce({ ok: true, ru: "Скажи «я вижу дом».", en: "Say «I see the house».", note: "", remember: "" })
          .mockResolvedValueOnce({ ok: true, ru: "", en: "", note: "Feminine nouns take -у in the accusative.",
                                   mark: { ok: false, yours: "книга", right: "книгу" }, remember: "" });
  await seed();
  await render(<SessionProvider><WordsProvider><Tutor navigation={{ navigate: jest.fn(), addListener: () => () => {} }} /></WordsProvider></SessionProvider>);
  await screen.findByTestId("tutor-turn");
  const input = screen.getByTestId("tutor-input");
  fireEvent.changeText(input, "книга");
  await waitFor(() => expect(input.props.value).toBe("книга"));
  await press("tutor-send");
  const mark = await screen.findByTestId("tutor-mark");
  expect(within(mark).getByText("YOU")).toBeTruthy();
  expect(within(mark).getByText("CORRECT")).toBeTruthy();
  expect(within(screen.getByTestId("tutor-mark-yours")).getByText("книга")).toBeTruthy();
  expect(within(screen.getByTestId("tutor-mark-right")).getByText("книгу")).toBeTruthy();
  const { light } = require("../src/theme");
  const bg = (id) => [].concat(screen.getByTestId(id).props.style).reduce((a, s) => ({ ...a, ...s }), {}).backgroundColor;
  expect(bg("tutor-mark-yours")).toBe(light.badBg);
  expect(bg("tutor-mark-right")).toBe(light.goodBg);
  // The note under it is one sentence of why.
  expect(screen.getAllByTestId("tutor-note").pop()).toHaveTextContent(/Feminine nouns/);
});
