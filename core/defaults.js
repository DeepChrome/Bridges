/* A fresh profile's state, and how a saved one is read into this build's
 * shape. Both apps start a profile from `DEFAULTS` and read one back through
 * `normalise` (native/src/store.js re-exports them; the desktop imports them
 * here), so a key added for one is a key the other knows. The schema and
 * its migrations are core/state.js. */

import { SCHEMA_VERSION, migrate, speechDefault } from "./state.js";
import { normaliseSeen, DEFAULT_FRONTS } from "./scheduler.js";
import { today } from "./util.js";

export const DEFAULTS = {
  v: SCHEMA_VERSION,
  /* Off since 2026-09-23 (the owner: the path is walked from the top; only
     the placement test may open chapters ahead). The switch stays in
     Settings. The frozen web app still ships it on. */
  dev: false,
  faves: {},            // video id -> day favourited (Immerse)
  lowPriority: {},      // card's Russian -> when it was set aside (Study; studycards.js)
  rest: {},             // card's Russian -> { run } of Agains, or { until } a day while resting (core/queue.js noteAnswer)
  notices: {},          // one-time notes seen, by id (Immerse's creators note)
  theme: "auto",
  /* Where the flashcards' *new* cards come from: `__path__` (the units the
     learner has reached), chapters, decks. What is due is always dealt,
     whatever is ticked (core/queue.js, 2026-09-28). */
  sets: ["__path__"],
  cardKinds: ["words", "sentences"],   // words, sentences, or both (core/queue.js cardKind)
  seen: {},             // word -> { recognise, produce, listen }: a card each (core/scheduler.js)
  trouble: {},
  daily: { day: null, new: 0, reviews: 0 },   // today's counts (core/queue.js dailyFor)
  /* The scheduler's settings (docs/PLAYBOOK.md 2.3): which fronts the
     flashcards ask through, the daily rations, the retention asked of the
     scheduler, and how far ahead a learning step may be taken, in minutes.
     One front by default — the Russian — since a word is one card
     (core/scheduler.js, 2026-09-23). */
  flash: DEFAULT_FRONTS.slice(),
  newPerDay: 5,
  retention: 0.9,
  learnAhead: 20,
  pinned: [],
  unit: {},             // unitId -> {best, done, video, lessons:{i:{v,q}}}
  drills: {},
  recent: [],           // dictionary history, newest first; keyed on the word itself
  name: "",
  day: null,
  streak: 0,
  speech: speechDefault(),   // the speaking activities' record; never audio
  watched: {},          // video id -> day watched (the Immerse library)
  mined: {},            // word -> {v, t, s}: taken from a video, and where from
  decks: [],            // imported Anki decks: {id, name, cards:[{ru, en}]}
  speed: "normal",      // how fast Russian is read: normal, slower, slowest
  cue: "confirm1",      // the sound a right answer makes (audio.js CUE_NAMES)
  wrongCue: "wrong1",   // …and a wrong one (audio.js WRONG_NAMES)
  osk: false,           // an on-screen Russian keyboard for typed answers
  /* Drill answers written rather than chosen. On by default: four options is
     the easier question, and §30j found production is what keeps a word. Some
     drill shapes have nothing to produce and ignore it (core/questions.js). */
  typedDrills: true,
  /* What each drill asks about and where its words come from, chosen from the
     cog on the drill (flows/Drills.js DrillOptions): drill id -> { only, chapters }.
     Absent, a drill runs as it always did. */
  drillPrefs: {},
  // Drive mode's options (core/drive.js DRIVE_DEFAULTS fill what is unset).
  drivePrefs: {},
  // Drive episodes heard to the end: episode number -> day.
  driveDone: {},
  /* The last wrong answers, newest first, as { kind, prompt, answer, said, at }
     (Run.js): what the tutor is handed so "drill me on what I get wrong" has
     something to go on. Capped at MISSES_KEPT. */
  misses: [],
  /* What the tutor asked to remember about this learner across conversations
     (screens/Tutor.js) — a preference, a recurring confusion. Kept here, not
     on the Worker, like every other piece of learner state. */
  tutorNotes: [],
  /* The tutor's first-time questionnaire (screens/Tutor.js TutorIntro): the
     answers as { at, goal, style, time, struggle }, or { at, skipped } — null
     until it has been asked, which is what shows it. */
  tutorIntro: null,
  talkLevel: null,      // how the Talk tutor pitches its Russian; null = by chapter reached
  talkSpeed: "normal",  // how fast the tutor is read out (audio.js SPEEDS)
  talkEn: true,         // English under the tutor's turns
  /* The phone's answer to an answer (haptics.js). On by default: it is the
     feedback that arrives before the sound and before the colour, and a
     learner studying with the volume down has nothing else. */
  haptics: true,
  /* Which "something new is open" notes have been shown (core/openings.js).
     Progress, not a setting: it belongs to this learner's journey through the
     route and a reset should start it over. */
  met: [],
};

/* Opening the app stamps the day and advances the streak (both apps, at
   adopt). `state.day` is attendance, not work — what means work is a card's
   `lastAt` (§30t). */
export function touchStreak(state, t = today()) {
  if (state.day === t) return state;
  // Imported or migrated state knows the streak but not when it last advanced;
  // adopt it rather than resetting to 1.
  const streak = (state.day === null || state.day === undefined)
    ? (state.streak || 1)
    : (state.day === t - 1 ? (state.streak || 0) + 1 : 1);
  return Object.assign({}, state, { streak, day: t });
}

export function normalise(raw, assumedVersion) {
  if (!raw || typeof raw !== "object") return Object.assign({}, DEFAULTS);
  const s = Object.assign({}, DEFAULTS, migrate(raw, raw.v || assumedVersion || 2), { v: SCHEMA_VERSION });
  // Cards from before Phase 2 — one a word, timed in days — become the
  // recognise card, timed in milliseconds. Untouched when already so.
  s.seen = normaliseSeen(s.seen);
  return s;
}
