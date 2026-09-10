/* Scene: a few sentences played in a row, with questions the learner can read
 * first (the owner, 2026-09-07).
 *
 * The questions are on screen before anything plays — a listener who knows what
 * to listen for listens differently — and nothing plays until Play is pressed.
 * Replays are unlimited. Every question is answered before Check; the step's
 * credit is the share right, and each sentence's words are graded by its meaning
 * question: understood is Good, missed is Again, the same rule Hear applies to a
 * typed word. After the check the sentences appear, word-linked, with their
 * meanings, so a missed one can be read.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Btn, Muted, Pill } from "../ui";
import { say, whenIdle, stop, hasRealAudio } from "../audio";
import { Linked } from "../words";
import { recordAttempt } from "@core/state";
import { SPEECH_SKIP_TOP } from "@core/speech";
import { fold } from "@core/util";

/* The breath between two sentences. Long enough to hear the last one end and
   ready yourself for the next; short enough that five still run under a minute. */
const GAP_MS = 1200;

function PlayButton({ onPress, playing }) {
  const t = useTheme();
  return (
    <Pressable
      testID="scene-play"
      accessibilityRole="button"
      accessibilityLabel={playing ? "Playing" : "Play the sentences"}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        paddingVertical: 13, borderRadius: radius.md, backgroundColor: t.brandBg,
        borderWidth: 1, borderColor: t.brand, opacity: pressed ? 0.6 : 1, minHeight: 48,
      })}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={t.brandInk} stroke="none">
        <Path d="M7 4v16l13-8z" />
      </Svg>
      <Text style={{ color: t.brandInk, fontWeight: "600", fontSize: 15 }}>
        {playing ? "Playing…" : "Play"}
      </Text>
    </Pressable>
  );
}

