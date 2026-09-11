/* When a sideways drag belongs to the tabs.
 *
 * The five tabs are swiped as well as pressed (the owner, 2026-09-11: *"almost
 * like an android home screen"*), and each tab is a stack. A swipe belongs to
 * the tabs only while the tab is showing its own first screen: deeper in, a drag
 * across a lesson, a dictionary entry or a video is that screen's, and changing
 * tab under the learner's thumb is how an app comes to feel like it is fighting
 * back.
 *
 * This lives apart from App.js because it is keyed on **screen names**, which is
 * exactly the kind of coupling that breaks quietly: rename a stack's first
 * screen and the swipe either dies everywhere or fires everywhere, and the app
 * still builds and still renders. The test is what says so.
 */

/* The first screen of each tab's stack, as App.js declares them. */
export const TAB_ROOT = {
  Learn: "Path",
  Study: "Cards",
  Practice: "Drills",
  Immerse: "Episodes",
  Search: "Words",
};

/* `focused` is what `getFocusedRouteNameFromRoute` gives: the screen showing
   inside this tab's stack, or undefined before the stack has navigated
   anywhere — which is itself the first screen. */
export function swipeAllowed(tab, focused) {
  if (!TAB_ROOT[tab]) return false;          // not a tab we know: leave it alone
  return !focused || focused === TAB_ROOT[tab];
}
