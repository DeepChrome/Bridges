/* Learn — the path. A spine of chapters, and at each chapter a fork.
 *
 * Each unit is a disc carrying its own progress as a ring, with its name beneath
 * it. The spine runs down the centre. After FORK_AT lessons of a chapter's spine
 * unit the road forks: lanes curve out to that chapter's side quests, drawn in a
 * row, and the main road carries on underneath to the next chapter. Side quests
 * are optional — the next chapter needs only the spine — so the fork is an offer,
 * not a gate. Before it opens the lanes are drawn dashed and the quests locked,
 * so the learner can see what is coming.
 *
 * The web app draws the ring with a conic gradient, which React Native has no
 * equivalent for; here it is a stroked circle with a dash offset. Same four states,
 * same colours, different renderer — that is the kind of difference rule 20a allows.
 */

import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, useWindowDimensions } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, space } from "../theme";
import { Screen, Btn, Pill, UnitIcon, Muted, styles } from "../ui";
import {
  STAGES, lessonCount, lessonDone, unitFineProgress, unitProgress,
  stageDone, stageUnlocked, unitUnlocked, nextLesson, forkOpen, FORK_AT,
} from "../data";

const STROKE = 5;
const LANE_H = 64;          // height of the fork drawing
const TRUNK_W = 3;

function PathNode({ unit, open, branch, onOpen, dx = 0 }) {
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
        alignItems: "center", width: branch ? 96 : 118, paddingTop: 6,
        paddingBottom: 10, transform: [{ translateX: dx }],
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
                     maxWidth: branch ? 92 : 112 }}>
        {unit.name}
      </Text>
    </Pressable>
  );
}

/* A stretch of the main road between things on it. */
function Trunk({ height = 18, dim }) {
  const t = useTheme();
  return <View style={{ width: TRUNK_W, height, backgroundColor: dim ? t.lineSoft : t.line,
                        borderRadius: 2 }} />;
}

/* The fork: lanes from the spine out to each side quest, the quests in a row, and
   the road going on beneath. Animates open the first time it is drawn open —
   lanes fade in, the row rises to meet them — and sits still after that. */
function Fork({ stage, chapterOpen, onOpen }) {
  const { st } = useSession();
  const t = useTheme();
  const { width: screenW } = useWindowDimensions();
  const open = chapterOpen && forkOpen(st, stage);
  const n = stage.branches.length;
  const W = Math.min(screenW - space.pad * 2, 400);
  const spacing = Math.min(104, Math.floor(W / n));
  const xs = stage.branches.map((_, k) => W / 2 + (k - (n - 1) / 2) * spacing);

  const anim = useRef(new Animated.Value(open ? 0 : 1)).current;
  useEffect(() => {
    if (!open) return;
    Animated.timing(anim, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [open]);

  const lane = open ? t.brand : t.lineSoft;
  return (
    <View testID={`fork-${stage.core.id}`} accessibilityLabel={open ? "Side quests" : `Side quests, after lesson ${FORK_AT}`}
          style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Trunk height={10} dim={!open} />
      <Animated.View style={{ opacity: open ? anim : 1 }}>
        <Svg width={W} height={LANE_H}>
          {/* The main road, straight through. */}
          <Line x1={W / 2} y1={0} x2={W / 2} y2={LANE_H} stroke={t.line} strokeWidth={TRUNK_W} />
          {xs.map((x, k) => (
            <Path key={k} testID={`lane-${stage.branches[k].id}`}
                  d={`M ${W / 2} 0 C ${W / 2} ${LANE_H * 0.55}, ${x} ${LANE_H * 0.35}, ${x} ${LANE_H}`}
                  stroke={lane} strokeWidth={TRUNK_W} fill="none" strokeLinecap="round"
                  strokeDasharray={open ? undefined : "4 6"} />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View
        style={{ width: W, height: 112, opacity: open ? anim : 1,
                 transform: [{ translateY: open ? anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0 }] }}>
        {stage.branches.map((u, k) => (
          <View key={u.id} style={{ position: "absolute", left: xs[k] - 48, top: 0 }}>
            <PathNode unit={u} open={unitUnlocked(st, u)} branch onOpen={onOpen} />
          </View>
        ))}
      </Animated.View>
      {!open ? (
        <Muted size={11} style={{ marginTop: -4, marginBottom: 6 }}>
          {`Side quests · after lesson ${FORK_AT}`}
        </Muted>
      ) : null}
      <Trunk height={18} dim={!chapterOpen} />
    </View>
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
              <View style={{ alignItems: "center", marginTop: 22, marginBottom: 12 }}>
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
              {stage.branches.length ? (
                <Fork stage={stage} chapterOpen={open} onOpen={openUnit} />
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
