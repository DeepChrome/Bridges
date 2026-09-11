/* Say: an English sentence, and the learner says it in Russian (ROADMAP P5.2).
 *
 * Hold the button, speak, let go. The platform recogniser runs on the device — audio
 * never leaves the phone — and its transcript is scored against the target with
 * core/compare.js, word by word, the same way Hear scores a typed answer. Three
 * attempts: a wrong one shows the alignment and the sentence with its recording, so
 * the next try is made having heard it. The grade goes to the scheduler per word
 * when the attempt is settled — perfect, kept, or the third.
 *
 * The microphone is asked for here, at the first Say, not at launch. Refused, or
 * with no offline Russian model on the phone, the step says so and offers Skip,
 * which grades nothing and does not count in the score. The hold-to-speak
 * mechanics live in ../speech.js, shared with the conversation screen.
 *
 * The recogniser is not asked for grammar; that is the feedback service's job
 * (Phase 4), layered on after the local verdict and never in its way.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Btn, Muted, Pill, Speaker, Text } from "../ui";
import { Linked } from "../words";
import { L, IX, UN } from "../data";
import { getFeedback, config } from "../lib/feedback";
import { useRecognizer } from "../speech";
import { Alignment } from "./Alignment";
import { compare } from "@core/compare";
import { gradeAlignment, alignmentCredit, feedbackTags } from "@core/speech";
import { recordAttempt, tagAttempt } from "@core/state";
import { tagInfo } from "@core/errortags";
import { fold } from "@core/util";

export const ATTEMPTS = 3;

export function HoldButton({ phase, onIn, onOut, size = 84 }) {
  const t = useTheme();
  const listening = phase === "listening";
  const busy = phase === "asking";
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        testID="say-hold"
        accessibilityRole="button"
        accessibilityLabel="Hold to speak"
        accessibilityState={{ busy }}
        onPressIn={onIn}
        onPressOut={onOut}
        hitSlop={8}
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: "center",
          justifyContent: "center",
          backgroundColor: listening ? t.brand : t.brandBg,
          borderWidth: 1, borderColor: t.brand, opacity: busy ? 0.6 : 1,
        }}
      >
        <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none"
             stroke={listening ? t.brandOn : t.brandInk} strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
          <Path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
        </Svg>
      </Pressable>
      <Muted style={{ marginTop: 10 }}>{listening ? "Listening…" : "Hold to speak"}</Muted>
    </View>
  );
}

/* Tag names are the closed list's ids; shown as words, not constants. */
const tagLabel = (id) => id.toLowerCase().replace(/_/g, " ");

/* What the Worker had to say, under the local verdict: a line of praise when it
   gave one, then each grammar point with its tag, then a better word where one
   fits. Rows, not cards — this sits inside the answer already on screen. */
