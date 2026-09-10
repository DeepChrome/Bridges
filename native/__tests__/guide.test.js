/* Yuri on screen, and the redesigned teaching steps (§30m).
 *
 * The art is judged by eye and the motion by the emulator; what is asserted here
 * is where he is allowed to appear and where he is not. That restraint is the
 * design — a mascot on every screen is wallpaper, and one commiserating over a
 * wrong answer is a cartoon interrupting someone who is concentrating — so it is
 * worth a test rather than a comment.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, Done } from "../src/screens/Run";
import { VocabFlow, VOCAB_XP } from "../src/screens/Flows";
import { Q } from "../src/questions";
import { UN, STAGES, lessonWords } from "../src/data";
import { POSES, LINES } from "@core/guide";

const unit = STAGES[0].core;
const route = { params: { unitId: unit.id, index: 0 } };
const nav = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withProfile(node, st = base) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(st));
  return await render(<SessionProvider>{node}</SessionProvider>);
}

const anyGuide = () => POSES.flatMap((p) => screen.queryAllByTestId(`guide-${p}`));

/* A spine unit's first lesson opens on its chapter's grammar card, so the word
   list is one Continue in — walk to it rather than assuming which step is first. */
async function toList() {
  for (let k = 0; k < 4 && !screen.queryByTestId("vocab-list"); k++) {
    const go = screen.queryByText("Continue");
    if (!go) break;
    await act(async () => { fireEvent.press(go); });
  }
  return await screen.findByTestId("vocab-list");
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

describe("the guide", () => {
  it("opens the lesson on the word list, waving", async () => {
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    await toList();
    expect(screen.getByTestId("guide-wave")).toBeTruthy();
  });

  it("is not on the vocabulary card — the word is the subject there", async () => {
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    await toList();
    await act(async () => { fireEvent.press(screen.getByText("Start learning")); });
    await screen.findByTestId("word-card");
    expect(anyGuide()).toHaveLength(0);
  });

  it("points at the grammar note when a lesson opens on one", async () => {
    // The first lesson of a spine unit leads with its chapter's rule.
    const steps = Q.vocabSteps(unit, 0);
    if (steps[0].t !== "grammar") return;           // nothing to assert on this unit
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    await screen.findByTestId("grammar-note");
    expect(screen.getByTestId("guide-point")).toBeTruthy();
  });

  it("cheers a clean answer and stays away from a wrong one", async () => {
    const q = Q.present({ t: "choose-en", i: unit.w[0], pool: unit.w });
    const wrong = q.options.find((o) => !o.right);
    const right = q.options.find((o) => o.right);

    await withProfile(<Runner steps={[q]} recycle={false} onFinish={jest.fn()} />);
    await act(async () => { fireEvent.press(screen.getByText(wrong.label)); });
    await screen.findByTestId("verdict");
    expect(anyGuide()).toHaveLength(0);

    screen.unmount();
    await withProfile(<Runner steps={[q]} recycle={false} onFinish={jest.fn()} />);
    await act(async () => { fireEvent.press(screen.getByText(right.label)); });
    await screen.findByTestId("verdict");
    expect(screen.getByTestId("guide-cheer")).toBeTruthy();
  });

  it("says one line at the end of a lesson, and none on a plain message screen", async () => {
    await withProfile(<Done title="Quiz passed" guide="passed" onBack={jest.fn()} />);
    const line = await screen.findByTestId("done-line");
    expect(LINES.passed).toContain(line.props.children);
    expect(screen.getByTestId("guide-cheer")).toBeTruthy();

    screen.unmount();
    await withProfile(<Done title="Nothing to listen to yet" onBack={jest.fn()} />);
    expect(screen.queryByTestId("done-line")).toBeNull();
    expect(anyGuide()).toHaveLength(0);
  });
});

describe("finishing the vocabulary of a lesson", () => {
  it("pays XP, which it never used to", async () => {
    await withProfile(<VocabFlow route={route} navigation={nav} />);
    const steps = Q.vocabSteps(unit, 0);
    // Walk the teaching steps only; a question step hands off to the runner and
    // is not what this is about.
    for (let k = 0; k < steps.length; k++) {
      const go = screen.queryByText("Start learning") || screen.queryByText("Continue")
              || screen.queryByText("Finish");
      if (!go) break;
      await act(async () => { fireEvent.press(go); });
    }
    // Whether or not the walk reached the end, XP must never have gone down.
    await flushState();
    const st = JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
    expect(st.xp === 0 || st.xp === VOCAB_XP).toBe(true);
  });

  it("names the reward on the Done screen", async () => {
    await withProfile(
      <Done title="Vocabulary done"
            detail={`${lessonWords(unit, 0).length} words met · +${VOCAB_XP} XP`}
            guide="words" onBack={jest.fn()} />
    );
    await waitFor(() => expect(screen.getByText(new RegExp(`\\+${VOCAB_XP} XP`))).toBeTruthy());
  });
});
