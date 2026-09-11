/* Yuri — the guide.
 *
 * The owner, 2026-09-10: "make a monkey theme character that guides on the
 * journey", against a complaint that the lesson slides look boring.
 *
 * **He is almost silent, and that is the design.** Rule 20.7 says labels, not
 * prose, and §25 says a polished learning screen may contain almost no text
 * outside the language material. A mascot that narrates every step — "Great
 * job! Now let's learn some words!" — is the thing this app is explicitly not
 * supposed to become. So Yuri carries expression rather than commentary: he is
 * present at the start of a lesson, points at the rule the chapter turns on,
 * and reacts when an answer lands. `LINES` exists for the one screen where a
 * sentence is welcome (the end of a lesson) and is capped at eight words so it
 * cannot quietly grow into a paragraph.
 *
 * Drawn here rather than shipped as an asset, for the same reason `avatars.js`
 * is: flat SVG costs nothing, works offline, scales to any size, and recolours
 * with the theme. The fur and face are the palette of the `monkeynaut` avatar
 * (the owner's own profile picture) so the two read as the same animal — Yuri
 * is that monkey with the helmet off. The scarf takes the brand colour from the
 * caller, so he belongs to whichever theme is on.
 */

export const GUIDE = { name: "Yuri" };

const FUR = "#A9744F";
const FUR_DARK = "#8A5C3B";
const SKIN = "#E8C39E";
const INK = "#241A12";

export const POSES = ["idle", "wave", "point", "think", "cheer"];

/* --------------------------------------------------------------- the body */

/* Everything below the neck. The arms are the pose: a raised hand reads as a
   wave at 40 px where an eyebrow does not, so expression is carried by the
   silhouette first and the face second. */
function limbs(pose) {
  const arm = (d) => `<path d="${d}" stroke="${FUR}" stroke-width="7.5" fill="none" stroke-linecap="round"/>`;
  const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${SKIN}"/>`;
  switch (pose) {
    case "wave":
      return arm("M34 64q-9 5-8 13") + hand(26, 79)
           + arm("M62 62q11-7 12-18") + hand(75, 42);
    case "point":
      // Down and to the right, because that is where the thing he is pointing
      // at is: he stands above the left corner of the card. An arm held out
      // level read as a shrug at 58 px.
      return arm("M34 64q-9 5-8 13") + hand(26, 79)
           + arm("M62 66q11 3 15 12") + hand(79, 82);
    case "think":
      return arm("M34 64q-9 5-8 13") + hand(26, 79)
           + arm("M62 66q9-3 6-12") + hand(66, 51);
    case "cheer":
      return arm("M34 62q-11-7-12-18") + hand(21, 42)
           + arm("M62 62q11-7 12-18") + hand(75, 42);
    default:
      return arm("M34 64q-9 5-8 13") + hand(26, 79)
           + arm("M62 64q9 5 8 13") + hand(70, 79);
  }
}

/* ---------------------------------------------------------------- the face */

function face(pose) {
  const eye = (x) =>
    `<circle cx="${x}" cy="30" r="3.1" fill="${INK}"/>`
    + `<circle cx="${x + 1}" cy="28.8" r="1.1" fill="#fff" opacity=".85"/>`;
  // A closed, curved-up eye. Two of them plus an open mouth is the whole of
  // "delighted" — no extra marks needed, and it survives being 32 px wide.
  const happyEye = (x) =>
    `<path d="M${x - 3.4} 31q3.4-4.2 6.8 0" stroke="${INK}" stroke-width="2.6"`
    + ` fill="none" stroke-linecap="round"/>`;
  const smile = `<path d="M43.5 41.5q4.5 3.8 9 0" stroke="${FUR_DARK}"`
    + ` stroke-width="2" fill="none" stroke-linecap="round"/>`;

  switch (pose) {
    case "cheer":
      return happyEye(41) + happyEye(55)
        + `<ellipse cx="48" cy="42" rx="5.4" ry="4.4" fill="#7A4A2C"/>`
        + `<path d="M43.6 40.6q4.4-2 8.8 0" stroke="${FUR_DARK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case "think":
      // One brow up, mouth pushed to one side: puzzling something over.
      return eye(41) + eye(55)
        + `<path d="M36.5 23.5q4.5-2.6 9 0" stroke="${FUR_DARK}" stroke-width="2" fill="none" stroke-linecap="round"/>`
        + `<path d="M44 42.5q4 1.6 7.5-.6" stroke="${FUR_DARK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case "wave":
    case "point":
    default:
      return eye(41) + eye(55) + smile;
  }
}

