/* Backward build-up — a long word learned from its end (core/buildup.js).
 *
 * The learner hears the last syllable, says it back, and each press adds one
 * syllable to the front until the whole word is there. Pimsleur's technique,
 * and the direction is the point: the ending is where Russian carries its
 * stress and where a learner's pronunciation collapses, so it is the part
 * that gets said most often rather than least.
 *
 * **Nothing is judged.** The recogniser was measured on 2–4-word sentences
 * (§30c) and a single syllable is a far harder ask of it; the Pair drill
 * already refuses to say "you said that wrong" for the same reason (§30o).
 * This is a mouth drill: the learner hears a model and matches it, and the
 * only thing the app owes them is a clean model and a way to hear it again.
 * Replays are unlimited and uncounted.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, Animated } from "react-native";
import { useTheme, radius, type as T } from "../theme";
import { Btn, Muted, Text } from "../ui";
import { say, hasRealAudio } from "../audio";
import { useEnter } from "../motion";

export function Build({ q, r }) {
  const t = useTheme();
  const steps = q.steps || [];
  const [at, setAt] = useState(0);
  const last = at >= steps.length - 1;
  const fragment = steps[at] || q.ru;
  const enter = useEnter([at]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* Every fragment is read by the phone — no recording exists of half a word.
     The complete word at the end is the exception: `say` prefers the
     collection's own recording when there is one, so the model the learner
     finally matches is a real voice wherever the corpus can supply it (§27). */
  const play = () => { say(fragment, { repeat: false }); };
  useEffect(() => { play(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [at]);

  const next = () => {
    if (last) {
      // Practice, not a score: the step is recorded so the run advances and
      // grades no word (core/buildup.js — pronouncing a word is not the same
      // claim as knowing it).
      r.record(true, [], undefined, { credit: 1, note: null });
      return;
    }
    setAt(at + 1);
  };

  return (
    <View>
      <Muted testID="build-meaning" style={{ textAlign: "center", marginBottom: 4 }}>{q.en}</Muted>

      {/* One dot per syllable, filling from the right — the shape of the
          method is the shape of the progress. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 18 }}>
        {steps.map((_, k) => (
          <View key={k} testID={k <= at ? "build-dot-on" : "build-dot-off"}
                style={{ width: 8, height: 8, borderRadius: 4,
                         backgroundColor: k <= at ? t.brand : t.line }} />
        ))}
      </View>

      <Pressable
        testID="build-play"
        accessibilityRole="button"
        accessibilityLabel="Hear it again"
        onPress={play}
        style={({ pressed }) => ({
          alignItems: "center", paddingVertical: 28, paddingHorizontal: 16,
          borderRadius: radius.xl, borderWidth: 1, borderColor: t.line,
          backgroundColor: pressed ? t.surface2 : t.surface,
        })}
      >
        {/* The animation goes on a wrapper, never on the Text itself. An
            animated value handed to a plain component reaches the native side
            as a map where a float is expected and the app dies with a
            ClassCastException — and nothing under test sees it, because the
            test clock settles animations instantly and never makes the cast
            (§20a: native has no visual suite; §30n′ made the same rule for
            `usePress`). Caught on the emulator, 2026-09-16. */}
        <Animated.View style={enter}>
          <Text testID="build-fragment"
                style={{ color: t.ink, fontWeight: "700", textAlign: "center",
                         fontSize: fragment.length > 14 ? 30 : fragment.length > 8 ? 38 : 46 }}>
            {fragment}
          </Text>
        </Animated.View>
      </Pressable>

      {!hasRealAudio(q.ru) || !last ? (
        <Muted testID="build-voice" size={12} style={{ textAlign: "center", marginTop: 8 }}>
          device voice
        </Muted>
      ) : null}

      <Btn kind="pri" testID="build-next" style={{ marginTop: 18 }}
           label={last ? "Done" : "Add a syllable"} onPress={next} />
    </View>
  );
}
