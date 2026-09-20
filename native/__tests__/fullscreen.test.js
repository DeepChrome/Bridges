/* Which screens hide the tab bar.
 *
 * The list is keyed on screen names, which is the coupling that breaks
 * quietly: rename a screen and the bar either never hides or hides on the
 * wrong thing, and the app still builds and still renders. So the test reads
 * App.js and checks the names are really declared there — the same job
 * tabs.test.js did for the swipe rule before the swipe was removed.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { RUNS, TAB_BAR_SCREENS, hidesTabBar } from "../src/fullscreen";

const APP = readFileSync(join(__dirname, "..", "App.js"), "utf8");
const declared = new Set(
  [...APP.matchAll(/<(?:Stack|Root|Tabs)\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]));
/* Only the five tab stacks: a `Root.Screen` sits above the tabs and has no bar
   to hide, so the question does not arise there. */
const inStacks = [...new Set(
  [...APP.matchAll(/<Stack\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]))];

describe("the screens that hide the tab bar", () => {
  it("are all screens the app actually declares", () => {
    expect(RUNS.filter((name) => !declared.has(name))).toEqual([]);
    expect(TAB_BAR_SCREENS.filter((name) => !declared.has(name))).toEqual([]);
  });

  /* Completeness, not existence (docs/PLAYBOOK.md Phase 0.3). The test above
     proves RUNS names real screens; it cannot notice a run screen that was
     added and never listed, which keeps the bar and fails nothing. So every
     screen registered in a tab stack has to be in one list or the other. */
  it("together with the browsing screens, cover every screen in the tab stacks", () => {
    const placed = new Set([...RUNS, ...TAB_BAR_SCREENS]);
    expect(inStacks.filter((name) => !placed.has(name))).toEqual([]);
    expect(inStacks.length).toBeGreaterThan(20);   // the regex found the stacks at all
  });

  it("never put a screen in both lists", () => {
    expect(RUNS.filter((name) => TAB_BAR_SCREENS.includes(name))).toEqual([]);
  });

  it("are runs, not the screens you choose from", () => {
    // Choosing keeps the bar; doing does not. These are the ones most likely to
    // be got wrong, because they sit either side of the line: the lesson's
    // three steps are a menu, the step itself is a run.
    for (const browsing of ["Path", "Unit", "Lesson", "Drills", "SceneList",
                            "QuizSetup", "Episodes", "Cards", "Words", "You",
                            "Sounds", "Listening"]) {
      expect(hidesTabBar(browsing)).toBe(false);
    }
    for (const run of ["Vocab", "Quiz", "Drill", "Scenes", "Talk", "Video"]) {
      expect(hidesTabBar(run)).toBe(true);
    }
  });

  /* Before a stack has navigated anywhere `getFocusedRouteNameFromRoute` gives
     undefined, which means it is showing its first screen — never a run. A
     truthiness slip here would hide the bar on every tab at launch. */
  it("keeps the bar when the stack has not navigated yet", () => {
    expect(hidesTabBar(undefined)).toBe(false);
    expect(hidesTabBar(null)).toBe(false);
    expect(hidesTabBar("")).toBe(false);
  });

  it("does not name anything twice", () => {
    expect(new Set(RUNS).size).toBe(RUNS.length);
  });
});
