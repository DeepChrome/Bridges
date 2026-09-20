/* The pronunciation drill (ROADMAP P10.8).
 *
 * The Sounds screen shipped the chart, the pairs and the false-friend letters,
 * and no way to practise any of it — which the owner had asked for in the same
 * breath. Two halves, alternating: hear a contrast and say which word it was,
 * then produce the same contrast yourself.
 *
 * **What the saying half can honestly claim.** The on-device recogniser was
 * measured on 2–4 word sentences (§30c), where context carries a great deal of
 * the work; a single word out of context is a harder ask of it. So this never
 * says "you said it wrong". It says which of the two words it heard, and when
 * it heard neither it says that and grades nothing — `r.skip()`, the same route
 * a phone with no microphone takes. A drill that told a learner their «люк» was
 * a «лук» when the recogniser simply had not caught it would be teaching them
 * to distrust their own mouth.
 */

import React, { useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { useTheme, radius, type as T } from "../theme";
import { Btn, Muted, Speaker, Text } from "../ui";
import { useRecognizer } from "../speech";
import { HoldButton, Blocked, ATTEMPTS } from "./Say";
import { fold } from "@core/util";

/* The contrast, in one line, under whichever half is on screen. */
function About({ text }) {
  const t = useTheme();
  if (!text) return null;
  return (
    <View testID="pair-about"
          style={{ marginTop: 14, backgroundColor: t.surface2, borderRadius: radius.md,
                   paddingHorizontal: 12, paddingVertical: 10 }}>
      <Muted size={T.small} style={{ textAlign: "center" }}>{text}</Muted>
    </View>
  );
}

/* ------------------------------------------------------------------ hear */

export function PairHear({ q, r }) {
  const t = useTheme();
  const [picked, setPicked] = useState(null);

  const choose = (k) => {
    if (r.answered) return;
    setPicked(k);
    // No lemma indices: pronunciation is not vocabulary, and a right answer here
    // must not put «чаша» into the scheduler as a word being studied.
    r.record(!!q.options[k].right, []);
  };

  return (
    <View>
      <View style={{ alignItems: "center", marginBottom: 4 }}>
        <Speaker text={q.target} />
      </View>
      <View style={{ gap: 8, marginTop: 12 }}>
        {q.options.map((o, k) => {
          const on = picked === k;
          const show = r.answered;
          const border = show ? (o.right ? t.good : on ? t.bad : t.line) : on ? t.brand : t.line;
          const bg = show ? (o.right ? t.goodBg : on ? t.badBg : t.surface) : on ? t.brandBg : t.surface;
          return (
            <Pressable key={k} testID={`pair-option-${k}`} disabled={r.answered}
                       accessibilityRole="button" accessibilityState={{ selected: on }}
                       onPress={() => choose(k)}
                       style={{ backgroundColor: bg, borderColor: border, borderWidth: 1,
                                borderRadius: radius.md, paddingVertical: 12,
                                paddingHorizontal: 14, minHeight: 56, justifyContent: "center" }}>
              <Text style={{ color: t.ink, fontSize: 22, fontWeight: "600" }}>{o.label}</Text>
              <Muted>{o.sub}</Muted>
            </Pressable>
          );
        })}
      </View>
      {/* The note is the teaching, so it waits until the answer is in: given
          beforehand it is the answer. */}
      {r.answered ? <About text={q.about} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------- say */

export function PairSay({ q, r }) {
  const t = useTheme();
  const [heard, setHeard] = useState(null);     // { word: "target"|"other"|null, transcript }
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);

  const rec = useRecognizer({
    enabled: !r.answered,
    // Both words, so the engine is choosing between the pair rather than
    // against the whole language.
    bias: [q.target, q.other],
    onFinal: (transcript) => {
      const n = attemptRef.current + 1;
      attemptRef.current = n;
      setAttempt(n);
      /* Which of the two the recogniser thinks it heard. A transcript may carry
         more than the word, so the test is containment on folded words rather
         than equality — and a transcript holding *both* words is no evidence
         either way. */
      const words = (transcript || "").split(/\s+/).map(fold).filter(Boolean);
      const hitT = words.includes(fold(q.target));
      const hitO = words.includes(fold(q.other));
      const word = hitT && !hitO ? "target" : hitO && !hitT ? "other" : null;
      setHeard({ word, transcript });
      if (word === "target") r.record(true, []);
      else if (word === "other" || n >= ATTEMPTS) {
        if (word === "other") r.record(false, []);
        else r.skip();                          // never caught: nothing to grade
      }
    },
  });

  const again = () => { setHeard(null); rec.setLive(""); };

  if (rec.block) {
    return <Blocked block={rec.block} onGetModel={rec.getModel}
                    onSkip={() => r.skip()} skipLabel="Skip (mic off)" />;
  }

  if (heard) {
    const tone = heard.word === "target" ? t.good : heard.word === "other" ? t.bad : t.ink3;
    return (
      <View>
        <Text testID="pair-heard"
              style={{ color: tone, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
          {heard.word === "target" ? `Heard «${q.target}»`
           : heard.word === "other" ? `Heard «${q.other}»`
           : "Did not catch that"}
        </Text>
        {heard.word === "other" ? (
          <Muted style={{ textAlign: "center", marginTop: 6 }}>
            {`«${q.other}» is ${q.otherGloss}`}
          </Muted>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center",
                       gap: 10, marginTop: 14 }}>
          <Text style={{ color: t.ink, fontSize: 26, fontWeight: "700" }}>{q.target}</Text>
          <Speaker text={q.target} size={36} />
        </View>
        <About text={q.about} />
        {!r.answered && attempt < ATTEMPTS ? (
          <Btn kind="pri" label={`Try again · ${ATTEMPTS - attempt} left`}
               style={{ marginTop: 14 }} onPress={again} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center" }}>
      <Speaker text={q.target} />
      <View style={{ height: 14 }} />
      <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} />
      <Text style={{ color: t.ink, fontSize: 18, marginTop: 16, minHeight: 24 }}>{rec.live}</Text>
      <About text={q.about} />
    </View>
  );
}
