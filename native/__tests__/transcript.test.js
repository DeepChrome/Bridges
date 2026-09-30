/* The transcript under a video (2026-09-29): the line being said lifted out,
   the word being said picked out, the list following the video until the
   learner scrolls it, and a tap on a line playing from there. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Transcript, lineAt, wordAt } from "../src/transcript";
import { transcriptOf, videos } from "../src/data";

const LINES = [
  [0, "привет всем", [0, 40]],
  [2000, "сегодня мы говорим", [0, 50, 90]],
  [5000, "о погоде", [0, 30]],
];

describe("the transcript", () => {
  it("finds the line and the word being said", () => {
    expect(lineAt(LINES, 0)).toBe(0);
    expect(lineAt(LINES, 2500)).toBe(1);
    expect(lineAt(LINES, 99999)).toBe(2);
    expect(wordAt(LINES[1], 2000)).toBe(0);
    expect(wordAt(LINES[1], 2600)).toBe(1);   // «мы» starts at 2,500
    expect(wordAt(LINES[1], 2950)).toBe(2);
  });

  it("marks the line and word, follows until scrolled, and plays from a tapped line", async () => {
    const onSeek = jest.fn();
    const { rerender } = await render(<Transcript lines={LINES} position={2600} onSeek={onSeek} />);
    expect(screen.getByTestId("transcript-word").props.children).toEqual([" ", "мы"]);
    expect(screen.getByTestId("transcript-follow").props.accessibilityState.selected).toBe(true);
    // A finger on the list stops it following; the chip puts it back.
    await act(async () => { fireEvent(screen.getByTestId("transcript-scroll"), "scrollBeginDrag"); });
    expect(screen.getByTestId("transcript-follow").props.accessibilityState.selected).toBe(false);
    await act(async () => { fireEvent.press(screen.getByTestId("transcript-follow")); });
    expect(screen.getByTestId("transcript-follow").props.accessibilityState.selected).toBe(true);
    await act(async () => { fireEvent.press(screen.getByTestId("transcript-line-2")); });
    expect(onSeek).toHaveBeenCalledWith(5000);
    // The highlight moves with the position.
    await rerender(<Transcript lines={LINES} position={5100} onSeek={onSeek} />);
    expect(screen.getByTestId("transcript-word").props.children).toEqual(["", "о"]);
  });

  it("ships a transcript for the library's videos, in order", () => {
    const v = videos()[0];
    const lines = transcriptOf(v.id);
    expect(lines.length).toBeGreaterThan(10);
    for (let k = 1; k < lines.length; k++) expect(lines[k][0]).toBeGreaterThanOrEqual(lines[k - 1][0]);
    for (const ln of lines.slice(0, 20)) expect(ln[1].split(" ")).toHaveLength(ln[2].length);
  });
});
