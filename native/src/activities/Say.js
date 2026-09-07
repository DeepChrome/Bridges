/* Say: an English sentence, and the learner says it in Russian (ROADMAP P5.2).
 *
 * Hold the button, speak, let go. The platform recogniser runs on the device — audio
 * never leaves the phone — and its transcript is scored against the target with
 * core/compare.js, word by word, the same way Hear scores a typed answer. Three
 * attempts: a wrong one shows the alignment and the sentence with its recording, so
 * the next try is made having heard it. The grade goes to the scheduler per word
 * when the attempt is settled — perfect, kept, or the third.
 *
 * Two things can stop it before it starts, and both are said plainly rather than
 * left as a button that does nothing: the microphone permission is refused (asked
 * here, at the first Say, not at launch), or Russian has no offline model on this
 * phone. Either offers Skip, which grades nothing and does not count in the score.
 *
 * The recogniser is not asked for grammar; that is the feedback service's job
 * (Phase 4), layered on after the local verdict and never in its way.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  ExpoSpeechRecognitionModule as M, useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Btn, Muted, Pill, Speaker } from "../ui";
import { Linked } from "../words";
import { L, IX, UN } from "../data";
import { getFeedback } from "../lib/feedback";
import { Alignment } from "./Alignment";
import { compare } from "@core/compare";
import { gradeAlignment } from "@core/speech";
import { recordAttempt, tagAttempt } from "@core/state";
import { tagInfo } from "@core/errortags";
import { fold } from "@core/util";

export const ATTEMPTS = 3;
const LANG = "ru-RU";

function HoldButton({ phase, onIn, onOut }) {
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
          width: 84, height: 84, borderRadius: 42, alignItems: "center",
          justifyContent: "center",
          backgroundColor: listening ? t.brand : t.brandBg,
          borderWidth: 1, borderColor: t.brand, opacity: busy ? 0.6 : 1,
        }}
      >
        <Svg width={34} height={34} viewBox="0 0 24 24" fill="none"
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
function Feedback({ fb }) {
  const t = useTheme();
  const rows = (fb.grammar || []).map((g) => ({ key: "g" + g.tag, chip: tagLabel(g.tag),
    text: g.note, title: (tagInfo(g.tag) || {}).en }))
    .concat((fb.wordChoice || []).map((c, k) => ({ key: "w" + k, chip: "better",
      text: `${c.said} → ${c.better}${c.note ? " · " + c.note : ""}` })));
  if (!rows.length && !fb.praise) return null;
  return (
    <View testID="feedback" style={{ marginTop: 12, gap: 8 }}>
      {fb.praise ? <Muted>{fb.praise}</Muted> : null}
      {rows.map((row) => (
        <View key={row.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Pill>{row.chip}</Pill>
          <Text style={{ color: t.ink2, fontSize: 14, flex: 1 }}
                accessibilityLabel={row.title ? `${row.title}. ${row.text}` : row.text}>
            {row.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Say({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  // Phase in a ref as well as state: the recogniser's events and a press that ends
  // before the permission prompt resolves both need the current value, not the one
  // their closure was made with.
  const [phase, setPhase] = useState("idle");        // idle | asking | listening | heard
  const phaseRef = useRef("idle");
  const go = (p) => { phaseRef.current = p; setPhase(p); };
  const [live, setLiveState] = useState("");
  const liveRef = useRef("");
  const setLive = (s) => { liveRef.current = s; setLiveState(s); };
  const [res, setRes] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState(null);
  const [block, setBlock] = useState(null);          // { why: mic | model | engine, text }
  const releasedAt = useRef(0);
  const releasedEarly = useRef(false);
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
    setFb("pending");
    const unit = UN.find((u) => u.id === q.unit);
    const reply = await getFeedback({
      transcript, target: q.target, unitId: q.unit,
      topic: unit && unit.g ? unit.g.title : null,
      lemmas: (q.lemmas || []).map((i) => L[i].b),
    });
    if (!reply || reply.ok !== true) { if (alive.current) setFb(null); return; }
    const tags = (reply.grammar || []).map((g) => g.tag)
      .concat((reply.words || []).flatMap((w) => w.tags || []));
    if (tags.length) update((prev) => ({ ...prev, speech: tagAttempt(prev.speech, ts, tags) }));
    if (alive.current) setFb(reply);
  };

  /* Hand the grades in. `n` is the attempt that produced `out`. */
  const settle = (out, n, transcript, ts) => {
    const perfect = out.wer === 0;
    setSettled(true);
    const okN = out.alignment.filter((a) => a.status === "ok").length;
    r.record(perfect, gradeAlignment(out.alignment, IX, { perfect, firstTry: n === 1 }),
             undefined,
             { credit: 1 - out.wer, note: perfect ? null : `${okN} of ${out.expected.length} words` });
    askFeedback(transcript, ts);
  };

  const last = useRef({ transcript: "", ts: 0 });
  const finish = (transcript) => {
    const n = attemptRef.current + 1;
    attemptRef.current = n;
    setAttempt(n);
    const out = compare(transcript, q.target);
    const perfect = out.wer === 0;
    setRes(out);
    go("heard");
    const ts = log({ transcript, wer: out.wer, attempt: n,
                     latencyMs: Date.now() - releasedAt.current,
                     grade: perfect ? (n === 1 ? 4 : 3) : 1 });
    last.current = { transcript, ts };
    if (perfect || n >= ATTEMPTS) settle(out, n, transcript, ts);
  };

  useSpeechRecognitionEvent("result", (ev) => {
    if (phaseRef.current !== "listening") return;
    const text = ev.results && ev.results[0] ? ev.results[0].transcript : "";
    if (ev.isFinal) finish(text);
    else setLive(text);
  });
  useSpeechRecognitionEvent("error", (ev) => {
    if (phaseRef.current !== "listening") return;
    go("idle");
    const what = `${ev.error} ${ev.message || ""}`;
    if (/not-supported|not downloaded/i.test(what)) {
      setBlock({ why: "model", text: "Russian is not installed for offline recognition." });
    } else if (ev.error === "no-speech") {
      setNote("Nothing heard");
    } else {
      setBlock({ why: "engine", text: `Recognition failed — ${ev.error}` });
    }
    log({ transcript: "", wer: 1, attempt: attemptRef.current, error: ev.error,
          latencyMs: Date.now() - releasedAt.current, grade: null });
  });
  useSpeechRecognitionEvent("end", () => {
    if (phaseRef.current !== "listening") return;
    // Ended without a final result. The last partial is what the recogniser had,
    // so score that rather than throw the attempt away; with nothing at all heard,
    // back to idle and let the learner try again.
    if (liveRef.current) finish(liveRef.current);
    else go("idle");
  });

  const hold = async () => {
    if (r.answered || phaseRef.current !== "idle") return;
    setLive(""); setNote(null);
    releasedEarly.current = false;
    go("asking");
    let perm;
    try { perm = await M.requestPermissionsAsync(); } catch (e) { perm = { granted: false }; }
    if (!perm.granted) {
      go("idle");
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
      return;
    }
    if (releasedEarly.current) { go("idle"); return; }
    go("listening");
    try {
      M.start({ lang: LANG, requiresOnDeviceRecognition: true, interimResults: true,
                maxAlternatives: 1, continuous: false });
    } catch (e) {
      go("idle");
      setBlock({ why: "engine", text: `Recognition failed — ${e.message || e}` });
    }
  };

  const release = () => {
    releasedAt.current = Date.now();
    if (phaseRef.current === "listening") {
      try { M.stop(); } catch (e) { /* the end event still arrives */ }
    } else {
      releasedEarly.current = true;
    }
  };

  const again = () => { setRes(null); setLive(""); go("idle"); };
  const keep = () => settle(res, attempt, last.current.transcript, last.current.ts);
  const skip = () => r.skip();
  const getModel = async () => {
    try { await M.androidTriggerOfflineModelDownload({ locale: LANG }); } catch (e) { /* stays blocked */ }
  };

  if (block) {
    return (
      <View style={{ alignItems: "center", gap: 12 }}>
        <Text style={{ color: t.ink2, fontSize: 15, textAlign: "center" }}>{block.text}</Text>
        {block.why === "model" ? <Btn label="Get Russian" onPress={getModel} /> : null}
        <Btn kind="ghost" label={block.why === "mic" ? "Skip (mic off)" : "Skip"}
             onPress={skip} />
      </View>
    );
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
      <HoldButton phase={phase} onIn={hold} onOut={release} />
      <Text style={{ color: t.ink, fontSize: 18, marginTop: 16, minHeight: 24,
                     textAlign: "center" }}>
        {phase === "listening" ? live : note || ""}
      </Text>
      {attempt > 0 ? <Muted>{`${ATTEMPTS - attempt} left`}</Muted> : null}
    </View>
  );
}
