/* Why a wrong answer was wrong (2026-09-26): the Worker's two lines under the
 * verdict, the miss kept in the profile for the tutor, and the rule card that
 * appears **only when no explanation comes**.
 *
 * The owner asked for the explanation ("AI feedback on incorrect answers") and
 * then, seeing it on his phone beside the chapter's grammar card: *"now that we
 * enabled the AI feedback on incorrect answers, we dont need all the extra
 * static verbiage for anywhere that is getting AI feedback."* So the two never
 * show together, which is what most of this file pins.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, missOf, MISSES_KEPT } from "../src/screens/Run";
import { splitMarked } from "../src/ui";
import { forgetToken } from "../src/lib/feedback";

const URL_KEY = "EXPO_PUBLIC_FEEDBACK_URL";
const chosen = {
  kind: "choose-en", ask: "Pick the word", prompt: "книга", cyr: true,
  note: { title: "Nouns", body: "Russian nouns carry gender." },
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};
const typed = {
  kind: "cases", ask: "Write genitive singular", prompt: "книга", sub: "book", cyr: true,
  typed: true, answer: "книги", target: "книги", alts: [],
};

async function withRunner(steps, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 9, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, streak: 0, ...state }));
  return await render(
    <SessionProvider><Runner steps={steps} onFinish={jest.fn()} gradeWords={false} /></SessionProvider>,
  );
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }
const answers = (body) => {
  global.fetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => body }));
};

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); await forgetToken(); jest.clearAllMocks();
  global.fetch = jest.fn();
  process.env[URL_KEY] = "https://w.example";
  process.env.EXPO_PUBLIC_APP_TOKEN = "tok";
});
afterEach(async () => {
  await flushState();
  delete process.env[URL_KEY];
  delete process.env.EXPO_PUBLIC_APP_TOKEN;
});

test("a wrong option asks why, shows both lines, and drops the static rule card", async () => {
  answers({ ok: true, why: "«книга» is a book.", yours: "«стол» is a table." });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });

  await screen.findByTestId("why");
  expect(screen.getByTestId("why-line")).toHaveTextContent("книга is a book.");
  expect(screen.getByTestId("why-yours")).toHaveTextContent("стол is a table.");
  // The whole point of the change: the chapter's card is not shown as well.
  expect(screen.queryByTestId("rule-note")).toBeNull();
  expect(screen.queryByText("Russian nouns carry gender.")).toBeNull();

  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/v1\/explain$/);
  expect(sent).toEqual({ kind: "choose-en", ask: "Pick the word", prompt: "книга", sub: null,
                         answer: "book", said: "table", rule: "Nouns" });
  // …and the miss is in the profile, for the tutor.
  const st = await saved();
  expect(st.misses).toHaveLength(1);
  expect(st.misses[0]).toMatchObject({ kind: "choose-en", prompt: "книга", answer: "book", said: "table" });
});

test("a reply with nothing to say about the learner's answer shows one line", async () => {
  answers({ ok: true, why: "Genitive after «нет».", yours: "" });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("why");
  expect(screen.queryByTestId("why-yours")).toBeNull();
  expect(screen.queryByTestId("why-rule-open")).toBeNull();     // no rule, no box
});

/* The reference behind the correction: a box, not another paragraph (the
   owner, 2026-09-26: "the user can click a box and get a little hint on the
   rules to address the thing being drilled"). */
test("the rule is behind a tap, and opening it shows the pattern", async () => {
  answers({ ok: true, why: "Genitive after «нет».", yours: "",
            rule: "«нет» always takes the genitive: «нет времени»." });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("why");
  // Closed by default: two short lines stay two short lines.
  expect(screen.queryByTestId("why-rule")).toBeNull();
  await act(async () => { fireEvent.press(screen.getByTestId("why-rule-open")); });
  expect(screen.getByTestId("why-rule")).toHaveTextContent(/always takes the genitive/);
  expect(screen.queryByTestId("why-rule-open")).toBeNull();
});

test("a typed miss sends what was written", async () => {
  answers({ ok: true, why: "Genitive singular of «книга» is «книги».", yours: "" });
  await withRunner([typed]);
  const input = await screen.findByTestId("type-input");
  fireEvent.changeText(input, "книгу");
  await waitFor(() => expect(input.props.value).toBe("книгу"));
  await act(async () => { fireEvent.press(screen.getByText("Check")); });
  await screen.findByTestId("why");
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(sent.said).toBe("книгу");
  expect(sent.answer).toBe("книги");
  expect(sent.kind).toBe("cases");
});

test("a right answer asks nothing and records nothing", async () => {
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("book")); });
  await screen.findByTestId("verdict");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByTestId("why")).toBeNull();
  expect(screen.queryByTestId("rule-note")).toBeNull();      // right needs no lecture either
  expect(((await saved()).misses || [])).toEqual([]);
});

/* The three ways an explanation does not arrive, and the rule card is the
   fallback for all of them — it is not gone, it is second choice. */
test("the setting off falls back to the rule card, and the miss is still kept", async () => {
  await withRunner([chosen], { explain: false });
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("verdict");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByTestId("why-pending")).toBeNull();
  expect(screen.getByTestId("rule-note")).toBeTruthy();
  expect((await saved()).misses).toHaveLength(1);
});

test("a failure falls back to the rule card rather than leaving the verdict bare", async () => {
  global.fetch.mockImplementation(async () => { throw new Error("offline"); });
  await withRunner([chosen]);
  await act(async () => { fireEvent.press(await screen.findByText("table")); });
  await screen.findByTestId("verdict");
  await waitFor(() => expect(screen.queryByTestId("why-pending")).toBeNull());
  expect(screen.queryByTestId("why")).toBeNull();
  expect(screen.getByTestId("rule-note")).toBeTruthy();
});

test("misses are shaped for the tutor and capped", () => {
  const m = missOf(chosen, "table");
  expect(m).toMatchObject({ kind: "choose-en", prompt: "книга", answer: "book", said: "table" });
  expect(missOf(typed, null).said).toBeNull();
  expect(MISSES_KEPT).toBe(30);
});

/* The formatting rule the whole redesign rests on: the Russian is the loud
   part, whether or not the model remembered its guillemets. */
describe("Marked", () => {
  it("sets «guillemet» content apart and drops the marks", () => {
    expect(splitMarked("Use «книгу», the accusative.")).toEqual([
      { text: "Use " }, { text: "книгу", mark: true }, { text: ", the accusative." },
    ]);
  });

  it("falls back to the Cyrillic runs when the model forgot them", () => {
    expect(splitMarked("Use книгу here")).toEqual([
      { text: "Use " }, { text: "книгу", mark: true }, { text: " here" },
    ]);
    // A stressed form and a hyphenated word are each one run.
    expect(splitMarked("кни́гу").map((p) => p.mark)).toEqual([true]);
    expect(splitMarked("что-то").map((p) => p.text)).toEqual(["что-то"]);
  });

  it("leaves English alone and survives nothing at all", () => {
    expect(splitMarked("Nothing Russian here")).toEqual([{ text: "Nothing Russian here" }]);
    expect(splitMarked("")).toEqual([]);
    expect(splitMarked(null)).toEqual([]);
    expect(splitMarked(undefined)).toEqual([]);
  });

  /* Guillemets win where both are present: the model said which part matters. */
  it("marks only what was quoted when anything was quoted", () => {
    const parts = splitMarked("«нет» governs книги");
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(["нет"]);
  });
});
