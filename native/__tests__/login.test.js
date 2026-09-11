/* Signing in — the gate with profiles already on the phone.
 *
 * Its own file for the reason gate.test.js gives: the gate writes profiles, and
 * four renders of a provider in one file is where the suite's cumulative
 * timeout starts to bite.
 *
 * The contract here is the whole point of the screen: the faces are the login,
 * one tap is the whole interaction, and a second profile can still be made
 * without losing the way back.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SessionProvider } from "../src/session";
import { flushState, ACC_KEY } from "../src/store";
import { Gate } from "../src/screens/Gate";

const TWO = {
  list: [
    { id: "p1", name: "Jared", avatar: "monkeynaut", placed: 0 },
    { id: "p2", name: "Sam", avatar: "kingfrog" },
  ],
  active: null,
};

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(ACC_KEY, JSON.stringify(TWO));
});

describe("signing in", () => {
  it("shows the profiles on the phone, each pressable by name", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    expect(await screen.findByText("Who's studying?")).toBeTruthy();
    expect(screen.getByTestId("profile-p1")).toBeTruthy();
    expect(screen.getByTestId("profile-p2")).toBeTruthy();
    // The mark is the only branding on the sign-in screen; the faces carry it.
    expect(screen.getByTestId("mark")).toBeTruthy();
  });

  it("signs in on the first press", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    await screen.findByText("Who's studying?");
    // No settling and no waitFor before the press: an entry animation must never
    // make a control wait to become usable (§25).
    await act(async () => { fireEvent.press(screen.getByTestId("profile-p2")); });
    await waitFor(async () => {
      const acc = JSON.parse(await AsyncStorage.getItem(ACC_KEY));
      expect(acc.active).toBe("p2");
    });
  });

  it("goes to a new profile and back again", async () => {
    await render(<SessionProvider><Gate onPlacement={jest.fn()} /></SessionProvider>);
    await screen.findByText("Who's studying?");
    await act(async () => { fireEvent.press(screen.getByText("New profile")); });
    expect(await screen.findByPlaceholderText("Your name")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Back")); });
    expect(await screen.findByText("Who's studying?")).toBeTruthy();
  });
});
