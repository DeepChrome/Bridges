/* The profile gate, in its own file.
 *
 * Jest gives each test file a fresh module registry. The gate creates profiles and
 * leaves module-level state in store.js behind it, which was quietly breaking every
 * screen test that ran after it in the same file — separate files, separate
 * registries, no bleed.
 *
 * Rebuilt 2026-09-10 (the owner: "a clean login screen and animation"). The
 * animations settle instantly under test (jest.setup.js), so what is asserted
 * here is the flow and the controls, not the movement — plus the one thing the
 * rebuild could plausibly break in a way nothing else would catch: a control
 * that is drawn but not pressable on the first frame.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Gate } from "../src/screens/Gate";

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
});

describe("profile gate", () => {
  it("opens on creation when there are no profiles", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    // The app introduces itself by its mark and its name, not by a heading that
    // says what to do next.
    expect(await screen.findByTestId("wordmark")).toBeTruthy();
    expect(screen.getByTestId("mark")).toBeTruthy();
  });

  it("offers every character to choose from", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    await screen.findByTestId("wordmark");
    // Each character is labelled, which is also what a screen reader announces.
    expect(screen.getByLabelText("Monkeynaut")).toBeTruthy();
    expect(screen.getByLabelText("Frog King")).toBeTruthy();
    expect(screen.getByLabelText("Gym Bunny")).toBeTruthy();
  });

  it("holds Continue until there is a name to continue with", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    await screen.findByTestId("wordmark");
    // Guarded in the handler, not only on the button: RNTL reads a press off the
    // wrapper's own props (§23), so a `disabled` that lives only in `Btn` would
    // pass this for the wrong reason.
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    expect(screen.queryByText("Where should we start?")).toBeNull();
    expect(screen.getByTestId("wordmark")).toBeTruthy();
  });

  it("offers the placement test after a profile is made", async () => {
    const onPlacement = jest.fn();
    await render(<SessionProvider><Gate onPlacement={onPlacement} /></SessionProvider>);
    await screen.findByTestId("wordmark");
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
    fireEvent.press(screen.getByTestId("placement-skip"));
    await waitFor(() => expect(onPlacement).toHaveBeenCalledWith(false));
  });

  /* A fifth test here hits the same cumulative timeout described in
     screens.test.js, so signing in to an existing profile is covered by
     login.test.js rather than by a fifth render in this file. */
});
