/* The summary before a video: what it holds, and all of it as flashcards. */

import React from "react";
import { StackActions } from "@react-navigation/native";
import { useSession } from "../session";
import { Screen, Btn, Title } from "../ui";
import { unitById, videoLines, nextRoute } from "../data";
import { PrepList } from "../prep";
import { short } from "../video";
import { videoFor } from "./Video";

/* What a video holds, before it (the owner, 2026-10-06: "video browser ->
   summary (flashcard option and overview of the relevant vocab/sentences) ->
   video -> questions"): the words it says, in their groups with the
   learner's score on each, its own sentences, the unit's rule, and all of it
   as flashcards. Watch video opens the player, which starts on arrival. */
export function VideoSummary({ route, navigation }) {
  const { st } = useSession();
  const params = route.params || {};
  const v = videoFor(params);
  if (!v) return null;
  const unit = v.unit ? unitById(v.unit) : null;
  const words = Object.keys(v.words || {});
  const lines = unit && unit.v && unit.v.id === v.id ? videoLines(unit) : [];
  const go = () => navigation.navigate("Video",
    { videoId: v.id, unitId: params.unitId, index: params.index, viaSummary: true });
  /* Opened again from the end of the video's questions (`onward`), its
     Continue goes on to the next lesson, not back into the video (the owner,
     2026-10-09: "the continue at the bottom of that page should move them to
     the next lesson rather than back to the video"). */
  const next = params.onward ? nextRoute(st) : null;
  const goOn = () => {
    navigation.dispatch(StackActions.popToTop());
    navigation.dispatch(StackActions.push(...next));
  };
  return (
    <Screen footer={next
      ? <Btn block kind="pri" testID="summary-continue" label="Continue" onPress={goOn} />
      : <Btn block kind="pri" testID="summary-continue" label="Watch video" onPress={go} />}>
      <Title sub={[v.ch, unit ? unit.name : null].filter(Boolean).join(" · ")}>{short(v.title)}</Title>
      <PrepList words={words} seen={st.seen || {}} unit={unit} lines={lines} label="In the video"
                onCards={(list) => navigation.navigate("ListCards",
                  { round: "list", words: list.concat(lines.map((l) => l.ru)), title: short(v.title),
                    after: "Back to the summary" })} />
    </Screen>
  );
}
