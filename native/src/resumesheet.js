/* The offer made on opening the app when a run was left part-way (resume.js).
   A sheet over the path rather than a screen of its own: the learner may want
   neither choice, and closing it leaves them where they always land. */

import React from "react";
import { View } from "react-native";
import { Sheet, Btn, Muted } from "./ui";
import { runLabel } from "./resume";

export function ResumeSheet({ run, onContinue, onRestart, onClose }) {
  return (
    <Sheet testID="resume-sheet" title="Continue where you left off?" onClose={onClose}
           footer={(
             <View style={{ gap: 10 }}>
               <Btn block kind="pri" testID="resume-continue" label="Continue" onPress={onContinue} />
               <Btn block kind="ghost" testID="resume-restart" label="Start again" onPress={onRestart} />
             </View>
           )}>
      <Muted testID="resume-what">{runLabel(run)}</Muted>
    </Sheet>
  );
}
