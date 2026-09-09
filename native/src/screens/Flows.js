/* Everything the runner drives: vocabulary, lesson quiz, drills, and the two
 * placement routes. Each one supplies its steps and decides what the result means. */

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { IMAGES } from "../images";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Thumb, Senses } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "./Run";
import { talkUnlocked, TALK_UNLOCK_STAGE } from "./Talk";
import { Linked } from "../words";
import { Q, DRILL_TYPES, TEST_OUT, QUIZ_KINDS, QUIZ_LENGTHS } from "../questions";
import {
  L, UN, STAGES, lessonWords, lessonCount, markComponent, PASS_MARK, drillPool,
  reachedUnits, unitUnlocked,
} from "../data";
import { touchStreak } from "../store";

/* The mark for a run: partial credit summed over first attempts, as a percentage. */
const scoreOf = (r) => (r.total ? Math.round(r.credit / r.total * 100) : 0);

/* ------------------------------------------------------------- vocabulary */

export function VocabFlow({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const index = route.params.index;
  const steps = useMemo(() => Q.vocabSteps(unit, index), [unit.id, index]);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false);
  useAudioStopOnLeave();

  if (done) {
    return (
      <Done
        title="Vocabulary done"
        detail={`${lessonWords(unit, index).length} words met`}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // The teaching steps are shown here; question steps hand off to the runner, one
  // at a time, so a lesson interleaves rather than front-loading every card.
  const step = steps[at];
  const advance = () => {
    if (at + 1 >= steps.length) {
      update((prev) => markComponent(prev, unit, index, "vocab"));
      setDone(true);
    } else {
      setAt(at + 1);
    }
  };

  if (step.t === "grammar" || step.t === "word") {
    const w = step.t === "word" ? L[step.i] : null;
    return (
      <Screen fill>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                       marginBottom: 16 }}>
          <View style={{ flex: 1 }}><Bar value={at / steps.length} /></View>
          <Pill>{`${at + 1}/${steps.length}`}</Pill>
        </View>
        {step.t === "grammar" ? (
          <Card>
            <Muted>{unit.name}</Muted>
            <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600",
                           marginTop: 6, marginBottom: 8 }}>{step.note.title}</Text>
            <Text style={{ color: t.ink2, fontSize: 15 }}>{step.note.body}</Text>
            {(step.note.examples || []).map(([ru, en], k) => (
              <View key={k} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1,
                                     borderTopColor: t.lineSoft }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={ru} size={19} />
                  </View>
                  <Speaker text={ru} size={36} />
                </View>
                <Muted>{en}</Muted>
              </View>
            ))}
          </Card>
        ) : (
          <Card style={{ alignItems: "center" }}>
            {IMAGES[w.b] ? (
              // A photograph of the thing, when Commons has a public-domain one
              // (tools/harvest_images.py). Above the word: see it, then read it.
              <Image testID="word-photo" source={IMAGES[w.b]} resizeMode="cover"
                     accessibilityLabel={`Photo: ${(w.e || "").split(/[,;]/)[0]}`}
                     style={{ width: "100%", height: 150, borderRadius: radius.md, marginBottom: 12 }} />
            ) : null}
            <Muted>New word</Muted>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
                           marginVertical: 8 }}>
              <Text style={{ color: t.ink, fontSize: 38, fontWeight: "600" }}>{w.w}</Text>
              <Speaker text={w.b} />
            </View>
            {/* The whole entry, sense by sense, and the word in two contexts — a
                card a learner can read, not a gloss (the owner, 2026-09-07). */}
            <Senses e={w.e} size={16} style={{ marginTop: 0 }} />
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              {[w.p, w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
            </View>
            {(w.x || []).slice(0, 2).map((ex, k) => (
              <View key={k} style={{ marginTop: k ? 10 : 14, paddingTop: k ? 10 : 12, borderTopWidth: 1,
                                     borderTopColor: t.lineSoft, alignSelf: "stretch" }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={ex.ru} size={18} />
                  </View>
                  <Speaker text={ex.ru} size={36} />
                </View>
                <Muted>{ex.en}</Muted>
              </View>
            ))}
          </Card>
        )}
        {/* marginTop:"auto" against Screen's flexGrow: the action holds one position
            whatever the card's height, instead of moving down the screen each step.
            The gap lives on the wrapper — putting it on the button would change the
            button's own padding. */}
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          <Btn kind="pri"
               label={step.t === "grammar" ? "Start learning"
                      : at + 1 >= steps.length ? "Finish" : "Continue"}
               onPress={advance} />
        </View>
      </Screen>
    );
  }

  // A single question, rendered by the shared runner.
  return (
    <Runner
      key={at}
      steps={[step]}
      progress={{ at, total: steps.length }}
      recycle={false}
      onFinish={advance}
    />
  );
}

