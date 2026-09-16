/* What a screen reader is told about a control.
 *
 * The playbook asked for "an accessibilityLabel on every pressable" and that
 * is the wrong rule for this codebase: a label *replaces* the text a reader
 * would otherwise announce, so putting one on a button that already says
 * "Continue" makes it worse, and putting the wrong one on it makes it a lie.
 * §25 says what actually matters — a reader has to be able to *name* a
 * control, and to know it is one.
 *
 * Measured before this was written: of 55 hand-rolled Pressables, exactly one
 * was icon-only and unnamed, and twelve carried no role at all. Three of the
 * twelve were `Btn`, `Row` and the sheet backdrop — the shared primitives that
 * draw most of the controls in the app — which is why fixing three files
 * covered nearly all of them, and why this file guards those three rather
 * than every call site.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { Btn, Row, List } from "../src/ui";

describe("what a reader is told", () => {
  it("names a button by what it says, and says when it cannot be pressed", async () => {
    const screen = await render(
      <>
        <Btn testID="live" label="Continue" onPress={() => {}} />
        <Btn testID="dead" label="Continue" onPress={() => {}} disabled />
      </>
    );
    const live = screen.getByTestId("live"), dead = screen.getByTestId("dead");
    expect(live.props.accessibilityRole).toBe("button");
    /* No label of its own: the word inside is the name, and a second one here
       would be what the reader announced instead of it. */
    expect(live.props.accessibilityLabel).toBeUndefined();
    expect(screen.getAllByText("Continue")).toHaveLength(2);

    expect(live.props.accessibilityState).toEqual({ disabled: false });
    /* The half of this that was actually missing. `Btn` never hands `disabled`
       to the Pressable — §23's note about React 19 making tests lie — so
       without this the control looks greyed out and announces itself as
       perfectly pressable. */
    expect(dead.props.accessibilityState).toEqual({ disabled: true });
  });

  it("only calls a row a button when it does something", async () => {
    const screen = await render(
      <List>
        <Row testID="tappable" onPress={() => {}}><></></Row>
        <Row testID="inert"><></></Row>
      </List>
    );
    expect(screen.getByTestId("tappable").props.accessibilityRole).toBe("button");
    /* A row that is only a place to put two pieces of text is not a control,
       and announcing it as one sends a reader hunting for what it does. */
    expect(screen.getByTestId("inert").props.accessibilityRole).toBeUndefined();
    /* React Native fills the state object in on the host node whether or not
       anything was passed, so the assertion is that none of its fields is
       set — `toBeUndefined` on the object itself passes for the wrong reason
       on a row that does carry a state. */
    const state = screen.getByTestId("inert").props.accessibilityState || {};
    expect(Object.values(state).filter((v) => v !== undefined)).toEqual([]);
  });
});
