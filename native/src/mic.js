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
import { useRecognizer, LANG } from "./speech";
import { stop as stopAudio } from "./audio";
import { ACTIVITY_ICONS } from "@core/icons";

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
  useEffect(() => { if (onNote && rec.block) onNote(rec.block.text); }, [rec.block]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (onNote && rec.note) onNote(rec.note); }, [rec.note]);   // eslint-disable-line react-hooks/exhaustive-deps
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