export function Scene({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  const [picks, setPicks] = useState({});        // question index -> option index
  const [playing, setPlaying] = useState(false);
  const [plays, setPlays] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stop(); }, []);

  /* The sentences in order, each waiting for the one before to finish, with a
     breath between them — the owner asked for a relaxed cadence, and running
     five sentences together is a wall of speech, not a passage. `at` says which
     one is sounding so the learner can see where they are. */
  const [at, setAt] = useState(-1);
  const play = async (from = 0) => {
    setPlays(plays + 1);
    setPlaying(true);
    for (let k = from; k < q.rows.length; k++) {
      if (!alive.current) return;
      setAt(k);
      await say(q.rows[k].ru, { repeat: false });
      await whenIdle();
      if (!alive.current) return;
      if (k + 1 < q.rows.length) await new Promise((go) => setTimeout(go, GAP_MS));
    }
    if (alive.current) { setPlaying(false); setAt(-1); }
  };

  /* One sentence again. ±5 seconds is the right control for a continuous
     recording; for five separate ones the sentence is the unit a listener
     actually wants to go back to. */
  const replay = async (k) => {
    stop();
    setPlays(plays + 1);
    setAt(k);
    await say(q.rows[k].ru, { repeat: false });
    await whenIdle();
    if (alive.current) setAt(-1);
  };

  const allPicked = q.questions.every((_, k) => picks[k] !== undefined);

  /* Whose voice this is, worked out rather than assumed. A written passage was
     expected to be device voice throughout — nobody has said these sentences —
     but the collection turns out to hold recordings for some of them anyway:
     «Кто это?» is a sentence real people say, and `say()` finds it through the
     same folded key as any other. So the note is counted, not declared. §27's
     rule is that TTS is never passed off as a recording; announcing a device
     voice over a genuine one would be the same failure pointed the other way. */
  const real = q.rows.filter((r) => hasRealAudio(r.ru)).length;
  const voiceNote = real === q.rows.length ? null
    : real ? "device voice for some lines" : "device voice";

  const check = () => {
    if (r.answered || !allPicked) return;
    const verdicts = q.questions.map((qq, k) => !!qq.options[picks[k]].right);
    const right = verdicts.filter(Boolean).length;
    // Grades per lemma: a sentence understood is Good for its content words —
    // never Easy, and function words are no evidence either way; a meaning
    // missed grades nothing, since not choosing it is not the same as not
    // knowing each word. The "which word did you hear?" question grades its
    // own word both ways. A lemma in two sentences takes its worst.
    const grade = {};
    const put = (i, g) => { grade[i] = i in grade ? Math.min(grade[i], g) : g; };
    q.questions.forEach((qq, k) => {
      if (typeof qq.row === "number") {
        if (verdicts[k]) (q.rows[qq.row].lemmas || []).filter((i) => i >= SPEECH_SKIP_TOP).forEach((i) => put(i, 3));
      } else if (typeof qq.i === "number") {
        put(qq.i, verdicts[k] ? 3 : 1);
      }
    });
    const words = Object.keys(grade).map((k) => ({ i: Number(k), grade: grade[k] }));
    r.record(right === verdicts.length, words, undefined, {
      credit: right / verdicts.length,
      note: right === verdicts.length ? null : `${right} of ${verdicts.length}`,
    });
    update((prev) => ({
      ...prev,
      speech: recordAttempt(prev.speech, {
        ts: Date.now(), key: fold(q.rows[0].ru), kind: "scene", unit: q.unit,
        target: q.rows.map((x) => x.ru).join(" "), right, of: verdicts.length,
        tags: [], grade: right === verdicts.length ? 3 : 1, plays,
      }),
    }));
  };

  return (
    <View>
      <PlayButton onPress={() => play(0)} playing={playing} />
      {/* One button a sentence: which one is sounding, and a way back to any of
          them without starting the passage again. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10 }}>
        {q.rows.map((_, k) => (
          <Pressable
            key={k}
            testID={`scene-again-${k}`}
            accessibilityRole="button"
            accessibilityLabel={`Play sentence ${k + 1} again`}
            onPress={() => replay(k)}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center",
                     justifyContent: "center", borderWidth: 1,
                     borderColor: at === k ? t.brand : t.line,
                     backgroundColor: at === k ? t.brandBg : t.surface }}
          >
            <Text style={{ color: at === k ? t.brandInk : t.ink2, fontWeight: "700" }}>
              {k + 1}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* What this passage is and whose voice reads it. A written passage has no
          recording — nobody has ever said the sentence — so the device voice
          reads it, and §27's rule is that this is never left to be assumed. */}
      <Muted testID="scene-about" style={{ textAlign: "center", marginTop: 8 }}>
        {[q.topic, q.level, `${q.rows.length} sentences`].filter(Boolean).join(" · ")}
      </Muted>
      <Muted testID="scene-voice" style={{ textAlign: "center", marginTop: 2 }}>
        {["Read the questions first", voiceNote].filter(Boolean).join(" · ")}
      </Muted>

      {q.questions.map((qq, k) => (
        <View key={k} testID={`scene-q-${k}`} style={{ marginTop: 16 }}>
          <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600", marginBottom: 8 }}>
            {qq.ask}
          </Text>
          <View style={{ gap: 6 }}>
            {qq.options.map((o, n) => {
              const on = picks[k] === n;
              const show = r.answered;
              const border = show ? (o.right ? t.good : on ? t.bad : t.line) : on ? t.brand : t.line;
              const bg = show ? (o.right ? t.goodBg : on ? t.badBg : t.surface) : on ? t.brandBg : t.surface;
              return (
                <Pressable key={n} disabled={r.answered}
                           onPress={() => setPicks({ ...picks, [k]: n })}
                           accessibilityRole="button" accessibilityState={{ selected: on }}
                           style={{ backgroundColor: bg, borderColor: border, borderWidth: 1,
                                    borderRadius: radius.md, paddingVertical: 11,
                                    paddingHorizontal: 14, minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: t.ink, fontSize: qq.cyr ? 18 : 15 }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {r.answered ? (
        <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
          {q.rows.map((row, k) => (
            <View key={k} style={{ marginBottom: 10, flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Pill>{String(k + 1)}</Pill>
              <View style={{ flex: 1 }}>
                <Linked text={row.ru} size={18} />
                <Muted>{row.en}</Muted>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Btn kind="pri" label="Check" style={{ marginTop: 16 }} disabled={!allPicked} onPress={check} />
      )}
    </View>
  );
}
