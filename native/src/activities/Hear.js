/* Hear: a native recording plays, the learner types what was said (ROADMAP P5.8).
 *
 * The runner plays the sentence once on arrival (`autoplay`); this view owns the
 * replays — as many as the learner wants; the count is logged, never capped. The
 * answer is scored by core/compare.js exactly as a spoken attempt would be, so a
 * dropped word or a wrong ending reads the same way in both activities, and each
 * word's grade goes to the scheduler through the runner's record(), with the
 * words right out of the words asked as partial credit. The English and the
 * sentence itself appear only after the answer: before it, the audio is the whole
 * prompt — unless the learner asks the runner for the hint, which is the English.
 */

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Btn, Muted, Speaker } from "../ui";
import { say } from "../audio";
import { RuInput } from "../keyboard";
import { Linked } from "../words";
import { IX, L } from "../data";
import { Alignment } from "./Alignment";
import { compare } from "@core/compare";
import { gradeAlignment, alignmentCredit, nearMiss } from "@core/speech";
import { describeForm } from "@core/forms";
import { recordAttempt } from "@core/state";
import { fold } from "@core/util";

function PlayButton({ onPress }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        testID="hear-play"
        accessibilityRole="button"
        accessibilityLabel="Play again"
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 72, height: 72, borderRadius: 36, alignItems: "center",
          justifyContent: "center", backgroundColor: t.brandBg,
          borderWidth: 1, borderColor: t.brand, opacity: pressed ? 0.6 : 1,
        })}
      >
        <Svg width={30} height={30} viewBox="0 0 24 24" fill="none"
             stroke={t.brandInk} strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 5 6 9H3v6h3l5 4z" />
          <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </Svg>
      </Pressable>
    </View>
  );
}

export function Hear({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  const [text, setText] = useState("");
  const [plays, setPlays] = useState(0);
  const [res, setRes] = useState(null);

  const replay = () => {
    setPlays(plays + 1);
    say(q.target);
  };

  const check = () => {
    if (r.answered) return;
    // Russian letters or nothing — Latin typing is not transliterated (Run.js
    // Typed says why). `compare` folds both sides and counts only Russian words.
    const out = compare(text, q.target);
    const perfect = out.wer === 0;
    setRes(out);
    // A word a letter or two off is half right (core/speech.js nearMiss), and
    // the note names the form that was wanted.
    const c = alignmentCredit(out.alignment, IX);
    const nears = out.alignment.filter((a) => nearMiss(a, IX));
    const named = nears.map((a) => {
      const i = IX[fold(a.expected)][0];
      const d = describeForm(L[i], a.expected);
      return d ? `«${a.expected}» is ${d.text.toLowerCase()}` : `«${a.expected}»`;
    });
    const note = perfect ? null
      : `${c.ok} of ${c.n} words` + (c.near ? `, ${c.near} a letter off` : "")
        + (named.length ? ` — ${named.join("; ")}` : "");
    r.record(perfect,
             gradeAlignment(out.alignment, IX, { perfect, firstTry: true, hinted: !!r.usedHint }),
             undefined,
             { credit: c.credit, note });
    update((prev) => ({
      ...prev,
      speech: recordAttempt(prev.speech, {
        ts: Date.now(), key: fold(q.target), kind: "hear", unit: q.unit,
        transcript: text, target: q.target, wer: out.wer, tags: [],
        grade: perfect ? (r.usedHint ? 2 : 3) : 1, plays: plays + 1, hinted: !!r.usedHint,
      }),
    }));
  };

  if (r.answered && res) {
    return (
      <View>
        <Alignment alignment={res.alignment} />
        {/* The moment the learner sees which word was missed is the moment to
            hear it again — the speaker stays after the answer. */}
        <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1,
                       borderTopColor: t.lineSoft, flexDirection: "row",
                       alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Linked text={q.target} size={20} />
            <Muted style={{ marginTop: 4 }}>{q.en}</Muted>
          </View>
          <Speaker text={q.target} size={36} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <PlayButton onPress={replay} />
      <View style={{ marginTop: 18 }}>
        <RuInput testID="hear-input" value={text} onChangeText={setText} onSubmit={check} />
      </View>
      <Btn kind="pri" label="Check" style={{ marginTop: 12 }} onPress={check} />
    </View>
  );
}
