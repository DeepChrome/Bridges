/* Conversation mode: the picker's gate and budget, a turn graded and pinned words.
   The Worker is the stubbed client; the recogniser is jest.setup's stub.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Talk from "../src/screens/Talk";
import { STAGES, L, lessonCount } from "../src/data";
import { talk, review, hint } from "../src/lib/feedback";
import { SCENARIOS } from "@core/scenarios";
import { TALK_SESSIONS_PER_DAY } from "@core/state";
import { today } from "@core/util";

jest.mock("../src/lib/feedback", () => ({
  talk: jest.fn(), review: jest.fn(), hint: jest.fn(), getFeedback: jest.fn(),
  // A configured build: the picker offers every open scenario.
  config: jest.fn(() => ({ url: "https://worker.test/v1/talk", token: "t" })),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, dev: false,
};
/* Chapters 1–2 done: a learner with some words, so the tutor is handed a
   studied list. Talk itself needs nothing done (2026-09-23). */
const done = () => {
  const unit = {};
  for (let s = 0; s <= 1; s++) {
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
  newWords: [{ ru: "булочка", lemma: "булочка", en: "bun" }] };

/* The marking is its own request now, asked at the same time as the reply, so
   it is its own fixture: the tutor answers and the marking lands after. */
const REVIEW = { ok: true,
  feedback: { words: [
      { said: "я", expected: "я", lemma: "я", status: "ok", tags: [] },
      { said: "хочу", expected: "хочу", lemma: "хотеть", status: "ok", tags: [] },
      { said: "вода", expected: "воду", lemma: "вода", status: "sub", tags: ["CASE"] }],
    grammar: [{ tag: "CASE", note: "Use «воду», the accusative after «хотеть»." }],
    wordChoice: [], overall: "minor", praise: "" } };

async function withTalk(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Talk navigation={nav} /></SessionProvider>);
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); global.__stt.reset();
});
afterEach(async () => { await flushState(); });

