/* Attribution is a licence condition, not decoration (rule 20.10).
 *
 * OpenRussian is CC BY-SA 4.0, Tatoeba's sentences CC BY 2.0 FR and
 * Wiktionary's senses CC BY-SA 3.0, and each requires the credit to travel
 * with the material. The web page has carried it since 2026-09-04 and
 * `tools/smoke.js` asserts it there; the **native app is the product** (§20a)
 * and carried none of it until 2026-09-17. This is the native half of that
 * assertion, and it exists because the obligation is easy to satisfy once and
 * then lose in a refactor with nothing failing.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render } from "@testing-library/react-native";

import Credits from "../src/screens/Credits";
import { STATS } from "../src/data";
import { NOTICES, NOTICE_COUNT } from "../src/notices";

describe("what the app says it owes", () => {
  it("names every source the payload shipped, with its licence", async () => {
    const view = await render(<Credits />);
    const sources = (STATS && STATS.credits) || [];
    /* Read from the payload rather than listed here: `build_site.py` builds
       them from each database's own `meta` rows, so a source that is added or
       relicensed changes both the data and this check at once. A hardcoded
       list here would be the second copy that drifts. */
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const c of sources) {
      expect(view.getByText(c.n)).toBeTruthy();
      expect(view.getByText(c.l)).toBeTruthy();
    }
    // The three that carry a share-alike or attribution condition.
    const all = sources.map((c) => c.n).join(" ");
    expect(all).toMatch(/OpenRussian/);
    expect(all).toMatch(/Tatoeba/);
    expect(all).toMatch(/Wiktionary/);
  });

  it("carries the software licences, generated from what is installed", async () => {
    const view = await render(<Credits />);
    expect(NOTICE_COUNT).toBeGreaterThan(20);
    expect(NOTICES.length).toBeGreaterThan(0);
    for (const n of NOTICES) {
      expect(view.getByText(n.l)).toBeTruthy();
      expect(n.packages.length).toBeGreaterThan(0);
    }
    /* Nothing may reach the screen as "unknown": tools/build_notices.mjs fails
       the build rather than guessing a licence for someone else's code. */
    expect(NOTICES.map((n) => n.l).join(" ")).not.toMatch(/unknown|undefined|null/i);
  });

  it("points photograph credits at the picture rather than listing 259 of them", async () => {
    const view = await render(<Credits />);
    expect(view.getByText("Wikimedia Commons")).toBeTruthy();
    expect(view.getByText(/credits its author on the word/)).toBeTruthy();
  });
});
