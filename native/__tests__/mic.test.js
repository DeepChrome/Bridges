/* Speaking instead of typing (the owner, 2026-09-29): a small grey microphone
 * in the dictionary's search bar, and beside every typed answer. One press
 * listens; the attempt ends when the speaker stops (speech.js SILENCE_MS), and
 * what was said lands in the field as though it had been typed. */

import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Search from "../src/screens/Search";
import { RuInput } from "../src/keyboard";
import { SILENCE_MS } from "../src/speech";

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), dispatch: jest.fn(), setParams: jest.fn() };
const base = {
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, recent: [],
};
async function withProfile(ui) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "curls", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return render(<SessionProvider>{ui}</SessionProvider>);
}
const pause = () => act(() => new Promise((r) => setTimeout(r, SILENCE_MS + 150)));

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); global.__stt.reset(); });
afterEach(async () => { await flushState(); });

function Answer() {
  const [v, setV] = useState("");
  return <RuInput testID="answer" value={v} onChangeText={setV} />;
}

describe("speaking into a field", () => {
  it("fills the dictionary's search with what was said, hearing Russian or English", async () => {
    await withProfile(<Search navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("word-search-mic")); });
    const opts = global.__stt.calls[0];
    expect(opts.continuous).toBe(true);                       // it ends itself, on a pause
    expect(opts.androidIntentOptions.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES).toEqual(["ru-RU", "en-US"]);
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [{ transcript: "собака" }] });
    });
    await pause();
    expect(screen.getByTestId("word-search").props.value).toBe("собака");
  });

  it("puts a spoken answer where the typing goes, in Russian only, without the full stop", async () => {
    await withProfile(<Answer />);
    await act(async () => { fireEvent.press(await screen.findByTestId("answer-mic")); });
    const opts = global.__stt.calls[0];
    expect(opts.lang).toBe("ru-RU");
    expect(opts.androidIntentOptions.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES).toBeUndefined();
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [{ transcript: "Книгу." }] });
    });
    await pause();
    expect(screen.getByTestId("answer").props.value).toBe("Книгу");
  });

  it("puts the microphone down on a second press and sends nothing", async () => {
    await withProfile(<Answer />);
    const mic = await screen.findByTestId("answer-mic");
    await act(async () => { fireEvent.press(mic); });
    expect(mic.props.accessibilityState).toMatchObject({ selected: true });
    await act(async () => { fireEvent.press(screen.getByTestId("answer-mic")); });
    await pause();
    expect(screen.getByTestId("answer").props.value).toBe("");
    expect(screen.getByTestId("answer-mic").props.accessibilityState).toMatchObject({ selected: false });
  });
});
