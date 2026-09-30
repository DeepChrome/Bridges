/* A unit's lessons, and inside a lesson its three components. */

import React from "react";
import { View, Pressable, Image } from "react-native";
import { SCENE_ART } from "../sceneart";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, List, Row, Bar, Thumb, Pill, Muted, Btn, Tick, Text } from "../ui";
import {
  UN, lessonCount, lessonWords, lessonDone, components, unitFineProgress, L, linesWith,
} from "../data";

export function UnitScreen({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  if (!unit) return null;
  const pr = unitFineProgress(st, unit);
  const n = lessonCount(unit);

  const art = SCENE_ART[unit.id];
  return (
    <Screen>
      {/* The unit's episode (docs/cast.md): the family doing what this unit
          teaches, and Monka's plan going wrong somewhere in it. No caption —
          the picture is the unit's subject, and the title is in the header. */}
      {art ? (
        <Image testID="unit-art" source={art} accessibilityIgnoresInvertColors
               accessible={false}
               style={{ width: "100%", aspectRatio: 1.5, borderRadius: radius.xl, marginBottom: 16 }} />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {Math.round(pr * 100)}%
        </Text>
        <Muted size={14}>complete</Muted>
      </View>
      <View style={{ marginTop: 8, marginBottom: 16 }}><Bar value={pr} /></View>

      <List>
        {Array.from({ length: n }, (_, i) => {
          const cs = components(st, unit, i);
          const words = lessonWords(unit, i).map((x) => L[x].b);
          return (
            <Row key={i}
                 onPress={() => navigation.navigate("Lesson",
                   { unitId: unit.id, index: i })}>
              <Thumb id={unit.id} done={lessonDone(st, unit, i)} n={i + 1} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                  {"Lesson " + (i + 1)}
                </Text>
                <Muted>{words.slice(0, 3).join(", ") + (words.length > 3 ? "…" : "")}</Muted>
              </View>
              <View style={{ flexDirection: "row", gap: 5 }}>
                {cs.filter((c) => !c.optional).map((c) => (
                  <View key={c.id} style={{ width: 9, height: 9, borderRadius: 5,
                                            backgroundColor: c.done ? t.good : t.surface3 }} />
                ))}
              </View>
            </Row>
          );
        })}
      </List>
      {/* Everything the unit teaches on one list, to study before its test. */}
      <Btn testID="unit-summary" label="Unit summary" style={{ marginTop: 16 }}
           onPress={() => navigation.navigate("Summary", { unitId: unit.id })} />
      {unit.kind === "spine" && unitFineProgress(st, unit) < 1 ? (
        <Btn label="Test out of this section" style={{ marginTop: 10 }}
             onPress={() => navigation.navigate("TestOut", { unitId: unit.id })} />
      ) : null}
    </Screen>
  );
}

const STEP_LABEL = { vocab: "Start the vocabulary", summary: "Review the summary", quiz: "Take the quiz", video: "Watch the video",
                     listen: "Listen to the conversation" };

export function LessonScreen({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const i = route.params.index;
  if (!unit) return null;
  const cs = components(st, unit, i);

  /* The brand edge goes on the next **required** step while one is left, so a
     finished lesson does not point at its optional extra as though the lesson
     were unfinished. Once the required work is done the extra takes it, which
     is the right nudge and not a demand. */
  const nextId = (cs.find((c) => !c.done && !c.optional) || cs.find((c) => !c.done) || {}).id;
  /* One place that knows where a step goes. It was written twice — here and on
     the primary button — which is exactly how the two come to disagree. */
  const open = (id) => {
    if (id === "listen") return navigation.navigate("Scenes", { key: `${unit.id}:${i}` });
    if (id === "summary") return navigation.navigate("Summary", { unitId: unit.id, index: i });
    return navigation.navigate(
      id === "video" ? "Video" : id === "quiz" ? "Quiz" : "Vocab",
      { unitId: unit.id, index: i });
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6,
                     marginBottom: 14 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {`${cs.filter((c) => c.done && !c.optional).length}/${cs.filter((c) => !c.optional).length}`}
        </Text>
        <Muted size={14}>steps done</Muted>
      </View>
      {/* Three cards with air between them rather than three rows of one list:
          the steps of a lesson are a short sequence, and a flat list of ticks
          read as a settings screen (the owner, 2026-09-10). The step to do next
          carries the brand edge, so the eye lands on it without a label. */}
      <View style={{ gap: 10 }}>
        {cs.map((c, k) => {
          const isNext = c.id === nextId;
          return (
            <Pressable
              key={c.id}
              testID={`step-${c.id}`}
              onPress={() => open(c.id)}
              style={({ pressed }) => ({
                backgroundColor: c.done ? t.surface2 : t.surface,
                borderColor: isNext ? t.brand : t.line,
                borderWidth: 1,
                borderBottomWidth: pressed ? 1 : isNext ? 3 : 1,
                marginBottom: pressed ? 2 : 0,
                borderRadius: radius.lg,
                padding: 15,
                flexDirection: "row", alignItems: "center", gap: 14,
                opacity: c.done ? 0.85 : 1,
              })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19,
                             alignItems: "center", justifyContent: "center",
                             backgroundColor: c.done ? t.good : isNext ? t.brand : t.surface2,
                             borderWidth: c.done || isNext ? 0 : 1, borderColor: t.line }}>
                <Text style={{ fontSize: c.done ? 17 : 15, fontWeight: "700",
                               color: c.done ? t.goodOn : isNext ? t.brandOn : t.ink3 }}>
                  {c.done ? "✓" : String(k + 1)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>
                  {c.label}
                </Text>
              </View>
              {c.id === "quiz" && typeof c.score === "number"
                ? <Pill tone={c.done ? "good" : undefined}>{c.score + "%"}</Pill> : null}
            </Pressable>
          );
        })}
      </View>
      {/* One primary action: the next undone step, or the next lesson. */}
      {!lessonDone(st, unit, i) ? (
        <Btn kind="pri" style={{ marginTop: 16 }}
             label={STEP_LABEL[nextId]}
             onPress={() => open(nextId)} />
      ) : i + 1 < lessonCount(unit) ? (
        <Btn kind="pri" style={{ marginTop: 16 }} label="Next lesson"
             onPress={() => navigation.setParams({ index: i + 1 })} />
      ) : null}
      {/* The lesson's words as a round of flashcards, on the way from the
          lesson to the video it prepares for (§30bf). */}
      <Btn testID="lesson-cards" style={{ marginTop: 10 }} label="Flashcards for this lesson"
           onPress={() => navigation.navigate("ListCards", {
             round: "list", title: unit.name,
             // The lesson's words, and the video's sentences that use them.
             words: lessonWords(unit, i).map((x) => L[x].b)
               .concat(linesWith(unit, lessonWords(unit, i)).map((l) => l.ru)) })} />
    </Screen>
  );
}
