/* Saying when something new has opened (the owner, 2026-09-17).
 *
 * He asked whether the roadmap had a guided tutorial and whether it needed
 * one. It has a first-run tour — three cards on word links, voices and the
 * microphone (`native/src/screens/Intro.js`) — and that is the right scope for
 * a tour: the things a learner could not guess.
 *
 * What was missing is a different thing. **Twelve activities open as the route
 * is walked and not one of them ever says so** (measured 2026-09-17): four
 * grammar drills by chapter, listen-and-type from the first chapter's third
 * lesson, the conversations from the second, say-it-aloud from the third, the
 * chapter's form question, Talk, native-speed listening, sentence cards, the
 * chapter task. They simply start appearing.
 *
 * That is not a gap a tutorial fixes. A tour shown on day one cannot tell
 * anyone about an activity that opens in chapter 8, and coach marks over a
 * screen are exactly what §2 and §25 say this app must never become. The
 * evidence is the owner himself: he studied for a week without meeting the
 * word-building drill, and asked twice where things were — for features he had
 * commissioned days earlier.
 *
 * So the app says it, once, at the moment it becomes true, on the path where
 * the learner already is. One at a time, oldest first, so somebody arriving
 * with a backlog meets them one per visit rather than a wall.
 *
 * Nothing here decides *whether* an activity is open — that is
 * `drillsIntroduced`, `SPEECH_MIX` and `TALK_UNLOCK_STAGE`, and duplicating
 * those numbers here is how the announcement would come to disagree with the
 * thing it announces. The gates are passed in.
 */

/* An opening: what to call it, the one line under it, and where "Try it" goes.
 * `screen` is a route name in the app's own navigator; `tab` is which stack it
 * lives in. A `null` screen is something that turns up inside a lesson rather
 * than on a screen of its own, and shows no button.
 *
 * `stage` is the 0-based chapter it opens at, or a function of the facts when
 * it is not a plain chapter number. */
export const OPENINGS = [
  { id: "hear", name: "Listening questions", blurb: "Type the sentence you hear",
    screen: null, stage: 0, lesson: 2 },
  { id: "drill:conjugation", name: "Conjugation drill", blurb: "Put a verb with the right person",
    tab: "Practice", screen: "DrillSetup", params: { type: "conjugation" }, drill: "conjugation" },
  { id: "scene", name: "Listening", blurb: "Half a minute, then five questions",
    tab: "Practice", screen: "SceneList", stage: 1 },
  { id: "talk", name: "Talk", blurb: "A short conversation on a topic",
    tab: "Practice", screen: "Talk", stage: 1 },
  { id: "form", name: "Form questions", blurb: "A word in the form its chapter teaches",
    screen: null, stage: 1 },
  { id: "say", name: "Saying it aloud", blurb: "Read a sentence to the phone",
    screen: null, stage: 2 },
  { id: "drill:agreement", name: "Agreement drill", blurb: "Make adjectives agree with their noun",
    tab: "Practice", screen: "DrillSetup", params: { type: "agreement" }, drill: "agreement" },
  { id: "drill:cases", name: "Cases drill", blurb: "Put a noun in the case a sentence needs",
    tab: "Practice", screen: "DrillSetup", params: { type: "cases" }, drill: "cases" },
  { id: "drill:aspect", name: "Aspect drill", blurb: "Match imperfective and perfective partners",
    tab: "Practice", screen: "DrillSetup", params: { type: "aspect" }, drill: "aspect" },
];

/* Which of them are open, given where the learner has actually reached.
 *
 * `stage`/`lesson` are the route's own position — **not** developer mode.
 * Developer mode unlocks every lesson (rule 20.9) and if that counted as
 * "open" the app would announce all nine on the first screen, to a learner who
 * has met nothing. Unlocking is not the same as having arrived.
 */
export function isOpen(entry, { stage, lesson, drillOpensAt }) {
  if (entry.drill) {
    const at = drillOpensAt ? drillOpensAt(entry.drill) : -1;
    return at >= 0 && stage >= at;
  }
  if (typeof entry.stage !== "number") return false;
  if (stage > entry.stage) return true;
  if (stage < entry.stage) return false;
  return entry.lesson === undefined || lesson >= entry.lesson;
}

/* Everything open and not yet announced, in the order the route opens it.
   `met` is the ids already shown (state). */
export function newlyOpen(facts) {
  const met = new Set((facts && facts.met) || []);
  return OPENINGS.filter((o) => !met.has(o.id) && isOpen(o, facts));
}

/* The one to show. One at a time: a learner returning after an update has a
   backlog, and five cards stacked on the path is the wall this exists to
   avoid. */
export function nextOpening(facts) {
  const list = newlyOpen(facts);
  return list.length ? list[0] : null;
}

/* Marking one seen. Kept here so the id list and the state it writes cannot
   drift apart, and so a repeat press cannot record it twice. */
export function markOpening(met, id) {
  const list = Array.isArray(met) ? met : [];
  return list.includes(id) ? list : list.concat([id]);
}
