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

  it("opens straight at the topic the bulb asked for", async () => {
    await withProfile(<Grammar route={{ params: { topic: "cases" } }} />);
    expect(await screen.findByText("The six cases")).toBeTruthy();
    /* "When do I use the genitive" is the question this exists to answer, and
       the answer is a list rather than a paragraph. ("Genitive" itself is on
       the screen twice — as the section and as a row of the plural table —
       which is the reference doing its job.) */
    expect(screen.getByText("After нет — the thing that is missing")).toBeTruthy();
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

  it("carries the guide to the word, not only its table", async () => {
    const q = drill("conjugation");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    expect(screen.getByTestId("ref-facts")).toBeTruthy();
    // A verb always has at least its aspect and its conjugation to say.
    expect(referenceFor(q).facts.length).toBeGreaterThan(1);
  });

  it("leads to the topic behind the question", async () => {
    const q = drill("conjugation");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    await act(async () => { fireEvent.press(screen.getByTestId("ref-topic")); });
    expect(nav.navigate).toHaveBeenCalledWith("Grammar", { topic: "verbs" });
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
