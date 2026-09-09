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
import { say, whenIdle, stop } from "../audio";
import { Linked } from "../words";
import { recordAttempt } from "@core/state";
import { SPEECH_SKIP_TOP } from "@core/speech";
import { fold } from "@core/util";

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

  /* The sentences in order, each waiting for the one before to finish. A learner
     who leaves mid-way stops the run; one who presses again starts over. */
  const play = async () => {
    setPlays(plays + 1);
    setPlaying(true);
    for (const row of q.rows) {
      if (!alive.current) return;
      await say(row.ru, { repeat: false });
      await whenIdle();
    }
    if (alive.current) setPlaying(false);
  };

  const allPicked = q.questions.every((_, k) => picks[k] !== undefined);

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
      <PlayButton onPress={play} playing={playing} />
      <Muted style={{ textAlign: "center", marginTop: 6 }}>
        {`${q.rows.length} sentences · read the questions first`}
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
