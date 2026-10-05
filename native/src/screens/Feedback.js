/* A tester's report — on any screen from the header's flag, or from Settings
 * (2026-10-03: "I just need a way for them to submit feedback"; 2026-10-05:
 * "give feedback on specific questions… severity, issue, and
 * recommendations… the option to record").
 *
 * One screen, top to bottom: what it is about (attached, not asked for), how
 * serious, what kind, what is wrong, what it should be, recordings, Send.
 * Only the words or a recording are needed; severity and kind are a tap each
 * and may be left. What the app knows — the build, the screen, the question
 * on it, the learner's place in the course — rides along (`feedbackFacts`,
 * about.js), so the report can be traced to what was on screen. It goes to the
 * Worker (POST /v1/report); backend/tools/reports.mjs reads it, critical
 * first. With no connection it offers the share sheet, so nothing typed is
 * lost. */

import React, { useEffect, useState } from "react";
import { View, Alert, Platform, Pressable } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, Muted, Text, TextInput, Chip, SectionLabel, Bubble } from "../ui";
import { report, plan as askPlan } from "../lib/feedback";
import { shareFeedback } from "../backup";
import { readCrashes } from "../crash";
import { GuidePop } from "../guide";
import { UN, routePosition, lessonsDone } from "../data";
import { masteryOf } from "./Study";
import { cardFor } from "@core/scheduler";
import { useClips, clipData, CLIPS_MAX } from "../recorder";
import { playTrack, stop as stopAudio } from "../audio";
import { expo as APP } from "../../app.json";

/* What rides along with a report: enough to find the problem, nothing the
   tester typed elsewhere. Exported for the test. */
export function feedbackFacts(st, { crashes = 0, from = null, ai = "" } = {}) {
  const pos = routePosition(st);
  const seen = st.seen || {};
  return {
    version: `${APP.version} (${APP.android ? APP.android.versionCode : "?"})`,
    from, chapter: pos.stage + 1, lesson: pos.lesson === Infinity ? "done" : pos.lesson + 1,
    lessonsDone: UN.reduce((n, u) => n + lessonsDone(st, u), 0),
    words: Object.keys(seen).length,
    mastered: masteryOf(st, Object.keys(seen).map((b) => ({ b }))).mastered,
    reviews: Object.values(seen).reduce((n, e) => n + ((cardFor(e) || {}).reps || 0), 0),
    days: st.streak || 0, ai, crashes,
  };
}

/* The scale, said once and behind the (i): a tester picks by the example. */
export const SEVERITIES = [
  { id: "minor", label: "Minor", says: "Correct, but awkward, unclear or odd-looking." },
  { id: "major", label: "Major", says: "Wrong: a meaning, form, sound or answer that is incorrect." },
  { id: "critical", label: "Critical", says: "Breaks the app, loses progress, or teaches something badly false." },
];
export const KINDS = [
  { id: "pronunciation", label: "Pronunciation" },
  { id: "translation", label: "Translation" },
  { id: "grammar", label: "Grammar" },
  { id: "wording", label: "Word choice" },
  { id: "broken", label: "Doesn't work" },
  { id: "display", label: "Looks wrong" },
  { id: "other", label: "Other" },
];

const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function InfoDot({ onPress, label }) {
  const t = useTheme();
  return (
    <Pressable testID="feedback-severity-info" onPress={onPress} hitSlop={12}
               accessibilityRole="button" accessibilityLabel={label}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink3} strokeWidth={2}
           strokeLinecap="round">
        <Circle cx={12} cy={12} r={10} /><Path d="M12 11v6M12 7.5v.5" />
      </Svg>
    </Pressable>
  );
}

/* The line at the top: what this report is attached to. */
function AboutLine({ about }) {
  const t = useTheme();
  if (!about) return null;
  const q = about.question;
  const where = [about.screen, about.title].filter(Boolean).join(" · ");
  const what = q ? [q.prompt || q.word, q.answer].filter(Boolean).join(" → ") : "";
  return (
    <View testID="feedback-about"
          style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: 12, marginBottom: 6 }}>
      <Muted size={12}>{where || "This screen"}</Muted>
      {what ? <Text style={{ color: t.ink, fontSize: T.body, marginTop: 2 }} numberOfLines={2}>{what}</Text> : null}
    </View>
  );
}

const field = (t, minHeight) => ({
  minHeight, color: t.ink, fontSize: T.body, lineHeight: 22, backgroundColor: t.surface,
  borderWidth: 1, borderColor: t.line, borderRadius: radius.md, padding: 12,
});