/* -------------------------------------------------------------- lesson quiz */

export function QuizFlow({ route, navigation }) {
  const { unitId, index } = route.params;
  const unit = UN.find((u) => u.id === unitId);
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => Q.quizSteps(unit, index), [unitId, index, seed]);
  useAudioStopOnLeave();

  if (result) {
    const passed = result.score >= PASS_MARK;
    return (
      <Done
        title={passed ? "Quiz passed" : `Not quite. ${PASS_MARK}% to pass`}
        detail={`${result.right} of ${result.total} right`}
        score={result.score}
        passed={passed}
        againLabel="Try again"
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      onFinish={(r) => {
        const score = scoreOf(r);
        update((prev) => touchStreak({
          ...markComponent(prev, unit, index, "quiz", score),
          xp: (prev.xp || 0) + r.right * 2 + (score >= PASS_MARK ? 10 : 0),
        }));
        setResult({ ...r, score });
      }}
    />
  );
}

/* ------------------------------------------------------------------ drills */

export function DrillList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const talkOpen = talkUnlocked(st);
  return (
    <Screen>
      {/* What is not a grammar drill comes first: a quiz of the learner's own
          making, listening scenes, and conversation. */}
      <List>
        <Row onPress={() => navigation.navigate("QuizSetup")}>
          <Thumb id="core" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Quiz</Text>
            <Muted>Choose the questions and the sections</Muted>
          </View>
          {((st.drills || {}).quiz || {}).best
            ? <Pill tone="good">{(st.drills.quiz.best) + "%"}</Pill> : null}
        </Row>
        <Row onPress={() => navigation.navigate("Listening")}>
          <Thumb id="speech" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Listening</Text>
            <Muted>Scenes from what you have met so far</Muted>
          </View>
          {((st.drills || {}).listening || {}).best
            ? <Pill tone="good">{(st.drills.listening.best) + "%"}</Pill> : null}
        </Row>
        <Row last onPress={() => navigation.navigate("Talk")} disabled={!talkOpen}>
          <Thumb id="emotion" locked={!talkOpen} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Talk</Text>
            <Muted>{talkOpen ? "A short conversation on a topic" : `Opens after chapter ${TALK_UNLOCK_STAGE + 1}`}</Muted>
          </View>
        </Row>
      </List>
      <View style={{ height: 12 }} />
      <List>
        {DRILL_TYPES.map((d, k) => {
          const best = ((st.drills || {})[d.id] || {}).best;
          return (
            <Row key={d.id} last={k === DRILL_TYPES.length - 1}
                 onPress={() => navigation.navigate("Drill", { type: d.id })}>
              <Thumb id={d.icon} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                  {d.name}
                </Text>
                <Muted>{d.blurb}</Muted>
              </View>
              {best ? <Pill tone="good">{best + "%"}</Pill> : null}
            </Row>
          );
        })}
      </List>
    </Screen>
  );
}

