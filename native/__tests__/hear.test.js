/* The Hear activity: audio in, typed sentence out, every word graded.
 *
 * Runs through the real runner so what is asserted is the whole path — the
 * autoplay on arrival, the counted replays, the alignment, the per-word FSRS writes
 * and the attempt in the speech slot — not a component in isolation.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { REPLAYS } from "../src/activities/Hear";
import { Q, SPEECH_MIX } from "../src/questions";
import { L, IX, STAGES, SPEECH } from "../src/data";
import { fold } from "@core/util";
import { words } from "@core/compare";

const later = STAGES.find((s) => Q.stageOf(s.core) >= SPEECH_MIX.hear.fromStage
                                 && (SPEECH.listen[s.core.id] || []).length).core;
const question = Q.present(Q.speechPrompt("hear", later, 0));
const heard = fold(question.target).replace(/[^а-яё\s-]/g, "").trim();

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withHear() {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(
    <SessionProvider>
      <Runner steps={[question]} onFinish={jest.fn()} />
    </SessionProvider>
  );
}

async function saved() {
  await flushState();
  return JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__played = [];
});

afterEach(async () => {
  await flushState();
});

describe("hear", () => {
  it("plays the sentence on arrival and shows neither text nor meaning", async () => {
    await withHear();
    await screen.findByTestId("hear-input");
    expect(global.__played).toHaveLength(1);
    expect(global.__played[0]).toContain("/audio/");
    expect(screen.queryByText(question.en)).toBeNull();
    expect(screen.queryByText(question.target)).toBeNull();
  });

  it("allows a fixed number of replays", async () => {
    await withHear();
    const play = await screen.findByTestId("hear-play");
    for (let k = 0; k < REPLAYS + 2; k++) {
      await act(async () => { fireEvent.press(play); });
    }
    expect(global.__played).toHaveLength(1 + REPLAYS);
    expect(screen.getByTestId("hear-play").props.accessibilityState.disabled).toBe(true);
  });

  it("a perfect answer is Correct, every word Easy, and the attempt is logged", async () => {
    await withHear();
    const input = await screen.findByTestId("hear-input");
    fireEvent.changeText(input, heard);
    await waitFor(() => expect(screen.getByTestId("hear-input").props.value).toBe(heard));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText("Correct")).toBeTruthy();
    // One green chip per word of the target, and nothing red.
    expect(screen.getAllByTestId("align-ok")).toHaveLength(words(question.target).length);
    expect(screen.queryByTestId("align-sub")).toBeNull();
    expect(screen.queryByTestId("align-del")).toBeNull();
    // Revealed after the answer: the sentence, as links, and its meaning.
    expect(screen.getByText(question.en)).toBeTruthy();

    const st = await saved();
    expect(question.lemmas.length).toBeGreaterThan(0);
    for (const i of question.lemmas) {
      const card = st.seen[L[i].b];
      expect(card).toBeTruthy();
      expect(card.reps).toBe(1);
      expect(card.lapses).toBe(0);
    }
    expect(st.speech.attempts).toHaveLength(1);
    expect(st.speech.attempts[0]).toMatchObject({ kind: "hear", wer: 0, unit: later.id });
  });

  it("a wrong word is Not quite, that word Again, the rest Good", async () => {
    await withHear();
    const input = await screen.findByTestId("hear-input");
    const wrongWord = "жираф";                       // never in a listening sentence
    const words = heard.split(/\s+/);
    const typed = [wrongWord].concat(words.slice(1)).join(" ");
    fireEvent.changeText(input, typed);
    await waitFor(() => expect(screen.getByTestId("hear-input").props.value).toBe(typed));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText("Not quite")).toBeTruthy();
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);

    const st = await saved();
    expect(st.speech.attempts[0].wer).toBeGreaterThan(0);
    // The lemma behind the first word lapsed; every other lemma in the sentence
    // was answered and did not. (A lemma met twice takes its worst grade, so it
    // lapses even if its other occurrence was right.)
    const firstLemma = (IX[words[0]] || [])[0];
    for (const i of question.lemmas) {
      expect({ lemma: L[i].b, lapses: st.seen[L[i].b].lapses })
        .toEqual({ lemma: L[i].b, lapses: i === firstLemma ? 1 : 0 });
    }
  });
});
