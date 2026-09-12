/* A failed lesson quiz shows the missed words again before the retake.
 *
 * The loop this closes was measured, not guessed: over the full route the
 * struggling simulated learner retook 357 times and passed 109 of 168, and the
 * app's whole answer to a failure was the same quiz again. The lesson's own
 * words are always asked (core/questions.js quizSteps), so the words did come
 * back — what never came back was the teaching.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Reteach, missedWords, RETEACH_MAX } from "../src/screens/Flows";
import { UN, L, lessonWords } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn(),
              addListener: jest.fn(() => jest.fn()) };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, dev: true,
};

async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

/* §23: a displayed headword carries a combining acute, and NFD splits «й» and
   «ё» apart as well — so strip the accents and recompose, or a word plainly on
   the screen fails to match itself. */
const bare = (s) => String(s).normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");

/* Every string the screen actually drew, folded. `getByText` takes a string or
   a RegExp and the rendered headword carries an accent, so neither matches the
   lexicon's own spelling without this. */
function drawn() {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (typeof n === "string") { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(n.children);
  })(screen.toJSON());
  return bare(out.join(" "));
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("which words a failed quiz picks out", () => {
  const unit = UN[0];
  const words = lessonWords(unit, 0);

  it("takes the ones got wrong, in the order the lesson teaches them", () => {
    const results = [
      { i: words[2], credit: 0, right: false },
      { i: words[0], credit: 0, right: false },
      { i: words[1], credit: 1, right: true },
    ];
    expect(missedWords(results, words)).toEqual([words[0], words[2]]);
  });

  it("counts a half-credit answer as missed, and a full one as not", () => {
    // A typed word one letter off earns half (Run.js Typed). The word is not
    // known well enough to have been asked and answered, so it comes back.
    expect(missedWords([{ i: words[0], credit: 0.5 }], words)).toEqual([words[0]]);
    expect(missedWords([{ i: words[0], credit: 1 }], words)).toEqual([]);
  });

  it("ignores a step with no lemma behind it", () => {
    // A scenario or a spoken sentence grades its own words and carries no `i`;
    // re-teaching "undefined" is how a crash gets shipped.
    expect(missedWords([{ credit: 0 }, { i: undefined, credit: 0 }], words)).toEqual([]);
  });

  it("leaves out a step that could not be attempted", () => {
    // Say with no microphone is skipped, not failed, and is left out of the
    // total so a phone without one scores the same quiz (Run.js skip). Being
    // re-taught a word you were never asked would undo that.
    expect(missedWords([{ i: words[0], skipped: true }], words)).toEqual([]);
    expect(missedWords([{ i: words[0], skipped: true, credit: 0 }], words)).toEqual([]);
  });

  it("never puts more than four in front of the learner", () => {
    const many = unit.w.slice(0, 9).map((i) => ({ i, credit: 0 }));
    expect(missedWords(many, unit.w.slice(0, 9))).toHaveLength(RETEACH_MAX);
  });

  it("keeps a missed review word, after the lesson's own", () => {
    const other = unit.w[unit.w.length - 1];
    const got = missedWords([{ i: other, credit: 0 }, { i: words[1], credit: 0 }], words);
    expect(got).toEqual([words[1], other]);
  });
});

describe("the second look", () => {
  const unit = UN[0];
  const words = lessonWords(unit, 0).slice(0, 3);

  it("walks the missed words and only then goes back to the quiz", async () => {
    const onNext = jest.fn();
    const onDone = jest.fn();
    await withProfile(<Reteach words={words} at={0} onNext={onNext} onDone={onDone} />);

    // The word itself is on the card, so this is teaching rather than a tally.
    await screen.findByTestId("reteach-next");
    expect(drawn()).toContain(bare(L[words[0]].w));
    await act(async () => { fireEvent.press(screen.getByTestId("reteach-next")); });
    expect(onNext).toHaveBeenCalledWith(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ends on Try again, which is what starts the retake", async () => {
    const onNext = jest.fn();
    const onDone = jest.fn();
    await withProfile(
      <Reteach words={words} at={words.length - 1} onNext={onNext} onDone={onDone} />);

    const btn = await screen.findByTestId("reteach-next");
    expect(screen.getByText("Try again")).toBeTruthy();
    await act(async () => { fireEvent.press(btn); });
    expect(onDone).toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  /* Nothing missed, nothing to draw — and the flow must not reach here at all,
     since `onAgain` only enters the second look when there is a word for it. */
  it("draws nothing when there is no word", async () => {
    await withProfile(<Reteach words={[]} at={0} onNext={jest.fn()} onDone={jest.fn()} />);
    expect(screen.queryByTestId("reteach-next")).toBeNull();
  });
});

describe("the words it names", () => {
  it("are real headwords, so the fail screen can print them", () => {
    const unit = UN[0];
    const words = lessonWords(unit, 0);
    for (const i of missedWords(words.map((i) => ({ i, credit: 0 })), words)) {
      expect(typeof L[i].w).toBe("string");
      expect(L[i].w.length).toBeGreaterThan(0);
    }
  });
});
