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
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study, { flagsFor, FRONTS, sessionFor, newCardRank } from "../src/screens/Study";
import { L, dueCount } from "../src/data";
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
  v: 9, seen: {}, trouble: {}, pinned: [], sets: ["__due__"], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
  flash: ["recognise"], newPerDay: 5, reviewsPerDay: 200, learnAhead: 20,
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
  /* The front is the learner's choice (`flash`), and the one card is asked
     through it (2026-09-23). */
  it("captions a listen card, whose front is otherwise only a speaker", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["listen"] });
    expect((await screen.findByTestId("card-kind")).props.children).toBe("Listen");
    expect(screen.getByTestId("card-listen")).toBeTruthy();
  });

  it("captions a produce card, which opens in English", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["produce"] });
    expect((await screen.findByTestId("card-kind")).props.children).toBe("Meaning");
  });

  it("flags a new card", async () => {
    await withProfile({ seen: { [WORD]: { recognise: fresh() } }, sets: ["__due__"] });
    await screen.findByTestId("card-kind");
    expect(screen.getByTestId("flag-new")).toBeTruthy();
    expect(screen.queryByTestId("flag-trouble")).toBeNull();
  });

  /* Trouble is judged only once a card has been seen enough (2026-09-24): a
     card lapsing three times in ten answers is; four lapses on a card seen
     twice is a card that is still being learned. */
  it("flags a troubled card, and not an untroubled one", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due({ lapses: 4, reps: 12 }) } } });
    await screen.findByTestId("card-kind");
    expect(screen.getByTestId("flag-trouble")).toBeTruthy();
    expect(screen.queryByTestId("flag-new")).toBeNull();
  });

  /* The familiarity ring (2026-09-23): the card's own stability as a number
     and a colour, red through amber to green. A new card has the New flag and
     no number — two marks for one fact would be one too many. */
  it("shows how well a card is held, coloured from red to green", async () => {
    const { familiarityColor } = require("../src/screens/Study");
    const { light } = require("../src/theme");
    await withProfile({ seen: { [WORD]: { recognise: due({ s: 30 }) } } });
    await screen.findByTestId("card-kind");
    const score = Number(screen.getByTestId("familiarity-score").props.children);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(70);
    // The ends of the scale are the audited tokens; the middle is the amber one.
    expect(familiarityColor(0, light)).toBe(light.bad.toUpperCase());
    expect(familiarityColor(50, light)).toBe(light.warn.toUpperCase());
    expect(familiarityColor(100, light)).toBe(light.good.toUpperCase());
    expect(familiarityColor(25, light)).not.toBe(familiarityColor(75, light));
  });

  it("gives a new card no score, only the flag", async () => {
    await withProfile({ seen: { [WORD]: { recognise: fresh() } }, sets: ["__due__"] });
    await screen.findByTestId("flag-new");
    expect(screen.queryByTestId("familiarity")).toBeNull();
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
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["produce"] });
    await screen.findByTestId("card-produce");
    expect(screen.queryAllByText(isWord)).toHaveLength(0);
    fireEvent.press(screen.getByText("Show"));
    expect((await screen.findAllByText(isWord)).length).toBeGreaterThan(0);
  });

  it("a listen card shows no Russian until it is turned", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["listen"] });
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

  /* A number, stepped or typed, rather than four fixed chips (the owner,
     2026-09-22). The chips could not say 7, and the value a learner wants is
     usually not one of four. */
  it("defaults new words to five a day, and takes any number", async () => {
    expect(QUEUE_DEFAULTS.newPerDay).toBe(5);
    await withProfile({ sets: [], newPerDay: undefined });
    fireEvent.press(await screen.findByText("Choose what to review"));
    expect((await screen.findByTestId("new-per-day-value")).props.value).toBe("5");

    await act(async () => { fireEvent.press(screen.getByTestId("new-per-day-plus")); });
    expect((await saved()).newPerDay).toBe(6);
    await act(async () => { fireEvent.press(screen.getByTestId("new-per-day-minus")); });
    expect((await saved()).newPerDay).toBe(5);

    // Typed, and committed when the field is left — not on every keystroke,
    // or clearing it to retype would commit a 0 and deal no new cards.
    await act(async () => { fireEvent.changeText(screen.getByTestId("new-per-day-value"), "12"); });
    await act(async () => { fireEvent(screen.getByTestId("new-per-day-value"), "blur"); });
    expect((await saved()).newPerDay).toBe(12);
  });

  /* **A front chooses how the card is asked, not which cards exist** (the
     owner, 2026-09-23: a word is one card; "one way, both ways, or audio
     only"). Ticking a second front does not double the pile, unticking one
     drops nothing, and the badge counts words. */
  it("asks the one card through the ticked front, and a second front does not double the pile", async () => {
    const seen = { [WORD]: { recognise: due() } };
    await withProfile({ seen, sets: ["__due__"], flash: ["recognise", "produce"] });
    await screen.findByTestId("card-kind");
    expect(sessionFor({ ...base, seen, sets: ["__due__"], flash: ["recognise", "produce"] })
      .items.map((i) => i.word)).toEqual([WORD]);
    expect(dueCount({ ...base, seen, flash: ["recognise", "produce"] })).toBe(1);

    const one = { ...base, seen, sets: ["__due__"], flash: ["produce"] };
    expect(sessionFor(one).items.map((i) => i.direction)).toEqual(["produce"]);
    expect(dueCount(one)).toBe(1);
    // The default front is the Russian.
    const { DEFAULTS } = require("../src/store");
    expect(DEFAULTS.flash).toEqual(["recognise"]);
  });

  /* Commonest first. `fresh` used to be shuffled, so a beginner's opening
     cards were a uniform sample of everything ticked — which is how the owner
     met «воспользоваться» ("to avail oneself") among his first. */
  it("deals the commonest new words first", async () => {
    const rare = L[3500] ? L[3500].b : L[L.length - 1].b;
    const common = L[3].b;
    const st = { ...base, seen: {}, sets: [], decks: [{ id: "k1", name: "d", cards: [
      { ru: rare, en: "" }, { ru: common, en: "" }] }], newPerDay: 1, flash: ["recognise"] };
    st.sets = ["deck:k1"];
    expect(sessionFor(st).items.map((i) => i.word)).toEqual([common]);
    expect(newCardRank(common)).toBeLessThan(newCardRank(rare));
    // A word the curriculum does not carry sorts after it, not before.
    expect(newCardRank("qqqq")).toBeGreaterThan(newCardRank(rare));
  });

  /* It never goes below nothing, whatever the finger does. */
  it("clamps the new-word ration rather than letting it go negative", async () => {
    await withProfile({ sets: [], newPerDay: 0 });
    fireEvent.press(await screen.findByText("Choose what to review"));
    const minus = await screen.findByTestId("new-per-day-minus");
    expect(minus.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { fireEvent.changeText(screen.getByTestId("new-per-day-value"), "-4"); });
    await act(async () => { fireEvent(screen.getByTestId("new-per-day-value"), "blur"); });
    expect((await saved()).newPerDay).toBe(4);
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
