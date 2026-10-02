/* The transcript under a video (2026-09-29): the line being said lifted out,
   the word being said picked out, the list following the video until the
   learner scrolls it, and a tap on a line playing from there. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Transcript, lineAt, wordAt } from "../src/transcript";
import { transcriptOf, videos } from "../src/data";
import { font } from "../src/theme";

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
    expect(screen.getByTestId("transcript-word").props.children).toBe("мы");
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
    expect(screen.getByTestId("transcript-word").props.children).toBe("о");
  });

  /* The owner, 2026-10-01: "allow links to full entries for words found
     within the transcript". A word the dictionary knows opens it; the line
     around it still plays from its time. */
  it("opens a known word, and leaves an unknown one plain", async () => {
    const onSeek = jest.fn(), onWord = jest.fn();
    await render(<Transcript lines={[[0, "сегодня мы говорим ыыкс", [0, 50, 90, 130]]]}
                             position={-1} onSeek={onSeek} onWord={onWord} />);
    await act(async () => { fireEvent.press(screen.getByTestId("transcript-link-0-2")); });
    expect(onWord).toHaveBeenCalledWith("говорим");
    expect(onSeek).not.toHaveBeenCalled();
    expect(screen.queryByTestId("transcript-link-0-3")).toBeNull();
  });

  /* The owner, 2026-10-01: "the option to have English in line with the
     transcription too (also highlighted as it goes)". */
  it("puts each line's English under it, behind a switch, said to be a machine's", async () => {
    const onToggleEn = jest.fn();
    const en = ["hello everyone", "today we are talking", "about the weather"];
    const { rerender } = await render(<Transcript lines={LINES} position={2600} onSeek={jest.fn()}
                                                  en={en} showEn={false} onToggleEn={onToggleEn} />);
    expect(screen.queryByTestId("transcript-en-1")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("transcript-en")); });
    expect(onToggleEn).toHaveBeenCalled();
    await rerender(<Transcript lines={LINES} position={2600} onSeek={jest.fn()}
                               en={en} showEn onToggleEn={onToggleEn} />);
    expect(screen.getByTestId("transcript-en-1").props.children).toBe("today we are talking");
    expect(screen.getByText("Machine translation")).toBeTruthy();
    // The line being said is lifted in English too — in the bold face, which
    // is how PT Serif carries weight (theme.js faceFor).
    const flat = (k) => Object.assign({}, ...[screen.getByTestId(`transcript-en-${k}`).props.style].flat(2).filter(Boolean));
    expect(flat(1).fontFamily).toBe(font.bold);
    expect(flat(0).fontFamily).toBe(font.regular);
  });

  it("offers no English switch for a video that has none", async () => {
    await render(<Transcript lines={LINES} position={0} onSeek={jest.fn()} en={null} />);
    expect(screen.queryByTestId("transcript-en")).toBeNull();
  });

  it("ships a transcript for the library's videos, in order", () => {
    const v = videos()[0];
    const lines = transcriptOf(v.id);
    expect(lines.length).toBeGreaterThan(10);
    for (let k = 1; k < lines.length; k++) expect(lines[k][0]).toBeGreaterThanOrEqual(lines[k - 1][0]);
    for (const ln of lines.slice(0, 20)) expect(ln[1].split(" ")).toHaveLength(ln[2].length);
  });
});
