/* The Say activity: hold, speak, release; the transcript is scored per word.
 *
 * The recogniser is the stub in jest.setup.js and a test plays its part by emitting
 * events. Runs through the real runner, as hear.test.js does, so the grades, the
 * retry, the skip path and the attempt log are all the real path.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { Q, SPEECH_MIX } from "../src/questions";
import { L, IX, STAGES, SPEECH } from "../src/data";
import { fold } from "@core/util";
import { MINUTE } from "@core/scheduler";
import { getFeedback } from "../src/lib/feedback";
import { WATCHDOG_MS, MIN_LISTEN_MS, TRANSIENT } from "../src/speech";
import { SPEECH_SKIP_TOP } from "@core/speech";

/* The Worker is out of scope here: the client is stubbed and, unless a test says
   otherwise, answers as an unconfigured build would. */
jest.mock("../src/lib/feedback", () => ({
  getFeedback: jest.fn(),
  config: jest.fn(() => ({ url: "https://worker.test/v1/feedback", token: "t" })),
}));

const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.say.fromStage
                                 && (SPEECH.speak[s.core.id] || []).length).core;
/* A sentence with a content word in it — only those are graded by a sentence
   (core/speech.js SPEECH_SKIP_TOP), and the pool's first draw may be «Я тебя
   люблю». */
function withContent(kind) {
  let q = null;
  for (let k = 0; k < 80 && !(q && q.lemmas.some((i) => i >= SPEECH_SKIP_TOP)); k++) {
    q = Q.present(Q.speechPrompt(kind, later, 0));
  }
  return q;
}
const question = withContent("say");
const heard = fold(question.target).replace(/[^а-яё\s-]/g, "").trim();
const content = question.lemmas.filter((i) => i >= SPEECH_SKIP_TOP);
/* A first grade is a learning step: Again one minute, Hard six, Good ten. A
   sentence said grades the produce card. */
