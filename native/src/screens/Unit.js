/* A unit's lessons, and inside a lesson its three components. */

import React from "react";
import { View, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, List, Row, Bar, Thumb, Pill, Muted, Btn } from "../ui";
import {
  UN, lessonCount, lessonWords, lessonDone, components, unitFineProgress, L,
} from "../data";

function Tick({ on }) {
  const t = useTheme();
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2,
                   borderColor: on ? t.good : t.line,
                   backgroundColor: on ? t.goodBg : "transparent",
                   alignItems: "center", justifyContent: "center" }}>
      {on ? (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.good}
             strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m5 13 4 4 10-10" />
        </Svg>
      ) : null}
    </View>
  );
}

export function UnitScreen({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  if (!unit) return null;
  const pr = unitFineProgress(st, unit);
  const n = lessonCount(unit);

  return (
    <Screen>
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
            <Row key={i} last={i === n - 1}
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
                {cs.map((c) => (
                  <View key={c.id} style={{ width: 9, height: 9, borderRadius: 5,
                                            backgroundColor: c.done ? t.good : t.surface3 }} />
                ))}
              </View>
            </Row>
          );
        })}
      </List>
      {unit.kind === "spine" && unitFineProgress(st, unit) < 1 ? (
        <Btn label="Test out of this section" style={{ marginTop: 16 }}
             onPress={() => navigation.navigate("TestOut", { unitId: unit.id })} />
      ) : null}
    </Screen>
  );
}

export function LessonScreen({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const i = route.params.index;
  if (!unit) return null;
  const cs = components(st, unit, i);
  const copy = {
    vocab: "Meet the new words",
    quiz: "Show you know them",
    video: "Hear them in the wild · shared across this unit",
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6,
                     marginBottom: 14 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {cs.filter((c) => c.done).length}/{cs.length}
        </Text>
        <Muted size={14}>steps done</Muted>
      </View>
      <List>
        {cs.map((c, k) => (
          <Row key={c.id} last={k === cs.length - 1}
               onPress={() => {
                 const dest = c.id === "video" ? "Video"
                            : c.id === "quiz" ? "Quiz" : "Vocab";
                 navigation.navigate(dest, { unitId: unit.id, index: i });
               }}>
            <Tick on={c.done} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                {c.label}
              </Text>
              <Muted>{copy[c.id]}</Muted>
            </View>
            {c.id === "quiz" && typeof c.score === "number"
              ? <Pill tone={c.done ? "good" : undefined}>{c.score + "%"}</Pill> : null}
          </Row>
        ))}
      </List>
      {lessonDone(st, unit, i) && i + 1 < lessonCount(unit) ? (
        <Btn kind="pri" style={{ marginTop: 16 }} label="Next lesson"
             onPress={() => navigation.setParams({ index: i + 1 })} />
      ) : null}
    </Screen>
  );
}
