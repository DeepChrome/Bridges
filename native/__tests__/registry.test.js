/* The activity registry: every kind the generators can emit has a view.
 *
 * VIEWS in Run.js is checked against what core/questions.js actually produces, by
 * running the generators, rather than against a list of kinds that could drift from
 * either side. A kind with no view draws a blank step in a lesson, silently; here it
 * is a failure with the kind named.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { VIEWS } from "../src/screens/Run";
import { Q, DRILL_TYPES } from "../src/questions";
import { STAGES } from "../src/data";

const kindsOf = (qs) => new Set(qs.filter(Boolean).map((q) => q.kind));
const expectViews = (kinds) => {
  expect(kinds.size).toBeGreaterThan(0);
  for (const k of kinds) {
    // Named on failure: "no view for kind X" beats "expected function, got undefined".
    expect({ kind: k, hasView: typeof VIEWS[k] === "function" })
      .toEqual({ kind: k, hasView: true });
  }
};

describe("activity registry", () => {
  it("every registered view is a render function", () => {
    expect(Object.keys(VIEWS).length).toBeGreaterThanOrEqual(12);
    for (const k of Object.keys(VIEWS)) expect(typeof VIEWS[k]).toBe("function");
  });

  it("covers every kind a drill can emit", () => {
    const qs = [];
    for (const d of DRILL_TYPES) qs.push(...Q.drillQuestions(d.id, 3));
    expectViews(kindsOf(qs));
  });

  it("covers every kind a lesson can ask", () => {
    const unit = STAGES[0].core;
    const pool = Q.poolFor(unit);
    const qs = [];
    for (const idx of unit.w.slice(0, 6)) {
      for (const e of Q.candidates(idx, pool)) qs.push(Q.present(e));
    }
    qs.push(...Q.quizSteps(unit, 0));
    qs.push(Q.present({ t: "match", pairs: unit.w.slice(0, 3) }));
    expectViews(kindsOf(qs));
  });

  it("covers every kind a placement or section test can ask", () => {
    const qs = Q.placementQuestions().concat(Q.sectionQuestions(STAGES[0].core));
    expectViews(kindsOf(qs));
  });
});
