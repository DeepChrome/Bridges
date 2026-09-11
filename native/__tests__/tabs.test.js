/* Which drags belong to the tabs.
 *
 * The rule is keyed on screen names, so it breaks silently: rename a stack's
 * first screen and either the swipe stops working everywhere or it starts
 * firing inside lessons, and the app builds and renders either way. The names
 * are checked against the navigator itself here rather than trusted.
 */

import { swipeAllowed, TAB_ROOT } from "../src/tabs";

describe("swiping between tabs", () => {
  it("is on when a tab is showing its own first screen", () => {
    for (const [tab, root] of Object.entries(TAB_ROOT)) {
      expect(swipeAllowed(tab, root)).toBe(true);
      // Before the stack has navigated anywhere there is no focused name yet,
      // and that state *is* the first screen.
      expect(swipeAllowed(tab, undefined)).toBe(true);
    }
  });

  it("is off anywhere deeper, where the drag is the screen's own", () => {
    expect(swipeAllowed("Learn", "Lesson")).toBe(false);
    expect(swipeAllowed("Learn", "Quiz")).toBe(false);
    expect(swipeAllowed("Practice", "Talk")).toBe(false);
    expect(swipeAllowed("Practice", "Scenes")).toBe(false);
    expect(swipeAllowed("Immerse", "Read")).toBe(false);
    expect(swipeAllowed("Study", "You")).toBe(false);
  });

  it("says no to anything that is not one of the five tabs", () => {
    expect(swipeAllowed("Word", undefined)).toBe(false);
    expect(swipeAllowed(undefined, undefined)).toBe(false);
  });

  /* The names above are worth nothing if they are not the navigator's. App.js
     declares each stack's screens in order, so the first `Stack.Screen` of each
     tab's stack is the root this rule names. */
  it("names the screen each stack actually opens on", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "App.js"), "utf8");
    const first = (stack) => {
      const body = src.split(`function ${stack}Stack()`)[1] || "";
      const m = body.match(/<Stack\.Screen\s+name="([^"]+)"/);
      return m && m[1];
    };
    for (const [tab, root] of Object.entries(TAB_ROOT)) {
      expect(first(tab)).toBe(root);
    }
  });
});
