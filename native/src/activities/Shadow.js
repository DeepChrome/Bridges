/* Shadowing (ROADMAP P10.6): hear a sentence, say it straight back.
 *
 * The app could already ask a learner to type what they heard (Hear) and to
 * produce Russian from an English prompt (Say). This is the third thing you can
 * do with a sentence and the one that was missing: the model is given, so
 * nothing is being retrieved and nothing decoded — only the sounds and the
 * rhythm are being asked for. It is the exercise most learners of Russian are
 * told to do and the one no app makes easy.
 *
 * The Russian is **not** on screen before the attempt. Reading it aloud is a
 * different exercise, and one the app already has; the whole point here is to
 * work from the ear. It appears afterwards, word-linked, with the alignment
 * above it.
 *
 * Grading is Say's, unchanged, so a dropped word counts the same whether it was
 * typed, read or shadowed (§30c). Replays are unlimited and slowing the
 * recording is a normal part of the exercise rather than a hint, so neither
 * costs the grade — that is what separates this from Hear, where the recording
 * is the question.
 */

import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Btn, Muted, Speaker, Text } from "../ui";
import { Linked } from "../words";
import { IX } from "../data";
import { say, whenIdle, stop } from "../audio";
import { useRecognizer } from "../speech";
import { HoldButton, Blocked } from "./Say";
import { Alignment } from "./Alignment";
import { compare, words } from "@core/compare";
import { gradeAlignment, alignmentCredit, sayPassed, closestTranscript } from "@core/speech";
import { recordAttempt } from "@core/state";
import { fold } from "@core/util";

export function Shadow({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  const [res, setRes] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const [settled, setSettled] = useState(false);
  const [plays, setPlays] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stop(); }, []);

  /* The model, on arrival and on request. Counted in the log and never capped:
     the owner's rule for Hear, and it applies twice over to an exercise whose
     whole method is repetition. */
  const play = async () => {
    setPlays((n) => n + 1);
    await say(q.target, { repeat: false });
    await whenIdle();
  };
  useEffect(() => { play(); }, []);

  /* The same pass rule as Say (core/speech.js sayPassed): every word said or
     nearly said, the recogniser's closest hearing taken. */
  const settle = (out, n) => {
    setSettled(true);
    const c = alignmentCredit(out.alignment, IX);
    const passed = sayPassed(out.alignment, IX);
    r.record(passed, gradeAlignment(out.alignment, IX, { perfect: passed, firstTry: n === 1 }),
             undefined,
             passed ? { credit: 1, note: null }
               : { credit: c.credit,
                   note: `${c.ok} of ${c.n} words` + (c.near ? `, ${c.near} nearly` : "") });
  };

  const rec = useRecognizer({
    enabled: !r.answered,
    bias: [q.target].concat(words(q.target)),
    onFinal: (top, latencyMs, alternatives) => {
      const n = attemptRef.current + 1;
      attemptRef.current = n;
      setAttempt(n);
      const transcript = closestTranscript(alternatives, q.target) || top;
      const out = compare(transcript, q.target);
      setRes(out);
      update((prev) => ({
        ...prev,
        speech: recordAttempt(prev.speech, {
          ts: Date.now(), key: fold(q.target), kind: "shadow", unit: q.unit,
          target: q.target, transcript, wer: out.wer, attempt: n, latencyMs, plays,
          tags: [], engine: "device", onDevice: true,
          grade: sayPassed(out.alignment, IX) ? (n === 1 ? 4 : 3) : 1,
        }),
      }));
      if (sayPassed(out.alignment, IX)) settle(out, n);
    },
  });

  const again = () => { setRes(null); rec.setLive(""); rec.clearBlock(); };

  if (rec.block) {
    return <Blocked block={rec.block} onGetModel={rec.getModel} onSkip={() => r.skip()} />;
  }

  if (res) {
    return (
      <View>
        <Alignment alignment={res.alignment} />
        <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1,
                       borderTopColor: t.lineSoft, flexDirection: "row",
                       alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Linked text={q.target} size={20} />
            <Muted>{q.en}</Muted>
          </View>
          <Speaker text={q.target} size={36} />
        </View>
        {!settled ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Btn kind="pri" label="Try again" style={{ flex: 1 }} onPress={again} />
            <Btn label="Continue" onPress={() => settle(res, attempt)} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center" }}>
      {/* Nothing of the sentence is shown yet. Slowing it down is part of the
          exercise, not a hint, so the speaker carries its own repeat behaviour
          (audio.js rateFor) and costs nothing. */}
      <Btn testID="shadow-play" label={plays ? "Hear it again" : "Hear it"} onPress={play} />
      <Muted style={{ marginTop: 8 }}>{`${plays} play${plays === 1 ? "" : "s"}`}</Muted>
      <View style={{ height: 14 }} />
      <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} />
      {/* The recogniser's own word for an attempt that produced nothing. Say
          and Talk have always shown it; Shadow, Pair and Build drew `live`
          alone, so a hold the engine could not use looked like a hold that had
          not registered (2026-09-22). */}
      <Text testID="shadow-live"
            style={{ color: t.ink, fontSize: T.head + 1, marginTop: 16, minHeight: 24 }}>
        {rec.phase === "listening" ? rec.live : rec.live || rec.note || ""}
      </Text>
    </View>
  );
}
