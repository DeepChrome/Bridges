/* Conversation mode: the picker's gate and budget, a turn graded and pinned words.
   The Worker is the stubbed client; the recogniser is jest.setup's stub.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Talk, { TALK_UNLOCK_STAGE } from "../src/screens/Talk";
import { STAGES, L, lessonCount } from "../src/data";
import { talk } from "../src/lib/feedback";
import { SCENARIOS } from "@core/scenarios";
import { TALK_SESSIONS_PER_DAY } from "@core/state";
import { today } from "@core/util";

jest.mock("../src/lib/feedback", () => ({ talk: jest.fn(), getFeedback: jest.fn() }));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, dev: false,
};
/* Chapters 1–5 done, so Talk is open and every scenario's unit is reachable. */
const done = () => {
  const unit = {};
  for (let s = 0; s <= TALK_UNLOCK_STAGE; s++) {
    for (const u of [STAGES[s].core].concat(STAGES[s].branches)) {
      const lessons = {};
      for (let i = 0; i < lessonCount(u); i++) lessons[i] = { v: true, q: 100 };
      unit[u.id] = { lessons, video: true, best: 100, done: true };
    }
  }
  return unit;
};

const OPENING = { ok: true, reply_ru: "Здравствуйте! Что вы хотите?", reply_en: "Hello! What would you like?",
  reply_tokens: [{ ru: "Здравствуйте", lemma: "здравствуйте" }, { ru: "Что", lemma: "что" }, { ru: "вы", lemma: "вы" }, { ru: "хотите", lemma: "хотеть" }],
  feedback: null, newWords: [] };
const REPLY = { ok: true, reply_ru: "Хорошо! Вы хотите чай?", reply_en: "Good! Do you want tea?",
  reply_tokens: [{ ru: "Хорошо", lemma: "хорошо" }, { ru: "Вы", lemma: "вы" }, { ru: "хотите", lemma: "хотеть" }, { ru: "чай", lemma: "чай" }],
  feedback: { words: [
      { said: "я", expected: "я", lemma: "я", status: "ok", tags: [] },
      { said: "хочу", expected: "хочу", lemma: "хотеть", status: "ok", tags: [] },
      { said: "вода", expected: "воду", lemma: "вода", status: "sub", tags: ["CASE"] }],
    grammar: [{ tag: "CASE", note: "Use «воду», the accusative after «хотеть»." }],
    wordChoice: [], overall: "minor", praise: "" },
  newWords: [{ ru: "булочка", lemma: "булочка", en: "bun" }] };

async function withTalk(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Talk navigation={nav} /></SessionProvider>);
}
async function saved() { await flushState(); return JSON.parse(await AsyncStorage.getItem("rb.state.p1")); }

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__stt.reset();
});
afterEach(async () => { await flushState(); });

