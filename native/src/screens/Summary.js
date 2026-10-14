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
import { Screen, Muted, Heading, Subheading, Speaker, Btn } from "../ui";
import { Linked } from "../words";
import { RuleCard } from "../rules";
import { WordSections, WordRow, prepSentences, VideoLines } from "../prep";
import { UN, L, lessonWords, lessonCount, markComponent, linesWith, stepRoute,
         components } from "../data";

const unitWordIdxs = (unit) => Array.from({ length: lessonCount(unit) }, (_, k) => lessonWords(unit, k)).flat();

/* Sentences a summary shows: enough to see the words at work, few enough to
   stay a list. The whole unit gets more because it covers more. */
const LESSON_SENTENCES = 4;
const UNIT_SENTENCES = 8;

export default function Summary({ route, navigation }) {
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
  const idxs = whole ? unitWordIdxs(unit) : lessonWords(unit, index);
  const words = idxs.map((i) => L[i].b);
  const seen = st.seen || {};
  // The video's own sentences with these words first; the collection's
  // recorded ones only where the video has none.
  const lines = linesWith(unit, idxs, whole ? UNIT_SENTENCES : LESSON_SENTENCES);
  const sentences = lines.length ? [] : prepSentences(words, whole ? UNIT_SENTENCES : LESSON_SENTENCES);
  const note = unit.g || null;       // the unit's rule applies to every lesson in it
  const onward = onwardOf(st, unit, index, whole);
  /* The cards: the words, and sentences for what comes next (the owner,
     2026-10-09: "this block just had 5 verbs and it wasn't particularly
     helpful. Include sentences for the upcoming exercise") — the video's own
     lines when the video is next, else the sentences shown here. */
  const toVideo = onward && onward[0] === "Video";
  const cardSentences = (toVideo ? linesWith(unit, unitWordIdxs(unit), UNIT_SENTENCES).map((l) => l.ru) : [])
    .concat(lines.map((l) => l.ru), sentences.map((s) => s.ru));
  const cards = words.concat([...new Set(cardSentences)]);
  const go = () => navigation.replace("ListCards", { round: "list", title: unit.name, words: cards,
                                                      next: onward || undefined });

  return (
    <Screen footer={navigation ? (
      <Btn block kind="pri" testID="summary-continue" label="Continue" onPress={go} />
    ) : null}>
      {/* Which lesson, in the small heading style: the header bar already
          says Summary, and each section carries its own count. */}
      <Subheading testID="summary-title">{whole ? unit.name : `${unit.name} · Lesson ${index + 1}`}</Subheading>

      {/* The same row as the list before a video (prep.js WordRow), with a
          speaker where that list has a jump to the moment. */}
      <WordSections words={words} testID="summary-cluster"
                    renderWords={(ws) => ws.map((w, k) => (
                      <WordRow key={w} word={w} seen={seen} first={k === 0} speaker testID="summary" />))} />

      {lines.length ? (
        <View testID="summary-sentences" style={{ marginTop: 26 }}>
          <Heading>From the video</Heading>
          <VideoLines lines={lines} testID="summary-lines"
                      onMoment={navigation ? (l) => navigation.navigate("Video", { videoId: l.vid, at: l.t }) : undefined} />
        </View>
      ) : sentences.length ? (
        <View testID="summary-sentences" style={{ marginTop: 26 }}>
          <Heading>Sentences</Heading>
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
        <View testID="summary-grammar" style={{ marginTop: 26 }}>
          <Heading style={{ marginBottom: 10 }}>Grammar</Heading>
          <RuleCard note={note} />
        </View>
      ) : null}
    </Screen>
  );
}

/* Where a summary leads, one way only (the owner, 2026-10-09: "instead of
   having two options, force it to go to flashcards after the summary and
   then after flashcards they can do the video"): the lesson's words as
   cards, with sentences, and then the lesson's next step. The video goes
   straight to the player — its own summary would deal these cards again.
   The grammar episode's button went with the choice ("replace watch grammar
   episode with continue"). */
function onwardOf(st, unit, index, whole) {
  if (whole || index === lessonCount(unit) - 1) {
    if (unit.v) return ["Video", { videoId: unit.v.id, unitId: unit.id, index: whole ? 0 : index }];
  }
  if (whole) return null;
  const cs = components(st, unit, index);
  const at = cs.findIndex((c) => c.id === "summary");
  const after = cs.find((c, k) => k > at && !c.done && c.id !== "video" && c.id !== "vwords");
  if (after) return stepRoute(after.id, unit, index);
  return index + 1 < lessonCount(unit) ? ["Vocab", { unitId: unit.id, index: index + 1 }] : null;
}
