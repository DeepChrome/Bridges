/* The owner's batch of 2026-09-29: the built-in explanation of a miss,
 * irregular words flagged and drilled, settings that explain themselves, a
 * changeable picture, and the plan. Own file, per the timeout note in
 * screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import You, { PictureSection } from "../src/screens/You";
import WordScreen from "../src/screens/Word";
import { WordList } from "../src/lesson";
import { Q } from "../src/questions";
import { L, UN, irregularWords } from "../src/data";
import { isIrregular } from "@core/facts";
import { fold } from "@core/util";
import { PLANS } from "@core/plans";

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), setParams: jest.fn(),
              addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
const base = { v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, streak: 0,
               speech: { attempts: [], tagCounts: {} } };

async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "curls", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return render(<SessionProvider>{ui}</SessionProvider>);
}
const byBare = (b) => L.find((w) => fold(w.b) === b);

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("a miss without the model", () => {
  /* No Worker in this build: the miss still gets the answer's form, what
     decides it, and a link to the section that states the rule. */
  it("names the form, says why, and links the rule and the entry", async () => {
    let q = null;
    for (let k = 0; k < 40 && !q; k++) q = Q.drillQuestions("cases", 1, null, null, true)[0] || null;
    expect(q && q.table && q.at).toBeTruthy();
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />,
                      { explain: false });
    const input = await screen.findByTestId("type-input");
    fireEvent.changeText(input, "ааа");
    await waitFor(() => expect(input.props.value).toBe("ааа"));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByTestId("standard-why")).toBeTruthy();
    expect(screen.getByTestId("standard-why-what")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("standard-why-rule")); });
    expect(nav.navigate).toHaveBeenCalledWith("Grammar", expect.objectContaining({ topic: expect.any(String),
                                                                                  section: expect.any(String) }));
  });
});

describe("words that break the rules", () => {
  it("are flagged on the entry", async () => {
    await withProfile(<WordScreen route={{ params: { word: "хотеть" } }} navigation={nav} />);
    expect(await screen.findByTestId("word-irregular")).toBeTruthy();
  });

  it("are not flagged where the rules hold", async () => {
    await withProfile(<WordScreen route={{ params: { word: "читать" } }} navigation={nav} />);
    await screen.findByTestId("word-status");
    expect(screen.queryByTestId("word-irregular")).toBeNull();
  });

  /* They were grouped under their own heading; since 2026-09-30 they carry a
     tag and stay with their group of related words (the owner: "Irregular
     verbs don't need their own section, just little tags"). */
  it("carry a tag in a lesson's word list, and keep their group", async () => {
    const unit = UN.find((u) => u.w.some((i) => isIrregular(L[i])) && u.w.some((i) => !isIrregular(L[i])));
    const odd = unit.w.find((i) => isIrregular(L[i]));
    await withProfile(<WordList unit={unit} words={unit.w.slice(0, 40)} at={0} total={3} />);
    expect(screen.queryByTestId("vocab-irregular")).toBeNull();
    expect(within(await screen.findByTestId(`new-${L[odd].b}`)).getByText("Irregular")).toBeTruthy();
  });

  it("is a list of related words together, in their own order", async () => {
    const unit = UN.find((u) => u.id === "nature");
    await withProfile(<WordList unit={unit} words={unit.w} at={0} total={3} />);
    const seasons = await screen.findByTestId("group-Seasons");
    const order = ["зима", "весна", "лето", "осень"].map((b) => within(seasons).getByTestId(`new-${b}`));
    expect(order.length).toBe(4);
    const all = within(seasons).getAllByTestId(/^new-/).map((n) => n.props.testID);
    expect(all).toEqual(["new-зима", "new-весна", "new-лето", "new-осень"]);
    expect(screen.getByTestId("vocab-cluster-noun")).toBeTruthy();
  });

  it("can be drilled on their own", () => {
    const odd = irregularWords();
    expect(odd.length).toBeGreaterThan(20);
    const qs = Q.drillQuestions("conjugation", 10, odd, null, true);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) expect(isIrregular(L[q.i])).toBe(true);
  });
});

/* Before the profile test: once a Settings Modal has been opened in this file,
   later renders here come up without their content (the Modal lingers in the
   test renderer), so this runs while the file is clean. */
describe("the picture", () => {
  it("opens the characters, and the one chosen is kept on the profile", async () => {
    await withProfile(<PictureSection />);
    await act(async () => { fireEvent.press(await screen.findByTestId("change-picture")); });
    const { AV } = require("@core/avatars");
    await act(async () => { fireEvent.press(await screen.findByLabelText(AV.nezha.name)); });
    const accounts = JSON.parse(await AsyncStorage.getItem("rb.accounts"));
    expect(accounts.list[0].avatar).toBe("nezha");
  });
});

/* One render for the profile's checks, in the order a learner would meet
   them. Split into several tests, every one after the first found a profile
   screen whose Settings would not open, so the screen is opened once. The
   sheet is a native Modal, and in the test renderer a Row press inside it
   does not redraw what it opens — so the picture is checked on its own
   below, outside the Modal, where it redraws as it does on the device. */
describe("a lesson's flashcards", () => {
  it("hands the lesson's words to Study as one round", async () => {
    const { LessonScreen } = require("../src/screens/Unit");
    const { UN, L, lessonWords, linesWith } = require("../src/data");
    await withProfile(<LessonScreen route={{ params: { unitId: UN[0].id, index: 0 } }} navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByTestId("lesson-cards")); });
    expect(nav.navigate).toHaveBeenCalledWith("ListCards", {
      round: "list", title: UN[0].name,
      // the lesson's words, then the video's sentences that use them
      words: lessonWords(UN[0], 0).map((x) => L[x].b).concat(linesWith(UN[0], lessonWords(UN[0], 0)).map((l) => l.ru)) });
  });
});

describe("the profile and its settings", () => {
  it("counts cards to review, keeps one scheduler setting and shows the plan", async () => {
    await withProfile(<You navigation={nav} />);
    // "cards to review" is the Study badge's number, and a tap goes there.
    await act(async () => { fireEvent.press(await screen.findByTestId("stat-due")); });
    expect(nav.navigate).toHaveBeenCalledWith("Study");

    // What the AI has left today is one row on the profile — the plan's name —
    // and the detail opens on a tap (2026-09-30). No Premium sales lines.
    expect((await screen.findByTestId("plan-name")).props.children).toBe("Free");
    expect(screen.queryByTestId("plan-conversation")).toBeNull();
    expect(screen.queryByText(new RegExp(`${PLANS.premium.conversation} Premium`))).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("plan")); });
    expect(await screen.findByTestId("plan-sheet")).toBeTruthy();
    expect(screen.getByTestId("plan-conversation")).toBeTruthy();
    // No Worker in the test build, so today's use is unknown and said as such.
    expect(screen.getAllByText("–").length).toBe(4);
    expect(screen.getByText(/^Renews at /)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("sheet-backdrop")); });
    expect(screen.queryByTestId("plan-sheet")).toBeNull();

    fireEvent.press(await screen.findByText("Settings"));
    // A scheduler setting says what it does, on a tap, and not before.
    // One scheduler setting left, new words a day (2026-09-29); reviews a day,
    // retention and learn-ahead are gone from the sheet.
    expect(await screen.findByTestId("settings-new-per-day")).toBeTruthy();
    for (const id of ["reviews-per-day", "retention", "learn-ahead"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId("change-picture")).toBeTruthy();
  });
});