export function Feedback({ fb, quiet, style }) {
  const t = useTheme();
  const rows = (fb.grammar || []).map((g) => ({ key: "g" + g.tag, chip: tagLabel(g.tag),
    text: g.note, title: (tagInfo(g.tag) || {}).en }))
    .concat((fb.wordChoice || []).map((c, k) => ({ key: "w" + k, chip: "better",
      text: `${c.said} → ${c.better}${c.note ? " · " + c.note : ""}` })));
  if (!rows.length && !fb.praise) return null;
  // `quiet`: outside a chat bubble, in a smaller italic face — there, not dominant.
  const face = quiet ? { color: t.ink3, fontSize: 13, fontStyle: "italic" } : { color: t.ink2, fontSize: 14 };
  return (
    <View testID="feedback" style={[{ marginTop: quiet ? 0 : 12, gap: quiet ? 4 : 8 }, style]}>
      {fb.praise ? <Text style={face}>{fb.praise}</Text> : null}
      {rows.map((row) => (
        <View key={row.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          {quiet ? <Text style={[face, { fontStyle: "normal", fontWeight: "600" }]}>{row.chip}</Text> : <Pill>{row.chip}</Pill>}
          <Text style={[face, { flex: 1 }]}
                accessibilityLabel={row.title ? `${row.title}. ${row.text}` : row.text}>
            {row.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* What can stop speaking before it starts, said plainly, with a way out. */
export function Blocked({ block, onGetModel, onSkip, skipLabel }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Text style={{ color: t.ink2, fontSize: 15, textAlign: "center" }}>{block.text}</Text>
      {block.why === "model" ? <Btn label="Get Russian" onPress={onGetModel} /> : null}
      {onSkip ? (
        <Btn kind="ghost" label={skipLabel || (block.why === "mic" ? "Skip (mic off)" : "Skip")}
             onPress={onSkip} />
      ) : null}
    </View>
  );
}

export function Say({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  const [res, setRes] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const [settled, setSettled] = useState(false);
  // The feedback service's answer: null (not asked), "pending", or the reply.
  // Anything but a reply renders nothing extra — the local verdict stands alone.
  const [fb, setFb] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const log = (fields) => {
    const ts = Date.now();
    update((prev) => ({
      ...prev,
      speech: recordAttempt(prev.speech, {
        ts, key: fold(q.target), kind: "say", unit: q.unit, target: q.target,
        tags: [], engine: "device", onDevice: true, ...fields,
      }),
    }));
    return ts;
  };

  /* Online enhancement, after the local verdict and never in its way: the Worker
     names the grammar behind a miss. Its tags go onto the attempt already logged,
     so the trouble bank's grammar section counts them; a failure of any kind
     leaves the screen exactly as the local verdict drew it. */
  const askFeedback = async (transcript, ts) => {
    // A build without the Worker's address has nothing to wait for: no spinner.
    if (!config()) return;
    setFb("pending");
    const unit = UN.find((u) => u.id === q.unit);
    const reply = await getFeedback({
      transcript, target: q.target, unitId: q.unit,
      topic: unit && unit.g ? unit.g.title : null,
      lemmas: (q.lemmas || []).map((i) => L[i].b),
    });
    if (!reply || reply.ok !== true) { if (alive.current) setFb(null); return; }
    const tags = feedbackTags(reply);
    if (tags.length) update((prev) => ({ ...prev, speech: tagAttempt(prev.speech, ts, tags) }));
    if (alive.current) setFb(reply);
  };

  /* Hand the grades in. `n` is the attempt that produced `out`. */
  const settle = (out, n, transcript, ts) => {
    const perfect = out.wer === 0;
    setSettled(true);
    const c = alignmentCredit(out.alignment, IX);
    r.record(perfect, gradeAlignment(out.alignment, IX, { perfect, firstTry: n === 1 }),
             undefined,
             { credit: c.credit,
               note: perfect ? null : `${c.ok} of ${c.n} words` + (c.near ? `, ${c.near} nearly` : "") });
    askFeedback(transcript, ts);
  };

  const last = useRef({ transcript: "", ts: 0 });
  const rec = useRecognizer({
    enabled: !r.answered,
    onFinal: (transcript, latencyMs) => {
      const n = attemptRef.current + 1;
      attemptRef.current = n;
      setAttempt(n);
      const out = compare(transcript, q.target);
      const perfect = out.wer === 0;
      setRes(out);
      const ts = log({ transcript, wer: out.wer, attempt: n, latencyMs,
                       grade: perfect ? (n === 1 ? 4 : 3) : 1 });
      last.current = { transcript, ts };
      if (perfect || n >= ATTEMPTS) settle(out, n, transcript, ts);
    },
    onError: (error, latencyMs) => {
      log({ transcript: "", wer: 1, attempt: attemptRef.current, error, latencyMs, grade: null });
    },
  });

  const again = () => { setRes(null); rec.setLive(""); };
  const keep = () => settle(res, attempt, last.current.transcript, last.current.ts);

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
          <View style={{ flex: 1 }}><Linked text={q.target} size={20} /></View>
          <Speaker text={q.target} size={36} />
        </View>
        {!settled ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Btn kind="pri" label={`Try again · ${ATTEMPTS - attempt} left`}
                 style={{ flex: 1 }} onPress={again} />
            <Btn label="Keep" onPress={keep} />
          </View>
        ) : null}
        {fb === "pending" ? (
          <ActivityIndicator testID="feedback-pending" color={t.ink3}
                             style={{ alignSelf: "flex-start", marginTop: 12 }} />
        ) : fb ? <Feedback fb={fb} /> : null}
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center" }}>
      <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} />
      <Text style={{ color: t.ink, fontSize: 18, marginTop: 16, minHeight: 24,
                     textAlign: "center" }}>
        {rec.phase === "listening" ? rec.live : rec.note || ""}
      </Text>
      {attempt > 0 ? <Muted>{`${ATTEMPTS - attempt} left`}</Muted> : null}
      {/* A library, a cold, a sleeping child: a way past that is not three
          wrong attempts. Skipped, like a refused microphone — graded nothing,
          left out of the total. */}
      {attempt === 0 ? (
        <Btn kind="ghost" label="Can't speak now" style={{ marginTop: 10 }}
             onPress={() => r.skip()} />
      ) : null}
    </View>
  );
}
