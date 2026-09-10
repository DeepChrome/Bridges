/* Read anything (ROADMAP P10.7): Russian from outside the curriculum. */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Read } from "../src/screens/Read";
import { L, IX, STAGES, videos } from "../src/data";
import { analyse, readVerdict, youtubeId, READ_SKIP_TOP, MAX_CHARS } from "@core/read";
import { today } from "@core/util";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
const base = {
  v: 5, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};

async function withProfile(st = base) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify(st));
  return await render(<SessionProvider><Read navigation={nav} /></SessionProvider>);
}

/* A content word (above the free-rank cut) with a form the index resolves. */
const content = L.findIndex((w, i) => i > READ_SKIP_TOP && w.p === "noun" && IX[w.b]);
const word = L[content];

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

describe("what a text is made of", () => {
  it("separates the glue from the vocabulary", () => {
    // «и», «в», «не» are said by everyone from the first screen; counting them
    // would make every text look part-known before a content word appeared.
    const r = analyse(`и в не ${word.b}`, { L, IX, seen: {} });
    expect(r.free).toBe(3);
    expect(r.content).toBe(1);
    expect(r.words.map((w) => w.i)).toContain(content);
  });

  it("counts what the learner is already scheduling, not what they have seen", () => {
    const cold = analyse(word.b, { L, IX, seen: {} });
    expect(cold.share).toBe(0);
    expect(cold.newWords).toHaveLength(1);
    const warm = analyse(word.b, { L, IX, seen: { [word.b]: { s: 1, due: 0 } } });
    expect(warm.share).toBe(1);
    expect(warm.newWords).toHaveLength(0);
  });

  it("reports what the dictionary cannot resolve rather than dropping it", () => {
    const r = analyse("абракадабрищенск", { L, IX, seen: {} });
    expect(r.unknown).toBe(1);
    expect(r.unknownForms).toEqual(["абракадабрищенск"]);
  });

  it("advises without blocking, and says plainly when there is no Russian", () => {
    expect(readVerdict(analyse("hello there", { L, IX, seen: {} })).tone).toBe("none");
    expect(readVerdict({ content: 10, share: 0.95 }).tone).toBe("good");
    expect(readVerdict({ content: 10, share: 0.8 }).tone).toBe("ok");
    expect(readVerdict({ content: 10, share: 0.2 }).tone).toBe("hard");
  });

  it("caps what it will read and says it did", () => {
    const long = ("слово ").repeat(8000);
    const r = analyse(long, { L, IX, seen: {} });
    expect(r.truncated).toBe(true);
    expect(r.chars).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("finds a video id in a link and refuses to find one in prose", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("watch https://www.youtube.com/watch?v=abcdefghijk now")).toBe("abcdefghijk");
    expect(youtubeId("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    // Eleven characters of Russian is not a video id.
    expect(youtubeId("преподаватель")).toBeNull();
    expect(youtubeId("")).toBeNull();
  });
});

describe("the screen", () => {
  it("reads pasted Russian, links every word and lists the new ones", async () => {
    await withProfile();
    await act(async () => { fireEvent.changeText(screen.getByTestId("read-input"), `Это ${word.b}.`); });
    await waitFor(() => expect(screen.getByTestId("read-input").props.value).toContain(word.b));
    await act(async () => { fireEvent.press(screen.getByTestId("read-go")); });
    expect(await screen.findByTestId("read-verdict")).toBeTruthy();
    expect(screen.getByTestId(`read-new-${word.b}`)).toBeTruthy();
  });

  it("takes a new word into review, scheduled from today", async () => {
    await withProfile();
    await act(async () => { fireEvent.changeText(screen.getByTestId("read-input"), `Это ${word.b}.`); });
    await waitFor(() => expect(screen.getByTestId("read-input").props.value).toContain(word.b));
    await act(async () => { fireEvent.press(screen.getByTestId("read-go")); });
    await act(async () => { fireEvent.press(screen.getByTestId(`read-add-${word.b}`)); });
    await flushState();
    const st = JSON.parse(await AsyncStorage.getItem("rb.state.p1"));
    expect(st.pinned).toContain(word.b);
    // Due today, not at some unspecified later point: the same route the video
    // miner uses (P10.4).
    expect(st.seen[word.b].due).toBe(today());
  });

  it("opens a library video from its link instead of trying to read the link", async () => {
    const v = videos()[0];
    await withProfile();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("read-input"), `https://youtu.be/${v.id}`);
    });
    await waitFor(() => expect(screen.getByTestId("read-link")).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId("read-go")); });
    expect(nav.navigate).toHaveBeenCalledWith("Video", { videoId: v.id });
  });

  it("says what it cannot do with a link to something it does not have", async () => {
    await withProfile();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("read-input"), "https://youtu.be/zzzzzzzzzzz");
    });
    await waitFor(() => expect(screen.getByTestId("read-link")).toHaveTextContent(/already in the library/));
  });
});
