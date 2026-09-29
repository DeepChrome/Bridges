/* The summary — what a lesson (or a whole unit) taught, as one list to scroll
 * before the quiz or the test (the owner, 2026-09-29: *"a summary before the
 * quiz that is just a reference on what was learned in a quick scrollable
 * list. They can use this to study before taking the quiz for that lesson or
 * the test for that chapter."*).
 *
 * A reference, not a lesson: nothing is asked and nothing graded. Grouped the
 * way the video's word list is (prep.js `clusterWords`), each word underlined
 * for its entry, its meaning, a speaker, the learner's score and the irregular
 * flag; then a few sentences using them, and the grammar card. Opening a
 * lesson's summary marks the optional step done; the unit's summary is a
 * button on the unit screen, before its test.
 */

import React, { useEffect } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Muted, SectionLabel, Speaker, Pill, Familiarity, Text } from "../ui";
import { Linked } from "../words";
import { RuleCard } from "../rules";
import { clusterWords, prepSentences } from "../prep";
import { UN, L, idxOfWord, rankOf, lessonWords, lessonCount, markComponent } from "../data";
import { familiarity, cardFor } from "@core/scheduler";
import { firstSense } from "@core/util";
import { isIrregular } from "@core/facts";

/* Sentences a summary shows: enough to see the words at work, few enough to
   stay a list. The whole unit gets more because it covers more. */
const LESSON_SENTENCES = 4;
const UNIT_SENTENCES = 8;

function WordLine({ word, seen, first }) {
  const t = useTheme();
  const e = L[idxOfWord(word)];
  const score = familiarity(cardFor(seen[word] || null), rankOf(word));
  return (
    <View testID={`summary-${word}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
                   borderTopWidth: first ? 0 : 1, borderTopColor: t.lineSoft }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Linked text={e ? e.w : word} size={17} style={{ fontWeight: "600" }} />
          {e && isIrregular(e) ? <Pill tone="irregular">Irregular</Pill> : null}
        </View>
        {e && firstSense(e) ? <Muted numberOfLines={2}>{firstSense(e)}</Muted> : null}
      </View>
      {score === null ? null : <Familiarity score={score} size={28} />}
      <Speaker text={word} size={36} />
    </View>
  );
}

export default function Summary({ route }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const { unitId, index } = route.params || {};
  const unit = UN.find((u) => u.id === unitId);
  const whole = index === undefined || index === null;

  // A lesson's summary counts as its optional step once it has been opened.
  useEffect(() => {
    if (!ready || !unit || whole) return;
    if (((st.unit[unit.id] || {}).lessons || {})[index]?.s) return;
    update((prev) => markComponent(prev, unit, index, "summary"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!unit) return null;
  const idxs = whole
    ? Array.from({ length: lessonCount(unit) }, (_, k) => lessonWords(unit, k)).flat()
    : lessonWords(unit, index);
  const words = idxs.map((i) => L[i].b);
  const seen = st.seen || {};
  const sentences = prepSentences(words, whole ? UNIT_SENTENCES : LESSON_SENTENCES);
  const note = unit.g || null;       // the unit's rule applies to every lesson in it

  return (
    <Screen>
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
        {whole ? unit.name : `${unit.name} · Lesson ${index + 1}`}
      </Text>
      <Muted testID="summary-count">{`${words.length} words`}</Muted>

      {clusterWords(words).map((c) => (
        <View key={c.id} testID={`summary-cluster-${c.id}`} style={{ marginTop: 16 }}>
          <SectionLabel>{c.name}</SectionLabel>
          {c.words.map((w, k) => <WordLine key={w} word={w} seen={seen} first={k === 0} />)}
        </View>
      ))}

      {sentences.length ? (
        <View testID="summary-sentences" style={{ marginTop: 16 }}>
          <SectionLabel>Sentences</SectionLabel>
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
        <View testID="summary-grammar" style={{ marginTop: 16 }}>
          <SectionLabel>Grammar</SectionLabel>
          <RuleCard note={note} />
        </View>
      ) : null}
    </Screen>
  );
}
