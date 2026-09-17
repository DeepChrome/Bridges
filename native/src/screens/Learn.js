/* Learn — the path. A spine of chapters, and at each chapter a fork.
 *
 * Each unit is a disc carrying its own progress as a ring, with its name beneath
 * it. The spine runs down the centre. After FORK_AT lessons of a chapter's spine
 * unit the road forks: lanes curve out to that chapter's side quests, drawn in
 * ranks of three, and the main road carries on underneath to the next chapter. Side quests
 * are optional — the next chapter needs only the spine — so the fork is an offer,
 * not a gate. Before it opens the lanes are drawn dashed and the quests locked,
 * so the learner can see what is coming.
 *
 * The web app draws the ring with a conic gradient, which React Native has no
 * equivalent for; here it is a stroked circle with a dash offset. Same four states,
 * same colours, different renderer — that is the kind of difference rule 20a allows.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { View, Pressable, Animated, useWindowDimensions } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, space, radius } from "../theme";
import { Screen, Btn, Pill, UnitIcon, Muted, styles, Text } from "../ui";
import {
  STAGES, lessonCount, lessonDone, unitFineProgress, unitProgress, unitState,
  stageDone, stageUnlocked, unitUnlocked, nextStep, forkOpen, FORK_AT, dueCount,
  routePosition,
} from "../data";
import { Q } from "../questions";
import { nextOpening, markOpening } from "@core/openings";
import { reviewFirst } from "@core/state";
import { dayDone } from "@core/scheduler";
import { today } from "@core/util";
import { taskFor } from "@core/tasks";
import { useSweep, useCount } from "../motion";

/* An SVG circle whose stroke offset can be animated. */
const ASvgCircle = Animated.createAnimatedComponent(Circle);

/* The chapter's task, offered once its spine is finished (ROADMAP P10.5).
   Nothing at all until then: an offer to "say who you are" before the chapter
   that teaches it is an invitation to fail. */
