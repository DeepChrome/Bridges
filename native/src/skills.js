/* A word's score, and the four scores behind it.
 *
 * The owner, 2026-10-29: *"when someone clicks the score, they get a blown up
 * detail of their mastery, where they're good and where they need to work."*
 * The ring on a flashcard, an entry or a word row is the word's card
 * (core/scheduler.js familiarity); a press on it opens this bubble, which
 * reads the word's four skill slots (core/skills.js) — Russian → English,
 * English → Russian, Cases & forms, In a sentence. The slots are what the
 * drills and the session builder read when they choose what to ask, so what
 * the bubble shows is what the app is working on.
 *
 * …drawn as one segmented ring (the owner, 2026-11-07: *"a segmented ring
 * where each segment represents one of those subscores, and the overall ring
 * gives the overall score. You can click one of the segments… glowing fire
 * like border to indicate selection and the others will shadow out… click
 * drill and it will target that specific word's drills for that area"*).
 * Four quarters, clockwise from the top in SKILLS order; each fills its
 * quarter by its score in the familiarity colours, a quarter nothing has
 * asked is the bare track. The middle is the overall score — the card's,
 * which is what the schedule acts on — or the selected skill's while one is
 * chosen. A legend under it lays the four out where they sit on the ring,
 * because a quarter of a ring is a small thing to hit and a name says what
 * a colour cannot. A chosen skill says what it measures and offers its own
 * run (core/questions.js SKILL_DRILL_OF), which moves that score alone.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Animated } from "react-native";
import Svg, { Path, Defs, RadialGradient, Stop } from "react-native-svg";
import { useTheme, type as T } from "./theme";
import { Bubble, Familiarity, Text, Muted, Btn, familiarityColor } from "./ui";
import { useSession } from "./session";
import { L, idxOfWord, rankOf } from "./data";
import { navRef } from "./words";
import { Q, SKILL_DRILL_OF } from "./questions";
import { motionOff } from "./motion";
import { SKILLS } from "@core/skills";
import { skillScores, familiarityLabel, cardFor, familiarity } from "@core/scheduler";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* The ring's geometry. `GAP` is the angle left between quarters; the caps are
   butt so a gap stays the width it says. */
const RING = { size: 208, stroke: 18, gap: 7, glow: 20 };
const SPAN = 360 / SKILLS.length;
/* Where a quarter starts and ends, in degrees clockwise from the top. */
const segmentOf = (k) => ({ from: k * SPAN + RING.gap / 2, to: (k + 1) * SPAN - RING.gap / 2 });
/* How far along its quarter a score reaches. */
const fillTo = (k, score) => {
  const { from, to } = segmentOf(k);
  return from + (to - from) * Math.max(0, Math.min(100, score)) / 100;
};

const point = (c, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
};
const arc = (c, r, from, to) => {
  const [x0, y0] = point(c, r, from), [x1, y1] = point(c, r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
/* The quarter as a slice wide enough to hit with a thumb: the stroke and a
   margin either side of it. */
const wedge = (c, rIn, rOut, from, to) => {
  const [a, b] = point(c, rOut, from), [d, e] = point(c, rOut, to);
  const [f, g] = point(c, rIn, to), [h, i] = point(c, rIn, from);
  return `M ${a} ${b} A ${rOut} ${rOut} 0 0 1 ${d} ${e} L ${f} ${g} A ${rIn} ${rIn} 0 0 0 ${h} ${i} Z`;
};

/* The flicker of the chosen quarter's flame: an opacity stepped through an
   uneven run, so it wavers rather than pulses. Off under reduced motion, where
   the flame is simply lit. Stepped by a timer, not Animated.loop, which in the
   test renderer's settled animations would restart itself forever. */
const FLICKER = [1, 0.8, 0.94, 0.7, 1, 0.86, 0.97, 0.76, 0.92];
const FLICKER_MS = 110;
function useFlicker() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (motionOff()) return undefined;
    let k = 0;
    const id = setInterval(() => { k = (k + 1) % FLICKER.length; v.setValue(FLICKER[k]); }, FLICKER_MS);
    return () => clearInterval(id);
  }, [v]);
  return v;
}

/* The flame round the chosen quarter: one wide stroke whose colour runs, from
   the ring outwards and inwards, amber to red to nothing — `warn` and `bad`,
   both audited tokens (§24) — with the quarter itself drawn over its middle. */
