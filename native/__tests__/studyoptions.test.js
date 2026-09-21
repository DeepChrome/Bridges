/* The flashcards' options and flags (§30ai), from the owner's report of
 * 2026-09-17: "Sometimes the flash cards are blank on the front side… sometimes
 * the card starts in English… What I'd like to see is options before starting
 * where you can pick to have the front in English or Russian… Make sure if we
 * do this, the card does not give the answer on the front side."
 *
 * The blank card was the listen card (a speaker and nothing else) and the
 * English one the produce card; both are the three directions doing their job
 * with nothing on the card saying which. What is asserted here is that the card
 * now says, that the front never carries the answer, and that the controls are
 * where a session starts.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study, { flagsFor, FRONTS } from "../src/screens/Study";
import { hasRealAudio, refreshVoices } from "../src/audio";
import { act } from "@testing-library/react-native";
import { DAY, REVIEW, NEW } from "@core/scheduler";
import { QUEUE_DEFAULTS } from "@core/queue";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const now = Date.now();
const WORD = "город";
/* The headword is drawn with its stress mark («го́род»), so it is matched with
   the accent allowed after any letter (§23). Until 2026-09-20 the exact string
   matched anyway — the vocabulary card's one-word "example" «город — town»,
   which the examples no longer carry — and the test passed for the wrong reason. */
const isWord = new RegExp("^" + WORD.split("").map((c) => c + "́?").join("") + "$");
const due = (extra = {}) => ({ dueAt: now - DAY, lastAt: now - 2 * DAY, s: 1, d: 5, state: REVIEW,
                              steps: 0, reps: 2, lapses: 0, ...extra });
const fresh = () => ({ dueAt: now, s: 0, d: 0, state: NEW, steps: 0, reps: 0, lapses: 0 });

const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: ["__due__"], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
  flash: ["recognise", "produce", "listen"], newPerDay: 5, reviewsPerDay: 200, learnAhead: 20,
};
async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  global.__players = []; global.__spoke = []; global.__spokeOpts = [];
});
afterEach(async () => { await flushState(); });

describe("the card says what it is", () => {
  it("captions a listen card, whose front is otherwise only a speaker", async () => {
    await withProfile({ seen: { [WORD]: { listen: due() } } });
    expect((await screen.findByTestId("card-kind")).props.children).toBe("Listen");
    expect(screen.getByTestId("card-listen")).toBeTruthy();
  });

  it("captions a produce card, which opens in English", async () => {
    await withProfile({ seen: { [WORD]: { produce: due() } } });
    expect((await screen.findByTestId("card-kind")).props.children).toBe("Meaning");
  });

  it("flags a new card", async () => {
    await withProfile({ seen: { [WORD]: { recognise: fresh() } }, sets: ["__due__"] });
    await screen.findByTestId("card-kind");
    expect(screen.getByTestId("flag-new")).toBeTruthy();
    expect(screen.queryByTestId("flag-trouble")).toBeNull();
  });

  it("flags a troubled card, and not an untroubled one", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due({ lapses: 4 }) } } });
    await screen.findByTestId("card-kind");
    expect(screen.getByTestId("flag-trouble")).toBeTruthy();
    expect(screen.queryByTestId("flag-new")).toBeNull();
  });

  it("counts a pinned word as trouble", () => {
    const st = { ...base, seen: { [WORD]: { recognise: due() } }, pinned: [WORD] };
    expect(flagsFor(st, { word: WORD, direction: "recognise", kind: "review" }).trouble).toBe(true);
    expect(flagsFor({ ...st, pinned: [] }, { word: WORD, direction: "recognise", kind: "review" }).trouble).toBe(false);
  });
});

/* The owner's condition on the whole feature. */
describe("the front never carries the answer", () => {
  it("a produce card shows no Russian until it is turned", async () => {
    await withProfile({ seen: { [WORD]: { produce: due() } } });
    await screen.findByTestId("card-produce");
    expect(screen.queryAllByText(isWord)).toHaveLength(0);
    fireEvent.press(screen.getByText("Show"));
    expect((await screen.findAllByText(isWord)).length).toBeGreaterThan(0);
  });

  it("a listen card shows no Russian until it is turned", async () => {
    await withProfile({ seen: { [WORD]: { listen: due() } } });
    await screen.findByTestId("card-listen");
    expect(screen.queryAllByText(isWord)).toHaveLength(0);
    fireEvent.press(screen.getByText("Show"));
    expect((await screen.findAllByText(isWord)).length).toBeGreaterThan(0);
  });
});

describe("the options live where a session starts", () => {
  it("offers the three fronts, and keeps the last one ticked", async () => {
    await withProfile({ sets: [], flash: ["recognise"] });
    fireEvent.press(await screen.findByText("Choose what to review"));
    for (const [id] of FRONTS) expect(await screen.findByTestId(`flash-${id}`)).toBeTruthy();
    /* Each press inside `act`, so the save effect has run before the row is
       read back — a bare press followed by `saved()` reads the state as it was
       (anki.test.js drives the picker the same way). */
    const press = async (id) => { await act(async () => { fireEvent.press(screen.getByTestId(id)); }); };
    await press("flash-recognise");
    expect((await saved()).flash).toEqual(["recognise"]);
    await press("flash-produce");
    expect((await saved()).flash).toEqual(["recognise", "produce"]);
    await press("flash-recognise");
    expect((await saved()).flash).toEqual(["produce"]);
  });

  it("defaults new words to five a day, and takes a choice", async () => {
    expect(QUEUE_DEFAULTS.newPerDay).toBe(5);
    await withProfile({ sets: [], newPerDay: undefined });
    fireEvent.press(await screen.findByText("Choose what to review"));
    const choice = await screen.findByTestId("new-per-day");
    await act(async () => { fireEvent.press(within(choice).getByText("10")); });
    expect((await saved()).newPerDay).toBe(10);
  });
});

describe("one voice", () => {
  it("uses the phone's voice on a word that has a recording, and says so", async () => {
    expect(hasRealAudio(WORD)).toBe(true);
    /* The device voice exists only once the platform has been asked for its
       voices, which the app does at launch; a test has to do it before the
       card arrives or `speakTTS` has nothing to speak with (speaker.test.js
       primes it the same way). */
    await act(async () => { await refreshVoices(); });
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flashVoice: "device" });
    await screen.findByTestId("card-recognise");
    /* The front's Russian reads itself out on arrival; with "one voice" that
       is the device, not a player. */
    expect(global.__players).toHaveLength(0);
    expect(global.__spoke).toContain(WORD);
    /* And the speaker does not claim a recording it is not using. */
    expect(screen.getByTestId("speaker-tts")).toBeTruthy();
    expect(screen.queryByTestId("speaker-real")).toBeNull();
  });

  it("prefers the recording by default", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } } });
    await screen.findByTestId("card-recognise");
    expect(screen.getByTestId("speaker-real")).toBeTruthy();
  });

  /* The first card of a session has to read itself out like every other one.
     The autoplay effect keyed on `[at, shown]`, and dealing a fresh session
     leaves both at their initial values, so React never re-ran it: every card
     but the first was read aloud. A listen card first in the pile was a
     speaker button in silence — which is a blank card by any other name. */
  it("reads the first card of a session aloud", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } } });
    await screen.findByTestId("card-recognise");
    await waitFor(() => expect(global.__players.length).toBeGreaterThanOrEqual(1));
  });
});
