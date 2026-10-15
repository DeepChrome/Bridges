/* The offer made when a run was left part-way (resume.js): on opening the app,
   as a sheet over the path, and on reopening the run's own screen.

   **What was left, as a card, not a line** (the owner, 2026-10-03: "super super
   ugly… the text where it says the name of the learning block"). It was one
   grey run-on — «Food · Lesson 2 quiz · 5 of 12». It is drawn the way a
   "continue watching" row is in the apps that do this well: the unit's icon in
   a tinted tile, the unit's name large, the step under it, and how far through
   as a bar with the count beside it. */

import React from "react";
import { View } from "react-native";
import { Sheet, Btn, Muted, Text, Bar, UnitIcon } from "./ui";
import { useTheme, radius, type as T } from "./theme";
import { UN } from "./data";

/* «Food · Lesson 2 quiz» -> { name: "Food", step: "Lesson 2 · Quiz" }. The
   titles are written by the flows (flows/*.js `save`); a title with no unit in
   it ("Today's recap") is the name alone. */
export function runParts(run) {
  const [name, ...rest] = String(run.title || "").split(" · ");
  const step = rest.join(" · ").replace(/^Lesson (\d+) (\w+)$/,
    (_, n, what) => `Lesson ${n} · ${what.charAt(0).toUpperCase()}${what.slice(1)}`);
  return { name: name || "Your last session", step };
}

export function RunCard({ run }) {
  const t = useTheme();
  const { name, step } = runParts(run);
  const unit = run.params && run.params.unitId ? UN.find((u) => u.id === run.params.unitId) : null;
  const done = run.at, total = run.queue.length;
  return (
    <View testID="resume-card"
          style={{ flexDirection: "row", gap: 14, alignItems: "center", padding: 14,
                   borderRadius: radius.lg, backgroundColor: t.surface,
                   borderWidth: 1, borderColor: t.line }}>
      <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: t.brandBg,
                     alignItems: "center", justifyContent: "center" }}>
        <UnitIcon id={unit ? unit.id : (run.params && run.params.type) || "quiz"}
                  size={28} color={t.brandInk} weight={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text testID="resume-name" numberOfLines={1}
              style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>{name}</Text>
        {step ? <Muted testID="resume-step" numberOfLines={1}>{step}</Muted> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Bar value={done / Math.max(1, total)} /></View>
          <Text testID="resume-what" style={{ color: t.ink2, fontSize: T.small, fontWeight: "700" }}>
            {`${done} of ${total}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ResumeSheet({ run, onContinue, onRestart, onClose }) {
  return (
    <Sheet testID="resume-sheet" title="Pick up where you left off" onClose={onClose}
           footer={(
             <View style={{ gap: 10 }}>
               <Btn block kind="pri" testID="resume-continue" label="Continue" onPress={onContinue} />
               <Btn block kind="ghost" testID="resume-restart" label="Start again" onPress={onRestart} />
             </View>
           )}>
      <RunCard run={run} />
    </Sheet>
  );
}