function Flame({ k }) {
  const t = useTheme();
  const opacity = useFlicker();
  const { size, stroke, glow } = RING;
  const c = size / 2, r = (size - stroke - glow) / 2, wide = stroke + glow, R = r + wide / 2;
  const at = (radius) => Math.max(0, Math.min(1, radius / R));
  const ember = familiarityColor(22, t);
  const { from, to } = segmentOf(k);
  return (
    <>
      <Defs>
        <RadialGradient id="flame" cx={c} cy={c} r={R} fx={c} fy={c} gradientUnits="userSpaceOnUse">
          <Stop offset={at(r - wide / 2)} stopColor={t.bad} stopOpacity={0} />
          <Stop offset={at(r - stroke / 2 - 4)} stopColor={ember} stopOpacity={0.85} />
          <Stop offset={at(r - stroke / 2)} stopColor={t.warn} stopOpacity={1} />
          <Stop offset={at(r + stroke / 2)} stopColor={t.warn} stopOpacity={1} />
          <Stop offset={at(r + stroke / 2 + 4)} stopColor={ember} stopOpacity={0.85} />
          <Stop offset={1} stopColor={t.bad} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <AnimatedPath testID={`skill-flame-${SKILLS[k].id}`} d={arc(c, r, from - 2, to + 2)}
                    stroke="url(#flame)" strokeWidth={wide} fill="none" opacity={opacity} />
    </>
  );
}

/* The ring: four quarters, the flame on the chosen one, the others dimmed,
   and a slice over each to press. */
function SegmentRing({ scores, overall, selected, onSelect }) {
  const t = useTheme();
  const { size, stroke, glow } = RING;
  const c = size / 2, r = (size - stroke - glow) / 2;
  const chosen = selected ? SKILLS.findIndex((s) => s.id === selected) : -1;
  const centre = chosen >= 0 ? scores[selected] : overall;
  const centreLabel = chosen >= 0
    ? SKILLS[chosen].short
    : overall === null ? "Not studied yet" : familiarityLabel(overall);
  return (
    <View testID="skill-ring" style={{ width: size, height: size, alignSelf: "center" }}
          accessibilityLabel={overall === null ? "Not studied yet" : `Familiarity ${overall} of 100`}>
      <Svg width={size} height={size}>
        {chosen >= 0 ? <Flame k={chosen} /> : null}
        {SKILLS.map((s, k) => {
          const { from, to } = segmentOf(k);
          const score = scores[s.id];
          const dim = chosen >= 0 && chosen !== k;
          return (
            <React.Fragment key={s.id}>
              <Path testID={`skill-track-${s.id}`} d={arc(c, r, from, to)} stroke={t.surface3}
                    strokeWidth={stroke} fill="none" opacity={dim ? 0.3 : 1} />
              {typeof score === "number" && score > 0 ? (
                <Path testID={`skill-arc-${s.id}`} d={arc(c, r, from, fillTo(k, score))}
                      stroke={familiarityColor(score, t)} strokeWidth={stroke} fill="none"
                      opacity={dim ? 0.25 : 1} />
              ) : null}
            </React.Fragment>
          );
        })}
        {SKILLS.map((s, k) => {
          const { from, to } = segmentOf(k);
          return (
            <Path key={`hit-${s.id}`} testID={`skill-hit-${s.id}`}
                  d={wedge(c, r - stroke / 2 - 16, r + stroke / 2 + glow / 2, from, to)}
                  fill={t.surface} fillOpacity={0.01}
                  onPress={() => onSelect(selected === s.id ? null : s.id)} />
          );
        })}
      </Svg>
      <View pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                     alignItems: "center", justifyContent: "center" }}>
        <Text testID="skill-centre" style={{ color: t.ink, fontSize: T.hero, fontWeight: "700" }}>
          {typeof centre === "number" ? centre : "—"}
        </Text>
        <Muted size={T.small} testID="skill-centre-label">{centreLabel}</Muted>
      </View>
    </View>
  );
}

/* The legend: the four where they sit on the ring — top left, top right,
   bottom left, bottom right — each a name, its colour and its number. */
