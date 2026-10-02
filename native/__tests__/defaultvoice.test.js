/* The phone's voice a word falls back to is a woman's, as every bought clip
   is (the owner, 2026-10-02: one speaker "changes between a man and a
   woman"). The list is the shape the owner's Pixel reports (core/voices.js):
   a man first, silent star voices, and local and network copies of each. */

import { defaultVoice } from "../src/audio";

const v = (identifier) => ({ identifier, language: "ru-RU", name: identifier });

it("prefers a woman's local voice over the first one listed", () => {
  const list = [v("ru-ru-x-rud-network"), v("ru-ru-x-star02-local"), v("ru-ru-x-rud-local"),
                v("ru-ru-x-rue-network"), v("ru-ru-x-rue-local")];
  expect(defaultVoice(list).identifier).toBe("ru-ru-x-rue-local");
});

it("never picks a silent voice while another exists", () => {
  expect(defaultVoice([v("ru-ru-x-star05-local"), v("ru-ru-x-rud-local")]).identifier)
    .toBe("ru-ru-x-rud-local");
});

it("answers null with no voices", () => {
  expect(defaultVoice([])).toBeNull();
});
