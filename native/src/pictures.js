/* The one answer to "what picture does this word have?". A word drawn with the
   cast (wordart.js, tools/build_cast_art.mjs --words) wins over a photograph:
   it is ours, needs no credit, and shows what a photograph of a verb cannot. */

import { IMAGES, CREDITS } from "./images";
import { WORD_ART } from "./wordart";

export function pictureOf(bare) {
  if (WORD_ART[bare]) return { source: WORD_ART[bare], credit: null, drawn: true };
  if (IMAGES[bare]) return { source: IMAGES[bare], credit: CREDITS[bare] || null, drawn: false };
  return null;
}
