/* The grammar reference, and the bulb that opens it (2026-09-27).
 *
 * The owner: *"there's no clear mechanism for communicating hard vs soft
 * stems, rules, when to use genitive"*, and *"for any of the drills or live
 * conversations… make sure there's a lightbulb available… it doesn't reveal
 * the answer, but it reveals the reference for the different verb forms."*
 *
 * Two things are worth a test and neither is visible in a screenshot: that the
 * bulb is absent exactly where the reference would *be* the answer, and that
 * the screen it opens is registered on the stack the question is running in
 * (§23 — a route not on the stack is a dead button and nothing throws).
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFileSync } from "fs";
import { join } from "path";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, referenceFor } from "../src/screens/Run";
import Grammar from "../src/screens/Grammar";
import { sentences } from "../src/ui";
import { hasReference } from "../src/rules";
import { Q } from "../src/questions";
import { UN } from "../src/data";
import { TOPICS } from "@core/grammar";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => {} };

async function withProfile(el) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  return await render(<SessionProvider>{el}</SessionProvider>);
}

const drill = (type) => {
  for (let k = 0; k < 40; k++) {
    const q = Q.drillQuestions(type, 1, null, null, false)[0];
    if (q) return q;
  }
  return null;
};

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); nav.navigate.mockClear(); });
afterEach(async () => { await flushState(); });

describe("the grammar reference", () => {
  it("lists every topic and opens one as a screen of its own", async () => {
    const push = jest.fn();
    await withProfile(<Grammar route={{ params: {} }} navigation={{ ...nav, push }} />);
    for (const topic of TOPICS) {
      expect(await screen.findByText(topic.title)).toBeTruthy();
    }
    /* A push, not a change of state inside this screen, or Back skips the
       list (2026-09-28 — backnav.test.js has the rest of that contract). */
    await act(async () => { fireEvent.press(screen.getByTestId("topic-stems")); });
    expect(push).toHaveBeenCalledWith("Grammar", { topic: "stems" });
  });

  it("draws a topic", async () => {
    await withProfile(<Grammar route={{ params: { topic: "stems" } }} navigation={nav} />);
    // The topic the course never taught at all, which is why it is first to check.
    expect(await screen.findByText("Two of every vowel")).toBeTruthy();
    expect(screen.getByTestId("topics-back")).toBeTruthy();
  });

  /* One page per case (the owner, 2026-10-03: "break the page for cases into
     sub categories one per case rather than throwing it all on one page"). */
  it("lists the six cases as pages, each opening on its own", async () => {
    const push = jest.fn();
    await withProfile(<Grammar route={{ params: { topic: "cases" } }} navigation={{ ...nav, push }} />);
    expect(await screen.findByText("The six cases")).toBeTruthy();
    for (const c of ["Nominative", "Accusative", "Genitive", "Dative", "Instrumental", "Prepositional"]) {
      expect(screen.getByTestId(`page-${c}`)).toBeTruthy();
    }
    // The cases' own lists are on their pages, not here.
    expect(screen.queryByText("After нет — the thing that is missing")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("page-Genitive")); });
    expect(push).toHaveBeenCalledWith("Grammar", { topic: "cases", section: "Genitive" });
  });

  it("draws one case as a page, with the case before and after", async () => {
    const replace = jest.fn();
    await withProfile(<Grammar route={{ params: { topic: "cases", section: "Genitive" } }}
                               navigation={{ ...nav, replace }} />);
    /* "When do I use the genitive" is the question this exists to answer, and
       the answer is a list rather than a paragraph. */
    expect(await screen.findByText("After нет — the thing that is missing")).toBeTruthy();
    expect(screen.getByTestId("page-prev")).toHaveTextContent(/Accusative/);
    await act(async () => { fireEvent.press(screen.getByTestId("page-next")); });
    expect(replace).toHaveBeenCalledWith("Grammar", { topic: "cases", section: "Dative" });
  });

  /* In the order the course teaches it (the owner, 2026-11-06: "in an order
     that makes sense"), under the chapter that does — read off the route. */
  it("lists the topics in teaching order, under the chapters that teach them", async () => {
    await withProfile(<Grammar route={{ params: {} }} navigation={nav} />);
    const first = await screen.findByTestId("grammar-chapter-1");
    expect(within(first).getByTestId("topic-first")).toBeTruthy();
    expect(within(first).getByTestId("topic-gender")).toBeTruthy();
    // The cases sit with the chapter that opens them, after the present tense.
    const cases = screen.getByTestId("grammar-chapter-5");
    expect(within(cases).getByTestId("topic-cases")).toBeTruthy();
    expect(within(screen.getByTestId("grammar-chapter-2")).getByTestId("topic-verbs")).toBeTruthy();
  });

  /* "Examples that show the differences": two lines that differ in the one
     thing, the words that differ drawn apart and each line labelled. */
  it("draws a contrast with the differing words marked, and a table with its endings set apart", async () => {
    await withProfile(<Grammar route={{ params: { topic: "cases", section: "Genitive" } }}
                               navigation={{ ...nav, replace: jest.fn() }} />);
    const pair = await screen.findByTestId("contrast-0");
    const marked = within(pair).getAllByTestId("linked-own").map((n) => n.props.children);
    expect(marked).toEqual(expect.arrayContaining(["есть", "брат", "нет", "бра́та"]));
    expect(marked).not.toContain("меня́");
    expect(within(pair).getAllByTestId("contrast-label").map((n) => n.props.children))
      .toEqual(["have: dictionary form", "have not: genitive"]);
    // The genitive's own endings, coloured apart from the stem.
    expect(screen.getAllByTestId("table-ending").map((n) => n.props.children)).toEqual(
      expect.arrayContaining(["а́", "ы", "и"]));
  });

  it("draws the course's own card rather than restating it", async () => {
    await withProfile(<Grammar route={{ params: { topic: "gender" } }} />);
    const core3 = UN.find((u) => u.id === "core3");
    expect(await screen.findByTestId("card-core3")).toBeTruthy();
    expect(screen.getByText(core3.g.title)).toBeTruthy();
  });
});

