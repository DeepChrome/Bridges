/* A listening passage: half a minute of one speaker on one subject.
 *
 * The old listening activity played two or three unrelated sentences and asked
 * what each meant. The owner's complaint (2026-09-10): no topic, no thread, and
 * no way to hear a bit again. This is a span of one real video — the same library
 * Immerse draws on, so the app ties together rather than holding two collections —
 * with the controls a listener actually wants: play, back five, forward five, and
 * a bar showing where in the passage you are.
 *
 * The questions come after the audio, never during: reading four options while a
 * native speaker talks is not listening. They are about what was *caught* rather
 * than what was understood — see the note in core/questions.js on why the
 * captions cannot honestly support more — and a missed word can be played back at
 * the second it went by.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { YouTube } from "../youtube";
import { useTheme, radius } from "../theme";
import { Btn, Bar, Muted, Pill, Text } from "../ui";
import { SKIP_MS } from "@core/questions";

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Passage({ q, r }) {
  const t = useTheme();
  const player = useRef(null);
  const [at, setAt] = useState(q.start);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);      // played through at least once
  const [dead, setDead] = useState(null);         // the player refused; see below
  const span = Math.max(1, q.end - q.start);

  // Position reports only while it is playing.
  useEffect(() => {
    if (player.current) player.current.watch(playing);
    return () => { if (player.current) player.current.watch(false); };
  }, [playing]);

  // Stop at the end of the span rather than running on into the video.
  useEffect(() => {
    if (playing && at >= q.end) {
      player.current && player.current.pause();
      setPlaying(false);
      setHeard(true);
    }
  }, [at, playing]);

  /* Play owns the position, because the stop effect reads it. Setting `playing`
     alone and seeking the player left `at` sitting past the end, so the effect
     below fired again the instant it re-ran and paused on the spot — "Again",
     the control this whole activity exists for, was dead after the first
     listen. Position reports only arrive while playing, so nothing else would
     ever have moved `at` back. */
  const play = () => {
    const from = at >= q.end - 500 ? q.start : at;
    setAt(from);
    setPlaying(true);
    player.current && player.current.seek(from, 0);
  };
  const pause = () => {
    setPlaying(false);
    player.current && player.current.pause();
  };
  const skip = (delta) => {
    player.current && player.current.skip(delta, q.start, q.end);
    setAt((x) => Math.min(q.end, Math.max(q.start, x + delta)));
  };

  const Skip = ({ delta, label }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`skip-${delta > 0 ? "fwd" : "back"}`}
      onPress={() => skip(delta)}
      style={({ pressed }) => ({
        paddingHorizontal: 16, paddingVertical: 12, minWidth: 64, minHeight: 44,
        alignItems: "center", justifyContent: "center",
        borderRadius: radius.md, borderWidth: 1, borderColor: t.line,
        backgroundColor: pressed ? t.surface2 : t.surface,
      })}
    >
      <Text style={{ color: t.ink, fontWeight: "700", fontSize: 15 }}>
        {delta > 0 ? "5 ▸" : "◂ 5"}
      </Text>
    </Pressable>
  );

  return (
    <View>
      {/* The player is present but small: this is listening, and a video the
          learner watches is a different activity (Immerse). Kept a pixel tall
          rather than unmounted, because it is what makes the sound. */}
      <View style={{ height: 1, overflow: "hidden", opacity: 0 }}>
        <YouTube
          ref={player}
          videoId={q.video}
          onTime={(ms) => setAt(ms)}
          onEnded={() => { setPlaying(false); setHeard(true); }}
          onError={(code) => { setPlaying(false); setDead(code); }}
        />
      </View>

      <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                     borderRadius: radius.lg, padding: 16 }}>
        <Muted numberOfLines={2}>{q.title}</Muted>
        <View style={{ marginTop: 14, marginBottom: 8 }}>
          <Bar value={Math.min(1, Math.max(0, (at - q.start) / span))} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Muted size={12}>{clock(Math.max(0, at - q.start))}</Muted>
          <Muted size={12}>{clock(span)}</Muted>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center",
                       gap: 12, marginTop: 14 }}>
          <Skip delta={-SKIP_MS} label="Back five seconds" />
          <Btn kind="pri" testID="passage-play"
               label={playing ? "Pause" : heard ? "Again" : "Play"}
               style={{ paddingHorizontal: 34 }}
               onPress={playing ? pause : play} />
          <Skip delta={SKIP_MS} label="Forward five seconds" />
        </View>
      </View>

      {/* Nothing is asked until it has been heard once — the questions are about
          the passage, and offering them first turns it into a reading test.

          Some videos cannot be embedded at all: the owner disables it, and the
          player says so (youtube.js, errors 101 and 150). The player is hidden
          here, so that message would never be seen — the learner would press
          Play, hear nothing, and be told to listen once through, for ever. A
          refusal is named and the step is skipped, which the runner leaves out
          of the total rather than marking wrong (the same way Say handles a
          missing microphone). */}
      <View style={{ marginTop: 16 }}>
        {dead ? (
          <>
            <Muted testID="passage-dead" style={{ textAlign: "center", marginBottom: 10 }}>
              This one cannot be played here.
            </Muted>
            <Btn label="Skip it" onPress={() => r.skip()} />
          </>
        ) : heard ? (
          // The passage is a gate, not a question: it is skipped rather than
          // recorded, so listening does not hand everyone a free mark and
          // inflate the score the list shows.
          <Btn kind="pri" testID="passage-done" label="Answer the questions"
               onPress={() => r.skip()} />
        ) : (
          <Muted style={{ textAlign: "center" }}>
            Listen once through, then the questions.
          </Muted>
        )}
      </View>
    </View>
  );
}

export default Passage;
