/* Before you watch — a video's word list, read before pressing play (§30bf).
 *
 * The video is the goal a unit works towards, so its words are the ones to
 * have in hand first: grouped the way a learner thinks about them (things to
 * do, things, what they are like, the little words that hold a sentence
 * together), each with where the learner stands on it, a jump to where the
 * video says it, and every Russian word underlined for the dictionary. A few
 * of the collection's sentences using them, the unit's grammar point, and at
 * the top the whole list as a round of flashcards.
 */

import React from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
import { Btn, Muted, SectionLabel, Familiarity, Speaker, Text, Fold, Pill } from "./ui";
import { Linked } from "./words";
import { RuleCard } from "./rules";
import { familiarity, cardFor } from "@core/scheduler";
import { firstSense } from "@core/util";
import { isIrregular } from "@core/facts";
import { L, UN, idxOfWord, rankOf } from "./data";
import { hasRealAudio } from "./audio";

/* The four sections every word list is drawn in, and the parts of speech each
   takes when a word has no group to say (tools/build_word_groups.mjs holds the
   same split, so a group's kind is the section it appears in here). */
export const CLUSTERS = [
  { id: "verb", name: "Verbs", pos: ["verb"] },
  { id: "noun", name: "Nouns", pos: ["noun"] },
  { id: "describing", name: "Describing words", pos: ["adjective", "adverb"] },
  { id: "little", name: "Little words", pos: null },   // whatever is left
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
    const kind = g ? g.kind
      : (CLUSTERS.find((c) => c.pos && e && c.pos.includes(e.p)) || CLUSTERS[CLUSTERS.length - 1]).id;
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

/* The small facts a word carries on any list, as tags beside it rather than
   as sections of their own (the owner, 2026-09-30: "Irregular verbs don't
   need their own section, just little tags for irregular and reflexive"). */
export const isReflexive = (e) => !!e && e.p === "verb" && /(ся|сь)$/.test(e.b || "");
export function WordTags({ e }) {
  if (!e) return null;
  return (
    <>
      {isIrregular(e) ? <Pill tone="irregular">Irregular</Pill> : null}
      {isReflexive(e) ? <Pill>Reflexive</Pill> : null}
    </>
  );
}

/* A section heading and its groups, drawn the same way on every list: the
   section in the ink colour with its count and a rule under it, each group's
   name in the brand colour above its words. `renderWords(words, group)` draws
   the rows, so a lesson keeps its own animated rows and a summary its own. */
export function WordSections({ words, renderWords, testID = "cluster" }) {
  const t = useTheme();
  return clusterWords(words).map((c, k) => (
    <View key={c.id} testID={`${testID}-${c.id}`} style={{ marginTop: k ? 26 : 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingBottom: 6,
                     borderBottomWidth: 2, borderBottomColor: t.line }}>
        <Text style={{ color: t.ink, fontSize: 19, fontWeight: "800" }}>{c.name}</Text>
        <Muted>{String(c.words.length)}</Muted>
      </View>
      {c.groups.map((grp) => (
        <View key={grp.name || "_"} testID={`group-${grp.name || c.id}`} style={{ marginTop: 12 }}>
          {grp.name ? (
            <Text style={{ color: t.brand, fontSize: 13, fontWeight: "700", letterSpacing: 0.6,
                           textTransform: "uppercase", marginBottom: 2 }}>{grp.name}</Text>
          ) : null}
          {renderWords(grp.words, grp)}
        </View>
      ))}
    </View>
  ));
}

/* A handful of short sentences from the collection, one per word in list
   order, never the same sentence twice. Short, because these are read before
   a video, not studied: the video is the long listen. */
export const PREP_SENTENCES = 4;
const SENTENCE_MAX_WORDS = 8;
export function prepSentences(words, n = PREP_SENTENCES) {
  const out = [], have = new Set();
  for (const word of words) {
    if (out.length >= n) break;
    const e = L[idxOfWord(word)];
    // Only sentences with a recording: the phone's voice reading a sentence
    // is the grey speaker the owner asked not to be offered here (2026-09-29).
    const ex = ((e && e.x) || [])
      .filter((x) => x.en && !have.has(x.ru) && x.ru.split(/\s+/).length <= SENTENCE_MAX_WORDS
              && hasRealAudio(x.ru))
      .sort((a, b) => a.ru.length - b.ru.length)[0];
    if (ex) { have.add(ex.ru); out.push(ex); }
  }
  return out;
}

const ARROW = "M8 5l11 7-11 7z";

/* Sentences from the video itself (data.js `videoLines`): the Russian, every
   word a link; the English under it; a speaker for the lessons' recording of
   it; and ▶ to hear the speaker say it in the video. One component wherever a
   lesson shows the video's sentences — the word card, the summary, the list
   before watching, the lesson's own "from the video" step. */
export function VideoLines({ lines, onMoment, testID = "video-lines" }) {
  const t = useTheme();
  return (
    <View testID={testID}>
      {lines.map((l, k) => (
        <View key={l.ru + l.t} testID={`${testID}-${k}`}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
                       borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}>
          <View style={{ flex: 1 }}>
            <Linked text={l.ru} size={16} />
            <Muted>{l.en}</Muted>
          </View>
          <Speaker text={l.ru} size={36} />
          {onMoment ? (
            <Pressable testID={`${testID}-${k}-moment`} onPress={() => onMoment(l)} hitSlop={4}
                       accessibilityRole="button" accessibilityLabel="Hear it in the video"
                       style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center",
                                                  justifyContent: "center", backgroundColor: t.brandBg,
                                                  opacity: pressed ? 0.6 : 1 })}>
              <Svg width={14} height={14} viewBox="0 0 24 24"><Path d={ARROW} fill={t.brandInk} /></Svg>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Jump({ word, active, onPress }) {
  const t = useTheme();
  return (
    <Pressable testID={`heard-${word}`} onPress={onPress} hitSlop={4}
               accessibilityRole="button" accessibilityLabel={`Play where «${word}» is said`}
               style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20,
                                          alignItems: "center", justifyContent: "center",
                                          backgroundColor: active ? t.brand : t.surface2,
                                          opacity: pressed ? 0.6 : 1 })}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={ARROW} fill={active ? t.brandOn : t.ink2} />
      </Svg>
    </Pressable>
  );
}

function WordRow({ word, seen, active, onJump, first }) {
  const t = useTheme();
  const e = L[idxOfWord(word)];
  const score = familiarity(cardFor(seen[word] || null), rankOf(word));
  return (
    <View testID={`prep-${word}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
                   borderTopWidth: first ? 0 : 1, borderTopColor: t.lineSoft }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Linked text={e ? e.w : word} size={17} style={{ fontWeight: "600" }} />
          <WordTags e={e} />
        </View>
        {e && firstSense(e) ? <Muted numberOfLines={1}>{firstSense(e)}</Muted> : null}
      </View>
      {/* Where the learner stands: the flashcard's own ring, or "new". */}
      {score === null
        ? <Muted size={12} testID={`prep-new-${word}`}>new</Muted>
        : <Familiarity score={score} size={30} testID={`prep-score-${word}`} />}
      <Jump word={word} active={active} onPress={() => onJump(word)} />
    </View>
  );
}

export function PrepList({ words, seen, unit, focusWord, onJump, onCards, lines, onMoment }) {
  const t = useTheme();
  if (!words.length) return <Muted>No study words are spoken in this one.</Muted>;
  const met = words.filter((w) => seen[w]).length;
  // The video's own sentences where it has them; otherwise the collection's
  // recorded ones.
  const own = lines && lines.length ? lines : null;
  const sentences = own ? [] : prepSentences(words);
  const note = unit && unit.g;
  return (
    <View testID="prep">
      <SectionLabel style={{ marginTop: 18 }}>Before you watch</SectionLabel>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Muted testID="prep-met" style={{ flex: 1 }}>{`${met} of ${words.length} met`}</Muted>
        <Btn kind="pri" testID="prep-cards" label="Flashcards" onPress={() => onCards(words)} />
      </View>
      <WordSections words={words} renderWords={(ws) => ws.map((w, k) => (
        <WordRow key={w} word={w} seen={seen} first={k === 0}
                 active={focusWord === w} onJump={onJump} />
      ))} />
      {own ? (
        <View testID="prep-sentences" style={{ marginTop: 16 }}>
          <Text style={{ color: t.ink3, fontSize: 13, fontWeight: "700" }}>Sentences</Text>
          <VideoLines lines={own} onMoment={onMoment} testID="prep-lines" />
        </View>
      ) : sentences.length ? (
        <View testID="prep-sentences" style={{ marginTop: 16 }}>
          <Text style={{ color: t.ink3, fontSize: 13, fontWeight: "700" }}>Sentences</Text>
          {sentences.map((s, k) => (
            <View key={s.ru} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
                                      borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}>
              <View style={{ flex: 1 }}>
                <Linked text={s.ru} size={16} />
                <Muted>{s.en}</Muted>
              </View>
              <Speaker text={s.ru} size={36} />
            </View>
          ))}
        </View>
      ) : null}
      {note ? (
        <Fold testID="prep-grammar" title="Grammar" style={{ marginTop: 12 }}>
          <RuleCard note={note} />
        </Fold>
      ) : null}
    </View>
  );
}
