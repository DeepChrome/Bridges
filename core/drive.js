/* Drive mode (the owner, 2026-10-15: *"a drive mode feature where it plays
 * audio russian lessons… Perhaps learn russian podcast or something?"*): a
 * hands-free audio lesson, built the way Pimsleur builds one, because that is
 * the method designed for a listener who cannot look at a screen.
 *
 *   - **Prompt, pause, answer.** The English is read, then a silence long
 *     enough to say the Russian aloud, then the Russian. The pause is the
 *     exercise: recall before the answer, out loud — production (§30j).
 *   - **Twice on first meeting** — the Russian again after a beat, to repeat.
 *   - **Graduated recall**, inside one sitting.
 *
 * **In clusters, never a pile** (the owner, the same evening: *"it should have
 * different clusters of words that are similar so it's not just a bunch of
 * random ass words"*). A drive is a run of the course's own named groups
 * (`u.gr`, §30bi: Seasons, Greetings, Parents and children): each group is
 * announced, its words taught in its own order, each recalled two words on,
 * then the whole group recalled once and a sentence or two that use it. The
 * next group opens by recalling a couple of the last one's words, so the
 * spacing crosses clusters without mixing them.
 *
 * Pure: groups in, segments out; the screen plays them. Nothing is graded and
 * nothing enters the scheduler (§30z).
 */

export const DRIVE_GAP = { word: 2600, sentence: 4200 };   // time to say it, ms
export const DRIVE_REPEAT_GAP = 1400;                       // between the two readings
export const DRIVE_BETWEEN = 900;                           // after an item
export const DRIVE_RECALL_AT = 2;                           // a word comes back this many words on
export const DRIVE_CARRY = 2;                               // words of the last group recalled at the next

export const DRIVE_OPTIONS = {
  direction: [{ id: "say", name: "Say it" }, { id: "hear", name: "Understand it" }, { id: "mix", name: "Both" }],
  pause: [{ id: "short", name: "Short" }, { id: "normal", name: "Normal" }, { id: "long", name: "Long" }],
  speed: [{ id: "normal", name: "Normal" }, { id: "slower", name: "Slower" }],
};
export const DRIVE_DEFAULTS = { direction: "say", pause: "normal", speed: "normal",
                                twice: true, sentences: true, names: true, next: true };
export const PAUSE_SCALE = { short: 0.7, normal: 1, long: 1.5 };

/* **The playlist** (the owner, 2026-10-15: *"like 25 different 'episodes'
   which are blocks of associated words, the earlier blocks simpler and later
   blocks more complex… select it like a podcast or playlist… largely
   coincide with vocab and sentences learned in the chapters"*). */
export const DRIVE_EPISODES = 25;
export const REVIEW_GROUPS = 5;

export const drivePrefs = (p) => ({ ...DRIVE_DEFAULTS, ...(p || {}) });

/* groups: [{ name, items: [{ ru, en, kind: "word" }], sentences: [{ ru, en, kind: "sentence" }] }]
   → segments:
   { t: "en" | "ru", text } | { t: "gap", ms } | { t: "group", name } | { t: "mark", group, item, first } */
