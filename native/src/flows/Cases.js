/* The case modules: the hub, one case's page, and its lesson or drill. */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Btn, Muted, List, Row, Thumb, SectionLabel, Text, RowText } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { GrammarNote } from "../lesson";
import { Q } from "../questions";
import { UN, onwardFrom, caseLearnKey, caseDrillKey } from "../data";
import { CASES, caseById } from "@core/cases";
import { scoreOf, bestOf } from "./shared";

/* ------------------------------------------------------------- the cases */

/* Questions in one case drill, and how many of a case's sentences are
   remembered as asked, so the next runs draw the rest of its pool of a
   hundred first (the owner, 2026-10-08: "10 questions at a time but a pool of
   like 100 per case"). */
export const CASE_DRILL_N = 10;
export const CASE_RECENT = 90;

/* The case modules (core/cases.js; the owner, 2026-10-08): the five cases in
   the order they are taught, each a lesson on the situations that call for it
   and a drill on real sentences. Nothing is locked (§30au); the next one to
   learn carries the brand colour, a learned one its tick. Below them, every
   case mixed — the forms drill that was the only cases drill before. */
export function CaseHub({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const drills = st.drills || {};
  const next = CASES.find((c) => !drills[caseLearnKey(c.id)]);
  return (
    <Screen>
      <List>
        {CASES.map((c, k) => {
          const learned = !!drills[caseLearnKey(c.id)];
          return (
            <Row key={c.id} testID={`case-${c.id}`}
                 onPress={() => navigation.navigate("CaseModule", { caseId: c.id })}>
              <Thumb n={k + 1} done={learned} tone={c === next ? "brand" : undefined} />
              <RowText title={c.name} sub={`Chapter ${c.stage + 1}`} />
            </Row>
          );
        })}
      </List>
      <SectionLabel gap>Every case</SectionLabel>
      <List>
        <Row testID="case-mixed" onPress={() => navigation.navigate("Drill", { type: "cases", all: true })}>
          <Thumb id="cases" tone="good" />
          <RowText title="All the forms" />
        </Row>
        {/* The words that decide the case, as flashcards (flows/CaseCards.js). */}
        <Row testID="case-cards" onPress={() => navigation.navigate("CaseCards")}>
          <Thumb id="casecards" tone="good" />
          <RowText title="Case cards" />
        </Row>
      </List>
    </Screen>
  );
}

/* One case: what it is for, the situations that call for it, and the two
   ways in. Learn is the main button until the lesson has been run; then
   Drill is, with the lesson still there to go through again. */
export function CaseModule({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const c = caseById((route.params || {}).caseId);
  if (!c) return null;
  const learned = !!(st.drills || {})[caseLearnKey(c.id)];
  const go = (mode) => navigation.navigate("CaseRun", { caseId: c.id, mode });
  return (
    <Screen footer={
      <View style={{ gap: 8 }}>
        <Btn block kind="pri" testID={learned ? "case-drill" : "case-learn"}
             label={learned ? "Drill" : "Learn"} onPress={() => go(learned ? "drill" : "learn")} />
        <Btn block kind="plain" testID={learned ? "case-learn" : "case-drill"}
             label={learned ? "Learn again" : "Drill"} onPress={() => go(learned ? "learn" : "drill")} />
      </View>}>
      <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>{`The ${c.name.toLowerCase()} case`}</Text>
      <Muted style={{ marginTop: 6 }}>{c.intro}</Muted>
      <SectionLabel gap>When it's used</SectionLabel>
      <List>
        {c.uses.map((u) => (
          <Row key={u.id} testID={`case-use-${u.id}`}>
            <RowText title={u.label} sub={u.examples[0][0]} />
          </Row>
        ))}
      </List>
    </Screen>
  );
}

/* A case's lesson (`mode: "learn"`) or its drill (`"drill"`). The lesson is
   VocabFlow's shape — a card, then questions one at a time through the
   runner — and the drill is a run like any other. Both keep their best under
   the case's key; from a lesson step (`unitId`) Continue goes on to the
   lesson's next step, from the hub the lesson leads into the drill. */
export function CaseFlow({ route, navigation }) {
  const { caseId, mode, unitId, index } = route.params || {};
  const c = caseById(caseId);
  const { st, update } = useSession();
  const [seed, setSeed] = useState(0);
  const [at, setAt] = useState(0);
  const [tally, setTally] = useState({ credit: 0, total: 0, right: 0 });
  const [result, setResult] = useState(null);
  useAudioStopOnLeave();
  const learned = CASES.filter((x) => (st.drills || {})[caseLearnKey(x.id)]).map((x) => x.id);
  const recent = ((st.drills || {})[caseDrillKey(caseId)] || {}).recent || [];
  const steps = useMemo(() => (!c ? []
    : mode === "drill" ? Q.caseDrill(c.id, CASE_DRILL_N, learned.concat(c.id), recent)
    : Q.caseLesson(c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caseId, mode, seed]);
  if (!c || !steps.length) return <Done title="Nothing to practice here yet" onBack={() => navigation.goBack()} />;

  const key = mode === "drill" ? caseDrillKey(c.id) : caseLearnKey(c.id);
  const finish = (sum) => {
    const score = scoreOf(sum);
    // A drill remembers its sentences, newest last, so the next run draws others.
    const asked = steps.map((q) => q.caseRu).filter(Boolean);
    update((prev) => {
      const next = bestOf(prev, key, score);
      if (mode !== "drill") return next;
      const was = ((prev.drills || {})[key] || {}).recent || [];
      const recentNow = was.filter((r) => !asked.includes(r)).concat(asked).slice(-CASE_RECENT);
      return { ...next, drills: { ...next.drills, [key]: { ...next.drills[key], recent: recentNow } } };
    });
    setResult({ ...sum, score });
  };
  const again = () => { setResult(null); setAt(0); setTally({ credit: 0, total: 0, right: 0 }); setSeed(seed + 1); };

  if (result) {
    /* From a lesson step, on through the lesson; from the hub, a lesson goes
       on to its drill and a drill back to the case. */
    const unit = unitId ? UN.find((u) => u.id === unitId) : null;
    const onward = unit ? onwardFrom(st, unit, index, "case") : null;
    return (
      <Done
        title={mode === "drill" ? `${c.name} drill` : `The ${c.name.toLowerCase()} case`}
        detail={result.total ? `${result.right} of ${result.total} right` : undefined}
        score={result.total ? result.score : undefined}
        onAgain={again}
        againLabel="Try again"
        onContinue={unit ? (onward ? () => navigation.replace(...onward) : () => navigation.goBack())
          : mode === "learn" ? () => navigation.replace("CaseRun", { caseId: c.id, mode: "drill" })
          : () => navigation.goBack()}
        continueLabel={!unit && mode === "learn" ? "Drill" : "Continue"}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (mode === "drill") {
    return (
      <Runner key={seed} steps={steps} navigation={navigation} recycle={false}
              onFinish={(r) => finish({ credit: r.credit, total: r.total, right: r.right })} />
    );
  }

  // The lesson: cards shown here, each question handed to the runner alone.
  const step = steps[at];
  const advance = (r) => {
    const sum = r ? { credit: tally.credit + (r.credit || 0), total: tally.total + (r.total || 0),
                      right: tally.right + (r.right || 0) } : tally;
    setTally(sum);
    if (at + 1 >= steps.length) finish(sum);
    else setAt(at + 1);
  };
  if (step.t === "grammar") {
    return (
      <Screen fill>
        <GrammarNote note={step.note} at={at} total={steps.length} label={`${c.name} case`} />
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          <Btn kind="pri" testID="case-card-next" label="Continue" onPress={() => advance(null)} />
        </View>
      </Screen>
    );
  }
  return (
    <Runner key={`${seed}:${at}`} steps={[step]} progress={{ at, total: steps.length }}
            recycle={false} navigation={navigation} onFinish={advance} />
  );
}
