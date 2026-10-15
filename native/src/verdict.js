/* The verdict under an answered question: the right answer, large, with its
 * speaker, its flags and the revealed sentence, and Continue. Carved out of the
 * runner (screens/Run.js) as a pure move; the runner decides *whether* a verdict
 * shows and what was answered, this draws it. */

import React from "react";
import { View, Animated } from "react-native";
import { useTheme, type as T } from "./theme";
import { Card, Btn, Pill, Speaker, Muted, Text } from "./ui";
import { IrregularTag } from "./rules";
import { formFlags, GENDER_NAMES } from "@core/forms";
import { GuidePop } from "./guide";
import { useEnter } from "./motion";
import { answerAudioText } from "./audio";
import { Linked } from "./words";

/* The right answer under a verdict: the largest thing on the card. */
const ANSWER_SIZE = 26;

export const CYR = /[Ѐ-ӿ]/;

/* `q` is the question, `qWord` its word (referenceFor), `verdict` what the
   runner recorded — `{ right, credit, note, said, as }`, right null when
   skipped — `at` the step, `usedHint` whether the bulb was opened, `irregular`
   whether the word breaks the rules, and `onNext` what Continue does. */
export function Verdict({ q, qWord, verdict, at, usedHint, irregular, onNext }) {
  const t = useTheme();
  const answer = q.options ? q.options.find((o) => o.right) : null;
  const right = verdict ? verdict.right : null;
  const partial = verdict && verdict.right === false && verdict.credit > 0;
  /* The right answer as the verdict shows it: the right answer the learner
     gave when it was another accepted one, else the one asked for. */
  const answerText = (verdict && verdict.as) || (answer ? answer.label : q.answer) || null;
  const answerSpeech = (verdict && verdict.as) || answerAudioText(q, answer);
  /* The answer's form as flags — case and number, tense and person, gender —
     only when the answer is a form of the question's word. A noun's gender
     rides along, since its table does not carry it. */
  const answerFlags = (() => {
    if (!qWord || !answerText || !CYR.test(answerText)) return [];
    const flags = formFlags(qWord, answerText);
    if (!flags.length) return [];
    const g = qWord.p === "noun" && qWord.g && GENDER_NAMES[qWord.g];
    return g && !flags.includes(g) ? flags.concat([g]) : flags;
  })();
  const tone = !verdict || verdict.right === null ? null
    : verdict.right ? { bg: t.goodBg, line: t.good, btn: "good" }
    : partial ? { bg: t.brandBg, line: t.brand, btn: "pri" }
    : { bg: t.badBg, line: t.bad, btn: "bad" };
  /* The verdict rises into place instead of appearing whole. It is the one
     moment in a quiz where something happens *to* the learner rather than
     because of them, and it used to be indistinguishable from a re-render.
     Keyed on the step so it plays once per question; it is mounted only once
     the question is answered. */
  const verdictIn = useEnter([at], { distance: 14 });

  return (
    // At the foot of the screen, so Continue sits in the same place on every
    // question instead of wherever the options happened to end — the same
    // rule Flows.js and the web runner already follow. The gap lives on the
    // wrapper, not the card.
    //
    // `paddingTop`, not `marginTop: "auto"`: the question block above now
    // carries flexGrow and takes the slack, so the verdict is already at the
    // foot and an auto margin would have nothing left to push against.
    <Animated.View testID="verdict" style={[verdictIn, { paddingTop: 18 }]}>
      <Card style={tone ? { backgroundColor: tone.bg, borderColor: tone.line } : undefined}>
        {/* Teddy turns up for a clean answer and nowhere else in the runner.
            He is the reward, so he has to stay rare: on every verdict he
            would be wallpaper within one quiz, and on a wrong answer he
            would be a cartoon commiserating with someone who is trying to
            concentrate. */}
        {/* A heading for a right, partial or skipped answer. A wrong one
            has none: the colour says it, and the answer below is what
            matters (the owner, 2026-10-09: "Remove 'not quite' and make the
            correct answer larger"). */}
        {right !== false || partial ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {right === true && !usedHint ? <GuidePop pose="cheer" size={40} /> : null}
            <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>
              {right === null ? "Skipped" : right ? "Correct" : "Almost"}
            </Text>
          </View>
        ) : null}
        {/* The right answer, large, with its speaker right beside it — not
            at the far end of a heading (the owner, 2026-10-09: "make sure
            the speaker button is aligned more with what is actually
            said"). Russian is a word link like everywhere else: one tap
            for the quick look, its More for the whole entry. That
            replaced a separate More button here (same day: "put its
            functionality into clicking the answer itself"). */}
        {right !== null && answerText ? (
          <View testID="verdict-answer" style={{ flexDirection: "row", alignItems: "center",
                                                 flexWrap: "wrap", gap: 10 }}>
            {/* An English answer ("book") cannot be tapped into a Russian
                word, so the word it means comes first, linked: «книга — book». */}
            {CYR.test(answerText) ? (
              <Linked text={answerText} size={ANSWER_SIZE} />
            ) : (
              <>
                {qWord ? <Linked text={qWord.w} size={ANSWER_SIZE} /> : null}
                <Text style={{ color: qWord ? t.ink2 : t.ink, fontSize: qWord ? ANSWER_SIZE - 6 : ANSWER_SIZE,
                               fontWeight: "700" }}>
                  {qWord ? `— ${answerText}` : answerText}
                </Text>
              </>
            )}
            {answerSpeech ? (
              <View testID="verdict-speaker"><Speaker text={answerSpeech} size={40} /></View>
            ) : null}
            {/* The answer card says when the word breaks the rules
                (2026-09-29), right or wrong. */}
            {irregular ? <IrregularTag word={qWord} testID="verdict-irregular" /> : null}
          </View>
        ) : null}
        {/* What form the answer is, as little flags (the owner, 2026-10-09:
            "the case, the tense, the plurality, the gender… don't make it
            too verbose. Just little flags"): read off the word's own table,
            the same flags the quick look shows. */}
        {right !== null && answerFlags.length ? (
          <View testID="verdict-flags" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {answerFlags.map((f) => <Pill key={f}>{f}</Pill>)}
          </View>
        ) : null}
        {verdict && verdict.note ? (
          <Text style={{ color: t.ink2, marginTop: 4, fontSize: T.body }}>{verdict.note}</Text>
        ) : null}
        {/* The answer, its audio and More — nothing else (the owner,
            2026-10-08: "Remove the bloat in the pop-up. Don't need forced
            AI responses. Instead, just leave the answer, the audio, and
            the full entry"). The model's explanation, the derived one, the
            fact pills and the rule card all used to come under a miss;
            the sparkle beside the question asks Teddy when a learner
            wants the why. */}
        {/* A gap-fill gives the sentence back whole, every word a link, and
            names the form that filled it. */}
        {right !== null && q.reveal ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1 }}><Linked text={q.reveal} size={17} /></View>
              <Speaker text={q.reveal} size={32} />
            </View>
            {/* The form is named by the flags above now, not a sentence
                («добра́» is short form · f) — except where there are none. */}
            {q.formNote && !answerFlags.length ? <Muted style={{ marginTop: 3 }}>{q.formNote}</Muted> : null}
          </View>
        ) : null}
        {/* "Comes round again" and "Right, with a hint" used to sit here.
            Both explained a mechanism rather than telling the learner
            anything they could act on — the question does come round again,
            and they will see it; the hint button said it counted before it
            was pressed. The owner, 2026-09-10: "don't have to explain
            features that don't have to be explained." */}
        <Btn block kind={tone ? tone.btn : "plain"} label="Continue"
             style={{ marginTop: 12 }} onPress={onNext} />
      </Card>
    </Animated.View>
  );
}
