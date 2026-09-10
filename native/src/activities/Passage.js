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
import { View, Text, Pressable } from "react-native";
import { YouTube } from "../youtube";
import { useTheme, radius } from "../theme";
import { Btn, Bar, Muted, Pill } from "../ui";
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

  const play = () => {
    setPlaying(true);
    player.current && player.current.seek(at >= q.end - 500 ? q.start : at, 0);
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
          learner watches is a different activity (Immerse). */}
      <View style={{ height: 1, overflow: "hidden", opacity: 0 }}>
        <YouTube
          ref={player}
          videoId={q.video}
          onTime={(ms) => setAt(ms)}
          onEnded={() => { setPlaying(false); setHeard(true); }}
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
          the passage, and offering them first turns it into a reading test. */}
      <View style={{ marginTop: 16 }}>
        {heard ? (
          <Btn kind="pri" testID="passage-done" label="Answer the questions"
               onPress={() => r.record(true, [], undefined, { credit: 1, note: null })} />
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
