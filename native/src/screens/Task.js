/* The task at the end of a chapter (ROADMAP P10.5).
 *
 * Every other exercise in the app asks a question and marks the answer. This
 * one sets a goal — say who you are, order what you want, ask the way — and
 * asks whether the learner got it across. That is the difference the research
 * kept returning to: production against an intention rather than recognition
 * against a prompt, and it is the one thing a scheduler and a word list cannot
 * do between them.
 *
 * **It is not scored and it cannot be failed.** Each requirement is met or not
 * met, the ones that are not say why in a few words, and the learner goes again
 * if they want to. A percentage here would turn the app's only open-ended
 * exercise back into a quiz, which is what it exists to be an alternative to.
 *
 * Typed or spoken, the learner's choice — the on-screen Russian keyboard is
 * already there for one and the recogniser for the other, and at chapter 1 a
 * learner may reasonably not trust their mouth yet.
 *
 * Without the Worker configured the screen still opens and still shows the
 * task; it says plainly that it cannot mark it. A goal worth attempting is
 * worth attempting unmarked, and the alternative is a screen that lies about
 * why it is empty.
 */

import React, { useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Muted, Pill, SectionLabel } from "../ui";
import { RuInput } from "../keyboard";
import { GuidePop } from "../guide";
import { markTask, config } from "../lib/feedback";
import { drillPool, L, STAGES } from "../data";
import { taskFor, MAX_SENTENCES } from "@core/tasks";
import { tagInfo } from "@core/errortags";

export function ChapterTask({ route, navigation }) {
  const chapter = route.params.chapter;
  const task = taskFor(chapter);
  const { st, update } = useSession();
  const t = useTheme();
  const [text, setText] = useState("");
  const [state, setState] = useState("writing");     // writing | marking | marked | failed
  const [mark, setMark] = useState(null);
  const configured = !!config("/v1/task");

  /* The words this learner has actually been taught, strongest first. The
     Worker judges against these, so a chapter-2 attempt is never faulted for
     reaching past what chapter 2 teaches. */
  const studied = useMemo(
    () => drillPool(st, STAGES[Math.min(chapter, STAGES.length) - 1].core)
      .map((i) => (L[i] ? L[i].b : null)).filter(Boolean),
    [chapter]
  );

  if (!task) {
    return (
      <Screen>
        <Card><Muted>There is no task for that chapter.</Muted></Card>
        <Btn label="Back" style={{ marginTop: 16 }} onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const send = async () => {
    setState("marking");
    const reply = await markTask({ goal: task.goal, must: task.must, attempt: text.trim(),
                                   studied, chapter });
    if (!reply || reply.ok !== true) { setState("failed"); return; }
    setMark(reply);
    setState("marked");
    if (reply.done) {
      update((prev) => ({
        ...prev,
        tasks: { ...(prev.tasks || {}), [chapter]: { done: true, at: Date.now() } },
      }));
    }
  };

  const again = () => { setState("writing"); setMark(null); };

  return (
    <Screen fill>
      <Card testID="task-goal" style={{ borderLeftWidth: 4, borderLeftColor: t.brand,
                                        backgroundColor: t.brandBg, borderColor: t.brandDim }}>
        <Text style={{ color: t.brand, fontSize: T.tiny, fontWeight: "700", letterSpacing: 0.8 }}>
          {`CHAPTER ${chapter} TASK`}
        </Text>
        <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700", marginTop: 4 }}>
          {task.title}
        </Text>
        <Text style={{ color: t.ink2, fontSize: T.body, lineHeight: T.body + 7, marginTop: 6 }}>
          {task.goal}
        </Text>
        <View style={{ marginTop: 12, gap: 4 }}>
          {task.must.map((m) => (
            <Muted key={m}>{`· ${m}`}</Muted>
          ))}
        </View>
        <Muted style={{ marginTop: 10 }}>
          {`In Russian · up to ${MAX_SENTENCES(chapter)} sentences`}
        </Muted>
      </Card>

      {state === "marked" && mark ? (
        <View style={{ marginTop: 16 }}>
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            {mark.done ? <GuidePop pose="cheer" size={80} /> : null}
          </View>
          <SectionLabel>{mark.done ? "Task done" : "Not there yet"}</SectionLabel>
          <Card>
            {mark.points.map((p) => (
              <View key={p.must} style={{ flexDirection: "row", alignItems: "flex-start",
                                          gap: 8, marginBottom: 8 }}>
                <Pill tone={p.met ? "good" : undefined}>{p.met ? "yes" : "no"}</Pill>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: T.body }}>{p.must}</Text>
                  {p.note ? <Muted>{p.note}</Muted> : null}
                </View>
              </View>
            ))}
            {mark.praise ? (
              <Muted testID="task-praise" style={{ marginTop: 4, fontStyle: "italic" }}>
                {mark.praise}
              </Muted>
            ) : null}
          </Card>
          {(mark.grammar || []).length ? (
            <>
              <SectionLabel style={{ marginTop: 16 }}>Worth a look</SectionLabel>
              <Card>
                {mark.grammar.map((g, k) => (
                  <View key={k} style={{ marginBottom: k === mark.grammar.length - 1 ? 0 : 8 }}>
                    <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "600" }}>
                      {(tagInfo(g.tag) || {}).en || g.tag}
                    </Text>
                    <Muted>{g.note}</Muted>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
          <View style={{ marginTop: "auto", paddingTop: 16 }}>
            <Btn kind="pri" label={mark.done ? "Done" : "Try again"}
                 onPress={mark.done ? () => navigation.goBack() : again} />
            {!mark.done ? (
              <Btn kind="ghost" label="Back" style={{ marginTop: 8 }}
                   onPress={() => navigation.goBack()} />
            ) : null}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 16, flex: 1 }}>
          <RuInput
            testID="task-input"
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Write it in Russian"
            style={{ minHeight: 110, textAlignVertical: "top", borderRadius: radius.md }}
          />
          {/* Both of these are failures rather than explanations: without them
              the button is dead or the answer vanishes with no reason given. */}
          {state === "failed" ? (
            <Muted testID="task-failed" style={{ marginTop: 10 }}>
              Could not reach the marker.
            </Muted>
          ) : null}
          {!configured ? (
            <Muted testID="task-unmarked" style={{ marginTop: 10 }}>
              This build cannot mark a task.
            </Muted>
          ) : null}
          <View style={{ marginTop: "auto", paddingTop: 16 }}>
            {state === "marking" ? (
              <ActivityIndicator testID="task-marking" color={t.ink3} />
            ) : (
              <Btn kind="pri" testID="task-send" label="Hand it in"
                   disabled={!configured || !text.trim()} onPress={send} />
            )}
            <Btn kind="ghost" label="Back" style={{ marginTop: 8 }}
                 onPress={() => navigation.goBack()} />
          </View>
        </View>
      )}
    </Screen>
  );
}
