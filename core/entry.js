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
 *
 * Lazily, since 2026-09-09: `t` and `x` are built the first time they are read and
 * kept on the entry. Hydrating the 4,000 studied words at boot used to build 5,000
 * tables nobody had asked for yet — 30 MB of heap before the first screen — and,
 * because a studied row carried no record of its own, forced the whole 4.45 MB
 * dictionary to be parsed to find each word's twin. The rows carry their record
 * now (build_site.py); the twin is the fallback, found on first use.
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

/* `sent` may be the pool itself or a function returning it, called once on the
   first example read — the native app keeps the pool in its own file. */
export function makeHydrator({ deepIndex, shapes, slots, sent }) {
  const shapeList = decodeShapes(shapes || "");
  let poolCache = null;
  const pool = () => {
    if (poolCache === null) poolCache = (typeof sent === "function" ? sent() : sent) || [];
    return poolCache;
  };

  const examples = (refs) => {
    if (!refs) return [];
    const out = [];
    const rows = pool();
    for (const r of refs.split(",")) {
      const row = rows[Number(r)];
      // `src` names an outside source and is empty for his own decks, so a screen
      // can say where a sentence came from without knowing any source by name.
      if (row) out.push({ ru: row[0], en: row[1], d: row[2], au: !!row[3],
                          src: row[4] || "" });
    }
    return out;
  };

  const hydrated = new WeakSet();

  /* Mutates and returns the entry: `t` and `x` become memoised getters, so an
     entry is filled out once, on first use, and never at boot. Idempotent. */
  return function hydrate(entry) {
    if (!entry || hydrated.has(entry)) return entry;
    hydrated.add(entry);

    // A studied row carries its own record; failing that, its dictionary twin
    // does, and they are the same word. Found once, when first needed.
    let rec = null, found = false;
    const record = () => {
      if (found) return rec;
      found = true;
      rec = entry.shape !== undefined ? entry : twinOf(deepIndex(), entry);
      if (rec && rec !== entry) {
        // Grammar the curriculum table did not carry.
        if (!entry.g && rec.g) entry.g = rec.g;
        if (!entry.a && rec.a) entry.a = rec.a;
        if (!entry.pt && rec.pt) entry.pt = rec.pt;
      }
      return rec;
    };

    let tables, exs;
    Object.defineProperty(entry, "t", {
      configurable: true, enumerable: true,
      get() {
        if (tables === undefined) {
          const r = record();
          tables = r ? buildTables(entry.p, slotsOf(r, shapeList, slots || [])) : [];
        }
        return tables;
      },
      set(v) { tables = v; },
    });
    Object.defineProperty(entry, "x", {
      configurable: true, enumerable: true,
      get() {
        if (exs === undefined) {
          const r = record();
          exs = examples(r ? r.refs : "");
        }
        return exs;
      },
      set(v) { exs = v; },
    });
    return entry;
  };
}
