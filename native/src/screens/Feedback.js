/* Send feedback — a tester's words, straight to the owner (2026-10-03: "I just
 * need a way for them to submit feedback").
 *
 * One box and one button. What the app knows that would help — the build,
 * where the learner is, how much they have done, which screen they came from,
 * the phone — rides along without being asked for (backup.js `feedbackFacts`),
 * so the tester only has to say what happened. It goes to the Worker
 * (POST /v1/report) and the owner reads it with backend/tools/reports.mjs.
 * With no connection it offers the share sheet instead, so nothing typed is
 * lost. */

import React, { useEffect, useState } from "react";
import { View, Alert, Platform } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, Muted, Text, TextInput } from "../ui";
import { report, plan as askPlan } from "../lib/feedback";
import { shareFeedback } from "../backup";
import { readCrashes } from "../crash";
import { GuidePop } from "../guide";
import { UN, routePosition, lessonsDone } from "../data";
import { masteryOf } from "./Study";
import { cardFor } from "@core/scheduler";
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

export default function Feedback({ route, navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const [text, setText] = useState("");
  const [state, setState] = useState("idle");          // idle | sending | sent
  const [crashes, setCrashes] = useState(0);
  useEffect(() => { readCrashes().then((c) => setCrashes((c || []).length)).catch(() => {}); }, []);
  const from = route && route.params ? route.params.from : null;

  const send = async () => {
    const words = text.trim();
    if (!words || state === "sending") return;
    setState("sending");
    const used = await askPlan().catch(() => null);
    const ai = used && used.ok && used.used
      ? Object.entries(used.used).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") : "";
    const facts = { ...feedbackFacts(st, { crashes, from, ai }), platform: `${Platform.OS} ${Platform.Version}` };
    const r = await report({ text: words, facts }).catch(() => ({ ok: false }));
    if (r && r.ok) { setState("sent"); return; }
    setState("idle");
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

  return (
    <Screen fill>
      <TextInput testID="feedback-text" value={text} onChangeText={setText} multiline autoFocus
                 placeholder="What happened, or what would make it better?"
                 placeholderTextColor={t.ink3} textAlignVertical="top"
                 style={{ minHeight: 180, color: t.ink, fontSize: T.body, lineHeight: 24,
                          backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
                          borderRadius: radius.md, padding: 14 }} />
      <Muted size={12} style={{ marginTop: 8 }}>Your place in the course and the build are attached.</Muted>
      <View style={{ marginTop: "auto", paddingTop: 16 }}>
        <Btn block kind="pri" testID="feedback-send" disabled={!text.trim() || state === "sending"}
             label={state === "sending" ? "Sending…" : "Send"} onPress={send} />
      </View>
    </Screen>
  );
}
