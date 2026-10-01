/* The people who appear in the written listening scenarios (§30l).
 *
 * One table, because three things need it and they must not drift:
 *
 *   - `tools/check_scripts.mjs` decides whether a cast entry names somebody the
 *     scenarios are allowed to use, and whether its English spelling is right;
 *   - the same tool builds the declined forms, so «Я знаю Ивана» passes the
 *     vocabulary gate (the lexicon carries no personal names at all);
 *   - the app picks each speaker a **voice of the right sex**.
 *
 * That last one is why `sex` is here rather than nowhere. The first cut handed
 * the phone's Russian voices out in the order Android listed them, so whoever
 * spoke first got voice zero — and the owner heard it at once: *"Masha clearly
 * sounds like a guy instead of a girl."* A cast list that does not know who is
 * a woman cannot be read aloud by a machine that does.
 *
 * `sex` is a property of the character, not a claim about the name in general.
 * Every name here is unambiguous in Russian, which is why these are the names.
 */

import { EVERYONE } from "./cast.js";

/* Since 2026-09-30 the people in the scenarios are the cast (core/cast.js):
   Teddy, his family, Monka, and the neighbourhood. The table is built from the
   cast, so a name a writer reaches for that is not a character fails the
   checker instead of quietly putting a stranger in the story. */
export const PEOPLE = Object.fromEntries(EVERYONE.map((c) => [c.ru, { en: c.en, sex: c.sex }]));

/* The sex of a named character, or null for a name the table does not carry —
   a corpus scene has no cast at all, and an unknown name must fall back rather
   than be guessed at. */
export function sexOf(ru) {
  const p = PEOPLE[ru];
  return p ? p.sex : null;
}
