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
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFileSync } from "fs";
import { join } from "path";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, referenceFor } from "../src/screens/Run";
import Grammar from "../src/screens/Grammar";
import { sentences } from "../src/ui";
import { Reference } from "../src/rules";
import { Q } from "../src/questions";
import { L, UN } from "../src/data";
import { TOPICS } from "@core/grammar";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => {} };

async function withProfile(el) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  return await render(<SessionProvider>{el}</SessionProvider>);
}

/* A stand-in paradigm, so the two directed checks below do not depend on which
   word a generator happened to draw. */
const TABLE = { title: "Declension", columns: ["", "Singular"], rows: [["Nominative", "кни́га"]] };

/* What the runner hands the sheet, without mounting a runner to get it. */
const refProps = (q) => {
  const r = referenceFor(q);
  return { title: r.word ? r.word.w : null, tables: r.tables, blank: r.blank,
           hide: r.hide, note: r.note, topic: r.topic };
};

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
  it("lists every topic and opens one", async () => {
    await withProfile(<Grammar route={{ params: {} }} />);
    for (const topic of TOPICS) {
      expect(await screen.findByText(topic.title)).toBeTruthy();
    }
    await act(async () => { fireEvent.press(screen.getByTestId("topic-stems")); });
    // The topic the course never taught at all, which is why it is first to check.
    expect(screen.getByText("Two of every vowel")).toBeTruthy();
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
  it("is there on a question whose answer is a cell of a table", async () => {
    const q = drill("cases");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    expect(screen.getByTestId("bulb")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    // More than one cell may be blanked: a paradigm repeats itself, and every
    // cell holding the answer goes, not only the one asked for.
    expect(screen.queryAllByTestId("table-blank").length).toBeGreaterThan(0);
  });

  /* The claim the whole feature rests on: "it doesn't reveal the answer".
     Blanking by position alone did not hold it — a verb's three tables are
     shown together and a paradigm repeats itself — so the sheet is checked
     against the answer over many real draws rather than one. */
  it("never prints the answer anywhere in the sheet", async () => {
    for (const type of ["cases", "conjugation", "agreement"]) {
      for (let k = 0; k < 12; k++) {
        const q = drill(type);
        if (!q || !q.table) continue;
        const right = q.options.find((o) => o.right).label;
        const view = await withProfile(
          <Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
        await screen.findByText(q.ask);
        // The option buttons carry it; count them, then open the sheet and
        // check the number has not gone up.
        const before = screen.queryAllByText(right).length;
        await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
        expect(screen.queryAllByText(right).length).toBe(before);
        expect(screen.queryAllByTestId("table-blank").length).toBeGreaterThan(0);
        view.unmount();
      }
    }
  });

  /* The two ways it leaked, aimed at rather than sampled for (§23: a check
     that only fails on the right draw is a check that gets committed over).
     Both were found by the sweep above and both are constructed here, so they
     fail whatever the draw. */
  it("drops a rule example that contains the answer", async () => {
    const q = {
      kind: "cases", i: 0, cyr: true, prompt: "тест", table: TABLE, at: [0, 1],
      options: [{ label: "кни́ги", right: true }, { label: "кни́гу", right: false }],
      note: { title: "A rule", body: "One sentence.",
              examples: [["Вот кни́ги.", "Here are the books."],
                         ["Э́то дом.", "This is a house."]] },
    };
    await withProfile(<Reference {...refProps(q)} onClose={jest.fn()} onTopic={jest.fn()} />);
    expect(await screen.findByText("This is a house.")).toBeTruthy();
    expect(screen.queryByText("Here are the books.")).toBeNull();
  });

  it("drops the headword as a title when the headword is the answer", async () => {
    const w = L[0];
    const q = {
      kind: "agreement", i: 0, cyr: true, prompt: "___ x", table: TABLE, at: [0, 1],
      options: [{ label: w.w, right: true }, { label: "другое", right: false }],
    };
    const props = refProps(q);
    expect(props.hide).toBe(w.w);
    await withProfile(<Reference {...props} onClose={jest.fn()} onTopic={jest.fn()} />);
    await screen.findByText("Got it");
    expect(screen.queryAllByText(w.w).length).toBe(0);
  });

  it("leads to the topic behind the question", async () => {
    const q = drill("conjugation");
    await withProfile(<Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} navigation={nav} />);
    await screen.findByText(q.ask);
    await act(async () => { fireEvent.press(screen.getByTestId("bulb")); });
    await act(async () => { fireEvent.press(screen.getByTestId("ref-topic")); });
    expect(nav.navigate).toHaveBeenCalledWith("Grammar", { topic: "verbs" });
  });

  /* The rule the whole feature rests on. Where the Russian word is what the
     learner has to produce, its paradigm *is* the answer — so there is no
     bulb at all, rather than a bulb that gives the game away. */
  it("shows no paradigm where the word is the answer", () => {
    for (const kind of ["type", "stress", "listen", "cloze", "choose-ru", "hear", "say"]) {
      const ref = referenceFor({ kind, i: 0, cyr: true, prompt: "x" });
      expect(ref.tables).toEqual([]);
      expect(ref.costs).toBe(false);
    }
  });

  it("costs the grade only when it shows the answer's own table", () => {
    const q = drill("cases");
    expect(referenceFor(q).costs).toBe(true);
    // The aspect drill asks for a different lemma, so the verb's own paradigm
    // cannot contain the answer and reading it is free.
    const aspect = drill("aspect");
    if (aspect) expect(referenceFor(aspect).costs).toBe(false);
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