export function driveScript(groups, prefs = {}) {
  const o = drivePrefs(prefs);
  const scale = PAUSE_SCALE[o.pause] || 1;
  const gap = (it) => Math.round((DRIVE_GAP[it.kind] || DRIVE_GAP.word) * scale);
  const out = [];
  let turn = 0;                                   // for "both": alternates prompt by prompt
  const prompt = (it, g, first) => {
    const hear = o.direction === "hear" || (o.direction === "mix" && turn++ % 2 === 1);
    out.push({ t: "mark", group: g, item: it, first, hear });
    if (hear) {
      // Understanding: the Russian, a pause to say what it means, the English.
      out.push({ t: "ru", text: it.ru });
      out.push({ t: "gap", ms: gap(it) });
      out.push({ t: "en", text: it.en });
      if (first && o.twice) { out.push({ t: "gap", ms: DRIVE_REPEAT_GAP }); out.push({ t: "ru", text: it.ru }); }
    } else {
      out.push({ t: "en", text: it.en });
      out.push({ t: "gap", ms: gap(it) });
      out.push({ t: "ru", text: it.ru });
      if (first && o.twice) { out.push({ t: "gap", ms: DRIVE_REPEAT_GAP }); out.push({ t: "ru", text: it.ru }); }
    }
    out.push({ t: "gap", ms: DRIVE_BETWEEN });
  };
  let carry = [];
  groups.forEach((grp, g) => {
    if (!grp.items.length) return;
    // A couple of the last group's words first: spacing across clusters.
    for (const it of carry) prompt(it, g - 1, false);
    if (o.names && grp.name) {
      out.push({ t: "group", name: grp.name });
      out.push({ t: "en", text: grp.name });
      out.push({ t: "gap", ms: DRIVE_BETWEEN });
    }
    const due = new Map();
    grp.items.forEach((it, k) => {
      for (const r of due.get(k) || []) prompt(grp.items[r], g, false);
      prompt(it, g, true);
      const at = k + DRIVE_RECALL_AT;
      if (at < grp.items.length) { if (!due.has(at)) due.set(at, []); due.get(at).push(k); }
    });
    // The group once more, start to finish, nothing given first.
    grp.items.forEach((it) => prompt(it, g, false));
    if (o.sentences) for (const s of grp.sentences || []) prompt(s, g, true);
    carry = grp.items.slice(-DRIVE_CARRY);
  });
  return out;
}

/* About how long a script runs: the gaps exactly, speech estimated. */
export function driveLength(script) {
  let ms = 0;
  for (const s of script) {
    if (s.t === "gap") ms += s.ms;
    else if (s.t === "en" || s.t === "ru") ms += 600 + String(s.text).length * 70;
  }
  return ms;
}

/* The course cut into episodes. `groups` is every usable group in course
   order ({ name, chapter, items, … }); each episode is a run of whole groups
   holding about an equal share of the words, so the first is the first
   chapter's greetings and the last is chapter ten's — simpler to harder by
   construction, because the course is. A group is never split, and a group
   of one word joins its neighbour rather than making a cluster of one. */
export function buildEpisodes(groups, n = DRIVE_EPISODES) {
  const usable = [];
  for (const g of groups) {
    if (!g.items.length) continue;
    const prev = usable[usable.length - 1];
    if (g.items.length < 2 && prev && prev.chapter === g.chapter) {
      usable[usable.length - 1] = { ...prev, items: prev.items.concat(g.items),
                                    idxs: (prev.idxs || []).concat(g.idxs || []) };
    } else usable.push(g);
  }
  const total = usable.reduce((s, g) => s + g.items.length, 0);
  if (!total) return [];
  const per = total / Math.min(n, usable.length);
  const out = [];
  const episodes = Math.min(n, usable.length);
  let cur = [], done = 0;
  usable.forEach((g, k) => {
    cur.push(g); done += g.items.length;
    const left = usable.length - k - 1;              // groups not yet placed
    const slotsLeft = episodes - out.length - 1;     // episodes still to open after this one
    if (slotsLeft <= 0) return;                      // the last takes everything left
    // Close at this episode's share of the words — or now, if waiting would
    // leave fewer groups than the episodes still to fill.
    const share = done >= per * (out.length + 1);
    if ((share && left >= slotsLeft) || left === slotsLeft) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out.map((gs, k) => ({
    id: k + 1,
    title: episodeTitle(gs),
    chapter: gs[0].chapter,
    groups: gs,
    words: gs.reduce((s, g) => s + g.items.length, 0),
  }));
}

/* An episode's name: its two largest groups, as a chapter heading reads. */
export function episodeTitle(groups) {
  const names = [...new Set(groups.slice().sort((a, b) => b.items.length - a.items.length).map((g) => g.name))];
  return names.slice(0, 2).join(" & ");
}