describe("talk", () => {
  it("is locked until chapter 5 is done, and says so", async () => {
    await withTalk({});
    expect(await screen.findByText(`Opens after chapter ${TALK_UNLOCK_STAGE + 1}`)).toBeTruthy();
    const first = screen.getByText(SCENARIOS[0].title).parent;
    expect(screen.getByText(`${TALK_SESSIONS_PER_DAY}`)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText(SCENARIOS[0].title)); });
    expect(talk).not.toHaveBeenCalled();
    expect(first).toBeTruthy();
  });

  it("opens with the tutor's turn, grades a spoken turn, counts its tag, offers a new word", async () => {
    talk.mockResolvedValueOnce(OPENING).mockResolvedValueOnce(REPLY);
    await withTalk({ unit: done() });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    expect(await screen.findByText(/Здравствуйте! Что вы хотите\?/)).toBeTruthy();
    expect(talk).toHaveBeenCalledTimes(1);
    expect(talk.mock.calls[0][0]).toMatchObject({ transcript: "", history: [] });
    expect(talk.mock.calls[0][0].scenario).toMatch(/waiter/);
    expect(talk.mock.calls[0][0].studied.length).toBeGreaterThan(20);
    // Chapters 1–5 are done, so the tutor pitches its Russian at the advanced
    // level unless a level was chosen; and it reads its turn out as it arrives.
    expect(talk.mock.calls[0][0].level).toBe("advanced");
    expect(global.__spoke[global.__spoke.length - 1]).toMatch(/Здравствуйте/);

    const hold = screen.getByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => { global.__stt.emit("result", { isFinal: true, results: [{ transcript: "я хочу вода" }] }); });
    expect(await screen.findByText(/Вы хотите чай\?/)).toBeTruthy();
    expect(talk.mock.calls[1][0].history).toHaveLength(2);
    expect(talk.mock.calls[1][0].transcript).toBe("я хочу вода");
    // The learner's bubble now carries the alignment and the grammar note.
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);
    expect(screen.getByText(/accusative after «хотеть»/)).toBeTruthy();
    expect(screen.getByText("11 turns left")).toBeTruthy();

    const st = await saved();
    expect(st.speech.tagCounts).toEqual({ CASE: 1 });
    expect(st.speech.attempts[0]).toMatchObject({ kind: "talk", scenario: "cafe", transcript: "я хочу вода" });
    expect(st.seen["вода"].lapses).toBe(1);
    expect(st.seen["хотеть"].lapses).toBe(0);
    expect(st.speech.talk).toEqual({ day: today(), sessions: 1 });

    await act(async () => { fireEvent.press(screen.getByText("Add to study")); });
    expect((await saved()).pinned).toEqual(["булочка"]);
    expect(screen.getByText("added")).toBeTruthy();
  });

  it("lets the learner pick the tutor's level and pace, and remembers them", async () => {
    talk.mockResolvedValue(OPENING);
    await withTalk({ unit: done() });
    await screen.findByText("В кафе");
    await act(async () => { fireEvent.press(screen.getByText("Beginner")); });
    await act(async () => { fireEvent.press(screen.getByText("Slowest")); });
    const st = await saved();
    expect(st.talkLevel).toBe("beginner");
    expect(st.talkSpeed).toBe("slowest");
    global.__spokeOpts = [];
    await act(async () => { fireEvent.press(screen.getByText("В кафе")); });
    await screen.findByText(/Здравствуйте/);
    expect(talk.mock.calls[0][0].level).toBe("beginner");
    expect(global.__spokeOpts[0].rate).toBeCloseTo(0.9 * 0.65);       // the tutor's own pace
  });

  it("ends with a summary and spends the day's sessions", async () => {
    talk.mockResolvedValue(OPENING);
    await withTalk({ unit: done(), speech: { attempts: [], tagCounts: {}, talk: { day: today(), sessions: TALK_SESSIONS_PER_DAY - 1 } } });
    expect(await screen.findByText("1")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("В кафе")); });
    await screen.findByText(/Здравствуйте/);
    await act(async () => { fireEvent.press(screen.getByText("End")); });
    expect(await screen.findByText("0 turns, 0 clean")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Another conversation")); });
    expect(await screen.findByText("0")).toBeTruthy();                    // none left today
    await act(async () => { fireEvent.press(screen.getByText("В кафе")); });
    expect(talk).toHaveBeenCalledTimes(1);                                 // refused, not sent
  });

  it("a turn the tutor did not grade stands as said and the conversation goes on", async () => {
    talk.mockResolvedValueOnce(OPENING).mockResolvedValueOnce({ ...REPLY, feedback: null, newWords: [] });
    await withTalk({ unit: done() });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    await screen.findByText(/Здравствуйте/);
    const hold = screen.getByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => { global.__stt.emit("result", { isFinal: true, results: [{ transcript: "я хочу чай" }] }); });
    expect(await screen.findByText(/Вы хотите чай\?/)).toBeTruthy();
    expect(screen.queryByTestId("turn-pending")).toBeNull();
    expect(screen.getByText("я хочу чай")).toBeTruthy();
    expect(screen.getByText("11 turns left")).toBeTruthy();
    expect((await saved()).speech.attempts).toHaveLength(0);
  });

  it("says so when the tutor cannot answer, and offers a retry", async () => {
    talk.mockResolvedValueOnce({ ok: false, reason: "offline" }).mockResolvedValueOnce(OPENING);
    await withTalk({ unit: done() });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    expect(await screen.findByText(/No connection/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Try again")); });
    expect(await screen.findByText(/Здравствуйте/)).toBeTruthy();
  });
});
