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
import { Btn, Muted, SectionLabel, Speaker, Text, Fold, Pill, Heading, Subheading, IconButton } from "./ui";
import { Linked } from "./words";
import { ScoreRing } from "./skills";
import { RuleCard, IrregularTag } from "./rules";
import { familiarity, cardFor } from "@core/scheduler";
import { firstSense } from "@core/util";
import { L, UN, idxOfWord, rankOf, wordScore } from "./data";
import { hasRealAudio } from "./audio";

/* The sections and groups a list is drawn in live in wordgroups.js, which has
   no React Native in it, so the desktop's video workspace draws the same
   groups (§30cr). */
import { CLUSTERS, clusterWords } from "./wordgroups";
export { CLUSTERS, clusterWords };

/* The small facts a word carries on any list, as tags beside it rather than
   as sections of their own (the owner, 2026-09-30: "Irregular verbs don't
   need their own section, just little tags for irregular and reflexive"). */
export const isReflexive = (e) => !!e && e.p === "verb" && /(ся|сь)$/.test(e.b || "");
export function WordTags({ e }) {
  if (!e) return null;
  return (
    <>
      <IrregularTag word={e} testID={`irregular-${e.b}`} />
      {isReflexive(e) ? <Pill>Reflexive</Pill> : null}
    </>
  );
}

/* A section heading and its groups, drawn the same way on every list: the
   section in the ink colour with its count and a rule under it, each group's
   name in the brand colour above its words. `renderWords(words, group)` draws
   the rows, so a lesson keeps its own animated rows and a summary its own. */
export function WordSections({ words, renderWords, testID = "cluster" }) {
  return clusterWords(words).map((c, k) => (
    <View key={c.id} testID={`${testID}-${c.id}`} style={{ marginTop: k ? 26 : 12 }}>
      <Heading count={c.words.length}>{c.name}</Heading>
      {c.groups.map((grp) => (
        <View key={grp.name || "_"} testID={`group-${grp.name || c.id}`} style={{ marginTop: 12 }}>
          {grp.name ? <Subheading>{grp.name}</Subheading> : null}
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
export function VideoLines({ lines, onMoment, testID = "video-lines", mark }) {
  const t = useTheme();
  return (
    <View testID={testID}>
      {lines.map((l, k) => (
        <View key={l.ru + l.t} testID={`${testID}-${k}`}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
                       borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}>
          <View style={{ flex: 1 }}>
            <Linked text={l.ru} size={16} mark={mark} />
            <Muted>{l.en}</Muted>
          </View>
          <Speaker text={l.ru} size={36} />
          {onMoment ? (
            <IconButton testID={`${testID}-${k}-moment`} onPress={() => onMoment(l)} size={36}
                        label="Hear it in the video" border={false} fill={t.brandBg}>
              <Svg width={14} height={14} viewBox="0 0 24 24"><Path d={ARROW} fill={t.brandInk} /></Svg>
            </IconButton>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Jump({ word, active, onPress }) {
  const t = useTheme();
  return (
    <IconButton testID={`heard-${word}`} onPress={onPress} label={`Play where «${word}» is said`}
                border={false} fill={active ? t.brand : t.surface2}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={ARROW} fill={active ? t.brandOn : t.ink2} />
      </Svg>
    </IconButton>
  );
}

/* One row for a word in any list with scores — the list before a video, a
   lesson's or unit's summary (COURSE-ROADMAP WP6: the two had a row each).
   The word, its tags, its first meaning, where the learner stands (the
   flashcard's own ring, or "new"), and then either a jump to the moment it is
   said (`onJump`) or a speaker (`speaker`). */
export function WordRow({ word, seen, active, onJump, first, speaker, testID = "prep" }) {
  const t = useTheme();
  const e = L[idxOfWord(word)];
  const score = wordScore(seen[word], word);
  return (
    <View testID={`${testID}-${word}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
                   borderTopWidth: first ? 0 : 1, borderTopColor: t.lineSoft }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Linked text={e ? e.w : word} size={17} style={{ fontWeight: "600" }} />
          <WordTags e={e} />
        </View>
        {e && firstSense(e) ? <Muted numberOfLines={2}>{firstSense(e)}</Muted> : null}
      </View>
      {score === null
        ? <Muted size={12} testID={`${testID}-new-${word}`}>new</Muted>
        : <ScoreRing word={word} score={score} size={30} testID={`${testID}-score-${word}`} />}
      {onJump ? <Jump word={word} active={active} onPress={() => onJump(word)} /> : null}
      {speaker ? <Speaker text={word} size={36} /> : null}
    </View>
  );
}

export function PrepList({ words, seen, unit, focusWord, onJump, onCards, lines, onMoment, label = "Before you watch" }) {
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
      <SectionLabel gap>{label}</SectionLabel>
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
