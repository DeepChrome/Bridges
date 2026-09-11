/* The conversations on offer (§30l).
 *
 * 168 written conversations shipped with the first build of them, and the
 * activity drew one at random and dealt it out — so a learner could be given
 * one and never choose one, never go back to one, and never see that the rest
 * existed. The owner, 2026-09-11: *"I only see one transcript with 5 questions.
 * Ideally, there would be one or two scenarios per chapter and then maybe some
 * extras. Each should have a scenario title."*
 *
 * What the list has to get right is which conversations it is allowed to offer,
 * and that is a path rule rather than a presentation one: a library that shows
 * a lesson the map has not opened is a way round the curriculum.
 *
 * Own file, per the timeout note in screens.test.js — past roughly the sixth
 * test in a file every matcher starts timing out in this RNTL/React 19 pairing,
 * which is a failure that looks exactly like a screen rendering nothing.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { ScenesList } from "../src/screens/Flows";
import { STAGES, SCRIPTS } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

const dev = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, dev: true,
};
const fresh = { ...dev, dev: false };

async function withProfile(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(state));
  return await render(<SessionProvider><ScenesList navigation={nav} /></SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => { await flushState(); });

describe("the conversations on offer", () => {
  it("groups them by chapter, a couple at a time", async () => {
    await withProfile(dev);
    // The chapter's own name, never "Core 3" (§30b).
    expect(await screen.findByText(STAGES[0].title)).toBeTruthy();
    expect(screen.getByText(STAGES[1].title)).toBeTruthy();
    // Two forward, the rest of the chapter behind one row.
    expect(screen.getAllByTestId(/^scene-row-core1:/).length).toBe(2);
    expect(screen.getByTestId("scene-more-1")).toBeTruthy();
  });

  it("opens the rest of a chapter on request", async () => {
    await withProfile(dev);
    const more = await screen.findByTestId("scene-more-1");
    const before = screen.getAllByTestId(/^scene-row-/).length;
    fireEvent.press(more);
    // The state update lands a tick after the press, not inside it.
    await waitFor(() => expect(screen.queryByTestId("scene-more-1")).toBeNull());
    expect(screen.getAllByTestId(/^scene-row-/).length).toBeGreaterThan(before);
  });

  it("offers a conversation by its title, and opens that one", async () => {
    await withProfile(dev);
    const row = await screen.findByTestId("scene-row-core1:0");
    expect(within(row).getByText(SCRIPTS["core1:0"].title)).toBeTruthy();
    fireEvent.press(row);
    expect(nav.navigate).toHaveBeenCalledWith("Scenes", { key: "core1:0" });
  });

  /* Developer mode aside (rule 20.9), the library may never be a way round the
     path: a learner who has finished nothing is offered nothing. */
  it("offers nothing to a learner who has not finished a lesson", async () => {
    await withProfile(fresh);
    expect(await screen.findByText(/Nothing to listen to yet/)).toBeTruthy();
    expect(screen.queryByTestId(/^scene-row-/)).toBeNull();
  });
});
