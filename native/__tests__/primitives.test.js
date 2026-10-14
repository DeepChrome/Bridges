/* The look pass's primitives (COURSE-ROADMAP WP8, 2026-10-14): one row text
   at the body size, one round icon button whose touch target is never under
   44 px however small it is drawn, one toggle row that still takes its place
   in a List, and one tone table for every button of a kind. */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View, StyleSheet } from "react-native";

import { RowText, IconButton, ToggleRow, List, toneOf, ICON_TARGET } from "../src/ui";
import { type, light, faceFor } from "../src/theme";

describe("RowText", () => {
  it("is the body size, bold by default, with its second line muted", async () => {
    await render(<View><RowText title="Dark mode" sub="All lessons unlocked" testID="rt" /></View>);
    const t = screen.getByTestId("rt");
    expect(StyleSheet.flatten(t.props.style).fontSize).toBe(type.body);
    // The app's Text turns a weight into the bold face (§30bj: Android drops
    // a synthesised weight on PT Serif), so the face is what to read.
    expect(StyleSheet.flatten(t.props.style).fontFamily).toBe(faceFor("600"));
    expect(screen.getByText("All lessons unlocked")).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("reaches 44 px of touch whatever size it is drawn at", async () => {
    await render(<View>
      <IconButton testID="small" size={36} label="a" onPress={() => {}} />
      <IconButton testID="big" size={44} label="b" onPress={() => {}} />
    </View>);
    for (const id of ["small", "big"]) {
      const b = screen.getByTestId(id);
      const size = StyleSheet.flatten(b.props.style).width;
      expect(size + 2 * b.props.hitSlop).toBeGreaterThanOrEqual(ICON_TARGET);
      expect(b.props.accessibilityRole).toBe("button");
    }
  });

  it("lights in the brand tint when on, and says so", async () => {
    await render(<IconButton testID="lit" on selected label="x" onPress={() => {}} />);
    const b = screen.getByTestId("lit");
    expect(StyleSheet.flatten(b.props.style).backgroundColor).toBe(light.brandBg);
    expect(b.props.accessibilityState).toEqual({ selected: true });
  });
});

describe("ToggleRow", () => {
  it("toggles from the row and from the switch, and keeps a List's hairline rule", async () => {
    const onChange = jest.fn();
    await render(
      <List>
        <ToggleRow title="Vibration" value={false} onValueChange={onChange} testID="sw" />
        <ToggleRow title="Dark mode" value onValueChange={() => {}} testID="sw2" />
      </List>,
    );
    fireEvent.press(screen.getByText("Vibration"));
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent(screen.getByTestId("sw"), "valueChange", true);
    expect(onChange).toHaveBeenCalledTimes(2);
    // The last row of the group carries no hairline: List's `last` reached the Row.
    const rows = screen.getAllByRole("button").filter((n) => n.props.accessibilityRole === "button"
      && StyleSheet.flatten(n.props.style) && "borderBottomWidth" in StyleSheet.flatten(n.props.style));
    expect(StyleSheet.flatten(rows[rows.length - 1].props.style).borderBottomWidth).toBe(0);
    expect(StyleSheet.flatten(rows[0].props.style).borderBottomWidth).toBe(1);
  });
});

describe("toneOf", () => {
  it("is Btn's table: a grade button and a button of the same kind agree", () => {
    expect(toneOf(light, "pri")).toEqual({ bg: light.brand, border: light.brandDim, fg: light.brandOn, edge: light.brandDim });
    expect(toneOf(light, "bad").fg).toBe(light.badOn);
    expect(toneOf(light, "ghost").bg).toBe("transparent");
  });
});
