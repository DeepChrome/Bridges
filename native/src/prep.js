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
import { Btn, Muted, SectionLabel, Familiarity, Speaker, Text, Fold } from "./ui";
import { Linked } from "./words";
import { RuleCard } from "./rules";
import { familiarity, cardFor } from "@core/scheduler";
import { firstSense } from "@core/util";
import { L, idxOfWord, rankOf } from "./data";
import { hasRealAudio } from "./audio";

export const CLUSTERS = [
  { id: "verb", name: "Verbs", pos: ["verb"] },
  { id: "noun", name: "Nouns", pos: ["noun"] },
  { id: "desc", name: "Describing words", pos: ["adjective", "adverb"] },
  { id: "small", name: "Little words", pos: null },   // whatever is left
];

/* The list in its clusters, each keeping the list's own order (the build puts
   the unit's words first, most-said first). Empty clusters are left out. */
export function clusterWords(words) {
  const out = CLUSTERS.map((c) => ({ ...c, words: [] }));
  for (const word of words) {
    const e = L[idxOfWord(word)];
    const p = e ? e.p : "";
    const c = out.find((x) => x.pos && x.pos.includes(p)) || out[out.length - 1];
    c.words.push(word);
  }
  return out.filter((c) => c.words.length);
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
        <Linked text={e ? e.w : word} size={17} style={{ fontWeight: "600" }} />
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
  const clusters = clusterWords(words);
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
      {clusters.map((c) => (
        <View key={c.id} testID={`cluster-${c.id}`} style={{ marginTop: 12 }}>
          <Text style={{ color: t.ink3, fontSize: 13, fontWeight: "700" }}>{c.name}</Text>
          {c.words.map((w, k) => (
            <WordRow key={w} word={w} seen={seen} first={k === 0}
                     active={focusWord === w} onJump={onJump} />
          ))}
        </View>
      ))}
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
