/* Read anything (ROADMAP P10.7): take a piece of Russian the learner found
 * somewhere else and say what they can already do with it.
 *
 * The workflow serious learners run by hand is three tools glued together —
 * something to read in, something to look words up in, something to review them
 * in. The app already holds the last two: a dictionary that resolves inflected
 * forms, a scheduler, and a word sheet two presses from any Russian on screen.
 * The only missing piece was somewhere to put text that did not come from the
 * corpus, which is what this is.
 *
 * Pure, and shared: no DOM, no fetch, no storage. It takes the index and the
 * learner's schedule and returns what is in the text — the app decides what to
 * draw and what to offer.
 */

import { fold, TOKEN } from "./util.js";

/* Below this rank a word is «и», «в», «не» — said by everyone from the first
   screen. Counting them as vocabulary would make every text look 40 % known
   before the learner had met a single content word. The same cut the speech
   grading uses, for the same reason. */
export const READ_SKIP_TOP = 100;

export const MAX_CHARS = 20000;

/* A YouTube id out of any of the shapes a link comes in. Returns null for
   anything else, including a bare eleven-character word in prose — the string
   has to look like a link, or «преподаватель» becomes a video id. */
export function youtubeId(text) {
  const s = String(text || "").trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?[^\s]*\bv=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* What a piece of text is made of, for this learner.
 *
 *   L        the lemma list
 *   IX       folded form -> lemma indices, best first
 *   seen     the learner's schedule, keyed on the bare word (rule 20.4)
 *
 * Every token is one of four things, and the four are what the screen colours:
 *   known    a content word this learner is already scheduling
 *   taught   the curriculum teaches it, they have not met it yet
 *   free     below READ_SKIP_TOP — grammar glue, not vocabulary
 *   unknown  no lemma in the curriculum index resolves it
 */
export function analyse(text, { L, IX, seen }) {
  const src = String(text || "").slice(0, MAX_CHARS);
  const forms = src.match(TOKEN) || [];
  const counts = new Map();          // lemma index -> times it appears
  let free = 0, unknown = 0;
  const unknownForms = new Map();    // folded form -> as written, first time

  for (const form of forms) {
    const key = fold(form);
    const hit = IX[key];
    if (!hit || !hit.length) {
      unknown++;
      if (!unknownForms.has(key)) unknownForms.set(key, form);
      continue;
    }
    // The app's own resolution, so a word tapped here opens what this says.
    const i = hit[0];
    if (i < READ_SKIP_TOP) { free++; continue; }
    counts.set(i, (counts.get(i) || 0) + 1);
  }

  const held = (i) => !!(seen && L[i] && seen[L[i].b]);
  const words = [...counts.entries()].map(([i, n]) => ({ i, n, known: held(i) }));
  words.sort((a, b) => (a.known === b.known ? b.n - a.n : a.known ? 1 : -1));

  const content = words.reduce((n, w) => n + w.n, 0);
  const knownTokens = words.filter((w) => w.known).reduce((n, w) => n + w.n, 0);

  return {
    chars: src.length,
    truncated: String(text || "").length > MAX_CHARS,
    tokens: forms.length,
    free,
    unknown,
    unknownForms: [...unknownForms.values()],
    content,
    knownTokens,
    /* The share of the content words in this text that the learner is already
       scheduling. Deliberately not "of all words": counting the glue would
       flatter every text, and the number is only worth printing if it moves. */
    share: content ? knownTokens / content : 0,
    words,
    newWords: words.filter((w) => !w.known),
  };
}

/* Whether a text is worth attempting, and what to say when it is not. The
   thresholds come from the same research the roadmap's Phase 10 cites: input
   has to be most-of-the-way comprehensible to build anything. This advises; it
   never blocks. A learner who wants to wade into something hard may. */
export const READ_COMFORTABLE = 0.9;
export const READ_WORKABLE = 0.7;

export function readVerdict(stats) {
  if (!stats || !stats.content) return { tone: "none", text: "No Russian words in that." };
  if (stats.share >= READ_COMFORTABLE) {
    return { tone: "good", text: "You know almost every word here." };
  }
  if (stats.share >= READ_WORKABLE) {
    return { tone: "ok", text: "Most of this is words you have met." };
  }
  return { tone: "hard", text: "A lot of this is new. Worth mining rather than reading." };
}
