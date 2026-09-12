/* Which screens are a run, and so hide the tab bar.
 *
 * A lesson, a quiz, a drill, a listening scenario, a conversation and a video
 * are one thing the learner is doing. Leaving the five tabs under them is an
 * escape hatch drawn across the bottom of the work — press one and the run is
 * gone with no way back to where you were — and it costs 58 px of a phone
 * screen to say so. Every learning app worth copying hides its navigation
 * inside a lesson; the header's back arrow is the way out, and it is the way
 * out that keeps your place.
 *
 * Browsing screens keep the bar: the path, a unit, the lesson's three steps,
 * the drill list, the scenario library, the dictionary. The rule is whether the
 * learner is *choosing* or *doing*.
 *
 * This lives apart from App.js for the reason `src/tabs.js` did before it: it is
 * keyed on **screen names**, and that coupling breaks quietly. Rename a screen
 * and the bar either never hides or hides on the wrong thing, and the app still
 * builds and still renders. `fullscreen.test.js` is what says so — it reads
 * App.js and checks every name here is really declared there.
 */

export const RUNS = [
  "Vocab",        // the lesson's teaching steps
  "Quiz",         // the lesson quiz
  "TestOut",      // testing out of a section
  "Placement",    // the placement test
  "ChapterTask",  // the open-ended chapter task
  "CustomQuiz",   // a quiz the learner built
  "Drill",        // any grammar drill
  "SoundDrill",   // the pronunciation pairs
  "Shadow",       // shadowing
  "Scenes",       // a written listening scenario
  "Passage",      // native-speed listening
  "Talk",         // a conversation
  "Video",        // an episode, which wants the whole screen
];

const SET = new Set(RUNS);

/* `focused` is what `getFocusedRouteNameFromRoute` gives: the screen showing
   inside this tab's stack, or undefined before the stack has navigated
   anywhere — which is its first screen, and never a run. */
export const hidesTabBar = (focused) => !!focused && SET.has(focused);
