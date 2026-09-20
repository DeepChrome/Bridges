/* The pronunciation drill (ROADMAP P10.8).
 *
 * The half that matters most here is the one that refuses to judge. A single
 * word out of context is a harder ask of the recogniser than the sentences it
 * was measured on (§30c), so when it catches neither word of the pair the drill
 * must skip rather than mark the learner wrong — a drill that tells someone
 * their «люк» was a «лук» when the phone simply did not hear it is teaching
 * them to distrust their own mouth.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, VIEWS } from "../src/screens/Run";
import { pairDrill, soundPairs, pairDiff } from "@core/alphabet";
import { fold } from "@core/util";

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withStep(step, onFinish = jest.fn()) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return await render(
    <SessionProvider>
      <Runner steps={[step]} recycle={false} onFinish={onFinish} />
    </SessionProvider>
  );
}

/* Hold, let the permission resolve, release, then deliver a transcript. */
async function speak(transcript) {
  const hold = screen.getByTestId("say-hold");
  await act(async () => { fireEvent(hold, "pressIn"); });
  await act(async () => { fireEvent(hold, "pressOut"); });
  await act(async () => {
    global.__stt.emit("result", { isFinal: true, results: [{ transcript, confidence: 0.9 }] });
  });
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  if (global.__stt) global.__stt.reset();
  global.__played = [];
  global.__spoke = [];
});
afterEach(async () => { await flushState(); });

describe("the drill's shape", () => {
  it("alternates hearing and saying, and every kind has a view", () => {
    const steps = pairDrill(10);
    expect(steps).toHaveLength(10);
    expect(steps.filter((s) => s.kind === "pair-hear").length).toBe(5);
    expect(steps.filter((s) => s.kind === "pair-say").length).toBe(5);
    // Hearing a contrast comes before producing it: being told your own attempt
    // is wrong before you have heard what right sounds like is not practice.
    expect(steps[0].kind).toBe("pair-hear");
    steps.forEach((s) => expect(typeof VIEWS[s.kind]).toBe("function"));
  });

  it("asks about a real contrast every time", () => {
    for (const s of pairDrill(24)) {
      expect(s.target).toBeTruthy();
      expect(s.other).toBeTruthy();
      expect(pairDiff(s.target, s.other)).toBeGreaterThanOrEqual(0);
      expect(fold(s.target)).not.toBe(fold(s.other));
      expect(s.about.length).toBeGreaterThan(20);
    }
  });

  it("grades no vocabulary — pronunciation is not a word you are studying", async () => {
    const step = pairDrill(2).find((s) => s.kind === "pair-hear");
    await withStep(step);
    const right = step.options.findIndex((o) => o.right);
    await act(async () => { fireEvent.press(screen.getByTestId(`pair-option-${right}`)); });
    await screen.findByTestId("verdict");
    await flushState();
    const st = (await global.__db.saved("p1"));
    expect(Object.keys(st.seen)).toHaveLength(0);
  });
});

describe("hearing a contrast", () => {
  it("marks the right word right and holds the explanation back until then", async () => {
    const step = pairDrill(2).find((s) => s.kind === "pair-hear");
    await withStep(step);
    expect(screen.queryByTestId("pair-about")).toBeNull();
    const right = step.options.findIndex((o) => o.right);
    await act(async () => { fireEvent.press(screen.getByTestId(`pair-option-${right}`)); });
    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(screen.getByTestId("pair-about")).toBeTruthy();
  });

  it("marks the other word wrong", async () => {
    const step = pairDrill(2).find((s) => s.kind === "pair-hear");
    await withStep(step);
    const wrong = step.options.findIndex((o) => !o.right);
    await act(async () => { fireEvent.press(screen.getByTestId(`pair-option-${wrong}`)); });
    expect(await screen.findByText("Not quite")).toBeTruthy();
  });
});

describe("saying a contrast", () => {
  const sayStep = () => pairDrill(2).find((s) => s.kind === "pair-say");

  it("accepts the word it was asked for", async () => {
    const step = sayStep();
    await withStep(step);
    await speak(step.target);
    expect(await screen.findByTestId("pair-heard")).toHaveTextContent(new RegExp(step.target));
    expect(screen.getByText("Correct")).toBeTruthy();
  });

  it("names the other word of the pair, and it is a miss only on Continue", async () => {
    const step = sayStep();
    await withStep(step);
    await speak(step.other);
    const heard = await screen.findByTestId("pair-heard");
    expect(heard).toHaveTextContent(new RegExp(step.other));
    expect(screen.queryByText("Not quite")).toBeNull();          // the learner decides
    expect(screen.getByText("Try again")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(await screen.findByText("Not quite")).toBeTruthy();
  });

  it("skips rather than fails when it caught neither, after as many tries as wanted", async () => {
    const step = sayStep();
    const onFinish = jest.fn();
    await withStep(step, onFinish);
    // Four attempts, none of them either word — there is no cap (the owner,
    // 2026-09-19: "remove the whole 3 tries thing").
    for (let k = 0; k < 4; k++) {
      await speak("абракадабра");
      await waitFor(() => expect(screen.getByTestId("pair-heard")).toHaveTextContent(/Did not catch/));
      expect(screen.getByText("Try again")).toBeTruthy();
      if (k < 3) await act(async () => { fireEvent.press(screen.getByText("Try again")); });
    }
    // A skipped step grades nothing and is left out of the total, so a phone
    // that cannot hear scores the same drill as one that can.
    await act(async () => { fireEvent.press(screen.getByText("Skip")); });
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onFinish.mock.calls[0][0].total).toBe(0);
  });
});
