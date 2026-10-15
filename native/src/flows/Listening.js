/* Listening: the library of written conversations, and one played with its
 * five questions. */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Pill, Muted, List, Row, SectionLabel, Text } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { Q } from "../questions";
import {
  UN, DRILL_PASS, reachedUnits, reviewWords, lessonsDone, nextLesson, scenarioLibrary,
} from "../data";
import { scoreOf, bestOf } from "./shared";

/* ------------------------------------------------------------- listening */


/* The conversations on offer, by chapter (the owner, 2026-09-11: *"one or two
   scenarios per chapter and then maybe some extras. Each should have a scenario
   title"*). Before this the activity drew one and dealt it out, so 168 written
   conversations were a thing a learner could be given but never choose. */
export function ScenesList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const lib = useMemo(() => scenarioLibrary(st), [st.unit, st.dev]);
  if (!lib.length) {
    return <Done title="Nothing to listen to yet" detail="Finish a lesson first."
                 onBack={() => navigation.goBack()} />;
  }
  return (
    <Screen>
      {lib.map(({ stage, rows }) => {
        // Two a chapter since Phase 14 (the twelve extras chapter 1 carried were
        // retired), so every one is listed: the "N more" row had nothing to hide.
        return (
          // The same 18 of air between chapters that Practice leaves between
          // its sections; without it each heading sat on the card above.
          <View key={stage.n} style={{ marginBottom: 18 }}>
            <SectionLabel>{stage.title || `Chapter ${stage.n}`}</SectionLabel>
            <List>
              {rows.map((s) => {
                const best = ((st.drills || {})[`scene:${s.key}`] || {}).best;
                return (
                  <Row key={s.key} testID={`scene-row-${s.key}`}
                       onPress={() => navigation.navigate("Scenes", { key: s.key })}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "600" }}
                            numberOfLines={2}>
                        {s.title}
                      </Text>
                      <Muted>{s.cast.join(" · ")}</Muted>
                    </View>
                    {best ? <Pill tone="good">{best + "%"}</Pill> : null}
                  </Row>
                );
              })}
            </List>
          </View>
        );
      })}
    </Screen>
  );
}

export function ListeningFlow({ route, navigation }) {
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const picked = route && route.params ? route.params.key : null;
  const units = useMemo(() => reachedUnits(st), [seed]);
  /* The passages written for the lessons this learner has finished (§30l).
     The owner, 2026-09-10: the native-speed video passages were "way too
     advanced", and the build's own numbers agreed — 45 s of a native speaker
     uses more words than the first three chapters hold. These are pitched at
     the lesson instead, and the corpus scene is the fallback for a lesson with
     no script, so the activity never goes empty. */
  const steps = useMemo(() => {
    /* A conversation chosen from the library is the one that plays — the whole
       point of the list is that it can be gone back to. */
    if (picked) {
      const [id, i] = picked.split(":");
      const unit = units.find((u) => u.id === id) || UN.find((u) => u.id === id);
      const one = unit ? Q.scriptScene(unit, Number(i)) : null;
      return one ? [one] : [];
    }
    const want = new Set(reviewWords(st));
    /* Where they are, not only what they have finished. Counting finished
       lessons alone left a learner on their very first lesson with nothing
       written to listen to, and the corpus fallback then handed them the
       unconnected sentences the owner objected to in the first place. The
       lesson Continue would open is a lesson being taught now, so its passage
       is revision of what is in front of them. */
    const here = nextLesson(st);
    const done = (u) =>
      here && here.unit.id === u.id ? here.index + 1 : lessonsDone(st, u);
    /* One scenario, not five (the owner, 2026-09-10: "just one audio is
       sufficient per lesson") — half a minute of conversation and five
       questions is a session of its own. */
    const p = Q.writtenPassage(units, done) || Q.lessonPassage(units, want);
    return p && p.lines.length ? [p] : [];
  }, [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to listen to yet"
                 detail="Finish a lesson first."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Listening" detail={steps[0] ? steps[0].topic : null}
            score={result.score} passed={result.score >= DRILL_PASS}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => {
                const next = bestOf(prev, "listening", score);
                // A chosen conversation also keeps its own best, so the library
                // shows which have been done.
                return picked ? bestOf(next, `scene:${picked}`, score) : next;
              });
              setResult({ ...r, score });
            }} />
  );
}
