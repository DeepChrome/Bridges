/* The Say activity: hold, speak, release; the transcript is scored per word.
 *
 * The recogniser is the stub in jest.setup.js and a test plays its part by emitting
 * events. Runs through the real runner, as hear.test.js does, so the grades, the
 * retry, the skip path and the attempt log are all the real path.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { Q, SPEECH_MIX } from "../src/questions";
import { L, IX, STAGES, SPEECH } from "../src/data";
import { fold, today } from "@core/util";
import { applyGrade } from "@core/fsrs";

const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.say.fromStage
                                 && (SPEECH.speak[s.core.id] || []).length).core;
const question = Q.present(Q.speechPrompt("say", later, 0));
const heard = fold(question.target).replace(/[^а-яё\s-]/g, "").trim();
const dueFor = (grade) => applyGrade({}, {}, "x", grade, today()).card.due;

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

const onFinish = jest.fn();

async function withSay() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(
    <SessionProvider>
      <Runner steps={[question]} onFinish={onFinish} />
    </SessionProvider>
  );
}

async function saved() {
  await flushState();
  return JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
}

/* Hold, let the permission resolve, release. */
async function speak() {
  const hold = screen.getByTestId("say-hold");
  await act(async () => { fireEvent(hold, "pressIn"); });
  await act(async () => { fireEvent(hold, "pressOut"); });
}
const final = (transcript) => act(async () => {
  global.__stt.emit("result", { isFinal: true, results: [{ transcript, confidence: 0.9 }] });
});

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__stt.reset();
  global.__played = [];
});

afterEach(async () => {
  await flushState();
});

describe("say", () => {
  it("prompts in English, listens on-device, and a perfect first attempt is Easy", async () => {
    await withSay();
    expect(await screen.findByText(question.en)).toBeTruthy();
    expect(screen.queryByText(question.target)).toBeNull();
    expect(global.__played).toHaveLength(0);           // nothing to copy from

    const hold = screen.getByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    expect(global.__stt.calls).toHaveLength(1);
    expect(global.__stt.calls[0]).toMatchObject({
      lang: "ru-RU", requiresOnDeviceRecognition: true, interimResults: true,
    });
    await act(async () => {
      global.__stt.emit("result", { isFinal: false, results: [{ transcript: "я", confidence: 0.4 }] });
    });
    expect(screen.getByText("я")).toBeTruthy();
    await act(async () => { fireEvent(hold, "pressOut"); });
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);

    await final(heard);
    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(screen.queryByText(/Try again/)).toBeNull();
    expect(screen.getByTestId("speaker-real")).toBeTruthy();   // the native recording

    const st = await saved();
    expect(question.lemmas.length).toBeGreaterThan(0);
    for (const i of question.lemmas) expect(st.seen[L[i].b].due).toBe(dueFor(4));
    expect(st.speech.attempts).toHaveLength(1);
    expect(st.speech.attempts[0]).toMatchObject({ kind: "say", wer: 0, attempt: 1, unit: later.id });

    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ right: 1, total: 1, skipped: 0 }));
  });

  it("a wrong attempt shows the alignment and offers a retry; perfect on retry is Good", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    await final("жираф " + heard.split(/\s+/).slice(1).join(" "));
    expect(await screen.findByText(/Try again · 2 left/)).toBeTruthy();
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);
    expect(screen.queryByTestId("verdict")).toBeNull();      // not settled yet

    await act(async () => { fireEvent.press(screen.getByText(/Try again/)); });
    await speak();
    await final(heard);
    expect(await screen.findByText("Correct")).toBeTruthy();

    const st = await saved();
    for (const i of question.lemmas) expect(st.seen[L[i].b].due).toBe(dueFor(3));
    expect(st.speech.attempts).toHaveLength(2);
    expect(st.speech.attempts[1]).toMatchObject({ attempt: 2, wer: 0 });
  });

  it("keeping an imperfect attempt is Not quite, the missed word Again", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    // Drop the first word the curriculum knows (a name like «Том» has no card).
    const words = heard.split(/\s+/);
    const k = words.findIndex((w) => IX[w] && IX[w].length);
    const dropped = IX[words[k]][0];
    await final(words.filter((_, j) => j !== k).join(" "));
    await act(async () => { fireEvent.press(screen.getByText("Keep")); });
    expect(await screen.findByText("Not quite")).toBeTruthy();
    const st = await saved();
    for (const i of question.lemmas) {
      expect({ lemma: L[i].b, lapses: st.seen[L[i].b].lapses })
        .toEqual({ lemma: L[i].b, lapses: i === dropped ? 1 : 0 });
    }
  });

  it("with the microphone refused it offers Skip, which grades nothing", async () => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync
      .mockResolvedValueOnce({ granted: false, status: "denied" });
    await withSay();
    await screen.findByText(question.en);
    await speak();
    expect(global.__stt.calls).toHaveLength(0);
    await act(async () => { fireEvent.press(await screen.findByText("Skip (mic off)")); });
    expect(await screen.findByText("Skipped")).toBeTruthy();
    const st = await saved();
    expect(Object.keys(st.seen)).toHaveLength(0);
    expect(st.speech.attempts).toHaveLength(0);
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ right: 0, total: 0, skipped: 1 }));
  });

  it("without the offline model it says so and offers the download", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    await act(async () => {
      global.__stt.emit("error", { error: "language-not-supported",
                                   message: "Requested language is supported but not downloaded" });
    });
    expect(await screen.findByText(/not installed for offline recognition/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Get Russian")); });
    expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload)
      .toHaveBeenCalledWith({ locale: "ru-RU" });
    expect(screen.getByText("Skip")).toBeTruthy();
  });
});
