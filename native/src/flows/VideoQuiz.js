/* The five questions after a video. */

import React, { useMemo, useState } from "react";
import { useSession } from "../session";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { PASS_MARK, nextRoute } from "../data";
import { StackActions } from "@react-navigation/native";
import { shuffle } from "@core/util";
import { videoFor } from "../screens/Video";
import { scoreOf, bestOf } from "./shared";

/* ------------------------------------------------------------- the video's questions */

/* Five questions about a video, after its summary (the owner, 2026-10-05: "a
   check on learning and check on understanding"; tools/build_video_quiz.mjs).
   Written with the right answer first, so they are shuffled here; nothing is
   graded into the scheduler — a question about who said what is not a word.
   The best score is kept under `vquiz:<video>`, which is what the lesson's
   "Video questions" step reads, and the end goes back to wherever the video
   was opened from (the video, its summary and this make three). */
export const videoQuizKey = (id) => `vquiz:${id}`;

export function videoQuizSteps(v) {
  return (v && v.quiz ? v.quiz : []).map(([q, options, at]) => ({
    kind: "video", prompt: q, at,
    options: shuffle(options.map((label, k) => ({ label, right: k === 0 }))),
  }));
}

export function VideoQuizFlow({ route, navigation }) {
  const { st, update } = useSession();
  const params = route.params || {};
  const v = videoFor(params);
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => videoQuizSteps(v), [v && v.id, seed]);   // eslint-disable-line react-hooks/exhaustive-deps
  useAudioStopOnLeave();
  /* Back to where the video was opened: past the summary and the video when
     it came from them (`depth` 3), or just off this screen when the lesson's
     own "Video questions" step opened it. */
  const leave = () => (navigation.pop ? navigation.pop(params.depth || 1) : navigation.goBack());
  /* A unit's video: Continue goes on to the next thing on the path, not back
     to the video's pages (the owner, 2026-10-09). The screens it came through
     are popped first, so Back from the next lesson is the path, not the video. */
  const onward = params.unitId ? nextRoute(st) : null;
  const goOn = () => {
    if (navigation.pop) navigation.pop(params.depth || 1);
    if (onward) navigation.dispatch(StackActions.push(...onward));
  };
  if (!v || !steps.length) return <Done title="No questions for this video yet" onBack={leave} />;
  if (result) {
    return (
      <Done
        title="Video questions"
        detail={`${result.right} of ${result.total} right`}
        score={result.score}
        passed={result.score >= PASS_MARK}
        /* The quiet way off the line: the video's summary again, whose own
           Continue then goes on, as this one does. */
        againLabel={onward ? "Summary" : "Try again"}
        onAgain={onward
          ? () => navigation.navigate("VideoSummary", { unitId: params.unitId, index: params.index, onward: true })
          : () => { setResult(null); setSeed(seed + 1); }}
        onContinue={onward ? goOn : leave}
        onBack={leave}
      />
    );
  }
  return (
    <Runner key={seed} title="Video questions" steps={steps} navigation={navigation} recycle={false}
            gradeWords={false}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, videoQuizKey(v.id), score));
              setResult({ ...r, score });
            }} />
  );
}
