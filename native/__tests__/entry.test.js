/* Hydration: every curriculum word gets its examples and its paradigm from
   the dictionary tier. The join is by *folded* headword and part of speech
   (core/entry.js makeDeepIndex): it used to key on the bare form as written,
   so every ё headword («ребёнок», «ещё») and every capitalised one
   («Россия») missed and opened with no examples and no tables although the
   payload carried both — 25 unit words on 2026-09-08. Own file, per the
   timeout note in screens.test.js. */

import { UN, L } from "../src/data";
import { fold } from "@core/util";

const unitWords = [...new Set(UN.flatMap((u) => u.w))].map((i) => L[i]);

describe("hydration of the curriculum", () => {
  it("gives every unit word its example sentences", () => {
    const without = unitWords.filter((w) => !(w.x && w.x.length));
    expect(without.map((w) => w.b)).toEqual([]);
  });

  it("finds the ё and capitalised headwords", () => {
    const yo = unitWords.filter((w) => /ё/.test(w.b) || fold(w.b) !== w.b.toLowerCase());
    expect(yo.length).toBeGreaterThan(10);
    for (const w of yo) expect(w.x.length).toBeGreaterThan(0);
    // Content words decline or conjugate; the paradigm must be there too.
    const declinable = yo.filter((w) => ["noun", "adjective", "verb"].includes(w.p) && !/^[А-Я]/.test(w.b));
    const bare = declinable.filter((w) => !w.t.length).map((w) => w.b);
    expect(bare).toEqual([]);
  });

  it("gives a verb a verb's paradigm, not its noun twin's", () => {
    // «мочь» is also a noun ("might") in the lexicon; «знать» a noun ("nobility").
    for (const b of ["мочь", "знать"]) {
      const w = L.find((e) => e.b === b && e.p === "verb");
      if (!w) continue;
      expect(w.t.length).toBeGreaterThan(0);
      expect(w.t.some((t) => /Present|Future|Past/i.test(t.title))).toBe(true);
    }
  });
});
