/* The question mark in a screen's corner (the owner, 2026-10-02: "each module
 * will have a little question mark on it in the corner… if they click that,
 * that will orient them to all the features of that page").
 *
 * One sheet a screen, each line a control on that screen and what it is for,
 * in the app's own words. Not coach marks over the live screen — a sheet can
 * be opened when wanted and blocks nothing — and nothing here is said on the
 * screen itself (rule 20.7: the screen shows, the sheet explains, on request).
 * Keyed by route name.
 *
 * And under the lines, "How do I…" (2026-10-08 — the owner found the lines
 * alone not much help: "if you can't make it better or more useful, just
 * delete it"): a question about using the app, answered by the AI from
 * `APP_GUIDE` and this screen's lines (askai.js). With the AI the "?" is on
 * every screen; without it, only on screens that have lines. */

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius } from "./theme";
import { Sheet, Text, Muted, Btn } from "./ui";
import { navRef } from "./words";
import { useAskThread, AskTurns, AskInput, aiOffered } from "./askai";
import { APP_GUIDE } from "./appguide";

export { APP_GUIDE };

export const HELP = {
  Path: { title: "The path", lines: [
    ["Discs", "Lessons; the filled one is next"],
    ["Side quests", "Open once a chapter's main lessons are done"],
    ["Continue", "Opens the next step for you"],
    ["Recap", "Today's words, once there are enough"],
  ] },
  Lesson: { title: "A lesson", lines: [
    ["Vocabulary", "The new words, the rule, and drills on both"],
    ["Quiz", "About ten questions; 75% passes"],
    ["Summary", "Everything taught, before the video"],
    ["Video", "Native speakers using what you learned"],
  ] },
  Cards: { title: "Study", lines: [
    ["Show, then grade", "Again, Hard, Good, Easy set the next review"],
    ["Counter", "Done, coming back, left; tap it for more"],
    ["Cog", "Fronts, sources, order, new words a day"],
    ["Goal reached", "A note; the cards keep coming"],
    ["Drills", "On the back: every drill for that word"],
    ["Switch", "Offered when one direction falls far behind"],
  ] },
  WordDrill: { title: "One word's drill", lines: [
    ["Bulb", "The word's tables; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Missed", "Comes back once at the end"],
    ["Sparkle", "Ask the AI about this question"],
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
    ["Sparkle", "Ask the AI about this question"],
  ] },
  Quiz: { title: "A quiz", lines: [
    ["Bulb", "The word's tables and rules; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Missed", "Comes back once at the end"],
    ["Wrong answer", "Why, in two lines, and the rule"],
    ["Sparkle", "Ask the AI about this question"],
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
  Drive: { title: "Drive mode", lines: [
    ["Episodes", "The course in 25 parts, easiest first"],
    ["Your playlists", "Your studied words and your trouble words"],
    ["Cog", "Prompt, pause, speed, next episode"],
  ] },
  DriveEpisode: { title: "An episode", lines: [
    ["The pause", "Say the Russian aloud before you hear it"],
    ["Lock the phone", "It keeps playing; pause from the lock screen"],
    ["Arrows", "The item before or after"],
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
HELP.CaseRun = HELP.Drill;

export function HelpButton({ route }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const th = useAskThread({ mode: "app",
    guide: () => APP_GUIDE + (help ? `\nThis screen (${help.title}): ${help.lines.map(([w, d]) => `${w}: ${d}`).join("; ")}.` : "") });
  const help = HELP[route];
  const ai = aiOffered();
  /* With the AI there is always something to ask, so the "?" is on every
     screen; without it, only where there are lines to read. */
  if (!help && !ai) return null;
  return (
    <>
      <Pressable onPress={() => { th.open(); setOpen(true); }} hitSlop={8} testID="help-button"
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
        <Sheet testID="help-sheet" title={help ? help.title : "How do I…"} onClose={() => setOpen(false)}
               footer={(
                 <>
                   {ai ? <AskInput th={th} prefix="help" placeholder="How do I…" /> : null}
                   {/* The way to tell the owner something is wrong, from the
                       screen it is wrong on — the screen's name rides along. */}
                   <Btn kind="ghost" testID="help-feedback" label="Send feedback" style={{ marginTop: 6 }}
                        onPress={() => {
                          setOpen(false);
                          if (navRef.isReady()) navRef.navigate("Feedback", { from: route });
                        }} />
                 </>
               )}>
          <View style={{ gap: 12, paddingBottom: 6 }}>
            {(help ? help.lines : []).map(([what, does]) => (
              <View key={what} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View style={{ minWidth: 92, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm,
                               backgroundColor: t.brandBg, alignItems: "center" }}>
                  <Text style={{ color: t.brandInk, fontSize: 13, fontWeight: "700" }}>{what}</Text>
                </View>
                <Muted style={{ flex: 1, paddingTop: 3 }}>{does}</Muted>
              </View>
            ))}
            <AskTurns thread={th.thread} busy={th.busy} prefix="help" />
          </View>
        </Sheet>
      ) : null}
    </>
  );
}
