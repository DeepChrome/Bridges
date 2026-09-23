/* The runner's question block: how big the prompt is, where it sits, and the
 * one case where it must not take the room.
 *
 * All three were flagged on the uncommitted change by the review that wrote
 * docs/PLAYBOOK.md (Phase 0.2), and the first was a real bug caught on the
 * emulator before it shipped: with `flexGrow: 1` on the question block, a
 * typed question with the keyboard up centred the prompt in the shrunken
 * window and put the input and Check below the fold. §20a: native has no
 * visual suite, so the layout contract is asserted in the render tree.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, promptSize, hasInput } from "../src/screens/Run";

const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));

const choice = {
  kind: "choose-en", ask: "Pick the word", prompt: "книга", cyr: true,
  options: [{ label: "book", right: true }, { label: "table" }, { label: "chair" }, { label: "lamp" }],
};
const typed = { kind: "type", ask: "Type it", prompt: "book", cyr: false, typed: true, target: "книга", answer: "книга" };
const heard = { kind: "hear", ask: "Type what you hear", prompt: "", say: "книга", target: "книга", answer: "книга",
                row: ["книга", "book", ["книга"], 0, "c"] };

/* The longest prompt any generator produces, measured over every lesson on
   2026-09-15 (tools/_scratch_phase0.mjs, since deleted): a 97-character cloze.
   The emulator cannot be steered to one particular random question, so the
   exact string is pinned here and the walkthrough photographs *a* long cloze. */
const LONGEST = "На встре́че прису́тствовал _____ генера́льный дире́ктор Междунаро́дной организа́ции по мигра́ции.";

async function withRunner(steps) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  return await render(
    <SessionProvider>
      <Runner steps={steps} onFinish={jest.fn()} gradeWords={false} />
    </SessionProvider>
  );
}

/* The Option's Pressable resolves its style function before the host View sees
   it, so its alignment is readable by walking out of the label. */
function optionBox(label) {
  let node = screen.getByText(label);
  while (node) {
    const s = flat(node.props.style);
    if (s.minHeight === 54) return s;
    node = node.parent;
  }
  throw new Error(`no option around “${label}”`);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); jest.clearAllMocks(); });
afterEach(async () => { await flushState(); });

describe("which questions open a keyboard", () => {
  it("is every typed drill, the typed word, and hearing a sentence", () => {
    expect(hasInput(typed)).toBe(true);
    expect(hasInput(heard)).toBe(true);
    expect(hasInput({ kind: "cases", typed: true })).toBe(true);
    expect(hasInput({ kind: "form", typed: true })).toBe(true);
  });
  it("and none of the ones answered by choosing or speaking", () => {
    for (const kind of ["choose-en", "choose-ru", "cloze", "listen", "cases", "form",
                        "stress", "scene", "say", "shadow", "match"]) {
      expect(hasInput({ kind })).toBe(false);
    }
  });
});

describe("where the question block sits", () => {
  it("takes the slack above four options", async () => {
    await withRunner([choice]);
    await screen.findByText("book");
    expect(flat(screen.getByTestId("question-block").props.style).flexGrow).toBe(1);
  });

  /* The bug: with the keyboard up the window shrinks, a growing block centres
     itself in what is left, and the input and Check are below the fold. */
  it("does not take it above a text input, so the keyboard cannot hide the answer", async () => {
    await withRunner([typed]);
    await screen.findByTestId("type-input");
    expect(flat(screen.getByTestId("question-block").props.style).flexGrow).toBe(0);
  });
});

describe("how big the prompt is", () => {
  it("is sized by length, never bigger for a longer prompt, within 19 to 44", () => {
    const sizes = [];
    for (let n = 1; n <= 120; n++) {
      const s = promptSize({ cyr: true, prompt: "а".repeat(n) });
      expect(s).toBeGreaterThanOrEqual(19);
      expect(s).toBeLessThanOrEqual(44);
      sizes.push(s);
    }
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    // An English prompt is read at a glance; the Russian is what is worth looking at.
    expect(promptSize({ cyr: false, prompt: "book" })).toBeLessThan(promptSize({ cyr: true, prompt: "книга" }));
  });

  /* 44 px for a word, not the review's suggested ceiling of 28: «в» at 28 is
     the "smallest thing on the screen" the change exists to fix. The widest
     eleven-letter Russian word at 44 px measures about 290 px against the 358
     available, so the top size cannot overflow. */
  it("gives a single word the full size and a sentence the smallest", () => {
    expect(promptSize({ cyr: true, prompt: "в" })).toBe(44);
    expect(promptSize({ cyr: true, prompt: "здравствуйте" })).toBe(34);
    expect(promptSize({ cyr: true, prompt: LONGEST })).toBe(22);
  });

  it("renders the longest cloze the app can produce at the smallest size", async () => {
    const cloze = { kind: "cloze", ask: "Fill the gap", prompt: LONGEST, cyr: true,
                    options: [{ label: "новый", right: true }, { label: "новая" },
                              { label: "новое" }, { label: "новые" }] };
    await withRunner([cloze]);
    const prompt = await screen.findByText(LONGEST);
    const s = flat(prompt.props.style);
    expect(s.fontSize).toBe(22);
    expect(s.lineHeight).toBe(30);
    // And the options are still there beneath it.
    expect(screen.getByText("новые")).toBeTruthy();
  });
});

describe("how the options are aligned", () => {
  it("centres short labels", async () => {
    await withRunner([choice]);
    await screen.findByText("book");
    expect(optionBox("book").alignItems).toBe("center");
  });

  /* Centring only happens when every label is eighteen characters or fewer,
     and eighteen at 16 px is about 160 px in a 326 px box — it cannot wrap. So
     a centred two-line label cannot occur; a sentence starts at the left. */
  it("left-aligns the set as soon as one label is a sentence", async () => {
    const long = { ...choice, options: choice.options.concat().map((o, i) =>
      (i === 1 ? { label: "the book that was on the table" } : o)) };
    await withRunner([long]);
    await screen.findByText("book");
    expect(optionBox("book").alignItems).toBe("flex-start");
    expect(optionBox("the book that was on the table").alignItems).toBe("flex-start");
  });
});
