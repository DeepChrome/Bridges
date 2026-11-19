/* The hand-off after a spoken step (the owner, 2026-11-19: "the transition
 * from the user saying the right thing to the next item is clunky and
 * glitchy… if you click the next button it just keeps making a ringing
 * noise"):
 *
 *   - an answer is recorded once: a second `record` on the same question — the
 *     word-building "Next word" pressed again under the verdict — rings no
 *     cue and tallies nothing;
 *   - word building hides its own buttons once the step is answered;
 *   - a clean spoken pass moves on by itself after the reading and a beat
 *     (Run.js AUTO_NEXT_KINDS); a chosen answer waits for Continue.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, AUTO_NEXT_KINDS, AUTO_NEXT_MS } from "../src/screens/Run";
import { buildup } from "@core/buildup";
import { L, exactIdx } from "../src/data";

const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 0, flash: ["recognise"] };

async function mount(steps, onFinish) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  return render(<SessionProvider><Runner steps={steps} onFinish={onFinish} recycle={false} /></SessionProvider>);
}
const press = async (id) => act(async () => { fireEvent.press(await screen.findByTestId(id)); });
const i = exactIdx("понимать");
const word = L[i];
const buildStep = { kind: "buildup", i, ru: word.w, en: "to understand", steps: buildup(word.w), stage: 0 };

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); global.__players = []; global.__buzz = []; });
afterEach(async () => { await flushState(); });

it("rings the cue once however often the answered step's button is pressed, and hides it", async () => {
  jest.useFakeTimers();
  const onFinish = jest.fn();
  await mount([buildStep, { ...buildStep, ru: L[exactIdx("говорить")].w, steps: buildup(L[exactIdx("говорить")].w) }], onFinish);
  await press("build-next");                             // Start: skip the two readings
  const n = buildup(word.w).length;
  for (let k = 1; k < n; k++) await press("build-next");  // every syllable
  const cuesBefore = global.__players.length;
  await press("build-next");                             // "Next word": the step is answered
  expect(await screen.findByText("Continue")).toBeTruthy();
  // Its own button is gone from under the verdict…
  expect(screen.queryByTestId("build-next")).toBeNull();
  const cuesAfter = global.__players.length;
  expect(cuesAfter).toBeGreaterThan(cuesBefore);
  // …and the verdict is drawn once (a second record would have redrawn it).
  expect(screen.getAllByText("Continue")).toHaveLength(1);
  jest.useRealTimers();
});

it("moves on by itself after a clean spoken pass, and waits for Continue on a chosen answer", async () => {
  expect([..."say shadow buildup".split(" ")].every((k) => AUTO_NEXT_KINDS.has(k))).toBe(true);
  expect(AUTO_NEXT_KINDS.has("choose-en")).toBe(false);
  jest.useFakeTimers();
  const onFinish = jest.fn();
  await mount([buildStep, { kind: "choose-en", i, prompt: word.w, cyr: true, ask: "Choose the meaning",
    options: [{ label: "to understand", right: true }, { label: "to read" }, { label: "to eat" }, { label: "to sleep" }], stage: 0 }], onFinish);
  await press("build-next");
  for (let k = 1; k < buildup(word.w).length; k++) await press("build-next");
  await press("build-next");
  expect(await screen.findByText("Continue")).toBeTruthy();
  // The reading is asked for at 420 ms, the advance armed at 500 ms, then the
  // beat: the next question is on screen without a press.
  await act(async () => { jest.advanceTimersByTime(600); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { jest.advanceTimersByTime(AUTO_NEXT_MS + 50); });
  expect(await screen.findByText("to read")).toBeTruthy();
  // A chosen answer stays on its verdict.
  await act(async () => { fireEvent.press(screen.getByText("to understand")); });
  expect(await screen.findByText("Continue")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(onFinish).not.toHaveBeenCalled();
  expect(screen.getByText("Continue")).toBeTruthy();
  jest.useRealTimers();
});
