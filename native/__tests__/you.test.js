/* The You screen's grammar section: the tags speech feedback attached, counted,
   most frequent first, each a way into the unit that teaches the point.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import You, { grammarTrouble } from "../src/screens/You";
import { tagInfo } from "@core/errortags";
import { UN } from "../src/data";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withYou(state) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><You navigation={nav} /></SessionProvider>);
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await flushState();
});

describe("grammar trouble", () => {
  it("orders tags by count and drops unknown ones", () => {
    const g = grammarTrouble({ speech: { tagCounts: { CASE: 2, PERSON: 5, BOGUS: 9, STRESS: 0 } } });
    expect(g.map((x) => x.id)).toEqual(["PERSON", "CASE"]);
    expect(g[0].info).toBe(tagInfo("PERSON"));
    expect(grammarTrouble({})).toEqual([]);
  });

  it("shows nothing-yet with no tags, and the counted tags otherwise", async () => {
    await withYou({});
    expect((await screen.findAllByText("Nothing yet")).length).toBe(2);   // words, grammar
  });

  it("lists a tag with its count and opens the unit that teaches it", async () => {
    await withYou({ speech: { attempts: [], tagCounts: { CASE: 3, WORD_ORDER: 1 } } });
    expect(await screen.findByText(tagInfo("CASE").en)).toBeTruthy();
    expect(screen.getByText("3×")).toBeTruthy();
    const unit = UN.find((u) => u.id === tagInfo("CASE").unit);
    expect(screen.getByText(unit.name)).toBeTruthy();
    fireEvent.press(screen.getByText(tagInfo("CASE").en));
    expect(nav.navigate).toHaveBeenCalledWith("Learn", { screen: "Unit", params: { unitId: unit.id } });
    // WORD_ORDER has no unit to send anyone to: listed, not pressable.
    fireEvent.press(screen.getByText(tagInfo("WORD_ORDER").en));
    expect(nav.navigate).toHaveBeenCalledTimes(1);
  });
});
