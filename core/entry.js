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

/* The dictionary tier by *folded* headword — and by headword-and-POS first,
   because OpenRussian lists homographs as separate rows («мочь» the verb and
   the noun "might", «русский» the adjective and the noun) and a studied verb
   must not inherit a noun's slots. The key is folded because the lookup is:
   the map used to be keyed on the bare form as written, so every ё headword
   («ребёнок», «ещё») and every capitalised one («Россия») missed and opened
   with no examples and no paradigm although the payload carried both. */
export function makeDeepIndex(list) {
  const map = new Map();
  for (const d of list) {
    const k = fold(d.b);
    const kp = k + "|" + (d.p || "");
    if (!map.has(kp)) map.set(kp, d);
    if (!map.has(k)) map.set(k, d);
  }
  return map;
}

export function twinOf(deepIndex, entry) {
  const k = fold(entry.b);
  return deepIndex.get(k + "|" + (entry.p || "")) || deepIndex.get(k) || null;
}

export function makeHydrator({ deepIndex, shapes, slots, sent }) {
  const shapeList = decodeShapes(shapes || "");
  const pool = sent || [];

  const examples = (refs) => {
    if (!refs) return [];
    const out = [];
    for (const r of refs.split(",")) {
      const row = pool[Number(r)];
      // `src` names an outside source and is empty for his own decks, so a screen
      // can say where a sentence came from without knowing any source by name.
      if (row) out.push({ ru: row[0], en: row[1], d: row[2], au: !!row[3],
                          src: row[4] || "" });
    }
    return out;
  };

  /* Mutates and returns the entry: hydration is idempotent and the result is
     cached on the object, so the 4,000 studied lemmas are built once. */
  return function hydrate(entry) {
    if (!entry || entry.t !== undefined) return entry;
    // A studied lemma carries no paradigm record of its own; its dictionary twin
    // does, and they are the same word.
    const rec = entry.shape !== undefined ? entry : twinOf(deepIndex(), entry);
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
