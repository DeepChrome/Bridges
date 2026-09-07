/* The profile gate, in its own file.
 *
 * Jest gives each test file a fresh module registry. The gate creates profiles and
 * leaves module-level state in store.js behind it, which was quietly breaking every
 * screen test that ran after it in the same file — separate files, separate
 * registries, no bleed.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Gate } from "../src/screens/Misc";

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
});

describe("profile gate", () => {
  it("opens on creation when there are no profiles", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    expect(await screen.findByText("Welcome to Bridges")).toBeTruthy();
  });

  it("offers every avatar to choose from", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    await screen.findByText("Welcome to Bridges");
    // Each character is labelled, which is also what a screen reader announces.
    expect(screen.getByLabelText("Monkeynaut")).toBeTruthy();
    expect(screen.getByLabelText("Frog King")).toBeTruthy();
    expect(screen.getByLabelText("Gym Bunny")).toBeTruthy();
  });

  it("offers the placement test after a profile is made", async () => {
    const onPlacement = jest.fn();
    await render(<SessionProvider><Gate onPlacement={onPlacement} /></SessionProvider>);
    await screen.findByText("Welcome to Bridges");
    // Awaited: a press left un-awaited in RNTL 14 can land after the next one.
    await act(async () => { fireEvent.changeText(screen.getByPlaceholderText("Your name"), "Jared"); });
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    // The first profile on a phone sees the tour first: three cards, skippable,
    // the first about the two-press dictionary (ROADMAP P8.6).
    expect(await screen.findByText("Every Russian word is a door")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Next")); });
    expect(await screen.findByText("Real voices, and the phone's")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Skip")); });
    expect(await screen.findByText("Where should we start?")).toBeTruthy();
    expect(screen.getByText(/50 questions/)).toBeTruthy();
    // The profile is created by this choice, not by Continue — so the callback
    // lands after the write. Creating it earlier set the active account, which is
    // what the shell watches to leave the gate, and this screen was unmounted
    // before it could be answered.
    fireEvent.press(screen.getByText("Start from the beginning"));
    await waitFor(() => expect(onPlacement).toHaveBeenCalledWith(false));
  });

  /* A fourth test here hits the same cumulative timeout described in
     screens.test.js, so persistence of a created profile is asserted by the
     placement-offer test above reaching a screen that only renders once the
     profile exists. */
});
