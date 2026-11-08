/* A word list in its sections and groups — the rule prep.js draws by on the
 * phone and the desktop's video workspace draws by on a computer. Pure: it
 * reads the units' groups and nothing of React Native, so both apps share one
 * answer to "which words sit together" (§30bi: related words together,
 * everywhere). */

import { L, UN, idxOfWord } from "./data";

/* The four sections every word list is drawn in, and the parts of speech each
   takes when a word has no group to say (tools/build_word_groups.mjs holds the
   same split, so a group's kind is the section it appears in here). */
export const CLUSTERS = [
  { id: "verb", name: "Verbs", pos: ["verb"] },
  { id: "noun", name: "Nouns", pos: ["noun"] },
  { id: "describing", name: "Describing words", pos: ["adjective", "adverb"] },
  { id: "little", name: "Everyday words", pos: null },   // whatever is left
];

/* Every curriculum word's group of related words, read once off the units
   (`gr`, build_site.py): its name, its section, and where the group and the
   word sit in the reading order. One table for the whole app, so a word is in
   the same company in a lesson, a unit's summary and a video's list — the
   owner, 2026-09-30: "Related words always need to be together throughout the
   entire app." */
let GROUP_OF = null;
function groupOf(word) {
  if (!GROUP_OF) {
    GROUP_OF = new Map();
    UN.forEach((u, ui) => (u.gr || []).forEach(([name, kind, ws], gi) => ws.forEach((i, wi) => {
      if (L[i] && !GROUP_OF.has(L[i].b)) GROUP_OF.set(L[i].b, { name, kind, order: ui * 1000 + gi, at: wi });
    })));
  }
  return GROUP_OF.get(word) || null;
}

/* The list in its sections, and inside each its groups of related words in
   the units' reading order, each group's words in their own order (the
   seasons winter to autumn). Groups of the same name in the same section are
   one group wherever they came from — a video's list spans units. A word no
   group names goes by its part of speech into a group with no heading. Empty
   sections are left out. */
export function clusterWords(words) {
  const out = CLUSTERS.map((c) => ({ ...c, groups: [], words: [] }));
  const place = [];
  words.forEach((word, n) => {
    const g = groupOf(word);
    const e = L[idxOfWord(word)];
    /* A word sits under the heading of its own part of speech — a group may
       mix them (the café's words with «заказать»), and «вкусный» and
       «горячий» in the Food group were listed under "Nouns" (the owner,
       2026-10-04). It keeps its group's name there; only a word whose class
       has no section of its own goes by the group's. */
    const own = CLUSTERS.find((c) => c.pos && e && c.pos.includes(e.p));
    const kind = own ? own.id : g ? g.kind : CLUSTERS[CLUSTERS.length - 1].id;
    place.push({ word, kind, name: g ? g.name : "", order: g ? g.order : 1e9, at: g ? g.at : n });
  });
  for (const c of out) {
    const mine = place.filter((p) => p.kind === c.id);
    const byName = new Map();
    for (const p of mine) {
      if (!byName.has(p.name)) byName.set(p.name, { name: p.name, order: p.order, words: [] });
      const grp = byName.get(p.name);
      grp.order = Math.min(grp.order, p.order);
      grp.words.push(p);
    }
    c.groups = [...byName.values()].sort((a, b) => a.order - b.order)
      .map((grp) => ({ name: grp.name,
                       words: grp.words.sort((a, b) => (a.order - b.order) || (a.at - b.at)).map((p) => p.word) }));
    c.words = c.groups.flatMap((grp) => grp.words);
  }
  return out.filter((c) => c.words.length);
}
