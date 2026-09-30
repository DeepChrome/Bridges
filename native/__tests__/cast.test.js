/* The cast on screen (core/cast.js, docs/cast.md, 2026-09-30): the story's
   characters are drawn from the cast art — their avatar faces, and a unit's
   episode picture — and everyone else keeps their flat face. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Avatar } from "../src/ui";
import { SCENE_ART } from "../src/sceneart";
import { CAST_FACES } from "../src/castfaces";
import { CAST } from "@core/cast";

describe("the cast's faces", () => {
  it("draws every character of the story from the cast art", async () => {
    for (const c of CAST) expect(CAST_FACES[c.avatar]).toBeTruthy();
    await render(<Avatar id="teddy" />);
    expect(screen.getByTestId("face-teddy")).toBeTruthy();
  });

  it("gives an old profile's Yorkie Teddy's face, and leaves the neighbours flat", async () => {
    await render(<Avatar id="serafim" />);
    expect(screen.getByTestId("face-teddy")).toBeTruthy();
    await render(<Avatar id="gena" />);
    expect(screen.queryByTestId("face-gena")).toBeNull();
  });
});

describe("a unit's episode picture", () => {
  it("ships only pictures for units that exist, and the sport one among them", () => {
    const { UN } = require("../src/data");
    const ids = new Set(UN.map((u) => u.id));
    for (const k of Object.keys(SCENE_ART)) expect(ids.has(k)).toBe(true);
    expect(SCENE_ART.sport).toBeTruthy();
  });
});

describe("a word drawn with the cast", () => {
  const { WORD_ART } = require("../src/wordart");
  const { pictureOf } = require("../src/pictures");
  const { IMAGES } = require("../src/images");
  const { L } = require("../src/data");

  it("is only ever a word the course teaches", () => {
    const taught = new Set(L.map((w) => w.b));
    for (const k of Object.keys(WORD_ART)) expect(taught.has(k)).toBe(true);
  });

  it("wins over a photograph, and carries no credit because it is ours", () => {
    for (const k of Object.keys(WORD_ART)) {
      expect(pictureOf(k)).toEqual({ source: WORD_ART[k], credit: null, drawn: true });
    }
    const photo = Object.keys(IMAGES).find((k) => !WORD_ART[k]);
    expect(pictureOf(photo).drawn).toBe(false);
    expect(pictureOf("такого-слова-нет")).toBeNull();
  });
});