export function DrillFlow({ route, navigation }) {
  const { type } = route.params;
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  // Only the learner's own words (data.js drillPool); the pool is fixed for the
  // run so answering does not reshuffle the questions underneath.
  const pool = useMemo(() => drillPool(st), [type, seed]);
  const steps = useMemo(() => Q.drillQuestions(type, undefined, pool), [type, seed, pool]);
  const spec = DRILL_TYPES.find((d) => d.id === type);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="No questions available" onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done
        title={spec.name}
        detail={`${result.right} of ${result.total} right` +
                (result.helped ? ` · ${result.helped} with the table` : "")}
        score={result.score}
        passed={result.score >= 80}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      onFinish={(r) => {
        const score = scoreOf(r);
        update((prev) => {
          const drills = { ...(prev.drills || {}) };
          const cur = drills[type] || { best: 0, runs: 0 };
          drills[type] = { best: Math.max(cur.best || 0, score), runs: (cur.runs || 0) + 1 };
          return touchStreak({ ...prev, drills, xp: (prev.xp || 0) + r.right });
        });
        setResult({ ...r, score });
      }}
    />
  );
}

/* Best and runs for a practice run, keyed like the grammar drills. */
const bestOf = (prev, key, score, xp) => {
  const drills = { ...(prev.drills || {}) };
  const cur = drills[key] || { best: 0, runs: 0 };
  drills[key] = { best: Math.max(cur.best || 0, score), runs: (cur.runs || 0) + 1 };
  return touchStreak({ ...prev, drills, xp: (prev.xp || 0) + xp });
};

/* ------------------------------------------------------------- listening */

export const LISTENING_N = 5;

export function ListeningFlow({ navigation }) {
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => reachedUnits(st), [seed]);
  const steps = useMemo(() => Q.listeningDrill(units, LISTENING_N), [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to listen to yet" detail="Scenes need a few sentences from your units."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Listening" detail={`${result.right} of ${result.total} scenes clean`}
            score={result.score} passed={result.score >= 80}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "listening", score, r.right * 2));
              setResult({ ...r, score });
            }} />
  );
}

/* ------------------------------------------------------------------ quiz */

/* The learner's own quiz: which kinds of question, which sections, how long. The
   sections default to everything up to where they are on the path. */
export function QuizSetup({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const reached = useMemo(() => reachedUnits(st).map((u) => u.id), []);
  const [kinds, setKinds] = useState(QUIZ_KINDS.map((k) => k.id));
  const [units, setUnits] = useState(reached);
  const [n, setN] = useState(QUIZ_LENGTHS[0]);
  const flip = (list, set) => (id) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.concat(id));
  const ready = kinds.length > 0 && units.length > 0;

  const Section = ({ label }) => (
    <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600", letterSpacing: 1,
                   textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>{label}</Text>
  );
  const Chip = ({ on, label, onPress, testID }) => (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button"
               accessibilityState={{ selected: on }}
               style={{ borderWidth: 1, borderColor: on ? t.brand : t.line,
                        backgroundColor: on ? t.brandBg : t.surface, borderRadius: 99,
                        paddingHorizontal: 13, paddingVertical: 9, minHeight: 40 }}>
      <Text style={{ color: on ? t.brandInk : t.ink2, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <Section label="Questions" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {QUIZ_KINDS.map((k) => (
          <Chip key={k.id} on={kinds.includes(k.id)} label={k.name}
                onPress={() => flip(kinds, setKinds)(k.id)} testID={`kind-${k.id}`} />
        ))}
      </View>
      <Section label="Sections" />
      {STAGES.map((s, si) => {
        const here = [s.core].concat(s.branches).filter((u) => unitUnlocked(st, u));
        if (!here.length) return null;
        return (
          <View key={s.core.id} style={{ marginBottom: 10 }}>
            <Muted style={{ marginBottom: 6 }}>{`Chapter ${s.n} · ${s.title}`}</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {here.map((u) => (
                <Chip key={u.id} on={units.includes(u.id)} label={u.name}
                      onPress={() => flip(units, setUnits)(u.id)} testID={`unit-${u.id}`} />
              ))}
            </View>
          </View>
        );
      })}
      <Section label="Length" />
      <View style={{ flexDirection: "row", gap: 6 }}>
        {QUIZ_LENGTHS.map((len) => (
          <Chip key={len} on={n === len} label={String(len)} onPress={() => setN(len)}
                testID={`len-${len}`} />
        ))}
      </View>
      <Btn kind="pri" label={ready ? "Start" : "Pick a question type and a section"}
           disabled={!ready} style={{ marginTop: 22 }}
           onPress={() => navigation.navigate("CustomQuiz", { kinds, units, n })} />
    </Screen>
  );
}

export function CustomQuizFlow({ route, navigation }) {
  const { kinds, units: unitIds, n } = route.params;
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => unitIds.map((id) => UN.find((u) => u.id === id)).filter(Boolean), [unitIds]);
  const steps = useMemo(() => Q.customQuiz({ units, kinds, n }), [units, kinds, n, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="No questions for that choice" detail="Try more sections or another kind of question."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Quiz" detail={`${result.right} of ${result.total} right`}
            score={result.score} passed={result.score >= PASS_MARK}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "quiz", score, r.right));
              setResult({ ...r, score });
            }} />
  );
}

