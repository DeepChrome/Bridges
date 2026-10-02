/* Light or dark (the owner, 2026-10-01: "turn that switch into the light dark
   mode switch"). The exercise-book look is the only one; the switch chooses
   its paper or its night, the phone deciding until the learner does. */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

import { useScheme, setAppearance, loadAppearance, resetAppearance, markOutOfFive } from "../src/appearance";
import { useTheme, palette } from "../src/theme";
import { Text } from "../src/ui";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: jest.fn(() => "light"),
}));

function Probe() {
  const scheme = useScheme();
  const t = useTheme();
  return <Text testID="probe">{`${scheme} ${t.bg}`}</Text>;
}
const read = () => screen.getByTestId("probe").props.children;

beforeEach(async () => {
  await AsyncStorage.removeItem("rb.appearance");
  resetAppearance();
  useColorScheme.mockReturnValue("light");
});

it("follows the phone until the learner chooses", async () => {
  useColorScheme.mockReturnValue("dark");
  await render(<Probe />);
  expect(read()).toBe(`dark ${palette("dark").bg}`);
});

it("holds the learner's choice over the phone, and keeps it", async () => {
  await render(<Probe />);
  expect(read()).toBe(`light ${palette("light").bg}`);
  await act(async () => { setAppearance("dark"); });
  expect(read()).toBe(`dark ${palette("dark").bg}`);
  expect(await AsyncStorage.getItem("rb.appearance")).toBe("dark");
  resetAppearance();
  await act(async () => { await loadAppearance(); });
  expect(read()).toBe(`dark ${palette("dark").bg}`);
});

it("the two palettes carry every key, so nothing reads undefined", () => {
  const keys = Object.keys(palette("light")).sort();
  expect(Object.keys(palette("dark")).sort()).toEqual(keys);
  expect(keys).toContain("pen");
});

it("marks out of five with no 2", () => {
  expect(markOutOfFive(0.95)).toBe(5);
  expect(markOutOfFive(0.8)).toBe(4);
  expect(markOutOfFive(0.2)).toBe(3);
});
