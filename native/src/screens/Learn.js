/* Learn — the path. Nodes on a route, not a column of cards.
 *
 * Each unit is a disc carrying its own progress as a ring, with its name beneath it,
 * and a chapter meanders left and right instead of stacking. The offsets come from
 * `COL`, which build_topics.py assigned when it laid the curriculum out — the route
 * bends the way the data says rather than by an alternation invented here.
 *
 * The web app draws the ring with a conic gradient, which React Native has no
 * equivalent for; here it is a stroked circle with a dash offset. Same four states,
 * same colours, different renderer — that is the kind of difference rule 20a allows.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Btn, Pill, UnitIcon, Muted, styles } from "../ui";
import {
  STAGES, COL, lessonCount, lessonDone, unitFineProgress, unitProgress,
  stageDone, stageUnlocked, unitUnlocked, nextLesson,
} from "../data";

const SWING = 58;          // px either side of the centre line
const STROKE = 5;

function PathNode({ unit, open, branch, onOpen }) {
  const { st } = useSession();
  const t = useTheme();
  const [pressed, setPressed] = React.useState(false);

  const pr = unitFineProgress(st, unit);
  const complete = unitProgress(st, unit) >= 1;
  let done = 0;
  for (let i = 0; i < lessonCount(unit); i++) if (lessonDone(st, unit, i)) done++;

  /* Four states, and the disc says which without a word. "Underway" keys on fine
     progress rather than completed lessons: a unit with a video needs that video
     watched before any lesson counts as done, so finished lesson bodies would
     otherwise still show as untouched. */
  const tone = complete
    ? { arc: t.good, p: 1, face: t.goodBg, icon: t.good, track: t.surface3,
        lip: t.line, nm: t.ink }
    : !open
    ? { arc: null, p: 0, face: t.surface2, icon: t.ink3, track: t.lineSoft,
        lip: t.lineSoft, nm: t.ink3 }
    : pr > 0
    ? { arc: t.brand, p: pr, face: t.surface, icon: t.brandInk, track: t.surface3,
        lip: t.line, nm: t.ink }
    // Available but untouched: the ring stays neutral and the icon carries the
    // invitation. A full coloured ring has to mean finished, or a fresh unit and a
    // completed one look identical.
    : { arc: null, p: 0, face: t.surface, icon: t.brand, track: t.surface3,
        lip: t.line, nm: t.ink };

  const size = branch ? 56 : 68;
  const iconSize = branch ? 22 : 26;
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const drop = pressed && open ? 2 : 0;

  return (
    <Pressable
      onPress={open ? () => onOpen(unit) : undefined}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={`node-${unit.id}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !open }}
      accessibilityLabel={
        !open ? `${unit.name}, locked`
          : done === 0 ? `${unit.name}, ${lessonCount(unit)} lessons`
          : `${unit.name}, ${done} of ${lessonCount(unit)} lessons done`
      }
      style={{
        alignItems: "center", width: branch ? 104 : 118, paddingTop: 6,
        paddingBottom: 10, transform: [{ translateX: (COL[unit.id] || 0) * SWING }],
      }}
    >
      <View style={{ width: size, height: size + 3 }}>
        {/* The lip: a solid edge under the disc, so pressing it has somewhere to go.
            RN's shadows are blurred, so this is a plain circle rather than a shadow. */}
        <View style={{ position: "absolute", left: 0, top: 3, width: size, height: size,
                       borderRadius: size / 2, backgroundColor: tone.lip }} />
        <View style={{ position: "absolute", left: 0, top: drop, width: size,
                       height: size, borderRadius: size / 2,
                       backgroundColor: tone.face, alignItems: "center",
                       justifyContent: "center" }}>
          <Svg width={size} height={size} style={{ position: "absolute" }}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={tone.track}
                    strokeWidth={STROKE} fill="none" />
            {tone.arc && tone.p > 0 ? (
              <Circle testID={`arc-${unit.id}`}
                      cx={size / 2} cy={size / 2} r={r} stroke={tone.arc}
                      strokeWidth={STROKE} fill="none" strokeLinecap="round"
                      strokeDasharray={`${c} ${c}`}
                      strokeDashoffset={c * (1 - Math.min(1, tone.p))}
                      rotation={-90} originX={size / 2} originY={size / 2} />
            ) : null}
          </Svg>
          {open ? (
            <UnitIcon id={unit.id} size={iconSize} color={tone.icon} />
          ) : (
            <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
                 stroke={tone.icon} strokeWidth={1.8} strokeLinecap="round"
                 strokeLinejoin="round">
              <Path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3" />
            </Svg>
          )}
        </View>
      </View>
      <Text style={{ color: tone.nm, fontSize: 12, fontWeight: "600", lineHeight: 15,
                     textAlign: "center", marginTop: 7,
                     maxWidth: branch ? 100 : 112 }}>
        {unit.name}
      </Text>
    </Pressable>
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

      <View style={{ alignItems: "center" }}>
        {STAGES.map((stage, i) => {
          const open = stageUnlocked(st, i);
          return (
            <View key={stage.core.id} style={{ alignItems: "center", alignSelf: "stretch" }}>
              <View style={{ alignItems: "center", marginTop: 26, marginBottom: 14 }}>
                {/* One string, not two children: a screen reader should hear
                    "Chapter 1", not "Chapter" then "1". */}
                <Text style={[styles.sectionLabel, { color: t.ink3, marginBottom: 0 }]}>
                  {`Chapter ${stage.n || i + 1}`}
                </Text>
                {stage.title ? (
                  <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700",
                                 letterSpacing: -0.2, marginTop: 1, textAlign: "center" }}>
                    {stage.title}
                  </Text>
                ) : null}
                <View style={{ marginTop: 6 }}>
                  {stageDone(st, stage) ? <Pill tone="good">done</Pill>
                    : !open ? <Pill>locked</Pill> : null}
                </View>
              </View>
              <PathNode unit={stage.core} open={open} branch={false} onOpen={openUnit} />
              {stage.branches.map((u) => (
                <PathNode key={u.id} unit={u} open={unitUnlocked(st, u)} branch
                          onOpen={openUnit} />
              ))}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
