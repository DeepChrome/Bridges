/* Learn — the path. A spine of chapters, and at each chapter a fork.
 *
 * Each unit is a disc carrying its own progress as a ring, with its name beneath
 * it. The spine runs down the centre; at each chapter lanes curve out to that
 * chapter's quests, drawn in ranks of three, and the main road carries on
 * underneath to the next chapter.
 *
 * **The whole map is drawn from the first screen, and every track on it is
 * empty until the node above it is done** (the owner, 2026-09-23: *"empty
 * lines, almost like a negative track… once a lesson is complete, it unlocks
 * the next node by connecting it with a line. Think of games… like Diablo where
 * you have to connect the nodes with a path"*). So a locked quest is a padlocked
 * disc at the end of a pale track; finishing the spine lays the brand colour
 * down that track and the disc opens. A finished quest lays its own lane back
 * to the road, and the road runs on to the next chapter once the chapter's
 * required quests are done. The first cut of this (2026-09-22) hid the lanes
 * and the quests until the spine was finished — which showed nothing to
 * connect, and was not what he asked for.
 *
 * The quests are not all optional: the chapter requires every one that
 * `build_topics.py` did not mark `opt`, so finishing them is what opens the
 * next chapter. The optional few say so under their names.
 *
 * The web app draws the ring with a conic gradient, which React Native has no
 * equivalent for; here it is a stroked circle with a dash offset. Same four states,
 * same colours, different renderer — that is the kind of difference rule 20a allows.
 */

import React, { useMemo } from "react";
import { View, Pressable, Animated, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, space, radius } from "../theme";
import { Screen, Btn, Pill, UnitIcon, Muted, styles, Text } from "../ui";
import {
  STAGES, lessonCount, lessonDone, unitFineProgress, unitProgress, unitState,
  stageDone, stageUnlocked, unitUnlocked, nextStep, forkOpen, optional, dueCount,
  routePosition,
} from "../data";
import { FINAL_N } from "../questions";
import { nextOpening, markOpening } from "@core/openings";
import { reviewFirst } from "@core/state";
import { dayDone } from "@core/scheduler";
import { today } from "@core/util";
import { taskFor } from "@core/tasks";
import { useSweep, useDraw, useFill } from "../motion";

/* An SVG circle whose stroke offset can be animated; a path likewise. */
const ASvgCircle = Animated.createAnimatedComponent(Circle);
const ASvgPath = Animated.createAnimatedComponent(Path);

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

/* The final test, at the foot of the path (the owner, 2026-09-19): fifty
   questions over every chapter. Offered once the spine is walked — the same
   rule the chapters unlock by, since the side quests are optional — and in
   developer mode, which unlocks everything (rule 20.9). Before that it sits
   locked at the end of the road rather than absent, so the road is seen to
   lead somewhere. */
