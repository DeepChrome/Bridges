/* Prose can be held and copied; controls cannot (ui.js NoSelect, 2026-10-13).
 *
 * On Android a selectable text takes the touch for itself, so a row or button
 * holding one stops pressing. The rule is therefore structural: a sentence,
 * a meaning or a note is selectable on its own and loses it inside a `Row`,
 * `Lift` or `Chip`. And what the AI is told about a card is the card as the
 * screen numbers it (about.js cardAbout). */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { Row, Marked, Note, SenseList, Muted } from "../src/ui";
import { Linked, WordsProvider } from "../src/words";
import { cardAbout } from "../src/about";

const inWords = async (ui) => await render(<WordsProvider>{ui}</WordsProvider>);

describe("selecting text", () => {
  it("a sentence, a note and a meaning can be selected on their own", async () => {
    await inWords(
      <View>
        <Linked text="Я чита́ю кни́гу." testID="sentence" />
        <Marked text="«книгу» is the accusative." testID="marked" />
        <Note text="One. Two." testID="note" />
        <SenseList senses={[{ g: "person", x: [{ ru: "Он в теа́тре", en: "He is at the theater." }] }, { g: "mankind" }]} testID="senses" />
      </View>,
    );
    expect(screen.getByTestId("sentence").props.selectable).toBe(true);
    expect(screen.getByTestId("marked").props.selectable).toBe(true);
    expect(screen.getByTestId("sense-primary").props.selectable).toBe(true);
    // …and a sense example's English, which the emulator found left out (2026-10-13).
    expect(screen.getByText("He is at the theater.").props.selectable).toBe(true);
    // A word inside the sentence is still a link.
    expect(screen.getByLabelText("кни́гу, open word")).toBeTruthy();
  });

  it("…and not inside a row or a button, where a selection would take the press", async () => {
    await inWords(
      <View>
        <Row onPress={() => {}} testID="row">
          <Linked text="Я чита́ю." testID="in-row" />
          <Marked text="«книгу» here." testID="marked-in-row" />
        </Row>
        <Row testID="plain-row">
          <Linked text="Я чита́ю." testID="in-plain-row" />
        </Row>
      </View>,
    );
    expect(screen.getByTestId("in-row").props.selectable).toBe(false);
    expect(screen.getByTestId("marked-in-row").props.selectable).toBe(false);
    // A row with nothing to press is a place to put text, and text there selects.
    expect(screen.getByTestId("in-plain-row").props.selectable).toBe(true);
  });

  it("a caller can still say no", async () => {
    await inWords(<Linked text="Я чита́ю." testID="no" selectable={false} />);
    expect(screen.getByTestId("no").props.selectable).toBe(false);
    await render(<Muted testID="muted" selectable>a caption</Muted>);
    expect(screen.getByTestId("muted").props.selectable).toBe(true);
  });
});

describe("what the AI is told about a card", () => {
  it("is its meanings and examples, numbered as the screen shows them", async () => {
    const face = { b: "человек", w: "челове́к", e: "person", x: [
      { ru: "Мы — лю́ди.", en: "We are human." }, { ru: "Кто тот челове́к?", en: "Who is that man?" },
      { ru: "три", en: "three" }, { ru: "четыре", en: "four" }] };
    const senses = [
      { g: "person, human being", x: [{ ru: "Э́тот челове́к твой друг.", en: "This man is your friend." }] },
      { g: "mankind" }, { g: "three" }, { g: "four" }, { g: "five" }];
    const card = cardAbout(face, senses);
    expect(card.word).toBe("человек");
    // Four senses, as the flashcard numbers them; three examples, as it lists them.
    expect(card.senses.map((s) => s.g)).toEqual(["person, human being", "mankind", "three", "four"]);
    expect(card.senses[0].en).toBe("This man is your friend.");
    expect(card.senses[1].ru).toBeUndefined();
    expect(card.examples.length).toBe(3);
    expect(card.examples[1].ru).toBe("Кто тот челове́к?");
    // The entry shows everything.
    expect(cardAbout(face, senses, { maxSenses: 8, maxExamples: 6 }).senses.length).toBe(5);
    // A sentence card is its sentence; a word with nothing to show sends nothing.
    expect(cardAbout({ b: "Я иду.", w: "Я иду́.", e: "I go.", sentence: true }, null))
      .toEqual({ word: "Я иду.", sentence: "Я иду́.", meaning: "I go." });
    expect(cardAbout({ b: "x", w: "x", e: "" }, [])).toBeUndefined();
  });
});
