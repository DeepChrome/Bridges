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
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { WordsProvider } from "../src/words";
import { flushState } from "../src/store";
import Tutor, { tutorProfile, remember, introNotes, NOTES_KEPT, CHOICES_AFTER } from "../src/screens/Tutor";
import { tutor } from "../src/lib/feedback";
import { L, STAGES } from "../src/data";
import { DAY, REVIEW } from "@core/scheduler";

jest.mock("../src/lib/feedback", () => ({
  isCap: jest.requireActual("../src/lib/feedback").isCap,
  capNotice: jest.requireActual("../src/lib/feedback").capNotice,
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
  // The first-time questionnaire has been answered (its own test below).
  tutorIntro: { at: now, skipped: true },
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
    /* Drawn as a text conversation (2026-10-14): Teddy's face on every tutor
       turn, the learner's own on theirs ("monkeynaut" is Monka, id "yuri"). */
    for (const f of screen.getAllByTestId("tutor-turn-face")) expect(within(f).getByTestId("face-teddy")).toBeTruthy();
    expect(within(screen.getByTestId("learner-turn-face")).getByTestId("face-yuri")).toBeTruthy();
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
    await global.__openOptions();
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

  /* The first time: three choices and a line, kept as the tutor's first notes
     (the owner, 2026-11-12: "the first time you use it, it just passes you a
     questionnaire"). Nothing is sent until it is answered or skipped, and it
     is not asked again. */
  it("asks a questionnaire the first time, keeps the answers as notes, then opens", async () => {
    tutor.mockResolvedValueOnce(GREET);
    await open({ tutorIntro: null });
    expect(await screen.findByTestId("tutor-intro")).toBeTruthy();
    expect(tutor).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByText("Speaking")); });
    await act(async () => { fireEvent.press(screen.getByText("Drills, one question at a time")); });
    await act(async () => { fireEvent.press(screen.getByText("15 minutes")); });
    const box = screen.getByTestId("intro-struggle");
    fireEvent.changeText(box, "the genitive");
    await waitFor(() => expect(box.props.value).toBe("the genitive"));   // §23: a press does not flush a changeText
    await act(async () => { fireEvent.press(screen.getByTestId("intro-start")); });
    expect(await screen.findByTestId("tutor-turn")).toBeTruthy();
    const st = await saved();
    expect(st.tutorIntro.style).toBe("drills");
    expect(st.tutorNotes).toEqual(["Goal: speaking", "Prefers drills, one question at a time",
                                   "Sittings of about 15 minutes", "Says they struggle with: the genitive"]);
    // …and they rode out with the first turn.
    const sent = tutor.mock.calls[0][0];
    expect(sent.profile.notes).toEqual(st.tutorNotes);
    expect(sent.profile.intro).toEqual({ goal: "speaking", style: "drills", time: "15", struggle: "the genitive" });
    expect(introNotes({})).toEqual([]);
  });

  it("can be skipped, once", async () => {
    tutor.mockResolvedValueOnce(GREET);
    await open({ tutorIntro: null });
    expect(await screen.findByTestId("tutor-intro")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("intro-skip")); });
    expect(await screen.findByTestId("tutor-turn")).toBeTruthy();
    const st = await saved();
    expect(st.tutorIntro.skipped).toBe(true);
    expect(tutor.mock.calls[0][0].profile.intro).toBeNull();
  });

  it("builds the profile from what the app already keeps", () => {
    const seen = { [WORD]: { recognise: { dueAt: now + 40 * DAY, lastAt: now, s: 200, d: 3, state: REVIEW, reps: 9, lapses: 0 },
                             ru2en: { s: 60, d: 5, state: REVIEW, reps: 6, lapses: 0, dueAt: now, lastAt: now } } };
    const p = tutorProfile({ ...base, seen, pinned: ["же"], misses: [], tutorNotes: [],
                             unit: { [STAGES[0].core.id]: { lessons: { 0: { v: true, q: 100 } } } } });
    expect(p.chapter).toBe(1);
    expect(p.level).toBe("beginner");
    expect(p.strong).toEqual([WORD]);
    expect(p.trouble).toEqual(["же"]);
    // The data and the algorithm (2026-11-12): chapters worked on, skills, holes, days.
    expect(p.chapters[0].chapter).toBe(1);
    expect(p.chapters[0].units[0]).toMatch(new RegExp(`^${STAGES[0].core.name} 1/\\d+$`));
    expect(p.skills.ru2en).toBeGreaterThan(0);
    expect(p.skills.en2ru).toBeNull();
    expect(p.skills.scored).toBe(1);
    expect(p.holes).toEqual([{ w: WORD, ru2en: p.skills.ru2en, en2ru: null, forms: null, usage: null }]);
    expect(p.recentDays).toBe(1);
    expect(p.resting).toEqual([]);
    expect(p.intro).toBeNull();
    // Notes: newest first, no repeats, capped.
    let notes = [];
    for (let k = 0; k < NOTES_KEPT + 3; k++) notes = remember(notes, "note " + k);
    expect(notes).toHaveLength(NOTES_KEPT);
    expect(notes[0]).toBe("note " + (NOTES_KEPT + 2));
    expect(remember(["A thing"], "a thing")).toEqual(["a thing"]);
    expect(remember(["x"], "")).toEqual(["x"]);
  });
});
