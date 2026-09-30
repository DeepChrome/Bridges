/* Teddy — the guide.
 *
 * The guide was a monkey called Yuri from 2026-09-10; since 2026-09-30 it is
 * the main character of the cast (core/cast.js, docs/cast.md), Teddy the
 * Yorkie, and the monkey is his rival in the stories instead.
 *
 * **He is almost silent, and that is the design.** Rule 20.7 says labels, not
 * prose, and §25 says a polished learning screen may contain almost no text
 * outside the language material. A mascot that narrates every step — "Great
 * job! Now let's learn some words!" — is the thing this app is explicitly not
 * supposed to become. So the guide carries expression rather than commentary:
 * present at the start of a lesson, pointing at the rule the chapter turns on,
 * and reacting when an answer lands. `LINES` exists for the one screen where a
 * sentence is welcome (the end of a lesson) and is capped at eight words so it
 * cannot quietly grow into a paragraph.
 *
 * He is pictures, bought by tools/build_cast_art.mjs (data/cast_art/guide/,
 * each pose made from the same character sheet) and shipped as
 * native/assets/guide/<pose>.png. What stays here is what is not art: his
 * name, the poses, and when he speaks.
 */

import { castById, GUIDE_ID } from "./cast.js";

export const GUIDE = { name: castById[GUIDE_ID].en };

export const POSES = ["idle", "wave", "point", "think", "cheer"];

/* ----------------------------------------------------------------- his voice */

/* The end of a lesson is the one screen where a sentence from Teddy is welcome:
   the learner has stopped working and is being told how it went. Eight words is
   the cap, and `core.test.mjs` enforces it — a mascot's copy is exactly the kind
   that grows a word at a time until it is a paragraph nobody reads. */
export const LINES = {
  /* The other place a sentence from him is welcome: the screen the app opens
     on, where the learner is not working yet and a guide who never introduces
     himself is just a drawing. Said once, on the way in. */
  hello: [
    "Hi! I'm Teddy.",
    "Good to meet you. I'm Teddy.",
  ],
  words: [
    "Those are yours now.",
    "Well met. On you go.",
    "That is the set. Good.",
  ],
  passed: [
    "Clean run. Onwards.",
    "That will stick.",
    "You had those.",
  ],
  scraped: [
    "Through, and worth another look.",
    "That will come. Keep at it.",
  ],
  failed: [
    "Not this time. Go again.",
    "Close. One more run.",
  ],
};

export const MAX_WORDS = 8;

/* Deterministic given a seed, so a screen does not reshuffle its own line on
   every render — a sentence that changes while you read it is worse than none. */
export function guideLine(kind, seed = 0) {
  const bag = LINES[kind];
  if (!bag || !bag.length) return null;
  return bag[Math.abs(Math.floor(seed)) % bag.length];
}

/* Which way his face goes, given how a lesson ended. */
export function poseFor(kind) {
  if (kind === "failed") return "think";
  if (kind === "scraped") return "point";
  return "cheer";
}
