/* The question mark in a screen's corner (the owner, 2026-10-02: "each module
 * will have a little question mark on it in the corner… if they click that,
 * that will orient them to all the features of that page").
 *
 * One sheet a screen, each line a control on that screen and what it is for,
 * in the app's own words. Not coach marks over the live screen — a sheet can
 * be opened when wanted and blocks nothing — and nothing here is said on the
 * screen itself (rule 20.7: the screen shows, the sheet explains, on request).
 * Keyed by route name; a screen with no entry gets no button. */

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius } from "./theme";
import { Sheet, Text, Muted } from "./ui";

export const HELP = {
  Path: { title: "The path", lines: [
    ["Discs", "Lessons; the filled one is next"],
    ["Side quests", "Open once a chapter's main lessons are done"],
    ["Continue", "Opens the next step for you"],
    ["Recap", "Today's words, once there are enough"],
  ] },
  Lesson: { title: "A lesson", lines: [
    ["Vocabulary", "The new words, with pictures and sentences"],
    ["Grammar", "The chapter's rule, on these words"],
    ["Quiz", "About ten questions; 75% passes"],
    ["Summary", "Everything taught, before the video"],
    ["Video", "Native speakers using what you learned"],
  ] },
  Cards: { title: "Study", lines: [
    ["Show, then grade", "Again, Hard, Good, Easy set the next review"],
    ["Counter", "Done, coming back, left; tap it for more"],
    ["Cog", "Fronts, sources, new words a day"],
    ["Fifty a day", "The rest wait for tomorrow; Keep going lifts it"],
  ] },
  Drills: { title: "Practice", lines: [
    ["Grammar drills", "Cases, agreement, conjugation, aspect, stress"],
    ["Listening", "A conversation and five questions"],
    ["Speaking", "Shadow a sentence; build a word; Talk"],
    ["Tutor", "Ask anything, in Russian or English"],
  ] },
  Drill: { title: "A drill", lines: [
    ["Cog", "What to ask, which words, written or chosen"],
    ["Bulb", "The word's tables and rules; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Wrong answer", "Why, in two lines, and the rule"],
  ] },
  Quiz: { title: "A quiz", lines: [
    ["Bulb", "The word's tables and rules; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Missed", "Comes back once at the end"],
    ["Wrong answer", "Why, in two lines, and the rule"],
  ] },
  Episodes: { title: "Immerse", lines: [
    ["Search", "A title, a topic, or a Russian word"],
    ["Filters", "Watched, channel, order"],
    ["History", "What you opened, newest first"],
    ["Under a video", "The words it says, each playable"],
  ] },
  Words: { title: "Search", lines: [
    ["Any form", "«книгу» finds «книга»"],
    ["English", "Type a meaning to find the word"],
    ["Microphone", "Say a word instead of typing"],
    ["An entry", "Meanings, tables, sentences, videos that say it"],
  ] },
  Scenes: { title: "Listening", lines: [
    ["Questions first", "Read them, then press play"],
    ["Back five", "Replays the last line"],
    ["Speed", "1×, ¾×, ½×"],
    ["Afterwards", "Every line, tappable, in its own voice"],
  ] },
  Tutor: { title: "The tutor", lines: [
    ["Microphone", "Hold to speak, in either language"],
    ["Loop", "Hands-free: it listens after each answer"],
    ["Bulb", "The grammar reference"],
    ["Cog", "Level, English under the Russian, start over"],
  ] },
};
HELP.GrammarRun = HELP.Drill;
HELP.CustomQuiz = HELP.Quiz;
HELP.Vocab = HELP.Lesson;

export function HelpButton({ route }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const help = HELP[route];
  if (!help) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} testID="help-button"
                 accessibilityRole="button" accessibilityLabel="What is on this screen"
                 style={{ marginRight: 12, width: 30, height: 30, alignItems: "center",
                          justifyContent: "center" }}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
             strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
        </Svg>
      </Pressable>
      {open ? (
        <Sheet testID="help-sheet" title={help.title} onClose={() => setOpen(false)}>
          <View style={{ gap: 12, paddingBottom: 6 }}>
            {help.lines.map(([what, does]) => (
              <View key={what} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View style={{ minWidth: 92, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm,
                               backgroundColor: t.brandBg, alignItems: "center" }}>
                  <Text style={{ color: t.brandInk, fontSize: 13, fontWeight: "700" }}>{what}</Text>
                </View>
                <Muted style={{ flex: 1, paddingTop: 3 }}>{does}</Muted>
              </View>
            ))}
          </View>
        </Sheet>
      ) : null}
    </>
  );
}
