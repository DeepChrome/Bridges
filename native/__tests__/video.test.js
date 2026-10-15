/* The video library and the player screen. The rule under test is the owner's:
   every word listed under a video is a word the video says (the transcript index
   decides), and the library is searchable by keyword or by a Russian word. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Immerse } from "../src/screens/Immerse";
import { Video, videoFor } from "../src/screens/Video";
import { VideoSummary } from "../src/screens/VideoSummary";
import { searchVideos, libraryOrder, channelsOf, VIDEO_SORTS } from "../src/video";
import { UN, videos, unitById } from "../src/data";
import { fold, firstSense } from "@core/util";

const VIDEOS = videos();
/* The video page draws its whole transcript from the start (2026-10-05), a
   few hundred lines; under a full parallel run that outlasts jest's 5 s. */
jest.setTimeout(30000);

jest.mock("../src/youtube", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { YouTube: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ seek: jest.fn(), pause: jest.fn(), watch: jest.fn() }));
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
async function saved() { await flushState(); return (await global.__db.saved("p1")); }

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

  /* Every unit works towards a video (§30bf), and its list is what to have in
     hand before watching: the unit's own words the episode says, first, then
     words the episode leans on. Every one is said, with its moment. */
  it("gives every unit a goal video, listing its own spoken words first", () => {
    const { L } = require("../src/data");
    expect(UN.every((u) => u.v)).toBe(true);
    const seenUnits = UN.filter((u) => u.v && u.v.heard);
    expect(seenUnits.length).toBeGreaterThan(30);
    for (const u of seenUnits) {
      const own = new Set(u.w.map((i) => L[i].b));
      const list = Object.keys(u.v.heard);
      expect(list.length).toBeLessThanOrEqual(24);
      const firstOther = list.findIndex((w) => !own.has(w));
      if (firstOther >= 0) expect(list.slice(firstOther).some((w) => own.has(w))).toBe(false);
      for (const w of list) expect(u.v.heard[w].length).toBeGreaterThan(0);
    }
  });

  /* The resting order is a progression (the owner, 2026-09-23): the units'
     episodes along the path, then the rest by CEFR code, unrated last. The
     other sorts are plain. */
  it("orders by level at rest: the units' episodes first, then A1 up, unrated last", () => {
    const order = libraryOrder(VIDEOS);
    const firstFree = order.findIndex((v) => !v.unit);
    expect(order.slice(0, firstFree).every((v) => v.unit)).toBe(true);
    const RANK = { A1: 0, A2: 1, B1: 2, "B1+": 3, B2: 4, C1: 5, C2: 6 };
    const rest = order.slice(firstFree).map((v) => (v.cefr in RANK ? RANK[v.cefr] : 9));
    expect(rest.every((r, k) => k === 0 || rest[k - 1] <= r)).toBe(true);
    expect(rest[0]).toBe(0);
    expect(rest[rest.length - 1]).toBe(9);

    const ease = libraryOrder(VIDEOS, "easiest").map((v) => v.ease || 0);
    expect(ease.every((e, k) => k === 0 || ease[k - 1] >= e)).toBe(true);
    const up = libraryOrder(VIDEOS, "newest").map((v) => v.up || "");
    expect(up[0] > up[up.length - 1]).toBe(true);
    expect(up.every((u, k) => k === 0 || up[k - 1] >= u)).toBe(true);
    const dur = libraryOrder(VIDEOS, "shortest").map((v) => v.dur);
    expect(dur.every((d, k) => k === 0 || dur[k - 1] <= d)).toBe(true);
    // Every video carries an upload date, or "newest" would be a guess.
    expect(VIDEOS.every((v) => /^\d{8}$/.test(v.up))).toBe(true);
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
  /* Whose videos these are, said once (the owner, 2026-09-23): the first time
     the library opens, a note names every channel with where to support it,
     and "Got it" is what records it as seen. The list is the payload's, from
     data/curated/channels.json, so a channel with a Patreon has the button and
     one without does not. */
  it("names the creators the first time the library opens, and again on request", async () => {
    const { CHANNELS } = require("../src/data");
    expect(CHANNELS.length).toBe(7);
    expect(CHANNELS.filter((c) => c.patreon).length).toBeGreaterThanOrEqual(5);
    await withProfile(<Immerse navigation={nav} />);
    expect(await screen.findByTestId("creators-note")).toBeTruthy();
    for (const c of CHANNELS) expect(screen.getByTestId(`creator-${c.name}`)).toBeTruthy();
    expect(screen.getAllByText("Patreon").length).toBe(CHANNELS.filter((c) => c.patreon).length);
    await act(async () => { fireEvent.press(screen.getByText("Got it")); });
    expect(screen.queryByTestId("creators-note")).toBeNull();
    expect((await saved()).notices.immerse).toEqual(expect.any(Number));
    // And it is still reachable, from the foot of the list.
    await act(async () => { fireEvent.press(screen.getByTestId("creators-open")); });
    expect(screen.getByTestId("creators-note")).toBeTruthy();
  });

  it("does not repeat the note once it has been seen", async () => {
    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 20000 } });
    await screen.findByTestId("video-search");
    expect(screen.queryByTestId("creators-note")).toBeNull();
  });

  /* Favourites (the owner, 2026-09-23): a heart on the row and on the player,
     kept per profile, and a filter that shows only them. */
  it("marks a favorite from the row, filters to favorites, and keeps it on the player", async () => {
    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 1 } });
    await screen.findByTestId(`fave-${libraryVideo.id}`);
    await act(async () => { fireEvent.press(screen.getByTestId(`fave-${libraryVideo.id}`)); });
    expect((await saved()).faves[libraryVideo.id]).toEqual(expect.any(Number));
    await act(async () => { fireEvent.press(screen.getByTestId("video-filter")); });
    await act(async () => { fireEvent.press(screen.getByTestId("filter-faves")); });
    expect(screen.getByTestId(`video-${libraryVideo.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`video-${unitVideo.id}`)).toBeNull();
    // Off again from the same heart.
    await act(async () => { fireEvent.press(screen.getByTestId(`fave-${libraryVideo.id}`)); });
    expect((await saved()).faves[libraryVideo.id]).toBeUndefined();
    expect(screen.getByText("No favorites yet")).toBeTruthy();

    await flushState(); await AsyncStorage.clear();
    await withProfile(<Video route={{ params: { videoId: libraryVideo.id } }} navigation={nav} />,
                      { faves: { [libraryVideo.id]: 20000 } });
    const heart = await screen.findByTestId(`fave-${libraryVideo.id}`);
    expect(heart.props.accessibilityState.selected).toBe(true);
  });

  it("sorts from one small control", async () => {
    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 1 } });
    await screen.findByTestId("video-sort");
    expect(screen.getByTestId("video-sort").props.accessibilityLabel).toBe(
      `Sort: ${VIDEO_SORTS.find((s) => s.id === "level").name}`);
    await act(async () => { fireEvent.press(screen.getByTestId("video-sort")); });
    await act(async () => { fireEvent.press(screen.getByTestId("sort-newest")); });
    expect(screen.queryByTestId("sort-sheet")).toBeNull();
    expect(screen.getByTestId("video-sort").props.accessibilityLabel).toBe(
      `Sort: ${VIDEO_SORTS.find((s) => s.id === "newest").name}`);
    const first = libraryOrder(VIDEOS, "newest")[0];
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf(`video-${first.id}`)).toBeLessThan(tree.indexOf(`video-${libraryOrder(VIDEOS, "newest")[5].id}`));
  });

  /* The owner, 2026-09-28: *"Add a filter on the Immerse page where you can
     filter by channel (where it also prepopulates all the different channels
     in the database)."* Prepopulated off the videos, not off the curated
     credits file — a channel harvested but not credited, or credited but not
     harvested, would otherwise put a row on the sheet that matches nothing. */
  it("filters by channel, listing every channel the library holds", async () => {
    const real = channelsOf(VIDEOS);
    expect(real.length).toBeGreaterThan(1);
    // Every channel in the data is offered, and the counts add up to the library.
    expect(real.reduce((n, c) => n + c.count, 0)).toBe(VIDEOS.filter((v) => v.ch).length);

    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 1 } });
    await act(async () => { fireEvent.press(await screen.findByTestId("video-channel")); });
    for (const c of real) expect(screen.getByTestId(`channel-${c.name}`)).toBeTruthy();

    const one = real[0];
    await act(async () => { fireEvent.press(screen.getByTestId(`channel-${one.name}`)); });
    expect(screen.queryByTestId("channel-sheet")).toBeNull();
    expect(screen.getByTestId("video-channel").props.accessibilityLabel).toBe(`Channel: ${one.name}`);
    // Only that channel's rows are on the screen now.
    const shown = VIDEOS.filter((v) => screen.queryByTestId(`video-${v.id}`));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((v) => v.ch === one.name)).toBe(true);

    await act(async () => { fireEvent.press(screen.getByTestId("video-channel")); });
    await act(async () => { fireEvent.press(screen.getByTestId("channel-all")); });
    expect(screen.getByTestId("video-channel").props.accessibilityLabel).toBe("Channel: All channels");
  });

  /* The three filters are one control (ui.js Dropdown), and there is no tally
     of how much is watched (the owner, 2026-09-28). */
  it("offers three drop-downs of one shape, and no watched count", async () => {
    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 1 } });
    for (const id of ["video-filter", "video-channel", "video-sort"]) {
      expect((await screen.findByTestId(id)).props.accessibilityRole).toBe("button");
    }
    expect(screen.queryByText(new RegExp(`of ${VIDEOS.length} watched`))).toBeNull();
  });

  it("lists the library, filters as you type, and opens a video", async () => {
    await withProfile(<Immerse navigation={nav} />, { notices: { immerse: 1 } });
    await screen.findByTestId("video-search");
    // Each row carries the video's YouTube thumbnail.
    const first = libraryOrder(VIDEOS)[0];
    expect(screen.getByTestId(`thumb-${first.id}`).props.source.uri).toContain(first.id);
    const input = screen.getByTestId("video-search");
    await act(async () => { fireEvent.changeText(input, "xyzzy-nothing"); });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    await act(async () => { fireEvent.changeText(input, ""); });
    await act(async () => { fireEvent.press(screen.getAllByText(first.title.split(" | ")[0].trim())[0]); });
    // A row opens the video's summary first (the owner, 2026-10-06).
    expect(nav.navigate).toHaveBeenCalledWith("VideoSummary", { videoId: first.id });
  });
});

describe("Video", () => {
  /* The video page is the player and the transcript (the owner, 2026-10-05);
     what the video holds is its summary, before it. */
  it("lists only spoken words for a unit's episode, on its summary", async () => {
    const unit = unitById(unitVideo.unit);
    const v = videoFor({ unitId: unit.id, index: 0 });
    const heard = Object.keys(unit.v.heard);
    expect(Object.keys(v.words).slice(0, heard.length)).toEqual(heard);
    await withProfile(<Video route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />);
    await screen.findByTestId("yt-player");
    // The video page itself holds no word list.
    expect(screen.queryByTestId("prep")).toBeNull();
    await flushState(); await AsyncStorage.clear();
    await withProfile(<VideoSummary route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />);
    await screen.findByTestId("prep");
    // One row per word, keyed by the bare form: the row itself shows the headword
    // as written, stress mark and all, which no plain text match would find (§23).
    for (const w of heard) expect(screen.getByTestId(`prep-${w}`)).toBeTruthy();
    // Each word carries its meaning beside it (the owner, 2026-09-10).
    const { L, idxOfWord } = require("../src/data");
    const meaning = firstSense(L[idxOfWord(heard[0])]);
    expect(meaning && screen.getAllByText(meaning).length).toBeTruthy();
    // No unit word the episode does not say is on the screen.
    const silent = unit.w.map((i) => L[i].b).filter((b) => !unit.v.heard[b]);
    for (const b of silent.slice(0, 5)) expect(screen.queryByTestId(`prep-${b}`)).toBeNull();
    // No player here, so no arrow to a moment.
    expect(screen.queryByTestId(`heard-${heard[0]}`)).toBeNull();
  });

  /* The list grouped (verbs, nouns…), each word underlined for the
     dictionary, the learner's score beside it, and the whole list as a round
     of flashcards. */
  it("groups the list, scores each word, and hands it to the flashcards", async () => {
    const { L, idxOfWord } = require("../src/data");
    const { clusterWords } = require("../src/prep");
    const unit = unitById(unitVideo.unit);
    const heard = Object.keys(unit.v.heard);
    const known = heard[0];
    await withProfile(<VideoSummary route={{ params: { unitId: unit.id, index: 0 } }} navigation={nav} />, {
      v: 10,
      seen: { [known]: { recognise: { state: 2, s: 20, d: 5, steps: 0, reps: 4, lapses: 0,
                                      dueAt: 9e12, lastAt: Date.now() - 86400000 } } },
    });
    await screen.findByTestId("prep");
    // Clusters by section, every word in exactly one. A group is a textbook
    // block and may mix parts of speech (заказать with the café words), so a
    // section is mostly — not only — its own kind of word.
    const clusters = clusterWords(heard);
    expect(clusters.reduce((n, c) => n + c.words.length, 0)).toBe(heard.length);
    const kindOf = (p) => (p === "verb" ? "verb" : p === "noun" ? "noun"
      : p === "adjective" || p === "adverb" ? "describing" : "little");
    for (const c of clusters) {
      expect(screen.getByTestId(`cluster-${c.id}`)).toBeTruthy();
      // A verb, noun or describing word is under its own heading, whatever
      // its group (2026-10-04: adjectives were listed under "Nouns").
      for (const w of c.words) {
        const k = kindOf(L[idxOfWord(w)].p);
        if (k !== "little") expect(k).toBe(c.id);
      }
    }
    // A word studied carries its score; one never met says so.
    expect(screen.getByTestId(`prep-score-${known}`)).toBeTruthy();
    expect(screen.getByTestId(`prep-new-${heard[1]}`)).toBeTruthy();
    expect(screen.getByTestId("prep-met").props.children).toBe(`1 of ${heard.length} met`);
    // The whole list goes to the flashcards as one round.
    await act(async () => { fireEvent.press(screen.getByTestId("prep-cards")); });
    // …with the video's own sentences after the words (2026-09-29).
    const { videoLines } = require("../src/data");
    const lines = videoLines(unit).map((l) => l.ru);
    expect(lines.length).toBeGreaterThan(0);
    // …and the round ends on the way back to the summary.
    const { short } = require("../src/video");
    expect(nav.navigate).toHaveBeenCalledWith("ListCards", { round: "list", words: heard.concat(lines),
                                                             title: short(unitVideo.title), after: "Back to the summary" });
    expect(screen.getByTestId("prep-lines")).toBeTruthy();
  });

  /* From a dictionary entry (the owner, 2026-09-08): the entry lists the videos
     that say the word with the moment, and opening one lands on that moment
     with the word in focus and the player up. */
  it("lists where a word is heard on its entry, and opens the player at the moment", async () => {
    const { heardIn } = require("../src/data");
    const WordScreen = require("../src/screens/Word").default;
    const word = Object.keys(libraryVideo.words)[0];
    const rows = heardIn(word);
    expect(rows.some((r) => r.id === libraryVideo.id)).toBe(true);
    for (const r of rows) expect(typeof r.t).toBe("number");
    expect(heardIn("xyzzy")).toEqual([]);

    await withProfile(<WordScreen route={{ params: { word } }} navigation={nav} />);
    expect(await screen.findByText(`Heard in · ${rows.length}`)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("heard-toggle")); });   // closed until asked
    const first = rows[0];
    await act(async () => { fireEvent.press(screen.getAllByText(first.title.split(" | ")[0].trim())[0]); });
    expect(nav.navigate).toHaveBeenCalledWith("Video", { videoId: first.id, word, at: first.t });

    await flushState(); await AsyncStorage.clear();
    await withProfile(<Video route={{ params: { videoId: first.id, word, at: first.t } }} navigation={nav} />);
    // The player is up without "Play", with the moment and "Add to review".
    expect(await screen.findByTestId("yt-player")).toBeTruthy();
    expect(screen.queryByText("Play")).toBeNull();
    expect(screen.getByTestId("video-focus")).toBeTruthy();
    expect(screen.getByTestId("mine")).toBeTruthy();
  });

  /* Watched shows on the row and the library filters by it (the owner,
     2026-09-19: "make it more obvious once a video has been completed"). */
  it("marks a watched row and filters the library by watched or not", async () => {
    await withProfile(<Immerse navigation={nav} />, { watched: { [libraryVideo.id]: 20000 }, notices: { immerse: 1 } });
    expect(await screen.findByTestId(`watched-${libraryVideo.id}`)).toBeTruthy();
    const show = async (id) => {
      await act(async () => { fireEvent.press(screen.getByTestId("video-filter")); });
      await act(async () => { fireEvent.press(screen.getByTestId(`filter-${id}`)); });
    };
    await show("watched");
    expect(await screen.findByTestId(`video-${libraryVideo.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`video-${unitVideo.id}`)).toBeNull();
    await show("unwatched");
    expect(await screen.findByTestId(`video-${unitVideo.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`video-${libraryVideo.id}`)).toBeNull();
  });

  /* The summary comes first and its button opens the video (the owner,
     2026-10-06: "summary -> video -> questions… update the text from
     continue to watch video"). */
  it("the summary's Watch video opens the player", async () => {
    await withProfile(<VideoSummary route={{ params: { videoId: libraryVideo.id } }} navigation={nav} />);
    const watch = await screen.findByTestId("summary-continue");
    expect(screen.getByText("Watch video")).toBeTruthy();
    await act(async () => { fireEvent.press(watch); });
    expect(nav.navigate).toHaveBeenCalledWith("Video", expect.objectContaining({ videoId: libraryVideo.id, viaSummary: true }));
  });

  /* Continue marks the video watched; a unit's episode counts for its unit
     too. It goes on to the questions where the video has them, and back past
     the video (and the summary it came through) where it has none. */
  it("Continue records the video as watched and goes on to its questions", async () => {
    const withQuiz = VIDEOS.find((v) => v.quiz && v.quiz.length);
    const without = VIDEOS.find((v) => !v.quiz);
    const n = { ...nav, pop: jest.fn() };
    if (withQuiz) {
      await withProfile(<Video route={{ params: { videoId: withQuiz.id, viaSummary: true } }} navigation={n} />);
      await act(async () => { fireEvent.press(await screen.findByTestId("video-continue")); });
      expect(typeof (await saved()).watched[withQuiz.id]).toBe("number");
      expect(n.navigate).toHaveBeenCalledWith("VideoQuiz", expect.objectContaining({ videoId: withQuiz.id, depth: 3 }));
      await flushState(); await AsyncStorage.clear();
    }
    if (without) {
      await withProfile(<Video route={{ params: { videoId: without.id, viaSummary: true } }} navigation={n} />);
      await act(async () => { fireEvent.press(await screen.findByTestId("video-continue")); });
      expect(n.pop).toHaveBeenCalledWith(2);
      await flushState(); await AsyncStorage.clear();
      // Opened straight from a word's moment, only the video is behind.
      await withProfile(<Video route={{ params: { videoId: without.id } }} navigation={n} />);
      await act(async () => { fireEvent.press(await screen.findByTestId("video-continue")); });
      expect(n.pop).toHaveBeenLastCalledWith(1);
      await flushState(); await AsyncStorage.clear();
    }
    await withProfile(<Video route={{ params: { unitId: unitVideo.unit, index: 0 } }} navigation={n} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("video-continue")); });
    const st = await saved();
    expect(st.unit[unitVideo.unit].video).toBe(true);
    expect(typeof st.watched[unitVideo.id]).toBe("number");
  });
});

/* The video's questions (tools/build_video_quiz.mjs): the right answer was
   written first and is shuffled; a run keeps its best and goes back. */
describe("the video's questions", () => {
  const quiz = [["Who joins the host?", ["Her friend", "Her sister", "Her teacher", "Her cat"], 5000]];
  it("shuffles each question's options and keeps one right answer", () => {
    const { videoQuizSteps } = require("../src/flows/VideoQuiz");
    const seen = new Set();
    for (let k = 0; k < 40; k++) {
      const [q] = videoQuizSteps({ quiz });
      expect(q.kind).toBe("video");
      expect(q.options.filter((o) => o.right).map((o) => o.label)).toEqual(["Her friend"]);
      seen.add(q.options.findIndex((o) => o.right));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the transcript", () => {
  it("is on the video page from the start, with its English", async () => {
    await withProfile(<Video route={{ params: { videoId: libraryVideo.id } }} navigation={nav} />);
    expect(await screen.findByTestId("transcript")).toBeTruthy();
    expect(screen.getByTestId("transcript-line-0")).toBeTruthy();
    expect(screen.queryByTestId("transcript-toggle")).toBeNull();
    const en = require("../src/data").transcriptEnOf(libraryVideo.id);
    if (en && en[0]) expect(screen.getByTestId("transcript-en-0")).toBeTruthy();
  });
});

/* Maximised (the owner, 2026-10-04: "small translucent buttons in the corners
   of a maximized screen"): the same player fills the screen sideways with the
   transport over it, and Back or the corner button bring it back. */
describe("full screen", () => {
  it("keeps the player, turns the screen, puts the controls over the picture, and comes back", async () => {
    const setOptions = jest.fn();
    const parentOptions = jest.fn();
    const n = { ...nav, setOptions, getParent: () => ({ setOptions: parentOptions }) };
    await withProfile(<Video route={{ params: { videoId: libraryVideo.id } }} navigation={n} />);
    const before = await screen.findByTestId("yt-player");
    expect(screen.getByTestId("video-pinned")).toBeTruthy();

    // The overlay is over the picture before maximising too (2026-10-05).
    expect(screen.getByTestId("video-overlay")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("video-maximise")); });
    expect(screen.getByTestId("video-full")).toBeTruthy();
    expect(screen.getByTestId("video-overlay")).toBeTruthy();
    for (const id of ["overlay-back5", "overlay-toggle", "overlay-fwd5", "overlay-slower", "overlay-faster", "overlay-exit"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // The same player, not a second one: a remount would reload the video.
    expect(screen.getByTestId("yt-player")).toBe(before);
    // Free to turn: upright, the transcript fills the lower half.
    expect(global.__orientation).toBe("any");
    expect(screen.getByTestId("video-half-script")).toBeTruthy();
    expect(setOptions).toHaveBeenCalledWith({ headerShown: false });
    // The tab bar is the run rule's (fullscreen.js), never set from here: an
    // option set on the parent outlives full screen and unstyles the bar.
    expect(parentOptions).not.toHaveBeenCalled();
    const { hidesTabBar } = require("../src/fullscreen");
    expect(hidesTabBar("Video")).toBe(true);
    // The row under the player is gone; its buttons are over the picture.
    expect(screen.queryByTestId("video-controls")).toBeNull();

    await act(async () => { fireEvent.press(screen.getByTestId("overlay-exit")); });
    expect(screen.getByTestId("video-pinned")).toBeTruthy();
    expect(screen.queryByTestId("video-half-script")).toBeNull();
    expect(global.__orientation).toBe("portrait");
    expect(setOptions).toHaveBeenLastCalledWith({ headerShown: true });
    expect(parentOptions).not.toHaveBeenCalled();
  });
});

