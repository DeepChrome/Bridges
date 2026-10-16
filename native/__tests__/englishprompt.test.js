/* English is never read by the Russian voice.
 *
 * A tester, 2026-10-09, on a typed question asking for «думать» under the
 * prompt "to think": *"Just says to rather than to think or the Russian
 * word."* A Russian voice handed "to think" says «то». Nothing in the runner
 * hands it an English prompt today — `promptSpeech` reads only a Russian
 * prompt, and the generator gives a typed question no `say` — so the rule is
 * held at both ends: the runner offers no speaker for English, and `say`
 * itself refuses text with no Cyrillic in it.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { Runner, promptSpeech } from "../src/screens/Run";
import { say } from "../src/audio";

const typed = { kind: "type", ask: "Write it in Russian", prompt: "to think", cyr: false, typed: true,
                target: "думать", answer: "ду́мать" };

beforeEach(() => { global.__spoke = []; global.__players = []; });

describe("an English prompt", () => {
  it("is not read aloud, even when a generator names it as what to say", () => {
    expect(promptSpeech(typed)).toBeNull();
    expect(promptSpeech({ ...typed, say: "to think" })).toBeNull();
    // A Russian `say` still is.
    expect(promptSpeech({ ...typed, say: "думать" })).toBe("думать");
  });

  it("is refused by the Russian voice", async () => {
    expect(await say("to think")).toBe(false);
    expect(global.__spoke).toEqual([]);
    expect((global.__players || []).length).toBe(0);
  });

  it("puts no speaker beside a typed question's English prompt", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
    await render(
      <SessionProvider>
        <Runner steps={[typed]} onFinish={jest.fn()} gradeWords={false} />
      </SessionProvider>
    );
    expect(await screen.findByText("to think")).toBeTruthy();
    expect(screen.queryByTestId("speaker-real")).toBeNull();
    expect(screen.queryByTestId("speaker-tts")).toBeNull();
    expect(screen.queryByTestId("speaker-silent")).toBeNull();
  });
});