function FinalCard({ open, best, onOpen }) {
  const t = useTheme();
  return (
    <Pressable
      testID="final-test"
      accessibilityRole="button"
      accessibilityState={{ disabled: !open }}
      onPress={open ? onOpen : undefined}
      style={({ pressed }) => ({
        alignSelf: "stretch", marginTop: 26, padding: 14, borderRadius: 20,
        backgroundColor: !open ? t.surface2 : best ? t.goodBg : t.brandBg,
        borderColor: !open ? t.line : best ? t.goodDim : t.brandDim, borderWidth: 1,
        flexDirection: "row", alignItems: "center", gap: 12,
        opacity: pressed && open ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>
          FINAL TEST
        </Text>
        <Text style={{ color: open ? t.ink : t.ink3, fontSize: 16, fontWeight: "700", marginTop: 2 }}>
          {`${FINAL_N} questions · every chapter`}
        </Text>
      </View>
      {!open ? <Pill>locked</Pill> : best ? <Pill tone="good">{`${best}%`}</Pill> : null}
    </Pressable>
  );
}

/* A lesson step's screen. */
export const STEP_ROUTE = { vocab: "Vocab", quiz: "Quiz", video: "Video" };

const STROKE = 5;
/* The depth of every disc's edge. One number, so a spine node and a side quest
   are pressed by the same amount. */
const LIP = 4;
const LANE_H = 64;          // height of the fork drawing
const MERGE_H = 44;         // and of the lanes coming back to the road
const ROW_GAP = 40;         // between ranks of side quests, when there is more than one
const ROW_H = 112;          // a rank of quest discs with their names
const QUEST_COLS = 3;       // quests to a rank: a fourth overlaps its neighbours' names
const TRUNK_W = 4;          // a track wide enough to read as empty, not as a hairline

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

  /* **One disc is filled, and it is the one Continue would open.**
   *
   * Every open disc used to be a white circle with a pale ring, so a path of
   * eight units was eight identical empty rings and nothing said where the
   * learner was — the owner, 2026-09-17: *"everything looks AI generated"*, and
   * this screen was the clearest case of it. Duolingo's path works because
   * exactly one node is loud; the rest are quiet states around it.
   *
   * Filling *every* open disc is the mistake to avoid: developer mode unlocks
   * the whole course (rule 20.9), so "open" is true almost everywhere and the
   * screen would be a wall of indigo saying nothing. `nextStep` is the same
   * answer the Continue button gives, so the disc and the button cannot
   * disagree about where you are. */
  const step = nextStep(st);
  const current = open && !complete && !!step && step.unit.id === unit.id;

  /* Five states, and the disc says which without a word. "Underway" keys on fine
     progress rather than completed lessons: a unit with a video needs that video
     watched before any lesson counts as done, so finished lesson bodies would
     otherwise still show as untouched.

     The arcs keep the colours `path.test.js` pins — the ring is the progress
     reading and this change is to the face beneath it. */
  const tone = complete
    /* Finished: the path encircles the disc (the owner, 2026-09-23 — "draw
       the path to encircle the completed lesson"). The full ring is in the
       brand colour, the same the lit track arrives in, so the road reads as
       running into the node, round it, and on. A tick-green ring was a
       separate mark that the track did not continue into. */
    ? { arc: t.brand, p: 1, face: t.brandBg, icon: t.brandInk, track: t.surface3,
        lip: t.brandDim, nm: t.ink }
    : !open
    // Locked: greyed as a whole — face, padlock and name — not just quieter.
    ? { arc: null, p: 0, face: t.surface2, icon: t.ink3, track: t.lineSoft,
        lip: t.lineSoft, nm: t.ink3, dim: true }
    : current
    // Where you are: filled, in the brand, with the icon reversed out of it.
    // `brandOn` rather than white because the pair is contrast-audited (§24).
    ? { arc: pr > 0 ? t.brand : null, p: pr, face: t.brand, icon: t.brandOn,
        track: "transparent", lip: t.brandDim, nm: t.ink }
    : pr > 0
    ? { arc: t.brand, p: pr, face: t.surface, icon: t.brandInk, track: t.surface3,
        lip: t.line, nm: t.ink }
    // Open but not where you are: quiet, and the icon carries the invitation. A
    // full coloured ring has to mean finished, or a fresh unit and a completed
    // one look identical.
    : { arc: null, p: 0, face: t.surface, icon: t.brand, track: t.surface3,
        lip: t.line, nm: t.ink };

  /* The current disc is bigger, because size is the cheapest hierarchy there
     is and a path is read at arm's length. */
  const size = branch ? (current ? 62 : 56) : (current ? 80 : 68);
  const iconSize = branch ? (current ? 25 : 22) : (current ? 31 : 26);
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  /* The lip, and how far the disc travels into it when pressed. Four, not
     three: the physical press only reads if the travel is visible at arm's
     length, and the disc must land flush on its own edge rather than hovering
     a pixel above it. */
  const drop = pressed && open ? LIP : 0;
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
        opacity: tone.dim ? 0.55 : 1,
      }}
    >
      <View style={{ width: size, height: size + LIP }}>
        {/* The lip: a solid edge under the disc, so pressing it has somewhere to go.
            RN's shadows are blurred, so this is a plain circle rather than a shadow —
            which is also the right model: the depth here is physical, a darker
            tint of the disc's own colour, never an atmospheric blur. */}
        <View style={{ position: "absolute", left: 0, top: LIP, width: size, height: size,
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
      {/* Which of a chapter's quests it does not require. Since 2026-09-22 the
          rest do gate the next chapter, so this is a *state the learner cannot
          otherwise see* — rule 20.7's one allowance — and not a caption saying
          what the row does. Without it a learner clearing a chapter has no way
          to tell which discs they must finish and which are theirs to take. */}
      {optional(unit) ? (
        <Text testID={`optional-${unit.id}`}
              style={{ color: t.ink3, fontSize: 10, fontWeight: "600", marginTop: 2,
                       letterSpacing: 0.5, textTransform: "uppercase" }}>
          Optional
        </Text>
      ) : null}
    </Pressable>
  );
}

/* A stretch of the main road between things on it: the empty track, and the
   brand colour filling it from the top once `on` — the same model as the
   lanes, in a View because a straight vertical stretch needs no SVG. */
function Trunk({ height = 18, on, testID }) {
  const t = useTheme();
  const fill = useFill(on ? 1 : 0);
  return (
    <View testID={testID}
          style={{ width: TRUNK_W, height, backgroundColor: t.lineSoft, borderRadius: 2,
                   overflow: "hidden" }}>
      {on ? (
        <Animated.View testID={testID ? `${testID}-lit` : undefined}
                       style={{ width: TRUNK_W, height: fill, backgroundColor: t.brand }} />
      ) : null}
    </View>
  );
}

/* Near enough the length of a cubic, for the draw animation's dash: twelve
   chords. A lane is a gentle S-curve, so the error is under a percent and the
   dash it feeds is invisible either way. */
export function cubicLength(x0, y0, x1, y1, x2, y2, x3, y3) {
  let len = 0, px = x0, py = y0;
  for (let i = 1; i <= 12; i++) {
    const s = i / 12, u = 1 - s;
    const x = u * u * u * x0 + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3;
    const y = u * u * u * y0 + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3;
    len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return len;
}

/* The lit half of a track: the same line in the brand colour, laying itself
   down from the top. `useDraw` runs the dash offset from the whole length to
   nothing, so coming back to the path after the lesson that opened a node is
   the one place the connection is *seen* to be made. */
function Lit({ d, length, testID }) {
  const t = useTheme();
  const offset = useDraw(length);
  return (
    <ASvgPath testID={testID} d={d} stroke={t.brand} strokeWidth={TRUNK_W} fill="none"
              strokeLinecap="round" strokeDasharray={`${length} ${length}`}
              strokeDashoffset={offset} />
  );
}

/* One track on the map: the empty line always — `track-<id>` — and, once the
   node it runs from is done, the lit one over it — `<id>`. The two ids are
   what the tests read: a lane exists before it is open, and lights when it is. */
function Track({ id, d, length, on }) {
  const t = useTheme();
  return (
    <>
      <Path testID={`track-${id}`} d={d} stroke={t.lineSoft} strokeWidth={TRUNK_W} fill="none"
            strokeLinecap="round" />
      {on ? <Lit testID={id} d={d} length={length} /> : null}
    </>
  );
}

/* Lanes fanning out from one point to a rank of quests. `laneOn(unit)` says
   whether the lane to that quest is connected yet. There is no road drawn
   through the fan: the lanes *are* the road (see `Fork`). */
function FanOut({ rank, xs, W, height, laneOn }) {
  return (
    <Svg width={W} height={height}>
      {xs.map((x, k) => (
        <Track key={rank[k].id} id={`lane-${rank[k].id}`}
               d={`M ${W / 2} 0 C ${W / 2} ${height * 0.55}, ${x} ${height * 0.35}, ${x} ${height}`}
               length={cubicLength(W / 2, 0, W / 2, height * 0.55, x, height * 0.35, x, height)}
               on={laneOn(rank[k])} />
      ))}
    </Svg>
  );
}

/* Lanes coming back from a rank's **required** quests to one point. An optional
   quest has no lane out of it: it unlocks nothing, so a line leaving it would
   lead nowhere (the owner, 2026-09-24). `backOn(unit)` lights a lane once that
   quest is finished. */
function Merge({ rank, xs, W, height, backOn }) {
  return (
    <Svg width={W} height={height}>
      {rank.map((u, k) => (optional(u) ? null : (
        <Track key={u.id} id={`merge-${u.id}`}
               d={`M ${xs[k]} 0 C ${xs[k]} ${height * 0.65}, ${W / 2} ${height * 0.45}, ${W / 2} ${height}`}
               length={cubicLength(xs[k], 0, xs[k], height * 0.65, W / 2, height * 0.45, W / 2, height)}
               on={backOn(u)} />
      )))}
    </Svg>
  );
}

/* A chapter's quests in ranks, the required ones first. The road through a
   fork is a chain — out to a rank, back from it, out to the next — and it can
   only continue from quests that have a lane back, so the optional ones sit
   in the last ranks as leaves. */
export function questOrder(branches) {
  return branches.filter((u) => !optional(u)).concat(branches.filter(optional));
}

/* The fork: the chapter's side quests in ranks of QUEST_COLS (the eighth
   chapter's eight quests used to sit in one row and their names ran into each
   other — the owner, 2026-09-08), joined to the road as a chain.
 *
 * **A line is drawn only where it leads to a node** (the owner, 2026-09-24:
 * *"it still has this random line in the middle that goes to nothing. That's
 * super ugly."*). The old drawing ran the road straight down the centre of
 * the fork, behind the quests, with a gap through every rank; what was meant
 * as "the road goes on" read as a stub to nowhere. There is no centre line
 * now. The road out of a chapter is: the stem from the spine disc, lanes out
 * to the first rank, lanes back from that rank's required quests to a point,
 * lanes out from that point to the next rank, and so on; after the last rank
 * with a required quest, the trunk on to the next chapter. Optional quests
 * take a lane in and none out.
 *
 * What lights what — each edge by the node it runs *from*:
 *   - the stem and the lanes out, by the spine unit being finished
 *     (`forkOpen`; developer mode counts, rule 20.9), which is exactly when
 *     the quest discs unlock (`unitUnlocked`), so a lit lane and an open disc
 *     cannot disagree;
 *   - each lane back, by that quest being finished;
 *   - the trunk on to the next chapter, by the chapter being done — every
 *     required quest finished — which is when the next spine disc unlocks. */
function Fork({ stage, chapterOpen, onOpen }) {
  const { st } = useSession();
  const { width: screenW } = useWindowDimensions();
  const open = chapterOpen && forkOpen(st, stage);
  const done = stageDone(st, stage);
  const W = Math.min(screenW - space.pad * 2, 400);
  const ranks = questRanks(questOrder(stage.branches));
  const xs = ranks.map((rank) => rankXs(rank, W));
  const laneOn = (u) => unitUnlocked(st, u);
  const backOn = (u) => unitProgress(st, u) >= 1;
  /* The last rank that has a lane back: the road on to the next chapter
     leaves from there. A rank of optional quests below it hangs off the
     same point with nothing after it. */
  const lastRequired = ranks.reduce((a, rank, r) => (rank.some((u) => !optional(u)) ? r : a), -1);

  return (
    <View testID={`fork-${stage.core.id}`} accessibilityLabel="Side quests"
          style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Trunk height={10} on={open} testID={`stem-${stage.core.id}`} />
      {ranks.map((rank, r) => (
        <React.Fragment key={r}>
          <FanOut rank={rank} xs={xs[r]} W={W} height={r ? ROW_GAP : LANE_H} laneOn={laneOn} />
          <View testID={`rank-${stage.core.id}-${r}`} style={{ width: W, height: ROW_H }}>
            {rank.map((u, k) => (
              <View key={u.id} style={{ position: "absolute", left: xs[r][k] - 48, top: 0 }}>
                <PathNode unit={u} open={unitUnlocked(st, u)} branch onOpen={onOpen} />
              </View>
            ))}
          </View>
          {/* Back to a point after a rank that has required quests, when there
              is anything after it to reach: another rank, or the next chapter. */}
          {r <= lastRequired && rank.some((u) => !optional(u)) ? (
            <Merge rank={rank} xs={xs[r]} W={W} height={MERGE_H} backOn={backOn} />
          ) : null}
        </React.Fragment>
      ))}
      {/* On to the next chapter. A chapter whose quests are all optional (none
          is) would carry the road straight from the stem, so it is drawn
          either way. */}
      <Trunk height={10} on={done} testID={`road-on-${stage.core.id}`} />
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
  const openUnit = (unit) => navigation.navigate("Unit", { unitId: unit.id });

  const opening = useMemo(
    () => nextOpening({ ...routePosition(st), met: st.met }),
    [st.unit, st.met]);
  const seeOpening = () => {
    if (opening) update((p) => ({ ...p, met: markOpening(p.met, opening.id) }));
  };

  return (
    <Screen>
      {/* The streak, centred at the top; the button under it names what it
          opens and no more (the owner, 2026-09-07). An XP count sat beside it
          until 2026-09-19 — "it means nothing now", and it did not: nothing
          read it, nothing unlocked on it, and the rings already say what
          counted. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 }}>
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
              ) : (
                <Trunk height={LANE_H} on={stageDone(st, stage)} testID={`road-on-${stage.core.id}`} />
              )}
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
        <FinalCard
          open={!!st.dev || STAGES.every((s) => !!unitState(st, s.core.id).done)}
          best={((st.drills || {}).final || {}).best}
          onOpen={() => navigation.navigate("Final")}
        />
      </View>
    </Screen>
  );
}
