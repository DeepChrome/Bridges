/* The Tutor (2026-09-26): a free conversation with someone handed the
 * learner's standing every turn. What is pinned: the profile goes with each
 * message and holds what the app knows (route, trouble, misses, notes); the
 * tutor opens the conversation; typed and spoken turns both reach it; its
 * Russian is spoken and word-linked; a `remember` lands in the profile,
 * capped; nothing enters the scheduler; a failure is said with a retry.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import Tutor, { tutorProfile, remember, NOTES_KEPT, CHOICES_AFTER } from "../src/screens/Tutor";
import { tutor } from "../src/lib/feedback";
import { L, STAGES } from "../src/data";
import { DAY, REVIEW } from "@core/scheduler";

jest.mock("../src/lib/feedback", () => ({
  tutor: jest.fn(), talk: jest.fn(), review: jest.fn(), hint: jest.fn(), getFeedback: jest.fn(),
  explain: jest.fn(), translate: jest.fn(),
  config: jest.fn(() => ({ url: "https://worker.test/v1/tutor", token: "t" })),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const WORD = L[STAGES[0].core.w[0]].b;
const base = {
  v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"],
};
const GREET = { ok: true, ru: "Привет, Jared!", en: "Hi, Jared!", note: "Shall we work on the genitive?", remember: "" };
const REPLY = { ok: true, ru: "Хорошо. Скажи «я хочу чай».", en: "Good. Say «I want tea».", note: "",
                remember: "wants drills, not chat" };

async function open(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(
    <SessionProvider><WordsProvider><Tutor navigation={nav} /></WordsProvider></SessionProvider>,
  );
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  // `clearAllMocks` leaves a queued `mockResolvedValueOnce` in place; a test
  // that did not consume all of its answers would hand them to the next one.
  tutor.mockReset();
  if (global.__stt) global.__stt.reset();
  global.__spoke = []; global.__spokeOpts = [];
});
afterEach(async () => { await flushState(); });

describe("tutor", () => {
  it("opens the conversation itself, from the profile, and speaks its Russian", async () => {
    tutor.mockResolvedValueOnce(GREET);
    await open({ tutorNotes: ["prefers drills"],
                 misses: [{ kind: "cases", prompt: "книга", answer: "книги", said: "книгу", at: now }] });
    expect(await screen.findByTestId("tutor-turn")).toBeTruthy();
    expect(tutor).toHaveBeenCalledTimes(1);
    const sent = tutor.mock.calls[0][0];
    expect(sent.text).toBe("");
    expect(sent.history).toEqual([]);
    expect(sent.profile.chapter).toBe(1);
    expect(sent.profile.notes).toEqual(["prefers drills"]);
    expect(sent.profile.misses[0]).toEqual({ kind: "cases", prompt: "книга", answer: "книги", said: "книгу" });
    expect(sent.studied.length).toBeGreaterThan(0);
    // The three parts, each drawn: the Russian word-linked, its English, the note.
    expect(screen.getByTestId("tutor-ru")).toHaveTextContent("Привет, Jared!");
    expect(screen.getByTestId("tutor-en")).toHaveTextContent("Hi, Jared!");
    expect(screen.getByTestId("tutor-note")).toHaveTextContent("Shall we work on the genitive?");
    await waitFor(() => expect(global.__spoke).toEqual(["Привет, Jared!"]));
  });

  /* The English is the learner's to switch off (Settings → "English under the
     tutor", the same `talkEn` Talk's toolbar writes); the note never is. */
  it("hides the English under the Russian when the setting is off, and never the note", async () => {
    tutor.mockResolvedValueOnce(GREET);
    await open({ talkEn: false });
    await screen.findByTestId("tutor-turn");
    expect(screen.getByTestId("tutor-ru")).toBeTruthy();
    expect(screen.queryByTestId("tutor-en")).toBeNull();
    expect(screen.getByTestId("tutor-note")).toBeTruthy();
  });

  it("sends a typed turn with the exchange so far, keeps the tutor's note, links its Russian", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    const input = screen.getByTestId("tutor-input");
    fireEvent.changeText(input, "drill me on cases");
    await waitFor(() => expect(input.props.value).toBe("drill me on cases"));
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-send")); });
    await waitFor(() => expect(screen.getAllByTestId("tutor-turn")).toHaveLength(2));
    const sent = tutor.mock.calls[1][0];
    expect(sent.text).toBe("drill me on cases");
    // The tutor's own turn goes back as the words it said, Russian then note.
    expect(sent.history).toEqual([{ who: "tutor", text: `${GREET.ru} ${GREET.note}` }]);
    // …and what the learner typed is on screen: the transcript is the point.
    expect(screen.getByTestId("learner-turn")).toHaveTextContent("drill me on cases");
    // Every Russian word in the reply is a dictionary link.
    expect(screen.getByLabelText("чай, open word")).toBeTruthy();
    // The note is in the profile now, and the schedule is untouched.
    const st = await saved();
    expect(st.tutorNotes).toEqual(["wants drills, not chat"]);
    expect(Object.keys(st.seen)).toEqual([]);
  });

  it("takes a spoken turn through the microphone", async () => {
    tutor.mockResolvedValueOnce(GREET).mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    const hold = screen.getByTestId("tutor-hold");
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    await act(async () => {
      global.__stt.emit("result", { isFinal: true, results: [{ transcript: "я хочу чай", confidence: 0.9 }] });
    });
    await waitFor(() => expect(screen.getAllByTestId("tutor-turn")).toHaveLength(2));
    expect(tutor).toHaveBeenCalledTimes(2);
    expect(tutor.mock.calls[1][0].text).toBe("я хочу чай");
    // The spoken words are on screen, word-linked: the transcript is the point.
    expect(screen.getByTestId("learner-turn")).toHaveTextContent("я хочу чай");
    expect(global.__stt.calls[0].lang).toBe("ru-RU");
    // The toggle switches the microphone to English.
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-lang")); });
    const before = global.__stt.calls.length;
    await act(async () => { fireEvent(hold, "pressIn"); });
    await act(async () => { fireEvent(hold, "pressOut"); });
    expect(global.__stt.calls.length).toBe(before + 1);
    expect(global.__stt.calls[before].lang).toBe("en-US");
  });

  it("says when the tutor could not answer, and offers to try again", async () => {
    tutor.mockResolvedValueOnce({ ok: false, reason: "offline" }).mockResolvedValueOnce(GREET);
    await open();
    expect(await screen.findByTestId("tutor-failure")).toHaveTextContent(/No connection/);
    await act(async () => { fireEvent.press(screen.getByText("Try again")); });
    expect(await screen.findByTestId("tutor-turn")).toBeTruthy();
  });

  /* The cog every other run screen carries (the owner, 2026-09-26: "in Tutor
     mode there's no settings button like there is in other areas"). Start over
     moved into it from under the microphone. */
  it("opens its options from the cog: level, the English, and starting over", async () => {
    tutor.mockResolvedValueOnce(GREET);
    await open();
    await screen.findByTestId("tutor-turn");
    expect(screen.queryByTestId("tutor-options")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-cog")); });
    expect(await screen.findByTestId("tutor-options")).toBeTruthy();
    expect(screen.getByTestId("tutor-level")).toBeTruthy();
    expect(screen.getByTestId("tutor-restart")).toBeTruthy();
    // The English toggle writes the key Talk's own EN button writes.
    await act(async () => { fireEvent.press(screen.getByTestId("tutor-en-row")); });
    expect((await saved()).talkEn).toBe(false);
    await waitFor(() => expect(screen.queryByTestId("tutor-en")).toBeNull());
  });

  /* A beginner cannot ask for a genitive drill in Russian, so the tutor
     offers and they tap (the owner, 2026-09-26). The fourth way out is the
     app's, and the list belongs to the newest turn only. */
  it("offers what to work on, sends a tap as a turn, and drops the list after", async () => {
    const lost = { ...GREET, choices: ["Drill the genitive", "Practise my trouble words"] };
    /* Not on the first confusion: the list waits until the tutor has come
       back lost CHOICES_AFTER times in a row (the owner, 2026-09-26). */
    tutor.mockResolvedValueOnce(lost).mockResolvedValueOnce(lost).mockResolvedValueOnce(lost)
         .mockResolvedValueOnce(REPLY);
    await open();
    await screen.findByTestId("tutor-turn");
    expect(screen.queryByTestId("tutor-choices")).toBeNull();
    for (let k = 0; k < CHOICES_AFTER - 1; k++) {
      const input = screen.getByTestId("tutor-input");
      fireEvent.changeText(input, "hmm " + k);
      await waitFor(() => expect(input.props.value).toBe("hmm " + k));
      await act(async () => { fireEvent.press(screen.getByTestId("tutor-send")); });
    }
    await screen.findByTestId("tutor-choices");
    expect(screen.getByTestId("tutor-choice-0")).toHaveTextContent("Drill the genitive");
    expect(screen.getByTestId("tutor-choice-other")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId("tutor-choice-0")); });
    await waitFor(() => expect(tutor).toHaveBeenCalledTimes(CHOICES_AFTER + 1));
    expect(tutor.mock.calls[CHOICES_AFTER][0].text).toBe("Drill the genitive");
    // The reply offered none, so the list is gone rather than left tappable.
    await waitFor(() => expect(screen.queryByTestId("tutor-choices")).toBeNull());
  });

  it("builds the profile from what the app already keeps", () => {
    const seen = { [WORD]: { recognise: { dueAt: now + 40 * DAY, lastAt: now, s: 200, d: 3, state: REVIEW, reps: 9, lapses: 0 } } };
    const p = tutorProfile({ ...base, seen, pinned: ["же"], misses: [], tutorNotes: [] });
    expect(p.chapter).toBe(1);
    expect(p.level).toBe("beginner");
    expect(p.strong).toEqual([WORD]);
    expect(p.trouble).toEqual(["же"]);
    // Notes: newest first, no repeats, capped.
    let notes = [];
    for (let k = 0; k < NOTES_KEPT + 3; k++) notes = remember(notes, "note " + k);
    expect(notes).toHaveLength(NOTES_KEPT);
    expect(notes[0]).toBe("note " + (NOTES_KEPT + 2));
    expect(remember(["A thing"], "a thing")).toEqual(["a thing"]);
    expect(remember(["x"], "")).toEqual(["x"]);
  });
});
