/* The end of a unit video's questions goes on along the path (the owner,
 * 2026-10-09: "After I answer the video questions, continue should take me
 * to the next chapter… keep things pretty linear"), with the video's summary
 * as the quiet second button, whose own Continue then goes on too. */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { VideoSummary } from "../src/screens/Misc";
import { UN, lessonCount, nextRoute, markComponent, components } from "../src/data";

const unit = UN.find((u) => u.v && u.v.quiz);
const index = lessonCount(unit) - 1;
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), pop: jest.fn(), dispatch: jest.fn(),
                     setParams: jest.fn(), addListener: jest.fn(() => () => {}) });
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
               speech: { attempts: [], tagCounts: {} }, streak: 0 };

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

it("once a unit's last lesson is done, Continue goes to the next unit, not back into the video", () => {
  let st = base;
  for (let k = 0; k <= index; k++) {
    for (const c of components(base, unit, k).filter((c) => !c.optional)) st = markComponent(st, unit, k, c.id, 100);
  }
  const route = nextRoute(st);
  expect(route).toBeTruthy();
  expect(["Video", "VideoSummary", "VideoQuiz", "Summary"]).not.toContain(route[0]);
  expect(route[1].unitId).not.toBe(unit.id);
});

it("the video's summary opened from the questions goes on with Continue, not back to the video", async () => {
  const n = nav();
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(base));
  await render(<SessionProvider><VideoSummary navigation={n}
    route={{ params: { unitId: unit.id, index, onward: true } }} /></SessionProvider>);
  const btn = await screen.findByTestId("summary-continue");
  expect(screen.getByText("Continue")).toBeTruthy();
  await act(async () => { fireEvent.press(btn); });
  const pushed = n.dispatch.mock.calls.map((c) => c[0]).find((a) => a.type === "PUSH");
  expect(pushed).toBeTruthy();
  expect(pushed.payload.name).not.toBe("Video");
});
