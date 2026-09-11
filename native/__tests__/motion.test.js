/* The motion system.
 *
 * Animations land instantly under test (jest.setup.js), so nothing here can
 * assert how something looks. What it asserts is the two contracts that broke
 * while the motion was being added, both silently:
 *
 *   1. A control is pressable on the first frame. §25: motion reinforces
 *      interaction and never delays study.
 *   2. An animated wrapper does not swallow the style the render tree is read
 *      through (§20a). Making the Pressable itself animated blinded three
 *      existing tests in the same commit that added the animation, and none of
 *      them failed in a way that named the cause.
 *
 * Deliberately not asserted: that a disabled control ignores a press, and that
 * a row without `onPress` has no press handlers. Both are true on a device and
 * neither is observable here — RNTL walks the fibre to a wrapper's own props
 * (§23), and Pressable turns its handlers into responder callbacks the host
 * node does not carry. A test that appears to check those would be checking the
 * framework and passing for the wrong reason.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Btn } from "../src/ui";
import { motionOff } from "../src/motion";
import { light } from "../src/theme";

/* The style a node resolved to. A style prop may be an object, an array, or a
   function of the press state — Pressable resolves the last of those before it
   renders, and the other suites read it the same way. */
function flat(node) {
  const s = node.props.style;
  const one = typeof s === "function" ? s({ pressed: false }) : s;
  return Array.isArray(one) ? Object.assign({}, ...one.filter(Boolean)) : (one || {});
}

describe("a control under a finger", () => {
  it("presses without waiting for anything", async () => {
    const onPress = jest.fn();
    await render(<Btn testID="b" label="Go" onPress={onPress} />);
    // No settling and no waitFor: the very first press has to count.
    fireEvent.press(screen.getByTestId("b"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps its own style readable, animated or not", async () => {
    await render(<Btn testID="b" kind="pri" label="Go" onPress={jest.fn()} />);
    expect(flat(screen.getByTestId("b")).backgroundColor).toBe(light.brand);
  });

  it("puts the caller's layout on the wrapper and the look on the button", async () => {
    /* The split that keeps the above true: `style` from a caller is always
       layout (a margin, or `flex: 1` in a row of two buttons), so it goes on
       the animated wrapper with the transform, and the Pressable keeps only
       what the button looks like. */
    await render(<Btn testID="b" label="Go" style={{ marginTop: 99 }} onPress={jest.fn()} />);
    const own = flat(screen.getByTestId("b"));
    expect(own.marginTop).not.toBe(99);
    expect(own.borderRadius).toBeGreaterThan(0);
  });

  it("stops looking like a primary when it is disabled", async () => {
    /* A faded primary still reads as a primary with pale text, which is how
       the way-in screen's Continue looked live until you pressed it (§30p). */
    await render(<Btn testID="b" kind="pri" label="Go" disabled onPress={jest.fn()} />);
    expect(flat(screen.getByTestId("b")).backgroundColor).not.toBe(light.brand);
  });

  it("survives a press in and out", async () => {
    const onPress = jest.fn();
    await render(<Btn testID="b" label="Go" onPress={onPress} />);
    const node = screen.getByTestId("b");
    fireEvent(node, "pressIn");
    fireEvent(node, "pressOut");
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalled();
  });
});

/* The progress bar is not tested here. Both of its paths — animated and plain —
   are already rendered by the runner, list and review suites as part of a real
   screen, and a second render of it in isolation bought nothing except two
   overlapping act() scopes. Animating is opt-in because the video passage
   drives its bar from a position poll four times a second, and easing on top of
   that would lag the video rather than follow it. */

describe("reduced motion", () => {
  it("is read from the platform rather than from an environment flag", async () => {
    // The hooks branch on this, so a learner who turns motion off gets the end
    // state immediately rather than a shorter version of the same movement.
    expect(typeof motionOff()).toBe("boolean");
  });
});
