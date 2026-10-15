/* A screen that holds a text field makes room for the keyboard (ui.js
   `useKeyboardPad`, 2026-10-15). The app draws edge to edge, so Android never
   resizes the window: the tutor's input row and Send sat behind the keys on the
   emulator, and typing landed in a field nobody could see. */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import { Keyboard, StyleSheet, Text } from "react-native";

import { Screen } from "../src/ui";

/* The jest Keyboard has no emitter; the listeners are caught on the way in. */
const handlers = {};
beforeEach(() => {
  jest.spyOn(Keyboard, "addListener").mockImplementation((name, fn) => {
    handlers[name] = fn;
    return { remove: () => { delete handlers[name]; } };
  });
});
afterEach(() => { jest.restoreAllMocks(); });

const pad = () => StyleSheet.flatten(screen.getByTestId("screen-pane").props.style).paddingBottom;
const show = (height) => act(async () => { handlers.keyboardDidShow({ endCoordinates: { height } }); });
const hide = () => act(async () => { handlers.keyboardDidHide({}); });

describe("Screen keyboard", () => {
  it("pads its foot by the keyboard while it is up, and only when asked to", async () => {
    await render(<Screen scroll={false} keyboard><Text>x</Text></Screen>);
    expect(pad()).toBe(0);
    await show(300);
    expect(pad()).toBe(300);
    await hide();
    expect(pad()).toBe(0);
  });

  it("leaves a screen with no field alone", async () => {
    await render(<Screen scroll={false}><Text>x</Text></Screen>);
    await show(300);
    expect(pad()).toBe(0);
  });
});
