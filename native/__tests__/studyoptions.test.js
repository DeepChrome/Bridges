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
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react-native";
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
  // Schema 10 with no new-card source, so the pile is exactly the cards seeded.
  v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
  flash: ["recognise"], newPerDay: 5, reviewsPerDay: 200, learnAhead: 20,
};
async function withProfile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  const view = await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
  await global.__startStudy();
  return view;
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
  /* No caption naming the front (the owner, 2026-10-05: "Doesn't have to say
     Russian or English at the top of the card"): the front itself shows it. */
  it("shows a listen card as its speaker, with no caption", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["listen"] });
    expect(await screen.findByTestId("card-listen")).toBeTruthy();
    expect(screen.queryByTestId("card-kind")).toBeNull();
  });

  it("shows a produce card in English, with no caption", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["produce"] });
    await screen.findByText("Show");
    expect(screen.queryByTestId("card-kind")).toBeNull();
    expect(screen.queryByText("Meaning")).toBeNull();
  });

  it("flags a new card", async () => {
    await withProfile({ seen: { [WORD]: { recognise: fresh() } }, sets: ["__due__"] });
    await screen.findByText("Show");
    expect(screen.getByTestId("flag-new")).toBeTruthy();
    expect(screen.queryByTestId("flag-trouble")).toBeNull();
  });

  /* A troubled card does not say so (2026-09-29, the owner: "the user doesn't
     need to be reminded"); it is in the bank, not on the card. */
  it("does not flag a troubled card", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due({ lapses: 4, reps: 12, s: 0.3 }) } } });
    await screen.findByText("Show");
    expect(screen.queryByTestId("flag-trouble")).toBeNull();
    expect(screen.queryByTestId("flag-new")).toBeNull();
  });

  /* The familiarity ring (2026-09-23): the card's own stability as a number
     and a colour, red through amber to green. A new card has the New flag and
     no number — two marks for one fact would be one too many. */
  it("shows how well a card is held, coloured from red to green", async () => {
    const { familiarityColor } = require("../src/screens/Study");
    const { light } = require("../src/theme");
    /* Five days held is partway whatever the word — a common word is mastered
       at three weeks and a rare one at three months (2026-09-28) — so the
       number sits in the middle either way. */
    await withProfile({ seen: { [WORD]: { recognise: due({ s: 5 }) } } });
    await screen.findByText("Show");
    await act(async () => { fireEvent.press(screen.getByText("Show")); });   // the back carries it
    const score = Number((await screen.findByTestId("familiarity-score")).props.children);
    expect(score).toBeGreaterThan(30);
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
    const { troubleWords } = require("../src/screens/Study");
    expect(troubleWords(st)).toContain(WORD);
    expect(troubleWords({ ...st, pinned: [] })).not.toContain(WORD);
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

  /* Both languages on the back, the starting side on top and the larger
     (the owner, 2026-10-03). */
  it("puts both sides on the back, the side it started from first and larger", async () => {
    const size = (node) => [].concat(node.props.style).filter(Boolean)
      .reduce((n, s) => (s.fontSize ? s.fontSize : n), 0);
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["produce"] });
    await screen.findByTestId("card-produce");
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    const meaning = await screen.findByTestId("card-meaning-front");
    const russian = screen.getByTestId("card-russian");
    const ru = within(russian).getAllByText(isWord)[0];
    expect(size(meaning)).toBeGreaterThan(size(ru));
  });

  it("a recognise card's back keeps the Russian on top, with the meaning under it", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, flash: ["recognise"] });
    await act(async () => { fireEvent.press(await screen.findByText("Show")); });
    expect(within(await screen.findByTestId("card-russian")).getAllByText(isWord).length).toBeGreaterThan(0);
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
    fireEvent.press(await screen.findByTestId("study-cog"));
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
    fireEvent.press(await screen.findByTestId("study-cog"));
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
    await screen.findByText("Show");
    expect(sessionFor({ ...base, seen, sets: ["__due__"], flash: ["recognise", "produce"] })
      .items.map((i) => i.word)).toEqual([WORD]);

    const one = { ...base, seen, sets: ["__due__"], flash: ["produce"] };
    expect(sessionFor(one).items.map((i) => i.direction)).toEqual(["produce"]);
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
    fireEvent.press(await screen.findByTestId("study-cog"));
    const minus = await screen.findByTestId("new-per-day-minus");
    expect(minus.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { fireEvent.changeText(screen.getByTestId("new-per-day-value"), "-4"); });
    await act(async () => { fireEvent(screen.getByTestId("new-per-day-value"), "blur"); });
    expect((await saved()).newPerDay).toBe(4);
  });
});

/* The day is done when the pile is; what is offered after it is the learner's
   (the owner, 2026-09-28: "after the user sufficiently studies for the day,
   they can have the option to review more trouble words"). */
/* Audio once per card (the owner, 2026-09-29: "the card audio goes off each
   time the card flips… not necessary"; "when I select the settings… it
   re-initiated the audio each time"). */
describe("the card reads itself once", () => {
  it("does not read again when the card is turned back and forth", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } } });
    await screen.findByTestId("card-recognise");
    const first = global.__players.length + global.__spoke.length;
    expect(first).toBe(1);
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("card-turn")); });
    await act(async () => { fireEvent.press(screen.getByTestId("card-turn")); });
    expect(global.__players.length + global.__spoke.length).toBe(first);
  });

  it("deals nothing new while the options are open, and reads nothing under the finger", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } } });
    await screen.findByTestId("card-recognise");
    const first = global.__players.length + global.__spoke.length;
    await act(async () => { fireEvent.press(screen.getByTestId("study-cog")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("flash-produce")); });
    await act(async () => { fireEvent.press(screen.getByTestId("flash-listen")); });
    expect(global.__players.length + global.__spoke.length).toBe(first);
  });

  /* The score is about the card's history; on the back only (2026-09-29). */
  it("shows the familiarity score on the back, not the front", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due({ s: 5 }) } } });
    await screen.findByTestId("card-recognise");
    expect(screen.queryByTestId("familiarity")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    expect(await screen.findByTestId("familiarity")).toBeTruthy();
  });
});

