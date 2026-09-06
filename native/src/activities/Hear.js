/* Hear: a native recording plays, the learner types what was said (ROADMAP P5.8).
 *
 * The runner plays the sentence once on arrival (`autoplay`); this view owns the
 * replays, because they are counted — three, then the learner has to commit. The
 * answer is scored by core/compare.js exactly as a spoken attempt would be, so a
 * dropped word or a wrong ending reads the same way in both activities, and each
 * word's grade goes to the scheduler through the runner's record(). The English
 * and the sentence itself appear only after the answer: before it, the audio is
 * the whole prompt.
 */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Btn, Muted } from "../ui";
import { say } from "../audio";
import { Linked } from "../words";
import { IX } from "../data";
import { Alignment } from "./Alignment";
import { compare } from "@core/compare";
import { gradeAlignment } from "@core/speech";
import { recordAttempt } from "@core/state";
import { fold, translit } from "@core/util";

export const REPLAYS = 3;
const CYRILLIC = /[а-яё]/i;

function PlayButton({ left, onPress }) {
  const t = useTheme();
  const live = left > 0;
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        testID="hear-play"
        accessibilityRole="button"
        accessibilityState={{ disabled: !live }}
        accessibilityLabel={live ? `Play again, ${left} left` : "No replays left"}
        onPress={live ? onPress : undefined}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 72, height: 72, borderRadius: 36, alignItems: "center",
          justifyContent: "center", backgroundColor: t.brandBg,
          borderWidth: 1, borderColor: t.brand,
          opacity: !live ? 0.35 : pressed ? 0.6 : 1,
        })}
      >
        <Svg width={30} height={30} viewBox="0 0 24 24" fill="none"
             stroke={t.brandInk} strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 5 6 9H3v6h3l5 4z" />
          <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </Svg>
      </Pressable>
      {/* Replays left, as dots rather than a number: glanceable, and no copy. */}
      <View style={{ flexDirection: "row", gap: 5, marginTop: 10 }}>
        {Array.from({ length: REPLAYS }, (_, k) => (
          <View key={k} style={{ width: 6, height: 6, borderRadius: 3,
                                 backgroundColor: k < left ? t.brand : t.line }} />
        ))}
      </View>
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
    if (plays >= REPLAYS) return;
    setPlays(plays + 1);
    say(q.target);
  };

  const check = () => {
    if (r.answered) return;
    // Latin typing is transliterated, as the type activity already allows; a mix is
    // left alone so a Cyrillic answer with a stray Latin letter is not mangled.
    const heard = CYRILLIC.test(text) ? text : translit(text);
    const out = compare(heard, q.target);
    const perfect = out.wer === 0;
    setRes(out);
    r.record(perfect, gradeAlignment(out.alignment, IX, { perfect, firstTry: true }));
    update((prev) => ({
      ...prev,
      speech: recordAttempt(prev.speech, {
        ts: Date.now(), key: fold(q.target), kind: "hear", unit: q.unit,
        transcript: heard, target: q.target, wer: out.wer, tags: [],
        grade: perfect ? 3 : 1, plays: plays + 1,
      }),
    }));
  };

  if (r.answered && res) {
    return (
      <View>
        <Alignment alignment={res.alignment} />
        <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1,
                       borderTopColor: t.lineSoft }}>
          <Linked text={q.target} size={20} />
          <Muted style={{ marginTop: 4 }}>{q.en}</Muted>
        </View>
      </View>
    );
  }

  return (
    <View>
      <PlayButton left={REPLAYS - plays} onPress={replay} />
      <TextInput
        testID="hear-input"
        value={text}
        onChangeText={setText}
        placeholder="Cyrillic or Latin"
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={check}
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderBottomWidth: 3, borderRadius: radius.md, paddingHorizontal: 14,
                 paddingVertical: 13, fontSize: 20, color: t.ink, marginTop: 18 }}
      />
      <Btn kind="pri" label="Check" style={{ marginTop: 12 }} onPress={check} />
    </View>
  );
}
