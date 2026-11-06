/* The partial hint (the owner, 2026-11-06): "anywhere where there are hints,
 * there should also be some sort of partial hint… Each time the partial hint
 * is pressed, maybe the user gets another letter or syllable", and on the
 * flashcard's front "one letter at a time".
 *
 * In a run it starts a form at its root and counts as help — the answer is
 * graded Hard at best, as the bulb's reference is (§30az). On a flashcard it
 * costs nothing: the learner grades the card.
 *
 * Own file, per the timeout note in screens.test.js.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import Study, { frontAnswer } from "../src/screens/Study";
import { L, exactIdx, sensesOf } from "../src/data";
import { DAY, REVIEW, gradeFor } from "@core/scheduler";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const VERB = exactIdx("знать");
const conj = {
  kind: "conjugation", ask: "Write the ты form", prompt: "знать", sub: "to know", cyr: true,
  typed: true, target: "зна́ешь", answer: "зна́ешь", alts: [], i: VERB,
};
const wi = L.findIndex((w) => w.t && w.t.length);
const chosen = {
  kind: "choose-en", ask: "Pick the meaning", prompt: L[wi].w, cyr: true, i: wi,
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};

async function profile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, streak: 0, ...state }));
}
const press = async (id) => act(async () => { fireEvent.press(screen.getByTestId(id)); });

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("in a run", () => {
  it("opens a form on its root, adds a letter a press, and goes once the answer is whole", async () => {
    expect(VERB).toBeGreaterThanOrEqual(0);
    await profile();
    await render(<SessionProvider><Runner steps={[conj]} onFinish={jest.fn()} gradeWords={false} /></SessionProvider>);
    await screen.findByTestId("partial-hint");
    expect(screen.queryByTestId("partial-hint-text")).toBeNull();
    await press("partial-hint");
    expect(screen.getByTestId("partial-hint-text").props.children).toBe("зна́___");
    await press("partial-hint");
    expect(screen.getByTestId("partial-hint-text").props.children).toBe("зна́е__");
    await press("partial-hint");
    await press("partial-hint");
    expect(screen.getByTestId("partial-hint-text").props.children).toBe("зна́ешь");
    // The whole answer given: nothing more to press.
    expect(screen.queryByTestId("partial-hint")).toBeNull();
  });

  it("counts as help: a right answer after it is graded Hard, not Good", async () => {
    await profile();
    await render(<SessionProvider><Runner steps={[chosen]} onFinish={jest.fn()} /></SessionProvider>);
    await press("partial-hint");
    expect(screen.getByTestId("partial-hint-text").props.children).toBe("b___");
    await act(async () => { fireEvent.press(screen.getByText("book")); });
    await screen.findByTestId("verdict");
    // The hint line goes with the question: the verdict says the answer.
    expect(screen.queryByTestId("partial-hint-text")).toBeNull();
    await flushState();
    const log = await global.__db.log("p1");
    expect(log).toHaveLength(1);
    expect(log[0].grade).toBe(gradeFor(true, true));
    expect(log[0].grade).not.toBe(gradeFor(true, false));
  });

  it("offers none where there is no single answer to give away a piece of", async () => {
    await profile();
    const stress = { kind: "stress", ask: "Where is the stress?", prompt: "", cyr: true, i: wi,
                     options: [{ label: "ру́ки", right: true }, { label: "руки́" }] };
    await render(<SessionProvider><Runner steps={[stress]} onFinish={jest.fn()} gradeWords={false} /></SessionProvider>);
    await screen.findByText("ру́ки");
    expect(screen.queryByTestId("partial-hint")).toBeNull();
  });
});

describe("on a flashcard's front", () => {
  const WORD = "город";
  const due = () => ({ dueAt: Date.now() - DAY, lastAt: Date.now() - 2 * DAY, s: 1, d: 5, state: REVIEW,
                       steps: 0, reps: 2, lapses: 0 });

  it("gives the meaning a letter at a time, and is gone once turned", async () => {
    await profile({ seen: { [WORD]: { recognise: due() } }, flash: ["recognise"], newPerDay: 0,
                    cardKinds: ["words"], learnAhead: 20 });
    await render(<SessionProvider><Study navigation={nav} /></SessionProvider>);
    await global.__startStudy();
    await screen.findByText("Show");
    const answer = frontAnswer(L[exactIdx(WORD)], "recognise", sensesOf(exactIdx(WORD)));
    expect(answer.length).toBeGreaterThan(1);
    await press("card-hint");
    expect(screen.getByTestId("card-hint-text").props.children).toMatch(new RegExp(`^${answer[0]}_`));
    await press("card-hint");
    expect(screen.getByTestId("card-hint-text").props.children.startsWith(answer.slice(0, 2))).toBe(true);
    // A flashcard grades itself: the hint writes nothing.
    await flushState();
    expect(await global.__db.log("p1")).toEqual([]);
    await act(async () => { fireEvent.press(screen.getByText("Show")); });
    expect(screen.queryByTestId("card-hint")).toBeNull();
  });

  it("hides the Russian on an English front", () => {
    const face = { w: "го́род", b: "город", e: "city; town" };
    expect(frontAnswer(face, "produce", null)).toBe("го́род");
    expect(frontAnswer(face, "recognise", null)).toBe("city");
    expect(frontAnswer({ ...face, sentence: true, e: "The city is big." }, "recognise", null)).toBe("The city is big.");
  });
});
