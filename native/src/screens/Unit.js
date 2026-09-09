/* A unit's lessons, and inside a lesson its three components. */

import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, List, Row, Bar, Thumb, Pill, Muted, Btn, Tick } from "../ui";
import {
  UN, lessonCount, lessonWords, lessonDone, components, unitFineProgress, L,
} from "../data";
import { prefetchUnit } from "../cache";

export function UnitScreen({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const [fetching, setFetching] = useState(null);   // { done, total } | "done" | null
  // Opening a unit is the moment to fetch its audio for offline use, and the
  // next unit's; only with the setting on, and only once per visit.
  useEffect(() => {
    if (!unit || !st.offline) return undefined;
    let live = true;
    setFetching({ done: 0, total: 0 });
    prefetchUnit(unit, (p) => { if (live) setFetching(p); })
      .then((r) => { if (live) setFetching(r.failed && !r.fetched ? "failed" : "done"); })
      .catch(() => { if (live) setFetching("failed"); });
    return () => { live = false; };
  }, [unit && unit.id, st.offline]);
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
        <View style={{ flex: 1 }} />
        {fetching && fetching !== "done" ? (
          <Muted testID="offline-status" size={12}>
            {fetching === "failed" ? "Audio not downloaded"
              : fetching.total ? `Downloading audio ${fetching.done}/${fetching.total}` : "Checking audio…"}
          </Muted>
        ) : fetching === "done" ? (
          <Muted testID="offline-status" size={12}>Audio saved for offline</Muted>
        ) : null}
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

const STEP_LABEL = { vocab: "Start the vocabulary", quiz: "Take the quiz", video: "Watch the video" };

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
          {`${cs.filter((c) => c.done).length}/${cs.length}`}
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
      {/* One primary action: the next undone step, or the next lesson. */}
      {!lessonDone(st, unit, i) ? (
        <Btn kind="pri" style={{ marginTop: 16 }}
             label={STEP_LABEL[cs.find((c) => !c.done).id]}
             onPress={() => {
               const c = cs.find((x) => !x.done);
               navigation.navigate(c.id === "video" ? "Video" : c.id === "quiz" ? "Quiz" : "Vocab",
                                   { unitId: unit.id, index: i });
             }} />
      ) : i + 1 < lessonCount(unit) ? (
        <Btn kind="pri" style={{ marginTop: 16 }} label="Next lesson"
             onPress={() => navigation.setParams({ index: i + 1 })} />
      ) : null}
    </Screen>
  );
}