/* -------------------------------------------------------------- the figure */

/* `accent` is the theme's brand colour — the scarf is the only part of him that
   changes with the palette, which is enough to make him look like he belongs to
   this app rather than like a sticker dropped on top of it. */
export function guideSvg(pose = "idle", accent = "#4D45E6") {
  const p = POSES.includes(pose) ? pose : "idle";
  return [
    // Tail, behind everything.
    `<path d="M63 74q15 3 13-11" stroke="${FUR}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    // Feet, then body, then belly.
    `<ellipse cx="39" cy="86" rx="7.5" ry="5" fill="${FUR_DARK}"/>`,
    `<ellipse cx="57" cy="86" rx="7.5" ry="5" fill="${FUR_DARK}"/>`,
    `<ellipse cx="48" cy="70" rx="17" ry="16" fill="${FUR}"/>`,
    `<ellipse cx="48" cy="73" rx="10.5" ry="10.5" fill="${SKIN}"/>`,
    limbs(p),
    // Scarf, over the shoulders and under the chin.
    `<path d="M33 54q15 9 30 0v6q-15 9-30 0z" fill="${accent}"/>`,
    `<path d="M36 59l-4 12 7-2z" fill="${accent}"/>`,
    // Ears, head, muzzle.
    `<circle cx="24" cy="30" r="8.5" fill="${FUR}"/><circle cx="24" cy="30" r="4.6" fill="${SKIN}"/>`,
    `<circle cx="72" cy="30" r="8.5" fill="${FUR}"/><circle cx="72" cy="30" r="4.6" fill="${SKIN}"/>`,
    `<circle cx="48" cy="32" r="21" fill="${FUR}"/>`,
    `<ellipse cx="48" cy="38" rx="14.5" ry="11.5" fill="${SKIN}"/>`,
    `<ellipse cx="45.6" cy="36" rx="1.1" ry="1.6" fill="${FUR_DARK}"/>`,
    `<ellipse cx="50.4" cy="36" rx="1.1" ry="1.6" fill="${FUR_DARK}"/>`,
    face(p),
  ].join("");
}

export const VIEW_BOX = "0 0 96 96";

/* ----------------------------------------------------------------- his voice */

/* The end of a lesson is the one screen where a sentence from Yuri is welcome:
   the learner has stopped working and is being told how it went. Eight words is
   the cap, and `core.test.mjs` enforces it — a mascot's copy is exactly the kind
   that grows a word at a time until it is a paragraph nobody reads. */
export const LINES = {
  /* The other place a sentence from him is welcome: the screen the app opens
     on, where the learner is not working yet and a guide who never introduces
     himself is just a drawing. Said once, on the way in. */
  hello: [
    "Welcome aboard. I am Yuri.",
    "Good to meet you. I am Yuri.",
  ],
  words: [
    "Those are yours now.",
    "Well met. On you go.",
    "That is the set. Good.",
  ],
  passed: [
    "Clean run. Onwards.",
    "That will stick.",
    "You had those.",
  ],
  scraped: [
    "Through, and worth another look.",
    "That will come. Keep at it.",
  ],
  failed: [
    "Not this time. Go again.",
    "Close. One more run.",
  ],
};

export const MAX_WORDS = 8;

/* Deterministic given a seed, so a screen does not reshuffle its own line on
   every render — a sentence that changes while you read it is worse than none. */
export function guideLine(kind, seed = 0) {
  const bag = LINES[kind];
  if (!bag || !bag.length) return null;
  return bag[Math.abs(Math.floor(seed)) % bag.length];
}

/* Which way his face goes, given how a lesson ended. */
export function poseFor(kind) {
  if (kind === "failed") return "think";
  if (kind === "scraped") return "point";
  return "cheer";
}