export default function Feedback({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const params = (route && route.params) || {};
  const about = params.about || null;
  const [severity, setSeverity] = useState(null);
  const [kind, setKind] = useState(null);
  const [text, setText] = useState("");
  const [fix, setFix] = useState("");
  const [scale, setScale] = useState(false);
  const [state, setState] = useState("idle");          // idle | sending | sent
  const [crashes, setCrashes] = useState(0);
  const rec = useClips();
  useEffect(() => { readCrashes().then((c) => setCrashes((c || []).length)).catch(() => {}); }, []);
  useEffect(() => () => stopAudio(), []);
  const from = params.from || (about && about.screen) || null;
  const ready = !!(text.trim() || fix.trim() || rec.clips.length);

  const send = async () => {
    if (!ready || state === "sending") return;
    if (rec.state === "recording") await rec.finish();
    setState("sending");
    const used = await askPlan().catch(() => null);
    const ai = used && used.ok && used.used
      ? Object.entries(used.used).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") : "";
    const facts = { ...feedbackFacts(st, { crashes, from, ai }), platform: `${Platform.OS} ${Platform.Version}` };
    const clips = await clipData(rec.clips);
    const body = { severity, kind, text: text.trim(), fix: fix.trim(), about, clips, facts };
    const r = await report(body).catch(() => ({ ok: false }));
    if (r && r.ok) { setState("sent"); return; }
    setState("idle");
    const words = [severity, kind, text.trim(), fix.trim() ? `Should be: ${fix.trim()}` : "",
                   about ? JSON.stringify(about) : ""].filter(Boolean).join("\n");
    Alert.alert("Not sent", "No connection. Share it instead?", [
      { text: "Cancel", style: "cancel" },
      { text: "Share", onPress: () => shareFeedback(facts, words).catch(() => {}) },
    ]);
  };

  if (state === "sent") {
    return (
      <Screen fill>
        <View testID="feedback-sent" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <GuidePop pose="thumbs" size={110} />
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>Thank you</Text>
        </View>
        <Btn block kind="pri" label="Done" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const recording = rec.state === "recording";
  return (
    <Screen footer={
      <Btn block kind="pri" testID="feedback-send" disabled={!ready || state === "sending"}
           label={state === "sending" ? "Sending…" : "Send"} onPress={send} />}>
      <AboutLine about={about} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
        <SectionLabel>How serious</SectionLabel>
        <InfoDot label="What the levels mean" onPress={() => setScale(true)} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        {SEVERITIES.map((s) => (
          <Chip key={s.id} testID={`feedback-sev-${s.id}`} on={severity === s.id} label={s.label}
                onPress={() => setSeverity(severity === s.id ? null : s.id)} />
        ))}
      </View>

      <SectionLabel style={{ marginTop: 18 }}>What kind</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        {KINDS.map((k) => (
          <Chip key={k.id} testID={`feedback-kind-${k.id}`} on={kind === k.id} label={k.label}
                onPress={() => setKind(kind === k.id ? null : k.id)} />
        ))}
      </View>

      <SectionLabel style={{ marginTop: 18 }}>What's wrong</SectionLabel>
      <TextInput testID="feedback-text" value={text} onChangeText={setText} multiline
                 placeholder="What you saw or heard" placeholderTextColor={t.ink3}
                 textAlignVertical="top" style={[field(t, 96), { marginTop: 6 }]} />

      <SectionLabel style={{ marginTop: 18 }}>What it should be</SectionLabel>
      <TextInput testID="feedback-fix" value={fix} onChangeText={setFix} multiline
                 placeholder="Optional" placeholderTextColor={t.ink3}
                 textAlignVertical="top" style={[field(t, 56), { marginTop: 6 }]} />

      <SectionLabel style={{ marginTop: 18 }}>Recordings</SectionLabel>
      <View style={{ gap: 8, marginTop: 6 }}>
        {rec.clips.map((c, k) => (
          <View key={c.uri} testID={`feedback-clip-${k}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Btn kind="plain" label={`Play ${k + 1} · ${clock(c.ms)}`} style={{ flex: 1 }}
                 onPress={() => { playTrack({ uri: c.uri }).catch(() => {}); }} />
            <Btn kind="ghost" label="Remove" testID={`feedback-clip-remove-${k}`} onPress={() => rec.remove(k)} />
          </View>
        ))}
        {rec.clips.length < CLIPS_MAX ? (
          <Btn testID="feedback-record" kind={recording ? "bad" : "plain"}
               label={recording ? `Stop · ${clock(rec.ms)}` : rec.clips.length ? "Record another" : "Record"}
               onPress={recording ? rec.finish : rec.start} />
        ) : null}
        {rec.state === "denied" ? <Muted size={12}>The microphone is off for Ya in the phone's settings.</Muted> : null}
      </View>

      <Bubble visible={scale} onClose={() => setScale(false)} title="How serious" testID="feedback-scale">
        {SEVERITIES.map((s) => (
          <View key={s.id} style={{ marginBottom: 10 }}>
            <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "700" }}>{s.label}</Text>
            <Text style={{ color: t.ink2, fontSize: T.body, lineHeight: 22 }}>{s.says}</Text>
          </View>
        ))}
      </Bubble>
    </Screen>
  );
}