const stepOf = (st, i) => st.seen[L[i].b].produce.dueAt - st.seen[L[i].b].produce.lastAt;

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
  return (await global.__db.saved("p1"));
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
  getFeedback.mockResolvedValue({ ok: false, reason: "unconfigured" });
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
    // Let go inside MIN_LISTEN_MS: the stop is honoured that much later, so a
    // one-syllable word is not cut off (speech.js).
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    await waitFor(() => expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1));

    await final(heard);
    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(screen.queryByText(/Try again/)).toBeNull();
    expect(screen.getByTestId("speaker-real")).toBeTruthy();   // the native recording

    const st = await saved();
    expect(content.length).toBeGreaterThan(0);
    // Good, capped: one sentence said right is not Easy for every word in it.
    for (const i of content) expect(stepOf(st, i)).toBe(10 * MINUTE);
    expect(st.speech.attempts).toHaveLength(1);
    expect(st.speech.attempts[0]).toMatchObject({ kind: "say", wer: 0, attempt: 1, unit: later.id });

    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ right: 1, total: 1, skipped: 0 }));
  });

  /* "It almost always marks me wrong" (the owner, 2026-09-19). Two of the
     three answers: the engine is told what to listen for, and of the hearings
     it offers the closest to the target is the one graded. */
  it("tells the engine the sentence, and takes the closest of its alternatives", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    const opts = global.__stt.calls[0];
    expect(opts.maxAlternatives).toBe(5);
    expect(opts.contextualStrings).toEqual(expect.arrayContaining([question.target]));
    expect(opts.contextualStrings.length).toBeGreaterThan(1);       // and its words
    // The top hearing is wrong; the second is the sentence.
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [
        { transcript: "жираф " + heard.split(/\s+/).slice(1).join(" "), confidence: 0.6 },
        { transcript: heard, confidence: 0.5 },
      ] });
    });
    expect(await screen.findByText("Correct")).toBeTruthy();
    const st = await saved();
    expect(st.speech.attempts[0]).toMatchObject({ wer: 0, attempt: 1 });
  });

  /* A recogniser that never reports back after stop() used to leave the button
     on "Listening…" for good: the watchdog gives up and says so. */
  it("gives up on a recogniser that never answers, and can be tried again", async () => {
    jest.useFakeTimers();
    try {
      await withSay();
      await screen.findByText(question.en);
      const hold = screen.getByTestId("say-hold");
      await act(async () => { fireEvent(hold, "pressIn"); });
      await act(async () => { fireEvent(hold, "pressOut"); });
      await act(async () => { jest.advanceTimersByTime(MIN_LISTEN_MS + 10); });
      expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(WATCHDOG_MS + 10); });
      expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
      expect(screen.getByText("Nothing heard")).toBeTruthy();
      // Back to idle: a new hold starts the recogniser again.
      await act(async () => { fireEvent(hold, "pressIn"); });
      expect(global.__stt.calls).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a wrong attempt shows the alignment and offers a retry; perfect on retry is Good", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    await final("жираф " + heard.split(/\s+/).slice(1).join(" "));
    expect(await screen.findByText("Try again")).toBeTruthy();       // no count: tries are unlimited
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);
    expect(screen.queryByTestId("verdict")).toBeNull();      // not settled yet

    await act(async () => { fireEvent.press(screen.getByText(/Try again/)); });
    await speak();
    await final(heard);
    expect(await screen.findByText("Correct")).toBeTruthy();

    const st = await saved();
    for (const i of content) expect(stepOf(st, i)).toBe(10 * MINUTE);
    expect(st.speech.attempts).toHaveLength(2);
    expect(st.speech.attempts[1]).toMatchObject({ attempt: 2, wer: 0 });
  });

  it("keeping an imperfect attempt is Almost (partial credit), the missed word Again", async () => {
    await withSay();
    await screen.findByText(question.en);
    await speak();
    // Drop the first content word (a name like «Том» has no card; «не» is not graded).
    const words = heard.split(/\s+/);
    const k = words.findIndex((w) => IX[w] && IX[w].length && IX[w][0] >= SPEECH_SKIP_TOP);
    const dropped = IX[words[k]][0];
    await final(words.filter((_, j) => j !== k).join(" "));
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(await screen.findByText(/^(Almost|Not quite)$/)).toBeTruthy();
    const st = await saved();
    // The dropped word is Again (due again today); the rest are due later. A
    // first Again on a new card is a learning step, not a lapse.
    for (const i of content) {
      expect({ lemma: L[i].b, step: stepOf(st, i) === MINUTE ? "again" : "later" })
        .toEqual({ lemma: L[i].b, step: i === dropped ? "again" : "later" });
    }
    expect(st.seen[L[dropped].b]).toBeTruthy();
  });

  it("offers a way past without speaking, which grades nothing", async () => {
    await withSay();
    await screen.findByText(question.en);
    await act(async () => { fireEvent.press(screen.getByText("Can't speak now")); });
    expect(await screen.findByText("Skipped")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ skipped: 1, total: 0 }));
    const st = await saved();
    for (const i of question.lemmas) expect(st.seen[L[i].b]).toBeUndefined();
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

  it("asks the feedback service after settling, shows its notes, and counts its tags", async () => {
    let resolve;
    getFeedback.mockReturnValueOnce(new Promise((res) => { resolve = res; }));
    await withSay();
    await screen.findByText(question.en);
    await speak();
    await final(heard.split(/\s+/).slice(1).join(" "));
    expect(getFeedback).not.toHaveBeenCalled();                 // not before the verdict
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(await screen.findByText(/^(Almost|Not quite)$/)).toBeTruthy();
    expect(screen.getByTestId("feedback-pending")).toBeTruthy(); // below it, not blocking it
    expect(getFeedback).toHaveBeenCalledTimes(1);
    expect(getFeedback.mock.calls[0][0]).toMatchObject({ target: question.target, unitId: later.id });
    expect(getFeedback.mock.calls[0][0].lemmas).toEqual(question.lemmas.map((i) => L[i].b));

    await act(async () => {
      resolve({ ok: true, overall: "minor", praise: "Clear pronunciation.",
                words: [], wordChoice: [{ said: "очень", better: "весьма", note: "" }],
                grammar: [{ tag: "CASE", note: "Accusative after the verb." }] });
    });
    expect(await screen.findByText("Accusative after the verb.")).toBeTruthy();
    expect(screen.getByText("case")).toBeTruthy();
    expect(screen.getByText("Clear pronunciation.")).toBeTruthy();
    expect(screen.getByText("очень → весьма")).toBeTruthy();
    expect(screen.queryByTestId("feedback-pending")).toBeNull();
    const st = await saved();
    expect(st.speech.tagCounts).toEqual({ CASE: 1 });
    expect(st.speech.attempts[0].tags).toEqual(["CASE"]);
  });

  it("shows nothing extra when the service is unavailable", async () => {
    getFeedback.mockResolvedValueOnce({ ok: false, reason: "offline" });
    await withSay();
    await screen.findByText(question.en);
    await speak();
    await final(heard);
    expect(await screen.findByText("Correct")).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByTestId("feedback")).toBeNull();
    expect(screen.queryByTestId("feedback-pending")).toBeNull();
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

  /* The other half of that rule, and the one that was wrong until 2026-09-22:
     a momentary failure is a **note**, not a screen that replaces the
     activity. Every code but `no-speech` used to raise a block and nothing
     ever called `clearBlock`, so a lost audio session ended the question. */
  it("treats a dropped microphone as a note and a real refusal as a block", async () => {
    expect(TRANSIENT["audio-capture"]).toBeTruthy();
    expect(TRANSIENT["no-speech"]).toBe("Nothing heard");
    expect(TRANSIENT["not-allowed"]).toBeUndefined();         // the mic really is off

    await withSay();
    await screen.findByText(question.en);
    await speak();
    await act(async () => { global.__stt.emit("error", { error: "audio-capture" }); });
    // Still the question, with the microphone ready and a word about it.
    expect(screen.getByText(question.en)).toBeTruthy();
    expect(screen.getByTestId("say-hold")).toBeTruthy();
    expect(screen.queryByText(/Recognition failed/)).toBeNull();
    expect(await screen.findByText(TRANSIENT["audio-capture"])).toBeTruthy();
  });
});
