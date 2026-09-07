/* Everything the runner drives: vocabulary, lesson quiz, drills, and the two
 * placement routes. Each one supplies its steps and decides what the result means. */

import React, { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Thumb } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "./Run";
import { Linked } from "../words";
import { Q, DRILL_TYPES, TEST_OUT } from "../questions";
import {
  L, UN, STAGES, lessonWords, lessonCount, markComponent, PASS_MARK, drillPool,
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
            <Muted>New word</Muted>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
                           marginVertical: 8 }}>
              <Text style={{ color: t.ink, fontSize: 38, fontWeight: "600" }}>{w.w}</Text>
              <Speaker text={w.b} />
            </View>
            <Text style={{ color: t.ink2, fontSize: 17, textAlign: "center" }}>
              {(w.e || "").split(/[,;]/).slice(0, 2).join(", ").trim()}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              {[w.p, w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
            </View>
            {w.x && w.x[0] ? (
              <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1,
                             borderTopColor: t.lineSoft, alignSelf: "stretch" }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={w.x[0].ru} size={18} />
                  </View>
                  <Speaker text={w.x[0].ru} size={36} />
                </View>
                <Muted>{w.x[0].en}</Muted>
              </View>
            ) : null}
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
  return (
    <Screen>
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

/* --------------------------------------------------------------- placement */

export function PlacementFlow({ navigation }) {
  const { update, accounts, account } = useSession();
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
        if (account) account.placed = placed;
        setResult({
          score: scoreOf(r),
          detail: placed
            ? `Stages 1–${placed} are marked done. You start at stage ${placed + 1}.`
            : "Starting from stage 1. Nothing to skip yet.",
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
