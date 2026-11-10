/* The summary before a video: what it holds, and all of it as flashcards. */

import React from "react";
import { StackActions } from "@react-navigation/native";
import { useSession } from "../session";
import { Screen, Btn, Title } from "../ui";
import { unitById, videoLines, nextRoute } from "../data";
import { PrepList } from "../prep";
import { short } from "../video";
import { videoFor } from "./Video";
import { useAbout, linesText } from "../about";
import { L, idxOfWord } from "../data";
import { firstSense } from "@core/util";

/* What a video holds, before it (the owner, 2026-10-06: "video browser ->
   summary (flashcard option and overview of the relevant vocab/sentences) ->
   video -> questions"): the words it says, in their groups with the
   learner's score on each, its own sentences, the unit's rule, and all of it
   as flashcards. Watch video opens the player, which starts on arrival. */
export function VideoSummary({ route, navigation }) {
  const { st } = useSession();
  const params = route.params || {};
  const v = videoFor(params);
  const unit = v && v.unit ? unitById(v.unit) : null;
  const words = Object.keys((v && v.words) || {});
  const lines = v && unit && unit.v && unit.v.id === v.id ? videoLines(unit) : [];
  // The summary as the AI reads it: the video, the words it says, its sentences.
  useAbout(v ? { kind: "video summary", title: v.title,
                 text: linesText(words.map((w) => { const i = idxOfWord(w); return i >= 0 ? { ru: L[i].w, en: firstSense(L[i]) } : { ru: w }; })
                   .concat(lines.map((l) => ({ ru: l.ru, en: l.en })))) } : null);
  if (!v) return null;
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