const LEGEND = [[3, 0], [2, 1]];
function Legend({ scores, selected, onSelect }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 14 }}>
      {LEGEND.map((row, y) => (
        <View key={y} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((k) => {
            const s = SKILLS[k], score = scores[s.id], on = selected === s.id;
            const dim = selected && !on;
            return (
              <Pressable key={s.id} testID={`skill-${s.id}`} accessibilityRole="button"
                         accessibilityState={{ selected: on }}
                         accessibilityLabel={`${s.name}, ${typeof score === "number" ? `${score} of 100` : "not asked yet"}`}
                         onPress={() => onSelect(on ? null : s.id)}
                         style={{ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8,
                                  paddingHorizontal: 10, borderRadius: 8, borderWidth: 1,
                                  borderColor: on ? t.warn : t.lineSoft, opacity: dim ? 0.4 : 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5,
                               backgroundColor: typeof score === "number" ? familiarityColor(score, t) : t.surface3 }} />
                <Text style={{ flex: 1, color: t.ink, fontSize: T.small, fontWeight: "600" }}>{s.short}</Text>
                <Text testID={`skill-${s.id}-score`} style={{ color: t.ink2, fontSize: T.small, fontWeight: "700" }}>
                  {typeof score === "number" ? score : "—"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* The chosen skill: its name, where it stands, what it measures, its run. */
function SkillDetail({ skill, score, reps, word, onDrill }) {
  const t = useTheme();
  const { st } = useSession();
  const i = idxOfWord(word);
  const drill = SKILL_DRILL_OF[skill.id];
  // Built when a skill is chosen, a few milliseconds: the button says what one
  // run holds, so it never offers a drill the word cannot fill.
  const n = useMemo(() => (i >= 0 ? Q.wordDrill(i, drill, { typed: st.typedDrills !== false }).length : 0),
    [i, drill, st.typedDrills]);
  return (
    <View testID={`skill-detail-${skill.id}`} style={{ marginTop: 16, gap: 4 }}>
      <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>{skill.name}</Text>
      <Muted size={T.small} testID={`skill-${skill.id}-label`}>
        {score === null ? "Not asked yet" : `${familiarityLabel(score)} · ${reps} ${reps === 1 ? "answer" : "answers"}`}
      </Muted>
      <Text style={{ color: t.ink2, fontSize: T.body, marginTop: 4 }}>{skill.about}</Text>
      <View style={{ marginTop: 12 }}>
        {n > 0
          ? <Btn kind="pri" block testID={`skill-drill-${skill.id}`}
                 label={`Drill · ${n} ${n === 1 ? "question" : "questions"}`}
                 onPress={() => onDrill(drill)} />
          : <Muted size={T.small} testID={`skill-drill-none-${skill.id}`}>Nothing to drill for this word.</Muted>}
      </View>
    </View>
  );
}

/* The bubble: the word, the ring, the legend, and the chosen skill. */
function SkillBreakdown({ word, onClose }) {
  const session = useSession();
  const [selected, setSelected] = useState(null);
  const seen = (session && session.st && session.st.seen) || {};
  const entry = seen[word] || null;
  const rank = rankOf(word);
  const scores = skillScores(entry, rank);
  const overall = familiarity(cardFor(entry), rank);
  const i = idxOfWord(word);
  const shown = i >= 0 ? L[i].w : word;
  const skill = selected ? SKILLS.find((s) => s.id === selected) : null;
  /* Close first: the bubble is a Modal and would sit over the run. The route
     is on the Study, Learn and Immerse stacks and the root one, so a navigate
     from any screen showing a ring finds it (§23). */
  const drill = (id) => {
    onClose();
    if (navRef.isReady()) navRef.navigate("WordDrill", { word, drill: id });
  };
  return (
    <Bubble title={shown} onClose={onClose} testID="skill-breakdown">
      <SegmentRing scores={scores} overall={overall} selected={selected} onSelect={setSelected} />
      <Legend scores={scores} selected={selected} onSelect={setSelected} />
      {skill ? (
        <SkillDetail skill={skill} score={scores[skill.id]} word={word} onDrill={drill}
                     reps={entry && entry[skill.id] ? entry[skill.id].reps || 0 : 0} />
      ) : null}
    </Bubble>
  );
}

/* The ring as a control: the word's score, and a press opens the breakdown.
   Draws nothing for a word with no score (a new card says "New" instead). */
export function ScoreRing({ word, score, size = 34, testID = "familiarity" }) {
  const [open, setOpen] = useState(false);
  if (score === null || score === undefined) return null;
  return (
    <>
      <Pressable testID={`${testID}-open`} accessibilityRole="button" hitSlop={6}
                 accessibilityLabel={`Familiarity ${score} of 100, see the breakdown`}
                 onPress={() => setOpen(true)}>
        <Familiarity score={score} size={size} testID={testID} />
      </Pressable>
      {open ? <SkillBreakdown word={word} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
