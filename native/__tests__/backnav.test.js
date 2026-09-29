/* Scrolling a sheet, and Back going where the learner came from (2026-09-28).
 *
 * The owner: *"on the extra info/hint page… it's very hard to scroll by
 * swiping. Seems like I have to click in specific places"* and *"Make the back
 * button a true back button… if I hit back it takes me to the drill rather
 * than to the previous page."*
 *
 * Neither is visible to a test that only reads text. A swipe is a native
 * gesture RNTL cannot perform, and Back is a stack RNTL does not keep. So both
 * are pinned by the structure that decides them (§20a): nothing between a
 * finger and the sheet's scroll view may claim the touch, and a link from an
 * entry must push rather than replace.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Text } from "react-native";

import { Sheet } from "../src/ui";
import { wordAction } from "../src/words";
import Grammar from "../src/screens/Grammar";

/* Every prop a React Native view uses to claim a touch. A view carrying any of
   them above the ScrollView takes the gesture first. */
const CLAIMS = ["onStartShouldSetResponder", "onMoveShouldSetResponder",
                "onResponderGrant", "onClick", "onPress"];

describe("a sheet scrolls wherever the finger lands", () => {
  it("has nothing above its scroll view that claims the touch", async () => {
    await render(
      <Sheet onClose={jest.fn()} title="Reference">
        {Array.from({ length: 40 }, (_, k) => <Text key={k}>{`line ${k}`}</Text>)}
      </Sheet>
    );
    const body = screen.getByTestId("sheet-body");
    const claimed = [];
    for (let n = body.parent; n; n = n.parent) {
      for (const p of CLAIMS) if (n.props && typeof n.props[p] === "function") claimed.push(p);
    }
    /* This failed before the fix: the sheet was a do-nothing Pressable, the
       backdrop another Pressable around it, and between them they took every
       swipe that started on text. */
    expect(claimed).toEqual([]);
  });

  it("keeps the backdrop, as a sibling behind the sheet rather than around it", async () => {
    const onClose = jest.fn();
    await render(<Sheet onClose={onClose}><Text>body</Text></Sheet>);
    const backdrop = screen.getByTestId("sheet-backdrop");
    const body = screen.getByTestId("sheet-body");
    let inside = false;
    for (let n = body.parent; n; n = n.parent) if (n === backdrop) inside = true;
    expect(inside).toBe(false);
    await act(async () => { fireEvent.press(backdrop); });
    expect(onClose).toHaveBeenCalled();
  });

  /* React Native's default flexShrink is 0: inside a sheet capped at 85 % a
     long body grew to its full height rather than scrolling within the cap. */
  it("lets the scroll view shrink to the sheet's height", async () => {
    await render(<Sheet onClose={jest.fn()}><Text>body</Text></Sheet>);
    const style = [].concat(screen.getByTestId("sheet-body").props.style).reduce(
      (a, s) => ({ ...a, ...(s || {}) }), {});
    expect(style.flexShrink).toBe(1);
  });
});

describe("Back returns to the page before", () => {
  /* React Navigation 7 treats navigate("Word") from a Word screen as "update
     the screen you are on", so three words read in a row were one screen. */
  it("pushes a new entry when opened from an entry", () => {
    expect(wordAction({ name: "Word" }, "книга")).toMatchObject(
      { type: "PUSH", payload: { name: "Word", params: { word: "книга" } } });
  });
  it("navigates as before from anywhere else", () => {
    for (const from of [{ name: "Drill" }, { name: "Cards" }, null]) {
      expect(wordAction(from, "книга")).toMatchObject({ type: "NAVIGATE" });
    }
  });

  const navFor = (routes) => ({
    push: jest.fn(), goBack: jest.fn(), navigate: jest.fn(),
    getState: () => ({ routes }),
  });

  it("opens a grammar topic as a screen of its own", async () => {
    const nav = navFor([{ name: "Grammar", params: {} }]);
    await render(<Grammar route={{ params: {} }} navigation={nav} />);
    await act(async () => { fireEvent.press(screen.getByTestId("topic-cases")); });
    expect(nav.push).toHaveBeenCalledWith("Grammar", { topic: "cases" });
  });

  it("goes back to the list it came from rather than stacking another", async () => {
    const nav = navFor([{ name: "Grammar", params: {} }, { name: "Grammar", params: { topic: "cases" } }]);
    await render(<Grammar route={{ params: { topic: "cases" } }} navigation={nav} />);
    await act(async () => { fireEvent.press(screen.getByTestId("topics-back")); });
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("opens the list when the bulb brought the learner straight to a topic", async () => {
    const nav = navFor([{ name: "Drill", params: {} }, { name: "Grammar", params: { topic: "verbs" } }]);
    await render(<Grammar route={{ params: { topic: "verbs" } }} navigation={nav} />);
    await act(async () => { fireEvent.press(screen.getByTestId("topics-back")); });
    expect(nav.push).toHaveBeenCalledWith("Grammar", {});
    expect(nav.goBack).not.toHaveBeenCalled();
  });
});
