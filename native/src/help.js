/* How to use this screen (the owner, 2026-10-02: "each module will have a
 * little question mark on it in the corner… if they click that, that will
 * orient them to all the features of that page"; since 2026-11-19 a row of
 * the header menu rather than a corner of its own).
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

import React, { useEffect } from "react";
import { View } from "react-native";
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
    ["Update available", "A newer build; Download fetches it"],
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
    ["Options", "Sliders, top right: review, front, cards, order, new words"],
    ["Goal reached", "A note; the cards keep coming"],
    ["Finish", "Past the goal: stop, and choose another round"],
    ["Resting", "Ten misses in a row: a new word instead"],
    ["Wrench", "Developer mode: why this card came up"],
    ["a_", "On the front: the answer a letter at a time"],
    ["Drills", "On the back: every drill for that word"],
    ["Low priority", "Out of the rotation; Options lists them"],
    ["Switch", "Offered when one direction falls far behind"],
    ["Cases", "Case cards: triggers, sentences, endings, forms, counting"],
    ["Which case?", "Tap one of the five; checked at once"],
    ["Case options", "Sliders, top right: cards, cases, number, one trigger"],
    ["Back", "On a case card: the card before"],
  ] },
  WordDrill: { title: "One word's drill", lines: [
    ["a_", "The answer a piece at a time; costs the grade"],
    ["Bulb", "The word's tables; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Missed", "Comes back once at the end"],
    ["Sparkle", "Ask the AI about this question"],
  ] },
  Drills: { title: "Practice", lines: [
    ["Grammar drills", "Cases, form cards, agreement, conjugation, aspect, stress"],
    ["Listening", "A conversation and five questions"],
    ["Speaking", "Shadow a sentence; build a word; Talk"],
    ["Tutor", "Ask anything, in Russian or English"],
  ] },
  FormCards: { title: "Form cards", lines: [
    ["Front", "The word and the form it asks for"],
    ["Show", "The form, its sound and the table"],
    ["Again · Hard · Good · Easy", "Your own grade; moves Cases & forms only"],
    ["Options", "Sliders, top right: which drills, which words"],
  ] },
  Drill: { title: "A drill", lines: [
    ["Options", "Sliders, top right: what to ask, words, answer style"],
    ["a_", "The answer a piece at a time; costs the grade"],
    ["Bulb", "The word's tables and rules; costs the grade"],
    ["Speaker", "Hear the word; twice for slower"],
    ["Wrong answer", "Why, in two lines, and the rule"],
    ["Sparkle", "Ask the AI about this question"],
  ] },
  Quiz: { title: "A quiz", lines: [
    ["a_", "The answer a piece at a time; costs the grade"],
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
    ["Episodes", "Each chapter's words, about fifty an episode"],
    ["Your playlists", "Your studied words, trouble words, a chapter's learned words"],
    ["Options", "Sliders, top right: prompt, pause, speed, voice, next episode"],
  ] },
  DriveEpisode: { title: "An episode", lines: [
    ["The pause", "Say the Russian aloud before you hear it"],
    ["Say a command", "Repeat, continue, back, next, pause, play, again"],
    ["Conjugate, Forms", "The word's tables; say a tense or a case"],
    ["Sleep", "Stops after the minutes you set"],
    ["Lock the phone", "It keeps playing; pause from the lock screen"],
  ] },
  Tutor: { title: "The tutor", lines: [
    ["First time", "A few questions; the tutor remembers them"],
    ["Say nothing", "It picks what to work on from your data"],
    ["Microphone", "Hold to speak, in either language"],
    ["Loop", "Hands-free: it listens after each answer"],
    ["Bulb", "The grammar reference"],
    ["Options", "Sliders, top right: level, English under Russian, start over"],
  ] },
};
HELP.GrammarRun = HELP.Drill;
HELP.CustomQuiz = HELP.Quiz;
HELP.Vocab = HELP.Lesson;
HELP.CaseRun = HELP.Drill;

/* The sheet itself. Since 2026-11-19 it opens from the header menu's "How to
   use this screen" row (headermenu.js), not from a "?" of its own — every
   header is the same three buttons now. */
export function HelpSheet({ route, onClose }) {
  const t = useTheme();
  const help = HELP[route];
  const th = useAskThread({ mode: "app",
    guide: () => APP_GUIDE + (help ? `\nThis screen (${help.title}): ${help.lines.map(([w, d]) => `${w}: ${d}`).join("; ")}.` : "") });
  const ai = aiOffered();
  useEffect(() => { th.open(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet testID="help-sheet" title={help ? help.title : "How do I…"} onClose={onClose}
           footer={(
             <>
               {ai ? <AskInput th={th} prefix="help" placeholder="How do I…" /> : null}
               {/* The way to tell the owner something is wrong, from the
                   screen it is wrong on — the screen's name rides along. */}
               <Btn kind="ghost" testID="help-feedback" label="Send feedback" style={{ marginTop: 6 }}
                    onPress={() => {
                      onClose();
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
  );
}
