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
                                twice: true, sentences: true, names: true, next: true, voice: true };
export const PAUSE_SCALE = { short: 0.7, normal: 1, long: 1.5 };

/* **The playlist** (the owner, 2026-10-15: *"different 'episodes' which are
   blocks of associated words, the earlier blocks simpler and later blocks
   more complex… select it like a podcast or playlist… largely coincide with
   vocab and sentences learned in the chapters"*): `buildEpisodes` below. */
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

/* **Spoken commands** (the owner, 2026-11-10: *"I'd like drive mode to be able
 * to take a few commands in English… Repeat… Continue… Back… Pause… Again…
 * Conjugate… Forms… you can say a case or a tense and it will drill those"*).
 *
 * The phone listens during the pauses — the only moments nothing is playing
 * (§30h′: a microphone open under a speaker hears the speaker) — for English,
 * and a word on this list is a command. Each has a few ways of being said,
 * longest matched first; the transcript has to *be* the command or end on it
 * («мама», heard by the English engine as "mama", matches nothing). */
export const COMMANDS = [
  { id: "repeat", say: ["repeat", "keep repeating", "loop"] },
  { id: "continue", say: ["continue", "carry on", "go on", "keep going", "resume"] },
  { id: "back", say: ["back", "go back", "previous"] },
  { id: "next", say: ["next", "skip", "forward"] },
  { id: "pause", say: ["pause", "stop", "wait", "hold on"] },
  { id: "play", say: ["play", "start"] },
  { id: "again", say: ["again", "once more", "one more time", "say it again", "say that again"] },
  { id: "conjugate", say: ["conjugate", "conjugation", "conjugations", "tenses"] },
  { id: "forms", say: ["forms", "form", "cases", "declension", "decline"] },
];
/* What a focus can be narrowed to: a verb's tables by tense, a declension by
   case. `table` picks tables by title, `row` picks rows by their label. */
export const FOCUS = [
  { id: "present", name: "Present", say: ["present", "present tense"], table: /^Present/, kind: "verb" },
  { id: "future", name: "Future", say: ["future", "future tense"], table: /^Present/, kind: "verb" },
  { id: "past", name: "Past", say: ["past", "past tense"], table: /^Past/, kind: "verb" },
  { id: "imperative", name: "Imperative", say: ["imperative", "command form", "commands"], table: /^Imperative/, kind: "verb" },
  { id: "nominative", name: "Nominative", say: ["nominative"], row: "Nominative", kind: "noun" },
  { id: "genitive", name: "Genitive", say: ["genitive"], row: "Genitive", kind: "noun" },
  { id: "dative", name: "Dative", say: ["dative"], row: "Dative", kind: "noun" },
  { id: "accusative", name: "Accusative", say: ["accusative"], row: "Accusative", kind: "noun" },
  { id: "instrumental", name: "Instrumental", say: ["instrumental"], row: "Instrumental", kind: "noun" },
  { id: "prepositional", name: "Prepositional", say: ["prepositional", "locative"], row: "Prepositional", kind: "noun" },
];
/* Every way a command can be said, for the recogniser's hint list. */
export const COMMAND_WORDS = COMMANDS.concat(FOCUS).flatMap((c) => c.say);

const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();

/* A transcript → { cmd } or { cmd: "focus", id }, or null. `avoid` is the
   English of the item being answered: with the prompt reversed ("Understand
   it") the learner says the meaning aloud into the pause, and «повторя́ть»
   is "to repeat", «наза́д» "back", «опя́ть» "again" — an answer, not an
   order. A command the item's own English contains is not one. */
export function parseCommand(text, avoid) {
  const t = normalise(text);
  if (!t) return null;
  const said = avoid ? ` ${normalise(avoid)} ` : "";
  const hit = (xs) => xs.slice().sort((a, b) => b.length - a.length)
    .find((w) => (t === w || t.endsWith(" " + w)) && !(said && said.includes(` ${w} `)));
  for (const f of FOCUS) if (hit(f.say)) return { cmd: "focus", id: f.id };
  for (const c of COMMANDS) if (hit(c.say)) return { cmd: c.id };
  return null;
}

/* **A word's tables, as a drive** — "conjugate" or "forms" on the word being
 * played. One cell at a time: the English of the cell ("she", "genitive
 * plural"), the pause, the Russian; each table announced as it opens. The
 * Russian of a verb's personal form is said with its pronoun («она чита́ла»),
 * since that is how the form is used; an imperative or a declined form alone.
 * Nothing is graded; "continue" returns to the lesson where it was.
 *
 * `entry` is a hydrated lemma ({ w, p, a, t }); `only` a FOCUS id. For a verb
 * the tables are its tenses, for anything declined its Declension. A verb
 * asked for "forms", or a noun for "conjugate", gets the tables it has. */
const PRONOUN_EN = { "я": "I", "ты": "you", "он / она": "he or she", "он": "he", "она": "she", "оно": "it",
                     "мы": "we", "вы": "you, plural", "они": "they" };
const VERB_TABLE = /^(Present|Past|Imperative)/;
const VERB_TABLE_NAME = { "Past": "Past", "Imperative": "Imperative" };

export function focusTables(entry, only) {
  const want = only ? FOCUS.find((f) => f.id === only) : null;
  const verb = entry && entry.p === "verb";
  let tables = (entry && entry.t || []).filter((t) => (verb ? VERB_TABLE : /^Declension$/).test(t.title || ""));
  if (want && want.table) tables = tables.filter((t) => want.table.test(t.title || ""));
  if (want && want.row) tables = tables.map((t) => ({ ...t, rows: (t.rows || []).filter((r) => r[0] === want.row) }))
    .filter((t) => t.rows.length);
  return tables;
}