/* --------------------------------------------------------------- placement */

export function PlacementFlow({ navigation }) {
  const { update, updateAccount } = useSession();
  const [result, setResult] = useState(null);
  const steps = useMemo(() => Q.placementQuestions(), []);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Placement complete"
        detail={result.detail}
        score={result.score}
        onBack={() => navigation.navigate("Path")}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      recycle={false}
      onFinish={(r) => {
        // A stage is cleared when its questions were answered well enough. Stop at
        // the first stage that is not — placement must not leave holes behind you.
        let placed = 0;
        update((prev) => {
          let next = prev;
          for (let si = 0; si < STAGES.length; si++) {
            const qs = r.results.filter((x) => x.stage === si);
            if (!qs.length) break;
            if (qs.filter((x) => x.right).length / qs.length < TEST_OUT) break;
            placed = si + 1;
            const core = STAGES[si].core;
            for (let li = 0; li < lessonCount(core); li++) {
              next = markComponent(next, core, li, "vocab");
              next = markComponent(next, core, li, "quiz", 100);
            }
            if (core.v) next = markComponent(next, core, 0, "video");
          }
          return next;
        });
        // Saved with the profile, not written into the live record: the gate
        // and You read it back after a relaunch.
        updateAccount({ placed });
        setResult({
          score: scoreOf(r),
          detail: placed
            ? `${placed === 1 ? "Chapter 1 is" : `Chapters 1–${placed} are`} marked done. You start at chapter ${placed + 1}.`
            : "Starting from chapter 1. Nothing to skip yet.",
        });
      }}
    />
  );
}

export function SectionFlow({ route, navigation }) {
  const unit = UN.find((u) => u.id === route.params.unitId);
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const steps = useMemo(() => Q.sectionQuestions(unit), [unit.id]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done title={`${unit.name} test`} detail={result.detail} score={result.score}
            onBack={() => navigation.goBack()} />
    );
  }

  return (
    <Runner
      steps={steps}
      recycle={false}
      onFinish={(r) => {
        let cleared = 0;
        update((prev) => {
          let next = prev;
          for (let li = 0; li < lessonCount(unit); li++) {
            const qs = r.results.filter((x) => x.lesson === li);
            if (!qs.length) continue;
            const rate = qs.filter((x) => x.right).length / qs.length;
            if (rate >= TEST_OUT) {
              next = markComponent(next, unit, li, "vocab");
              next = markComponent(next, unit, li, "quiz", Math.round(rate * 100));
              cleared += 1;
            }
          }
          return next;
        });
        setResult({
          score: scoreOf(r),
          detail: cleared
            ? `${cleared} of ${lessonCount(unit)} lessons marked done.`
            : "No lessons skipped. Worth working through this one.",
        });
      }}
    />
  );
}
