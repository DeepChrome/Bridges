/* Learn — the path. Stages down the screen, a core unit each with its branches. */

import React from "react";
import { View, Text } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import {
  Screen, List, Row, Btn, Pill, Bar, Thumb, Muted, styles,
} from "../ui";
import {
  STAGES, lessonCount, lessonDone, unitFineProgress, unitProgress,
  stageDone, stageUnlocked, unitUnlocked, nextLesson,
} from "../data";

function UnitRow({ unit, open, branch, onOpen, last }) {
  const { st } = useSession();
  const t = useTheme();
  const pr = unitFineProgress(st, unit);
  const complete = unitProgress(st, unit) >= 1;
  let done = 0;
  for (let i = 0; i < lessonCount(unit); i++) if (lessonDone(st, unit, i)) done++;

  return (
    <Row onPress={() => onOpen(unit)} disabled={!open} last={last}>
      <View style={{ marginLeft: branch ? 18 : 0 }}>
        <Thumb id={unit.id} done={complete} locked={!open} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>{unit.name}</Text>
        <Muted>
          {open ? `${done}/${lessonCount(unit)} lessons · ${Math.round(pr * 100)}%`
                : "Locked"}
        </Muted>
        <View style={{ marginTop: 6 }}><Bar value={pr} /></View>
      </View>
    </Row>
  );
}

export default function Learn({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const next = nextLesson(st);
  const openUnit = (unit) => navigation.navigate("Unit", { unitId: unit.id });

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {(st.xp || 0).toLocaleString("en-US")}
        </Text>
        <Muted size={14}>XP</Muted>
        <Text style={{ color: t.ink3, marginHorizontal: 4 }}>·</Text>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {st.streak || 0}
        </Text>
        <Muted size={14}>{st.streak === 1 ? "day" : "days"} in a row</Muted>
      </View>

      {next ? (
        <Btn
          kind="pri"
          style={{ marginTop: 12 }}
          label={`${unitFineProgress(st, next.unit) > 0 ? "Continue" : "Start"} · ${next.unit.name} · Lesson ${next.index + 1}`}
          onPress={() => navigation.navigate("Unit", { unitId: next.unit.id })}
        />
      ) : null}

      {STAGES.map((stage, i) => {
        const open = stageUnlocked(st, i);
        const units = [{ u: stage.core, branch: false }]
          .concat(stage.branches.map((u) => ({ u, branch: true })));
        return (
          <View key={stage.core.id} style={{ marginTop: 22 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
                           marginBottom: 9 }}>
              {/* One string, not two children: a screen reader should hear
                  "Stage 1", not "Stage" then "1". */}
              <Text style={[styles.sectionLabel, { color: t.ink2, marginBottom: 0 }]}>
                {`Stage ${i + 1}`}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              {stageDone(st, stage) ? <Pill tone="good">done</Pill>
                : !open ? <Pill>locked</Pill> : null}
            </View>
            <List>
              {units.map(({ u, branch }, k) => (
                <UnitRow
                  key={u.id}
                  unit={u}
                  branch={branch}
                  open={unitUnlocked(st, u)}
                  onOpen={openUnit}
                  last={k === units.length - 1}
                />
              ))}
            </List>
          </View>
        );
      })}
    </Screen>
  );
}
