/* A pinned footer on a screen with no tab bar under it takes the bottom
   inset itself (the owner, 2026-11-18, of "Watch video" sitting on the
   gesture bar); on a tab screen the tab bar has it already. And a pull down
   a screen runs its onRefresh. */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, RefreshControl } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

global.__navRoute = null;
jest.mock("../src/words", () => ({
  ...jest.requireActual("../src/words"),
  navRef: { isReady: () => true, getCurrentRoute: () => global.__navRoute },
}));

import { Screen, Text } from "../src/ui";

const INSETS = { top: 0, bottom: 30, left: 0, right: 0 };
const footerPad = () => StyleSheet.flatten(screen.getByTestId("screen-footer").props.style).paddingBottom;
const mount = (route, ui) => {
  global.__navRoute = route;
  return render(<SafeAreaInsetsContext.Provider value={INSETS}>{ui}</SafeAreaInsetsContext.Provider>);
};

it("takes the bottom inset under a run's footer, and not under a tab screen's", async () => {
  await mount({ name: "Quiz" }, <Screen footer={<Text>Go</Text>}><Text>body</Text></Screen>);   // a run
  expect(footerPad()).toBe(12 + 30);
  await mount({ name: "Path" }, <Screen footer={<Text>Go</Text>}><Text>body</Text></Screen>);   // a tab screen
  expect(footerPad()).toBe(12);
});

it("runs onRefresh on a pull, and only while it is asked for", async () => {
  const onRefresh = jest.fn(async () => {});
  await mount({ name: "Path" }, <Screen onRefresh={onRefresh}><Text>body</Text></Screen>);
  // The control rides on the scroll view as a prop; its onRefresh is the pull.
  await screen.getByTestId("screen-body").props.refreshControl.props.onRefresh();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  await mount({ name: "Path" }, <Screen><Text>body</Text></Screen>);
  expect(screen.getByTestId("screen-body").props.refreshControl).toBeUndefined();
  expect(RefreshControl).toBeTruthy();
});