/* The name a table is announced by. A verb's "Present / Future" is one or the
   other by its aspect (core/forms.js tableLabel's rule, kept here so core/drive
   stays free of that import's other baggage). */
export function focusTableName(title, entry) {
  if (/^Present/.test(title)) {
    const a = entry && entry.a;
    return a === "perfective" ? "Future" : a === "imperfective" ? "Present" : "Present or future";
  }
  return VERB_TABLE_NAME[title] || "Forms";
}

export function focusScript(entry, opts = {}) {
  const o = drivePrefs(opts.prefs);
  const scale = PAUSE_SCALE[o.pause] || 1;
  const gap = Math.round(DRIVE_GAP.word * scale);
  const out = [];
  const tables = focusTables(entry, opts.only);
  for (const t of tables) {
    const name = focusTableName(t.title, entry);
    out.push({ t: "group", name });
    out.push({ t: "en", text: name });
    out.push({ t: "gap", ms: DRIVE_BETWEEN });
    const verb = VERB_TABLE.test(t.title || "");
    const cols = t.columns || [];
    for (const row of t.rows || []) {
      const label = String(row[0] || "").trim();
      for (let ci = 1; ci < row.length; ci++) {
        const forms = Array.isArray(row[ci]) ? row[ci] : [row[ci]];
        const form = forms.find(Boolean);
        if (!form) continue;
        const col = String(cols[ci] || "").trim();
        const generic = /^(form|forms)?$/i.test(col);
        let en, ru, parts;
        if (verb) {
          en = PRONOUN_EN[label] || label;
          const pronoun = /^Imperative/.test(t.title) ? null : label.split(" / ")[0];
          parts = pronoun ? [pronoun, form] : [form];
          ru = parts.join(" ");
        } else {
          en = generic ? label.toLowerCase() : `${label.toLowerCase()}, ${col.toLowerCase()}`;
          parts = [form];
          ru = form;
        }
        out.push({ t: "mark", item: { ru, en, kind: "word", b: entry.b }, focus: true, first: false, hear: false });
        out.push({ t: "en", text: en });
        out.push({ t: "gap", ms: gap });
        parts.forEach((p, k) => { if (k) out.push({ t: "gap", ms: 200 }); out.push({ t: "ru", text: p }); });
        out.push({ t: "gap", ms: DRIVE_BETWEEN });
      }
    }
  }
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

/* The course cut into episodes, **chapter by chapter** (the owner, 2026-11-10:
   *"ensure the categories make sense… synch it with the chapters… organized
   by words learned in specific chapters"*). `groups` is every usable group in
   course order ({ name, chapter, items, … }). A chapter's groups are cut into
   as many episodes as its words fill at about `EPISODE_WORDS` each, each a run
   of whole groups holding an equal share, so an episode never straddles two
   chapters and the list reads as the course does. A group is never split, and
   a group of one word joins its neighbour rather than making a cluster of one.
   The old cut was 25 equal shares over the whole course, whose titles ("Swamps
   & Berries") said nothing about where a learner was. */
export const EPISODE_WORDS = 50;

export function buildEpisodes(groups, perEpisode = EPISODE_WORDS) {
  const usable = [];
  for (const g of groups) {
    if (!g.items.length) continue;
    const prev = usable[usable.length - 1];
    if (g.items.length < 2 && prev && prev.chapter === g.chapter) {
      usable[usable.length - 1] = { ...prev, items: prev.items.concat(g.items),
                                    idxs: (prev.idxs || []).concat(g.idxs || []) };
    } else usable.push(g);
  }
  const out = [];
  const chapters = [...new Set(usable.map((g) => g.chapter))];
  for (const ch of chapters) {
    const mine = usable.filter((g) => g.chapter === ch);
    const total = mine.reduce((s, g) => s + g.items.length, 0);
    const episodes = Math.max(1, Math.min(mine.length, Math.round(total / perEpisode)));
    const per = total / episodes;
    const runs = [];
    let cur = [], done = 0;
    mine.forEach((g, k) => {
      cur.push(g); done += g.items.length;
      const left = mine.length - k - 1;                // groups not yet placed
      const slotsLeft = episodes - runs.length - 1;    // episodes still to open after this one
      if (slotsLeft <= 0) return;                      // the last takes everything left
      // Close at this episode's share of the words — or now, if waiting would
      // leave fewer groups than the episodes still to fill.
      const share = done >= per * (runs.length + 1);
      if ((share && left >= slotsLeft) || left === slotsLeft) { runs.push(cur); cur = []; }
    });
    if (cur.length) runs.push(cur);
    runs.forEach((gs, k) => out.push({
      id: out.length + 1,
      title: episodeTitle(gs),
      chapter: ch,
      part: k + 1, parts: runs.length,
      groups: gs,
      words: gs.reduce((s, g) => s + g.items.length, 0),
    }));
  }
  return out;
}

/* An episode's name: its groups, largest first, up to three. */
export function episodeTitle(groups) {
  const names = [...new Set(groups.slice().sort((a, b) => b.items.length - a.items.length).map((g) => g.name))];
  return names.slice(0, 3).join(" · ") + (names.length > 3 ? " …" : "");
}

/* The sleep timer's choices, in minutes (the owner, 2026-11-10: *"a little
   sleep button… set a number of minutes for it to keep playing before the
   exercise ends"*). */
export const SLEEP_MINUTES = [10, 20, 30, 45, 60];
