/* The STT lab: it asks the recogniser for on-device Russian, scores what comes back
   with compare(), and logs every attempt as kind "lab". The recogniser is the stub in
   jest.setup.js; a test plays its part by emitting events.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { Share } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import SttLab from "../src/screens/SttLab";
import { STT_SET } from "../src/sttset";

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withLab(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><SttLab /></SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__stt.reset();
});

afterEach(async () => {
  await flushState();
});

describe("STT lab", () => {
  it("has a thirty-sentence set, six per unit, all short", () => {
    expect(STT_SET).toHaveLength(30);
    const perUnit = {};
    for (const s of STT_SET) perUnit[s.unit] = (perUnit[s.unit] || 0) + 1;
    expect(Object.values(perUnit)).toEqual([6, 6, 6, 6, 6]);
    for (const s of STT_SET) expect(s.ru.split(/\s+/).length).toBeLessThanOrEqual(10);
  });

  it("refuses to render without developer mode", async () => {
    await withLab({ dev: false });
    expect(await screen.findByText("Developer mode is off.")).toBeTruthy();
  });

  it("asks for on-device Russian, scores the final result, and logs it", async () => {
    await withLab({ dev: true });
    expect(await screen.findByText(STT_SET[0].ru)).toBeTruthy();
    expect(screen.getByText("0 logged")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("Speak")); });
    expect(global.__stt.calls).toHaveLength(1);
    expect(global.__stt.calls[0]).toMatchObject({
      lang: "ru-RU", requiresOnDeviceRecognition: true, interimResults: true,
    });

    // A partial result shows live; the final one is scored. The set's first sentence
    // is «Вот это да!»; the recogniser drops the punctuation, compare() does not mind.
    await act(async () => {
      global.__stt.emit("result", { isFinal: false, results: [{ transcript: "вот", confidence: 0.5 }] });
    });
    expect(screen.getByText("вот")).toBeTruthy();
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [{ transcript: "вот это да", confidence: 0.9 }] });
    });
    expect(await screen.findByText("WER 0%")).toBeTruthy();
    expect(screen.getByText("1 logged")).toBeTruthy();
  });

  it("logs a recogniser error as a failed attempt and offers Again", async () => {
    await withLab({ dev: true });
    await screen.findByText(STT_SET[0].ru);
    await act(async () => { fireEvent.press(screen.getByText("Speak")); });
    await act(async () => {
      global.__stt.emit("error", { error: "no-speech", message: "No speech detected" });
    });
    expect(await screen.findByText(/no-speech/)).toBeTruthy();
    expect(screen.getByText("1 logged")).toBeTruthy();
    expect(screen.getByText("Again")).toBeTruthy();
  });

  it("exports the speech slot as JSON through the share sheet", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await withLab({
      dev: true,
      speech: { attempts: [{ kind: "lab", target: "Вот это да!", transcript: "вот это да",
                             wer: 0, latencyMs: 900 }], tagCounts: {} },
    });
    await screen.findByText(STT_SET[0].ru);
    await act(async () => { fireEvent.press(screen.getByText("Export 1 attempts")); });
    expect(share).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(share.mock.calls[0][0].message);
    expect(sent.attempts).toHaveLength(1);
    expect(sent.attempts[0]).toMatchObject({ kind: "lab", wer: 0 });
    expect(sent.set).toBe(30);
    share.mockRestore();
  });
});
