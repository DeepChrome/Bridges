/* A table's own dictionary-form cell keeps a speaker (2026-10-16). The form
   recordings leave out a spelling the dictionary stresses two ways (§30cf:
   «вода» beside «во́да», a genitive of "waters"), which took the speaker off
   «вода́» in water's own table while the card above played the same word.
   The headword's clip is the one the card plays; the cell uses it. Any other
   form of a contested spelling still has none. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { FormSpeaker } from "../src/rules";
import { wordClip } from "../src/wordaudio";
import { fold } from "@core/util";

it("plays the headword's clip in its own cell, and nothing for another contested form", async () => {
  expect(wordClip(fold("вода́"))).toBeTruthy();          // the card's recording exists
  await render(
    <>
      <FormSpeaker form="вода́" headword="вода́" testID="own" />
      <FormSpeaker form="вода́" testID="bare" />
      <FormSpeaker form="во́ды" headword="вода́" testID="other" />
    </>,
  );
  expect(screen.getByTestId("own").props.accessibilityRole).toBe("button");
  // Without the headword (or a form recording, mocked empty here) there is no speaker.
  expect(screen.getByTestId("bare").props.accessibilityRole).toBeUndefined();
  expect(screen.getByTestId("other").props.accessibilityRole).toBeUndefined();
});