describe("the bulb", () => {
  /* The owner reversed the blanking on 2026-09-28: *"Remove that filtering…
     everything should be referenceable. This isn't a quiz for grade."* So the
     answer being *present* is the contract now, and it is the thing to pin —
     it was deliberately absent for a day and would come back the moment
     anybody reads the old §30ay. */
  it("shows the answer rather than hiding it", async () => {
    for (const type of ["cases", "conjugation", "agreement"]) {
      const q = drill(type);
      if (!q || !q.table) continue;
      const right = q.options.find((o) => o.right).label;
      const view = await withProfile(
        <Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
      await screen.findByText(q.ask);
      const before = screen.queryAllByText(right).length;
      await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
      // The table now prints it too, so it is on the screen more than it was.
      expect(screen.queryAllByText(right).length).toBeGreaterThan(before);
      expect(screen.queryAllByTestId("table-blank").length).toBe(0);
      view.unmount();
    }
  });

  it("marks the cell the question is asking for", async () => {
    const q = drill("cases");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    const asked = screen.getByTestId("table-asked");
    const right = q.options.find((o) => o.right).label;
    // The marked cell is the answer's own, and it reads as the answer.
    expect(within(asked).getByText(right)).toBeTruthy();
  });

  /* Every drill, not the four whose answer was safe to show: *"All drills you
     must be able to reference the proper guide."* */
  it("is on every kind of question that has a word", () => {
    for (const kind of ["type", "stress", "listen", "cloze", "choose-ru", "choose-en",
                        "aspect", "cases", "conjugation", "agreement", "form"]) {
      const ref = referenceFor({ kind, i: 0, cyr: true, prompt: "x" });
      expect(hasReference(ref)).toBe(true);
    }
    // …and nothing to offer where there is no word at all, rather than an
    // empty sheet: a sentence step carries no `i`.
    expect(hasReference(referenceFor({ kind: "hear", prompt: "x" }))).toBe(false);
  });

  /* The chart and nothing else (the owner, 2026-10-08: "Remove random grammar
     tips from the hint area… The rest is too busy"). */
  it("shows the word's tables and no facts, rule card or topic link", async () => {
    const q = drill("conjugation");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    expect(screen.getByTestId("table-asked")).toBeTruthy();
    for (const id of ["ref-facts", "ref-rule", "ref-topic"]) expect(screen.queryByTestId(id)).toBeNull();
  });
});

/* A route that is not on the stack the screen is running in does nothing at
   all — no error, no screen (§23). The bulb is offered inside a quiz on the
   Learn stack and inside a drill on Practice, so Grammar has to be on both.
   routes.test.js reads every navigate in the app; this names the one that
   would be silently dead. */
describe("the Grammar route", () => {
  const APP = readFileSync(join(__dirname, "..", "App.js"), "utf8");
  const stackOf = (name) => {
    const m = APP.match(new RegExp(`function ${name}Stack\\(\\)[\\s\\S]*?\\n}`));
    return m ? m[0] : "";
  };
  it("is registered wherever a bulb can be pressed", () => {
    for (const s of ["Learn", "Practice"]) {
      expect(stackOf(s)).toContain('name="Grammar"');
    }
  });
});

describe("a note is its sentences", () => {
  it("puts each on its own line", () => {
    expect(sentences("One thing. Then another thing.")).toEqual(
      ["One thing.", "Then another thing."]);
  });
  it("keeps a fragment with the sentence before it", () => {
    // An abbreviation or a decimal would otherwise split a line in two.
    expect(sentences("It costs 1.5 roubles.").length).toBe(1);
  });
  it("is nothing when there is nothing", () => {
    expect(sentences("")).toEqual([]);
    expect(sentences(null)).toEqual([]);
  });
});
