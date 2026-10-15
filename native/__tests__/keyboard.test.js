/* A screen that holds a text field makes room for the keyboard (ui.js
   `useKeyboardPad`, 2026-10-15). The app draws edge to edge, so Android never
   resizes the window: the tutor's input row and Send sat behind the keys on the
   emulator, and typing landed in a field nobody could see. */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import { Keyboard, StyleSheet, Text } from "react-native";

import { renderHook } from "@testing-library/react-native";
import { Screen, useKeyboardOverlap } from "../src/ui";

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

describe("a sheet under the keyboard", () => {
  /* A Modal is its own window and some devices resize it for the keyboard,
     others not; the pad is the measured overlap, so both come out right. */
  const keyboard = (top, height) => act(async () => { handlers.keyboardDidShow({ endCoordinates: { screenY: top, height } }); });
  it("pads by the part of the sheet the keys cover, and nothing when the window already moved it", async () => {
    let bottom = 2400;                                   // the sheet reaches the foot of a 2400-high window
    const { result } = await renderHook(() => useKeyboardOverlap((node, cb) => cb(bottom)));
    await keyboard(1500, 900);
    expect(result.current[1]).toBe(900);
    bottom = 1500;                                       // the window resized: the sheet sits on the keys
    await keyboard(1500, 900);
    expect(result.current[1]).toBe(0);
    await hide();
    expect(result.current[1]).toBe(0);
  });
  it("falls back to the keyboard's height where nothing can be measured", async () => {
    const { result } = await renderHook(() => useKeyboardOverlap((node, cb) => cb(null)));
    await keyboard(1500, 900);
    expect(result.current[1]).toBe(900);
  });
});
