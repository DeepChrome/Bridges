/* A small microphone that fills a field by voice (the owner, 2026-09-29:
 * *"add the option to speak to search via a small little grey microphone
 * button in the bar — press once and it will listen and detect when the user
 * stops"*, and *"the option to speak the response on all of the drills too as
 * an alternative to typing"*).
 *
 * One press, not a hold: `listen()` is the hands-free attempt conversation
 * mode already uses, which measures the pause itself and ends when the
 * speaker stops (speech.js SILENCE_MS). A second press puts it down and sends
 * nothing. Recognition is on the device, as everywhere else (§30c).
 *
 * Grey at rest and brand while listening, so the only state a learner has to
 * read is "is it on". What it heard goes to `onLive` as it comes and to
 * `onText` when it is done; the field is the caller's, so the words land where
 * the typing would have. `langs` of two lets it follow the speaker between
 * Russian and English (the dictionary takes either); a drill passes Russian
 * alone, since an English reading of a Russian answer is a wrong answer
 * waiting to happen.
 *
 * Nothing listens while the app is talking (§30h′): `stop()` silences any
 * recording or voice before the microphone opens, or it would hear the prompt.
 */

import React, { useEffect } from "react";
import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
import { Text, IconButton } from "./ui";
import { useRecognizer, LANG, LANG_EN } from "./speech";
import { stop as stopAudio } from "./audio";
import { ACTIVITY_ICONS } from "@core/icons";

/* The microphone's language, one small toggle beside it: a request is as
   likely to be "what should I study next" as «я хочу чай». The tutor's and the
   sparkle's (the owner, 2026-11-19: "make sure we have the option for the AI
   to receive input in Russian or English from the user"). */
export function LangToggle({ lang, onPress, testID = "mic-lang" }) {
  const t = useTheme();
  const en = lang === LANG_EN;
  return (
    <IconButton testID={testID} size={44} onPress={onPress}
                label={en ? "Microphone hears English" : "Microphone hears Russian"}>
      <Text style={{ color: t.ink2, fontSize: 12, fontWeight: "700" }}>{en ? "EN" : "RU"}</Text>
    </IconButton>
  );
}

/* Conversation mode, as one icon beside the microphone — the control the
   owner described: *"think about Claude's own conversation mode with the
   little icon by itself."* Four bars of a waveform, lit when the exchange is
   running. It is the mode's only control and it is not a setting. */
export function ConverseToggle({ on, onPress, testID = "converse" }) {
  const t = useTheme();
  return (
    <IconButton testID={testID} size={44} on={on} selected={on} onPress={onPress}
                label={on ? "Leave conversation mode" : "Conversation mode"}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
           stroke={on ? t.brandInk : t.ink2} strokeWidth={2} strokeLinecap="round">
        <Path d="M4 10v4M8.5 6v12M15.5 6v12M20 10v4" />
      </Svg>
    </IconButton>
  );
}

/* `onNote(text, action)`: what the caller should say under its field, and —
   when the Russian model is what is missing — the one thing the learner can
   do about it (`{ label, run }`), which `MicNote` draws as a link. The cases
   drill's microphone used to report "not installed" with no way to install it
   (the owner, 2026-10-29); the hold-to-speak activities had `Get Russian`
   all along (activities/Say.js Blocked). */
export function MicButton({ onText, onLive, onNote, langs, testID = "mic", size = 40, bias }) {
  const t = useTheme();
  const rec = useRecognizer({
    bias,
    onFinal: (text) => { if (onLive) onLive(""); if (text && text.trim()) onText(text.trim()); },
    onQuiet: () => { if (onLive) onLive(""); if (onNote) onNote("Nothing heard"); },
  });
  const on = rec.phase !== "idle";
  useEffect(() => { if (onLive && on) onLive(rec.live); }, [rec.live]);   // eslint-disable-line react-hooks/exhaustive-deps
  // A block (microphone off, no Russian model) or a transient note, said once
  // by the caller in its own place — a 40 px button has nowhere to say it.
  useEffect(() => {
    if (!onNote || !rec.block) return;
    const b = rec.block;
    const action = b.why === "model" && b.canGet !== false
      ? { label: `Get ${b.name || "Russian"}`, run: rec.getModel } : null;
    onNote(b.text, action);
  }, [rec.block]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (onNote && rec.note) onNote(rec.note, null); }, [rec.note]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the screen puts the microphone down.
  useEffect(() => () => rec.cancel(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const press = () => {
    if (on) { rec.cancel(); if (onLive) onLive(""); return; }
    if (rec.block) rec.clearBlock();
    if (onNote) onNote(null);
    stopAudio();
    const both = Array.isArray(langs) && langs.length > 1;
    rec.listen(both ? { lang: langs[0], langs } : { lang: (langs && langs[0]) || LANG });
  };

  return (
    <Pressable testID={testID} onPress={press} hitSlop={6}
               accessibilityRole="button" accessibilityState={{ selected: on }}
               accessibilityLabel={on ? "Stop listening" : "Speak instead"}
               style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center",
                        justifyContent: "center", backgroundColor: on ? t.brand : "transparent" }}>
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none"
           stroke={on ? t.brandOn : t.ink3} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d={ACTIVITY_ICONS.shadow} />
      </Svg>
    </Pressable>
  );
}