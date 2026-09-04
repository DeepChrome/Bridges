/* Filling an entry out.
 *
 * The payload stores each thing once: paradigms as shared ending-shapes, sentences
 * as a pool every entry can point into. `hydrate` turns that back into the shape the
 * screens already expect — `t` for tables, `x` for examples — so nothing downstream
 * has to know the storage changed.
 *
 * Both tiers go through here, which is the point: an entry from the wider dictionary
 * and one from the curriculum come out of it looking the same, and there is nothing
 * for a screen to apologise for.
 */

import { fold } from "./util.js";
import { decodeShapes, slotsOf, buildTables } from "./paradigm.js";

export function makeHydrator({ deepIndex, shapes, slots, sent }) {
  const shapeList = decodeShapes(shapes || "");
  const pool = sent || [];

  const examples = (refs) => {
    if (!refs) return [];
    const out = [];
    for (const r of refs.split(",")) {
      const row = pool[Number(r)];
      if (row) out.push({ ru: row[0], en: row[1], d: row[2], au: !!row[3] });
    }
    return out;
  };

  /* Mutates and returns the entry: hydration is idempotent and the result is
     cached on the object, so the 4,000 studied lemmas are built once. */
  return function hydrate(entry) {
    if (!entry || entry.t !== undefined) return entry;
    // A studied lemma carries no paradigm record of its own; its dictionary twin
    // does, and they are the same word.
    const rec = entry.shape !== undefined ? entry : deepIndex().get(fold(entry.b));
    entry.t = rec ? buildTables(entry.p, slotsOf(rec, shapeList, slots || [])) : [];
    entry.x = examples(rec ? rec.refs : "");
    if (rec && rec !== entry) {
      // Grammar the curriculum table did not carry.
      if (!entry.g && rec.g) entry.g = rec.g;
      if (!entry.a && rec.a) entry.a = rec.a;
      if (!entry.pt && rec.pt) entry.pt = rec.pt;
    }
    return entry;
  };
}