/* The day's goal (2026-10-05): the number is what the learner fights to 0. */
const goalOf = (owed, done = 0) => ({ day: require("@core/scheduler").dayOf(now), owed, done });

describe("after the day's pile", () => {
  it("offers a round of trouble words, which deals them though none is due", async () => {
    // Trouble: answered a dozen times and still scoring under 20 (scheduler.js).
    const bad = due({ dueAt: now + 5 * DAY, lapses: 5, reps: 12, d: 9.5, s: 0.3 });
    await withProfile({ seen: { [WORD]: { recognise: bad } }, goal: goalOf(0) });
    expect((await screen.findByTestId("study-state")).props.children).toBe("Daily goal met");
    await act(async () => { fireEvent.press(screen.getByTestId("trouble-round")); });
    expect(await screen.findByTestId("card-recognise")).toBeTruthy();
    expect(screen.getByTestId("study-heading").props.children).toBe("Trouble words");
  });

  /* Everything due is dealt toward the goal — including a card whose word
     folds onto another lemma («всё» → «все»), which the pile once looked up
     under the other word's schedule and never dealt (2026-09-29). */
  it("deals what is due toward the goal", () => {
    const st = { ...base, sets: [], cardKinds: ["words"], goal: goalOf(2),
                 seen: { "всё": { recognise: due() }, [WORD]: { recognise: due() } } };
    const s = sessionFor(st);
    expect(s.items.map((x) => x.word).sort()).toEqual(["всё", WORD].sort());
  });

  /* The goal is the stop: met, the pile deals nothing more, and "Keep going"
     deals on past it. */
  it("stops at the goal, and keeps going when asked", () => {
    const st = { ...base, sets: [], cardKinds: ["words"], goal: goalOf(0, 20),
                 seen: { "всё": { recognise: due() }, [WORD]: { recognise: due() } } };
    expect(dueCount(st)).toBe(0);
    expect(sessionFor(st).items).toHaveLength(0);
    expect(sessionFor(st, { beyond: true }).items.map((x) => x.word).sort()).toEqual(["всё", WORD].sort());
  });

  /* The badge is the goal, never the due count: eighty due is still a day's
     goal of 20 plus the new-word setting (it read 38 all day, 2026-10-05). */
  it("badges the day's goal, not everything due", () => {
    const { goalPerDay } = require("@core/queue");
    const seen = {};
    for (const b of L.slice(0, 80).map((x) => x.b)) seen[b] = { recognise: due() };
    const st = { ...base, sets: [], cardKinds: ["words"], seen };
    expect(dueCount(st)).toBe(goalPerDay(base.newPerDay));
  });

  it("offers a round of known words, least held first", async () => {
    const { knownWords } = require("../src/screens/Study");
    const later = (s) => due({ dueAt: now + 5 * DAY, s });
    const st = { seen: { "да": { recognise: later(30) }, "нет": { recognise: later(2) },
                         [WORD]: { recognise: fresh() } }, cardKinds: ["words"], learnAhead: 20 };
    expect(knownWords(st)).toEqual(["нет", "да"]);
    await withProfile({ seen: { "да": st.seen["да"], "нет": st.seen["нет"] }, goal: goalOf(0) });
    expect((await screen.findByTestId("study-state")).props.children).toBe("Daily goal met");
    await act(async () => { fireEvent.press(screen.getByTestId("known-round")); });
    expect(await screen.findByTestId("card-recognise")).toBeTruthy();
    expect(screen.getByTestId("study-heading").props.children).toBe("Known words");
  });

  /* The end of the day's work is said as a goal met, with the ways to go on. */
  it("says the daily goal is met, and offers keep going, trouble words or new words", async () => {
    await withProfile({ seen: { [WORD]: { recognise: due() } }, sets: ["__path__"], newPerDay: 0, goal: goalOf(1) });
    await screen.findByTestId("card-recognise");
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    await act(async () => { fireEvent.press(screen.getByTestId("grade-3")); });
    expect((await screen.findByTestId("study-state")).props.children).toBe("Daily goal met");
    expect(screen.getByTestId("study-today").props.children).toBe("1 card today");
    expect(screen.getByTestId("keep-going")).toBeTruthy();
    // New words, ahead of the day's ration.
    await act(async () => { fireEvent.press(screen.getByTestId("study-ahead")); });
    expect(await screen.findByTestId("flag-new")).toBeTruthy();
  });
});

/* Each visit opens on the options (the owner, 2026-10-05: "Each time the
   person clicks study, they'll encounter the options… The default will be
   their personal review"). */
describe("the options first", () => {
  it("shows the day's number and the personal review before any card", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, sets: ["__path__"],
      seen: { [WORD]: { recognise: due() } }, goal: goalOf(7) }));
    await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
    expect((await screen.findByTestId("study-goal")).props.children).toBe("7");
    expect(screen.queryByTestId("card-recognise")).toBeNull();
    expect(screen.getByTestId("study-go")).toHaveTextContent("Personal review");
    await act(async () => { fireEvent.press(screen.getByTestId("study-go")); });
    expect(await screen.findByTestId("card-recognise")).toBeTruthy();
  });
});

describe("the card's voice", () => {
  it("prefers the recording", async () => {
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
