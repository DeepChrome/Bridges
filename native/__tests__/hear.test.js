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
import { Q, SPEECH_MIX } from "../src/questions";
import { L, IX, STAGES, SPEECH, lessonCount } from "../src/data";
import { fold, today } from "@core/util";
import { words } from "@core/compare";
import { applyGrade } from "@core/fsrs";
import { SPEECH_SKIP_TOP } from "@core/speech";

/* The earliest lesson whose Hear pool can actually supply a sentence with a
   content word in it — only those are graded (core/speech.js SPEECH_SKIP_TOP),
   and the per-word FSRS writes are what this file is here to assert.
 *
 * Not simply "the first stage with a pool": which lemmas a lesson teaches moves
 * whenever the curriculum is re-cut, and chapter 1's are pronouns and «быть», so
 * some of its lessons draw only from «Я не Том»-shaped sentences and grade
 * nothing. Searching for the lesson rather than pinning one keeps the assertions
 * exactly as strong while surviving a rebuild. */
function findPrompt(kind) {
  for (const s of STAGES) {
    if (Q.stageOf(s.core) < SPEECH_MIX.hear.fromStage) continue;
    if (!(SPEECH.listen[s.core.id] || []).length) continue;
    const from = Q.stageOf(s.core) === SPEECH_MIX.hear.fromStage
      ? (SPEECH_MIX.hear.fromLesson || 0) : 0;
    for (let li = from; li < lessonCount(s.core); li++) {
      for (let k = 0; k < 80; k++) {
        const q = Q.present(Q.speechPrompt(kind, s.core, li));
        if (q && q.lemmas && q.lemmas.some((i) => i >= SPEECH_SKIP_TOP)) {
          return { q, unit: s.core, lesson: li };
        }
      }
    }
  }
  throw new Error(`no ${kind} prompt anywhere carries a content word`);
}
const found = findPrompt("hear");
const later = found.unit;
const lesson = found.lesson;
const question = found.q;
const heard = fold(question.target).replace(/[^а-яё\s-]/g, "").trim();
const content = question.lemmas.filter((i) => i >= SPEECH_SKIP_TOP);

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

  it("replays as often as asked", async () => {
    await withHear();
    const play = await screen.findByTestId("hear-play");
    for (let k = 0; k < 6; k++) {
      await act(async () => { fireEvent.press(play); });
    }
    expect(global.__played).toHaveLength(7);
  });

  it("gives partial credit for the words that were right, and the hint costs the grade", async () => {
    await withHear();
    const input = await screen.findByTestId("hear-input");
    await act(async () => { fireEvent.press(screen.getByText(/^Hint/)); });
    expect(screen.getByTestId("hint-text").props.children).toBe(question.en);
    const words = heard.split(/\s+/);
    const typed = words.slice(0, -1).concat("жираф").join(" ");             // last word wrong
    fireEvent.changeText(input, typed);
    await waitFor(() => expect(screen.getByTestId("hear-input").props.value).toBe(typed));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText("Almost")).toBeTruthy();
    expect(screen.getByText(`${words.length - 1} of ${words.length} words`)).toBeTruthy();
    const st = await saved();
    expect(st.speech.attempts[0].hinted).toBe(true);
    // Hinted right words are Hard (2): due no further out than an unhinted Good.
    const okLemmas = content.filter((i) => fold(L[i].b) !== fold(words[words.length - 1]));
    const good = applyGrade({}, {}, "x", 3, today()).card.due;
    for (const i of okLemmas) if (st.seen[L[i].b].due > today()) expect(st.seen[L[i].b].due).toBeLessThan(good);
  });

  it("a perfect answer is Correct, every content word Good, and the attempt is logged", async () => {
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
    expect(content.length).toBeGreaterThan(0);
    for (const i of content) {
      const card = st.seen[L[i].b];
      expect(card).toBeTruthy();
      expect(card.reps).toBe(1);
      expect(card.due).toBe(applyGrade({}, {}, "x", 3, today()).card.due);   // Good, not Easy
    }
    // Function words are no evidence either way and get no card from a sentence.
    for (const i of question.lemmas) if (i < SPEECH_SKIP_TOP) expect(st.seen[L[i].b]).toBeUndefined();
    expect(st.speech.attempts).toHaveLength(1);
    expect(st.speech.attempts[0]).toMatchObject({ kind: "hear", wer: 0, unit: later.id });
  });

  it("a wrong word is Almost (partial credit), that word Again, the rest Good", async () => {
    await withHear();
    const input = await screen.findByTestId("hear-input");
    const wrongWord = "жираф";                       // never in a listening sentence
    const words = heard.split(/\s+/);
    // Replace the first *content* word: a function word dropped grades nothing.
    const k = words.findIndex((w) => IX[w] && IX[w][0] >= SPEECH_SKIP_TOP);
    expect(k).toBeGreaterThanOrEqual(0);
    const typed = words.map((w, j) => (j === k ? wrongWord : w)).join(" ");
    fireEvent.changeText(input, typed);
    await waitFor(() => expect(screen.getByTestId("hear-input").props.value).toBe(typed));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText(words.length > 1 ? "Almost" : "Not quite")).toBeTruthy();
    expect(screen.getAllByTestId("align-sub")).toHaveLength(1);

    const st = await saved();
    expect(st.speech.attempts[0].wer).toBeGreaterThan(0);
    // The lemma behind the first word was graded Again and is due again today;
    // every other lemma in the sentence was answered and is due later. (A lemma
    // met twice takes its worst grade, so it is Again even if its other
    // occurrence was right.) A first Again on a new card is a learning step,
    // not a lapse, so the schedule is what shows the grade.
    const wrongLemma = IX[words[k]][0];
    for (const i of content) {
      expect({ lemma: L[i].b, when: st.seen[L[i].b].due === today() ? "today" : "later" })
        .toEqual({ lemma: L[i].b, when: i === wrongLemma ? "today" : "later" });
    }
  });
});
