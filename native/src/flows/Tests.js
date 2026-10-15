/* The tests: the final, the placement, and testing out of a unit. */

import React, { useMemo, useState } from "react";
import { useSession } from "../session";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { useResume } from "../resume";
import { Q, TEST_OUT, FINAL_N } from "../questions";
import { UN, STAGES, lessonCount, markComponent, PASS_MARK, required } from "../data";
import { scoreOf, bestOf } from "./shared";

/* --------------------------------------------------------------- placement */

/* The final test, from the foot of the path (core/questions.js finalExam).
   Scored like a quiz and kept under `drills.final` like a practice run; it
   unlocks nothing, because there is nothing after it. */
export function FinalFlow({ route, navigation }) {
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => Q.finalExam(FINAL_N), [seed]);
  useAudioStopOnLeave();
  const save = { key: "final", route: "Final", params: {}, title: "Final test" };
  const resume = useResume(save.key, route && route.params);
  if (resume.prompt) return resume.prompt;

  if (result) {
    return (
      <Done title="Final test" detail={`${result.right} of ${result.total} right`}
            score={result.score} passed={result.score >= PASS_MARK}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    /* A test, not practice: a miss is not asked again at the back, or the
       fifty would grow with every wrong answer (2/50 became 2/51 on the
       emulator) — the placement and section tests hold the same rule. */
    <Runner steps={steps} recycle={false} navigation={navigation}
            save={save} restore={resume.restore}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "final", score));
              setResult({ ...r, score });
            }} />
  );
}

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
        onBack={() => navigation.popTo("Path") /* back down, not a second path on top */}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      recycle={false}
      navigation={navigation}
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
            /* The spine and every quest the chapter requires: since 2026-09-22
               the next chapter opens on both (§30ap), so a placement that
               marked the spine alone would leave the learner placed at a
               chapter they could not reach. Optional quests are left as they
               are — they gate nothing. */
            for (const unit of [STAGES[si].core, ...required(STAGES[si])]) {
              for (let li = 0; li < lessonCount(unit); li++) {
                next = markComponent(next, unit, li, "vocab");
                next = markComponent(next, unit, li, "quiz", 100);
              }
              if (unit.v) next = markComponent(next, unit, 0, "video");
            }
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
  const save = { key: `section:${unit.id}`, route: "TestOut", params: { unitId: unit.id },
                 title: `${unit.name} test` };
  const resume = useResume(save.key, route.params);
  if (resume.prompt) return resume.prompt;

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
      navigation={navigation}
      save={save}
      restore={resume.restore}
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
          /* Every lesson tested out: the unit is done, video step and all, as
             placement marks it — or an unwatched video would leave a unit the
             learner just tested out of standing in the way of the next. */
          if (cleared === lessonCount(unit) && unit.v) next = markComponent(next, unit, 0, "video");
          return next;
        });
        setResult({
          score: scoreOf(r),
          detail: cleared
            ? `${cleared} of ${lessonCount(unit)} lessons marked done.`
            : "No lessons skipped.",
        });
      }}
    />
  );
}
