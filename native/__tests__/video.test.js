/* The video library and the player screen. The rule under test is the owner's:
   every word listed under a video is a word the video says (the transcript index
   decides), and the library is searchable by keyword or by a Russian word. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Immerse, Video, searchVideos, libraryOrder, videoFor } from "../src/screens/Misc";
import { UN, VIDEOS, unitById } from "../src/data";

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: jest.fn(), pause: jest.fn() }));
    return React.createElement(View, { testID: "yt-player" });
  }) };
});

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0, dev: true,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
async function saved() { await flushState(); return JSON.parse(await AsyncStorage.getItem("rb.state.p1")); }

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

const unitVideo = VIDEOS.find((v) => v.unit && unitById(v.unit).v && unitById(v.unit).v.heard);
const libraryVideo = VIDEOS.find((v) => !v.unit);

describe("the video data", () => {
  it("ships a library, and every listed word carries a moment in the video", () => {
    expect(VIDEOS.length).toBeGreaterThan(50);
    for (const v of VIDEOS) {
      expect(Object.keys(v.words).length).toBeGreaterThan(0);
      for (const w in v.words) {
        expect(v.words[w].length).toBeGreaterThan(0);
        for (const m of v.words[w]) expect(typeof m.t).toBe("number");
      }
      expect(typeof v.kw).toBe("string");
    }
  });

  it("lists under a unit's episode only unit words the episode says", () => {
    const seenUnits = UN.filter((u) => u.v && u.v.heard);
    expect(seenUnits.length).toBeGreaterThan(10);
    for (const u of seenUnits) {
      const bare = new Set(u.w.map((i) => require("../src/data").L[i].b));
      for (const w in u.v.heard) {
        expect(bare.has(w)).toBe(true);
        expect(u.v.heard[w].length).toBeGreaterThan(0);
      }
    }
  });

  it("puts the units' episodes first, then the rest easiest first", () => {
    const order = libraryOrder(VIDEOS);
    const firstFree = order.findIndex((v) => !v.unit);
    expect(order.slice(0, firstFree).every((v) => v.unit)).toBe(true);
    const rest = order.slice(firstFree).map((v) => v.ease || 0);
    expect(rest.every((e, k) => k === 0 || rest[k - 1] >= e)).toBe(true);
  });

  it("searches by keyword, by title, and by a Russian word the video says", () => {
    const grammar = searchVideos(VIDEOS, "grammar");
    expect(grammar.length).toBeGreaterThan(0);
    expect(grammar.every((v) => (v.kw + " " + v.title).toLowerCase().includes("grammar"))).toBe(true);
    const word = Object.keys(libraryVideo.words)[0];
    const hits = searchVideos(VIDEOS, word);
    expect(hits.some((v) => v.id === libraryVideo.id)).toBe(true);
    expect(hits.every((v) => Object.keys(v.words).some((w) => w.startsWith(word)) ||
                             (v.kw + " " + v.title).includes(word))).toBe(true);
    expect(searchVideos(VIDEOS, "xyzzy-nothing")).toEqual([]);
  });

  it("filters on a typed CEFR code, which is never displayed", () => {
    const b1 = searchVideos(VIDEOS, "b1");
    expect(b1.length).toBeGreaterThan(0);
    expect(b1.every((v) => /^B1\+?$/.test(v.cefr))).toBe(true);
    const a1 = searchVideos(VIDEOS, "A1 grammar");
    expect(a1.every((v) => v.cefr === "A1" && (v.kw + " " + v.title).toLowerCase().includes("grammar"))).toBe(true);
    const plus = searchVideos(VIDEOS, "b1+");
    expect(plus.every((v) => v.cefr === "B1+")).toBe(true);
    expect(VIDEOS.filter((v) => v.cefr).length).toBeGreaterThan(150);
  });
});

describe("Immerse", () => {
  it("lists the library, filters as you type, and opens a video", async () => {
    await withProfile(<Immerse navigation={nav} />);
    expect(await screen.findByText(`of ${VIDEOS.length} watched`)).toBeTruthy();
    // Each row carries the video's YouTube thumbnail.
    const first = libraryOrder(VIDEOS)[0];
    expect(screen.getByTestId(`thumb-${first.id}`).props.source.uri).toContain(first.id);
    const input = screen.getByTestId("video-search");
    await act(async () => { fireEvent.changeText(input, "xyzzy-nothing"); });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    await act(async () => { fireEvent.changeText(input, ""); });
    await act(async () => { fireEvent.press(screen.getAllByText(first.title.split(" | ")[0].trim())[0]); });
    expect(nav.navigate).toHaveBeenCalledWith("Video", { videoId: first.id });
  });
});

describe("Video", () => {
  it("shows only spoken words for a unit's episode, and seeks on a tap", async () => {
    const unit = unitById(unitVideo.unit);
    const v = videoFor({ unitId: unit.id, index: 0 });
    const heard = Object.keys(unit.v.heard);
    expect(Object.keys(v.words).slice(0, heard.length)).toEqual(heard);
    await withProfile(<Video route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />);
    await screen.findByText("Play here");
    for (const w of heard) expect(screen.getByText(w)).toBeTruthy();
    // No unit word the episode does not say is on the screen.
    const { L } = require("../src/data");
    const silent = unit.w.map((i) => L[i].b).filter((b) => !unit.v.heard[b]);
    for (const b of silent.slice(0, 5)) expect(screen.queryByText(b)).toBeNull();
    expect(screen.queryByText(/not spoken/)).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText(heard[0])); });
    expect(screen.getByTestId("yt-player")).toBeTruthy();
    expect(screen.getByText(unit.v.heard[heard[0]][0].s)).toBeTruthy();
  });

  it("records a library video as watched, and a unit episode for its unit too", async () => {
    await withProfile(<Video route={{ params: { videoId: libraryVideo.id } }} navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByText("Mark as watched")); });
    let st = await saved();
    expect(typeof st.watched[libraryVideo.id]).toBe("number");
    expect(nav.goBack).toHaveBeenCalled();

    await flushState(); await AsyncStorage.clear();
    await withProfile(<Video route={{ params: { unitId: unitVideo.unit, index: 0 } }} navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByText("Mark as watched")); });
    st = await saved();
    expect(st.unit[unitVideo.unit].video).toBe(true);
    expect(typeof st.watched[unitVideo.id]).toBe("number");
  });
});