describe("talk", () => {
  /* Open from the first screen, every scenario (the owner, 2026-09-23:
     nothing in Practice is locked). It opened after chapter 2 until then. */
  it("is open on a brand new profile, every scenario", async () => {
    talk.mockResolvedValueOnce(OPENING);
    await withTalk({});
    expect(screen.queryByText(/Opens after chapter/)).toBeNull();
    expect(TALK_SESSIONS_PER_DAY).toBe(Infinity);                       // no daily limit any more
    const last = SCENARIOS[SCENARIOS.length - 1];
    await act(async () => { fireEvent.press(await screen.findByText(last.title)); });
    expect(talk).toHaveBeenCalledTimes(1);
  });

  it("opens with the tutor's turn, grades a spoken turn, counts its tag, offers a new word", async () => {
    talk.mockResolvedValueOnce(OPENING).mockResolvedValueOnce(REPLY);
    review.mockResolvedValue(REVIEW);
    await withTalk({ unit: done() });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    expect(await screen.findByText(/Здравствуйте! Что вы хотите\?/)).toBeTruthy();
    expect(talk).toHaveBeenCalledTimes(1);
    expect(talk.mock.calls[0][0]).toMatchObject({ transcript: "", history: [] });
    // The café is Gena's (the cast, core/cast.js), and the tutor plays him.
    expect(talk.mock.calls[0][0].scenario).toMatch(/Gena.*café/);
    expect(talk.mock.calls[0][0].studied.length).toBeGreaterThan(20);
    // Chapters 1–5 are done, so the tutor pitches its Russian at the advanced
    // level unless a level was chosen; and it reads its turn out as it arrives.
    expect(talk.mock.calls[0][0].level).toBe("beginner");      // chapters 1–4 by the route
    expect(global.__spoke[global.__spoke.length - 1]).toMatch(/Здравствуйте/);

    const hold = screen.getByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => { global.__stt.emit("result", { isFinal: true, results: [{ transcript: "я хочу вода" }] }); });
    expect(await screen.findByText(/Вы хотите чай\?/)).toBeTruthy();
    expect(talk.mock.calls[1][0].history).toHaveLength(2);
    expect(talk.mock.calls[1][0].transcript).toBe("я хочу вода");
    /* Both halves of the turn went at once, and the marking carries only what
       marking needs: no studied list, no grammar topic. */
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][0].transcript).toBe("я хочу вода");
    expect(review.mock.calls[0][0].studied).toBeUndefined();
    // The learner's bubble carries the alignment; the grammar note sits under it.
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);
    /* The Russian in a note is its own span now (ui.js `Marked`, 2026-09-26),
       so the English clause is what a whole-string query can match. */
    expect(screen.getByText(/the accusative after/)).toBeTruthy();
    expect(screen.getByText("11 turns left")).toBeTruthy();
    // The English is on by default under every tutor turn; new words do not
    // appear in the transcript (they clutter it) — they wait for the summary.
    expect(screen.getAllByTestId("tutor-en")).toHaveLength(2);
    expect(screen.queryByText("булочка")).toBeNull();

    const st = await saved();
    expect(st.speech.tagCounts).toEqual({ CASE: 1 });
    expect(st.speech.attempts[0]).toMatchObject({ kind: "talk", scenario: "cafe", transcript: "я хочу вода" });
    // A spoken turn grades the word's one card: Again is a one-minute learning
    // step, Good a ten-minute one.
    expect(st.seen["вода"].recognise.dueAt - st.seen["вода"].recognise.lastAt).toBe(60000);
    expect(st.seen["хотеть"].recognise.dueAt - st.seen["хотеть"].recognise.lastAt).toBe(600000);
    expect(st.speech.talk).toEqual({ day: today(), sessions: 1 });

    // English off, then the summary: what went well, what to work on, the words.
    await act(async () => { fireEvent.press(screen.getByTestId("talk-en")); });
    expect(screen.queryAllByTestId("tutor-en")).toHaveLength(0);
    expect((await saved()).talkEn).toBe(false);
    await act(async () => { fireEvent.press(screen.getByTestId("talk-end")); });
    expect(await screen.findByText("Went well")).toBeTruthy();
    expect(screen.getByText(/1 turn, 0 with nothing to correct/)).toBeTruthy();
    expect(screen.getByText(/2 words right as said/)).toBeTruthy();
    /* The Russian in a note is its own span now (ui.js `Marked`, 2026-09-26),
       so the English clause is what a whole-string query can match. */
    expect(screen.getByText(/the accusative after/)).toBeTruthy();
    expect(screen.getByText("булочка")).toBeTruthy();
    expect(screen.getByText("чай")).toBeTruthy();                        // a tutor word, from its tokens
    await act(async () => { fireEvent.press(screen.getAllByText("Add")[0]); });
    expect((await saved()).pinned).toEqual(["булочка"]);
    await act(async () => { fireEvent.press(screen.getByText("Add all to review")); });
    const pinned = (await saved()).pinned;
    expect(pinned).toContain("чай");
    expect(pinned.length).toBeGreaterThan(1);
  });

  it("gives a hint on request, drops it when the learner speaks, and restarts", async () => {
    talk.mockResolvedValue(OPENING);
    hint.mockResolvedValueOnce({ ok: true, hint_ru: "Я хочу чай, пожалуйста.", hint_en: "I would like tea, please." });
    await withTalk({ unit: done() });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    await screen.findByText(/Здравствуйте/);
    await act(async () => { fireEvent.press(screen.getByTestId("talk-hint")); });
    expect(await screen.findByText(/Я хочу чай, пожалуйста/)).toBeTruthy();
    expect(screen.getByText("I would like tea, please.")).toBeTruthy();
    expect(hint.mock.calls[0][0].history).toHaveLength(1);
    expect(hint.mock.calls[0][0].level).toBe("beginner");      // chapters 1–4 by the route
    const hold = screen.getByTestId("say-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => { global.__stt.emit("result", { isFinal: true, results: [{ transcript: "я хочу чай" }] }); });
    expect(screen.queryByTestId("hint-card")).toBeNull();
    // Restart asks first once the learner has spoken; the confirmation is taken.
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) =>
      buttons.find((b) => b.style === "destructive").onPress());
    await act(async () => { fireEvent.press(screen.getByTestId("talk-restart")); });
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
    expect(await screen.findByText(/Здравствуйте/)).toBeTruthy();
    expect(screen.queryByText("я хочу чай")).toBeNull();
    expect(talk).toHaveBeenCalledTimes(3);                                 // open, turn, open again
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

  it("ends with a summary, counts the session, and a fourth conversation is not refused", async () => {
    talk.mockResolvedValue(OPENING);
    await withTalk({ unit: done(), speech: { attempts: [], tagCounts: {}, talk: { day: today(), sessions: 3 } } });
    await act(async () => { fireEvent.press(await screen.findByText("В кафе")); });
    await screen.findByText(/Здравствуйте/);
    expect(talk).toHaveBeenCalledTimes(1);                                 // a fourth session, sent
    expect((await saved()).speech.talk.sessions).toBe(4);
    await act(async () => { fireEvent.press(screen.getByTestId("talk-end")); });
    expect(await screen.findByText("Nothing the tutor corrected.")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Another conversation")); });
    expect(await screen.findByText("В кафе")).toBeTruthy();
  });

  it("a turn the tutor did not grade stands as said and the conversation goes on", async () => {
    talk.mockResolvedValueOnce(OPENING).mockResolvedValueOnce({ ...REPLY, newWords: [] });
    review.mockResolvedValue({ ok: true, feedback: null });
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

  /* Marking that never arrives must not leave the learner's own words spinning
     under a conversation that is otherwise fine. */
  it("stops waiting when the marking fails", async () => {
    talk.mockResolvedValueOnce(OPENING).mockResolvedValueOnce({ ...REPLY, newWords: [] });
    review.mockRejectedValue(new Error("no connection"));
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