function ChapterTaskCard({ chapter, spineDone, done, onOpen }) {
  const t = useTheme();
  const task = taskFor(chapter);
  if (!task || !spineDone) return null;
  return (
    <Pressable
      testID={`chapter-task-${chapter}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({
        alignSelf: "stretch", marginTop: 16, padding: 14, borderRadius: 20,
        backgroundColor: done ? t.goodBg : t.brandBg,
        borderColor: done ? t.goodDim : t.brandDim, borderWidth: 1,
        flexDirection: "row", alignItems: "center", gap: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>
          {done ? "TASK DONE" : "CHAPTER TASK"}
        </Text>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700", marginTop: 2 }}>
          {task.title}
        </Text>
        <Muted numberOfLines={2}>{task.goal}</Muted>
      </View>
      {done ? <Pill tone="good">done</Pill> : null}
    </Pressable>
  );
}

/* A lesson step's screen. */
export const STEP_ROUTE = { vocab: "Vocab", quiz: "Quiz", video: "Video" };

const STROKE = 5;
const LANE_H = 64;          // height of the fork drawing
const MERGE_H = 44;         // and of the lanes coming back to the road
const ROW_GAP = 40;         // between ranks of side quests, when there is more than one
const ROW_H = 112;          // a rank of quest discs with their names
const QUEST_COLS = 3;       // quests to a rank: a fourth overlaps its neighbours' names
const TRUNK_W = 3;

/* A chapter's side quests in ranks of QUEST_COLS, each rank centred on the road:
   eight quests read 3 · 3 · 2. Every rank keeps the curriculum's order. */
export function questRanks(branches) {
  const ranks = [];
  for (let k = 0; k < branches.length; k += QUEST_COLS) ranks.push(branches.slice(k, k + QUEST_COLS));
  return ranks;
}

/* Where a rank's discs sit across the drawing's width W. */
function rankXs(rank, W) {
  const n = rank.length;
  const spacing = Math.min(120, Math.floor(W / QUEST_COLS));
  return rank.map((_, k) => W / 2 + (k - (n - 1) / 2) * spacing);
}

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
  const sweep = useSweep(c * (1 - Math.min(1, tone.p)));

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
            {/* The ring sweeps to its new value instead of being redrawn at it.
                Coming back to the path after a lesson, this is the only thing
                on the screen that says the lesson counted, and it used to
                simply already be further round. An SVG stroke offset is not a
                transform, so this one is off the native driver — one value on
                one circle per unit, which is what that can carry. */}
            {tone.arc && tone.p > 0 ? (
              <ASvgCircle testID={`arc-${unit.id}`}
                      cx={size / 2} cy={size / 2} r={r} stroke={tone.arc}
                      strokeWidth={STROKE} fill="none" strokeLinecap="round"
                      strokeDasharray={`${c} ${c}`}
                      strokeDashoffset={sweep}
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

/* Lanes fanning out from the road to a rank of quests, the road running on
   beneath them. */
function FanOut({ rank, xs, W, height, stroke, road, dashed }) {
  return (
    <Svg width={W} height={height}>
      <Line x1={W / 2} y1={0} x2={W / 2} y2={height} stroke={road} strokeWidth={TRUNK_W} />
      {xs.map((x, k) => (
        <Path key={rank[k].id} testID={`lane-${rank[k].id}`}
              d={`M ${W / 2} 0 C ${W / 2} ${height * 0.55}, ${x} ${height * 0.35}, ${x} ${height}`}
              stroke={stroke} strokeWidth={TRUNK_W} fill="none" strokeLinecap="round"
              strokeDasharray={dashed ? "4 6" : undefined} />
      ))}
    </Svg>
  );
}

/* The fork: lanes from the spine out to the chapter's side quests, in ranks of
   QUEST_COLS (the eighth chapter's eight quests used to sit in one row and
   their names ran into each other — the owner, 2026-09-08), and the road going
   on beneath. Each rank past the first gets its own fan of lanes from the
   road; the last rank's lanes come back to it. Animates open the first time
   it is drawn open — lanes fade in, the ranks rise to meet them — and sits
   still after that. */
function Fork({ stage, chapterOpen, onOpen }) {
  const { st } = useSession();
  const t = useTheme();
  const { width: screenW } = useWindowDimensions();
  const open = chapterOpen && forkOpen(st, stage);
  const W = Math.min(screenW - space.pad * 2, 400);
  const ranks = questRanks(stage.branches);
  const xs = ranks.map((rank) => rankXs(rank, W));

  const anim = useRef(new Animated.Value(open ? 0 : 1)).current;
  useEffect(() => {
    if (!open) return;
    Animated.timing(anim, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [open]);

  const lane = open ? t.brand : t.lineSoft;
  const fade = { opacity: open ? anim : 1 };
  const rise = { transform: [{ translateY: open ? anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0 }] };
  const last = ranks.length - 1;
  return (
    <View testID={`fork-${stage.core.id}`} accessibilityLabel={open ? "Side quests" : `Side quests, after lesson ${FORK_AT}`}
          style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Trunk height={10} dim={!open} />
      {ranks.map((rank, r) => (
        <React.Fragment key={r}>
          <Animated.View style={fade}>
            <FanOut rank={rank} xs={xs[r]} W={W} height={r ? ROW_GAP : LANE_H}
                    stroke={lane} road={t.line} dashed={!open} />
          </Animated.View>
          <Animated.View testID={`rank-${stage.core.id}-${r}`} style={[{ width: W, height: ROW_H }, fade, rise]}>
            {rank.map((u, k) => (
              <View key={u.id} style={{ position: "absolute", left: xs[r][k] - 48, top: 0 }}>
                <PathNode unit={u} open={unitUnlocked(st, u)} branch onOpen={onOpen} />
              </View>
            ))}
          </Animated.View>
        </React.Fragment>
      ))}
      {!open ? (
        <Muted size={11} style={{ marginTop: -4, marginBottom: 6 }}>
          {`Side quests · after lesson ${FORK_AT}`}
        </Muted>
      ) : null}
      {/* The lanes come back: from under each quest of the last rank to the road,
          which goes on to the next chapter. A fork that never re-joined read as
          a dead end. */}
      <Animated.View style={fade}>
        <Svg width={W} height={MERGE_H}>
          <Line x1={W / 2} y1={0} x2={W / 2} y2={MERGE_H} stroke={t.line} strokeWidth={TRUNK_W} />
          {xs[last].map((x, k) => (
            <Path key={k} testID={`merge-${ranks[last][k].id}`}
                  d={`M ${x} 0 C ${x} ${MERGE_H * 0.65}, ${W / 2} ${MERGE_H * 0.45}, ${W / 2} ${MERGE_H}`}
                  stroke={lane} strokeWidth={TRUNK_W} fill="none" strokeLinecap="round"
                  strokeDasharray={open ? undefined : "4 6"} />
          ))}
        </Svg>
      </Animated.View>
      <Trunk height={10} dim={!chapterOpen} />
    </View>
  );
}

export default function Learn({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const next = nextStep(st);
  const due = dueCount(st);
  const holdBack = reviewFirst(due);
  const done = dayDone(st, due, today());
  const xp = useCount(st.xp || 0);
  const openUnit = (unit) => navigation.navigate("Unit", { unitId: unit.id });

  /* The drill gates are the payload's, so they are read through `Q` rather
     than repeated here — the announcement must not be able to disagree with
     the thing it announces. */
  const opening = useMemo(
    () => nextOpening({ ...routePosition(st), met: st.met, drillOpensAt: Q.drillOpensAt }),
    [st.unit, st.met]);
  const seeOpening = () => {
    if (opening) update((p) => ({ ...p, met: markOpening(p.met, opening.id) }));
  };

  return (
    <Screen>
      {/* The score line, centred at the top; the button under it names what it
          opens and no more (the owner, 2026-09-07). */}
      {/* XP counts up to its new value. Coming back from a lesson, this line
          and the ring above are the only two things that say it counted, and
          both of them used to have simply changed while you were away. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 }}>
        <Text testID="xp" style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
          {xp.toLocaleString("en-US")}
        </Text>
        <Muted size={14}>XP</Muted>
        <Text style={{ color: t.ink3, marginHorizontal: 4 }}>·</Text>
        <Text testID="streak"
              style={{ color: done ? t.good : t.ink, fontSize: 20, fontWeight: "700" }}>
          {st.streak || 0}
        </Text>
        <Muted size={14}>{st.streak === 1 ? "day" : "days"} in a row</Muted>
        {/* The day is closed: something was finished and nothing is waiting.
            A tick, not a sentence — the streak turning green beside it is the
            rest of the message (§25). */}
        {done ? (
          <Svg testID="day-done" width={15} height={15} viewBox="0 0 24 24" fill="none"
               stroke={t.good} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 13l5 5L20 7" />
          </Svg>
        ) : null}
      </View>

      {/* Something has opened that was not open before (core/openings.js).
       *
       * Twelve activities appear as the route is walked and none of them used
       * to say so — the owner studied for a week without meeting the
       * word-building drill and asked twice where things were, for features he
       * had commissioned days earlier. A first-run tour cannot fix that: it
       * cannot tell anyone on day one about a drill that opens in chapter 8.
       *
       * So it is said once, where the learner already is, at the moment it
       * becomes true. One at a time — someone arriving after an update has a
       * backlog, and five of these stacked on the path is the wall this exists
       * to avoid. A name, one line, and the way in. */}
      {opening ? (
        <View testID="opening"
              style={{ marginTop: 16, borderWidth: 1, borderColor: t.brandDim,
                       backgroundColor: t.brandBg, borderRadius: radius.lg, padding: 14 }}>
          <Muted size={11} style={{ color: t.brandInk, fontWeight: "700", letterSpacing: 1 }}>
            NOW OPEN
          </Muted>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "700", marginTop: 4 }}>
            {opening.name}
          </Text>
          <Muted style={{ marginTop: 2 }}>{opening.blurb}</Muted>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {opening.screen ? (
              <Btn kind="pri" testID="opening-go" label="Try it" style={{ flex: 1 }}
                   onPress={() => { seeOpening(); navigation.navigate(opening.tab || "Practice",
                     { screen: opening.screen, params: opening.params }); }} />
            ) : null}
            {/* "Got it" rather than a cross: the note is information, and a
                dismiss that looks like closing an advert reads as one. */}
            <Btn kind={opening.screen ? "ghost" : "pri"} testID="opening-seen"
                 label="Got it" style={{ flex: 1 }} onPress={seeOpening} />
          </View>
        </View>
      ) : null}

      {/* What is due sits on the path, above the lesson: review is part of
          the route, not a tab the learner has to remember (the pedagogy
          review, 2026-09-08). Opens the flashcards on exactly the due words. */}
      {due > 0 ? (
        <Btn
          kind={holdBack ? "pri" : "plain"}
          testID="review-due"
          style={{ marginTop: 12, alignSelf: "center", paddingHorizontal: 26 }}
          label={`Review · ${due} due`}
          onPress={() => {
            update((p) => ({ ...p, sets: ["__due__"] }));
            navigation.navigate("Study");
          }}
        />
      ) : null}
      {/* Above REVIEW_FIRST due cards the two buttons trade places: reviewing is
          the primary action and the next lesson goes quiet. Advice, not a lock —
          the lesson is still one press away, as the fork and developer mode are.
          Without it the struggling simulated learner walked into 254 cards due in
          a day and finished the route with 208 outstanding; holding new words
          back halves the worst day and empties the backlog by the end.

          It used to say "Clear these before new words" underneath. The swap is
          the message: one button is blue and the other is not, which is what
          §25 means by showing rather than explaining, and the line was the app
          narrating its own rule at someone who could already see it. */}
      {next ? (
        // Straight to the next undone step of the next lesson — a question
        // within seconds, not a unit list and a lesson list first.
        <Btn
          // Quiet once the day is done, for the same reason and by the same
          // means as review-first: the learner may carry on and nothing says
          // they should not, but the app stops pushing.
          kind={holdBack || done ? "plain" : "pri"}
          testID="next-step"
          style={{ marginTop: 12, alignSelf: "center", paddingHorizontal: 26 }}
          label={`${unitFineProgress(st, next.unit) > 0 ? "Continue" : "Start"} (${next.unit.name})`}
          onPress={() => navigation.navigate(STEP_ROUTE[next.step] || "Vocab",
                                             { unitId: next.unit.id, index: next.index })}
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
              {/* The chapter's task, once its spine is finished (ROADMAP P10.5).
                  On the path rather than in Practice because it belongs to the
                  chapter: it is the thing the chapter was for. Keyed on the
                  spine alone, the same rule the next chapter unlocks by — the
                  side quests are optional and this is not held back by them. */}
              <ChapterTaskCard
                chapter={stage.n || i + 1}
                spineDone={!!unitState(st, stage.core.id).done}
                done={!!((st.tasks || {})[stage.n || i + 1] || {}).done}
                onOpen={() => navigation.navigate("ChapterTask", { chapter: stage.n || i + 1 })}
              />
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
