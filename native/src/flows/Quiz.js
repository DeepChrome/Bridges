/* Quizzes outside a lesson: the learner's own, built on Practice, and the
 * day's recap. */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Btn, Muted, SectionLabel, Chip, Loading } from "../ui";
import { Runner, Done, useAudioStopOnLeave, useResume, ResumePrompt } from "../screens/Run";
import { clearRun, savedRun } from "../resume";
import { Q, QUIZ_KINDS, QUIZ_LENGTHS } from "../questions";
import {
  UN, STAGES, PASS_MARK, unitUnlocked, reachedUnits, todaysWork, recapKey,
} from "../data";
import { scoreOf, bestOf } from "./shared";

/* ------------------------------------------------------------------ quiz */

/* The learner's own quiz: which kinds of question, which sections, how long. The
   sections default to everything up to where they are on the path. */
export function QuizSetup({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const reached = useMemo(() => reachedUnits(st).map((u) => u.id), []);
  /* A quiz left part-way is offered here, before the choices (the owner,
     2026-10-04: "the continue where you left off prompt on quizzes doesn't
     take the person back to the initial settings"): Continue picks the run up,
     and Start again comes back to this screen with that run's choices ticked
     rather than the defaults. */
  const [left, setLeft] = useState(() => savedRun("custom"));
  const was = (left && left.params) || {};
  const [kinds, setKinds] = useState(was.kinds || QUIZ_KINDS.map((k) => k.id));
  const [units, setUnits] = useState(was.units || reached);
  const [n, setN] = useState(was.n || QUIZ_LENGTHS[0]);
  if (left) {
    return (
      <ResumePrompt run={left}
                    onContinue={() => { setLeft(null); navigation.navigate("CustomQuiz", { ...was, resume: true }); }}
                    onRestart={() => { clearRun("custom"); setLeft(null); }} />
    );
  }
  const flip = (list, set) => (id) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.concat(id));
  const ready = kinds.length > 0 && units.length > 0;


  return (
    /* Start is pinned: it used to sit under every chapter's unit chips, so on a
       profile with the whole path open the one thing this screen is for was
       thirty-four sections down. */
    <Screen
      footer={
        <Btn kind="pri" label={ready ? "Start" : "Pick a question type and a section"}
             disabled={!ready} testID="quiz-start"
             onPress={() => navigation.navigate("CustomQuiz", { kinds, units, n })} />
      }
    >
      <SectionLabel gap>Questions</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {QUIZ_KINDS.map((k) => (
          <Chip key={k.id} on={kinds.includes(k.id)} label={k.name}
                onPress={() => flip(kinds, setKinds)(k.id)} testID={`kind-${k.id}`} />
        ))}
      </View>
      <SectionLabel gap>Sections</SectionLabel>
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
      <SectionLabel gap>Length</SectionLabel>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {QUIZ_LENGTHS.map((len) => (
          <Chip key={len} on={n === len} label={String(len)} onPress={() => setN(len)}
                testID={`len-${len}`} />
        ))}
      </View>
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
  const save = { key: "custom", route: "CustomQuiz", tab: "Practice",
                 params: { kinds, units: unitIds, n }, title: "Quiz" };
  const resume = useResume(save.key, route.params);
  if (resume.prompt) return resume.prompt;

  if (!steps.length) {
    return <Done title="No questions for that choice" detail="Try more sections."
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
    <Runner steps={steps} navigation={navigation} save={save} restore={resume.restore}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "quiz", score));
              setResult({ ...r, score });
            }} />
  );
}

/* The day's recap (core/questions.js `recapQuestions`): a refresher over the
   whole day's work, with today's weak spots mixed in, 10 to 20 questions,
   graded through the scheduler like any quiz — another meeting the same day
   is what consolidates it. Done once a day: kept under `drills["recap:<day>"]`. */
export function RecapFlow({ route, navigation }) {
  const { st, update, ready } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  /* Drawn once a run, not on every grade — the run's own answers change `st`.
     Not before the profile has loaded, or the store's empty defaults would
     decide there was nothing to recap and nothing would ask again. */
  const steps = useMemo(() => {
    if (!ready) return null;
    const work = todaysWork(st);
    return Q.recapQuestions({ words: work.words.concat(work.missed), focus: work.focus });
  }, [seed, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  useAudioStopOnLeave();
  // Today's only: yesterday's recap is not where anyone left off.
  const save = { key: recapKey(), route: "Recap", params: {}, title: "Today's recap" };
  const resume = useResume(save.key, route && route.params);
  if (resume.prompt) return resume.prompt;

  if (!steps) return <Screen><Loading /></Screen>;
  if (!steps.length) {
    return <Done title="Nothing to recap yet" onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Today's recap" detail={`${result.right} of ${result.total} right`}
            score={result.score} passed={result.score >= PASS_MARK}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} navigation={navigation} save={save} restore={resume.restore}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, recapKey(), score));
              setResult({ ...r, score });
            }} />
  );
}
