/* Word building — a long word said a syllable at a time (core/buildup.js).
 *
 * The shape the owner asked for on 2026-09-16, after using the first cut:
 *
 *   - the whole word and its meaning stay at the top for the length of it, so
 *     the learner always knows what they are building toward;
 *   - a new word is read out **twice**, with a pause, before any syllable —
 *     you cannot aim at a target you have not heard;
 *   - forwards, «по» → «пони» → «понима» → «понимаю» (the tradeoff is written
 *     down in core/buildup.js, where the direction lives);
 *   - one voice throughout;
 *   - controls: the word before, the word after;
 *   - and, if the learner asked for it on the way in, the phone listens.
 *
 * **One voice, and it is the device's.** `say()` prefers a recording from the
 * collection when there is one, so the fragments were read by the phone and
 * then the finished word arrived in a studio voice — a different person saying
 * the thing you had just spent four repetitions matching. `speakLine` is the
 * device throughout, the same reason a written scenario is (§30l). The screen
 * says whose voice it is (§27).
 *
 * **What the listening half can honestly claim** is what the Pair drill claims
 * (§30o): the on-device recogniser was measured on 2–4-word sentences, and a
 * word out of context is harder than that — a syllable far harder. So it never
 * says "wrong". It says what it heard, marks a match, and when it caught
 * nothing it says that instead of holding it against the learner. And it only
 * listens for the **whole word**: asking a recogniser to score «пони» would be
 * inventing a verdict out of noise.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, Animated } from "react-native";
import { useTheme, radius, type as T } from "../theme";
import { Btn, Muted, Text } from "../ui";
import { speakLine } from "../audio";
import { useEnter } from "../motion";
import { useRecognizer } from "../speech";
import { HoldButton, Blocked } from "./Say";
import { fold } from "@core/util";

/* Between the two readings of a new word, and between a reading and the first
   syllable. Long enough to be a pause rather than a stutter, short enough that
   nobody reaches for the button. */
export const INTRO_GAP_MS = 550;

export function Build({ q, r }) {
  const t = useTheme();
  const steps = q.steps || [];
  const [at, setAt] = useState(0);
  const [intro, setIntro] = useState(true);      // the word being read out twice
  const [heard, setHeard] = useState(null);      // { ok, transcript } once it has listened
  const last = at >= steps.length - 1;
  const fragment = steps[at] || q.ru;
  const enter = useEnter([at, intro]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* Every fragment, and the word itself, in the one voice. */
  const speak = (text) => speakLine(text);
  const play = () => { speak(fragment); };

  /* A new word arrives: read whole, pause, read whole again, pause, then the
     first syllable. Each `await` is checked against `alive` — leaving the
     screen mid-sequence must not go on talking, and `r.back`/skip can change
     the word underneath it. */
  const token = useRef(0);
  useEffect(() => {
    const mine = ++token.current;
    setHeard(null);
    if (!intro) { play(); return; }
    (async () => {
      await speak(q.ru);
      if (!alive.current || token.current !== mine) return;
      await new Promise((ok) => setTimeout(ok, INTRO_GAP_MS));
      if (!alive.current || token.current !== mine) return;
      await speak(q.ru);
      if (!alive.current || token.current !== mine) return;
      await new Promise((ok) => setTimeout(ok, INTRO_GAP_MS));
      if (!alive.current || token.current !== mine) return;
      setIntro(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, intro, q.ru]);

  /* No reset-on-word-change effect: the runner keys the activity by position
     (`<Animated.View key={at}>` in Run.js), so a new word — forwards or back —
     is a new mount and the state starts where it should. An effect doing the
     same job would fire a second time on the first render of each word and
     restart the intro on top of itself. */

  const rec = useRecognizer({
    enabled: !!q.listen && last && !intro && !r.answered,
    onFinal: (transcript) => {
      const words = (transcript || "").split(/\s+/).map(fold).filter(Boolean);
      setHeard({ ok: words.includes(fold(q.ru)), transcript: transcript || "" });
    },
  });

  const advance = () => {
    if (!last) { setAt(at + 1); return; }
    /* Practice, not a score: the step is recorded so the run advances and
       grades no word (core/buildup.js — pronouncing a word is not the same
       claim as knowing it). */
    r.record(true, [], undefined, { credit: 1, note: null });
  };

  if (rec.block) {
    return <Blocked block={rec.block} onGetModel={rec.getModel}
                    onSkip={() => r.record(true, [], undefined, { credit: 1, note: null })}
                    skipLabel="Carry on without it" />;
  }

  const listening = !!q.listen && last && !intro;

  return (
    <View>
      {/* The word being built, and what it means. It does not move, so the
          fragment below it is always read against the whole. */}
      <View style={{ alignItems: "center", marginBottom: 18 }}>
        <Text testID="build-word"
              style={{ color: t.ink, fontSize: q.ru.length > 12 ? 24 : 28, fontWeight: "700",
                       textAlign: "center" }}>
          {q.ru}
        </Text>
        {q.en ? (
          <Muted testID="build-meaning" style={{ textAlign: "center", marginTop: 2 }}>{q.en}</Muted>
        ) : null}
      </View>

      {/* One dot per syllable, filling from the **right** — the shape of the
          method is the shape of the progress, and the build runs from the end
          of the word toward its front (core/buildup.js). Filling them left to
          right would draw the opposite of what the learner is hearing. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 18 }}>
        {steps.map((_, k) => {
          const lit = !intro && k >= steps.length - 1 - at;
          return (
            <View key={k} testID={lit ? "build-dot-on" : "build-dot-off"}
                  style={{ width: 8, height: 8, borderRadius: 4,
                           backgroundColor: lit ? t.brand : t.line }} />
          );
        })}
      </View>

      <Pressable
        testID="build-play"
        accessibilityRole="button"
        accessibilityLabel="Hear it again"
        onPress={() => speak(intro ? q.ru : fragment)}
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
                style={{ color: intro ? t.ink3 : t.ink, fontWeight: "700", textAlign: "center",
                         fontSize: (intro ? q.ru : fragment).length > 14 ? 30
                                 : (intro ? q.ru : fragment).length > 8 ? 38 : 46 }}>
            {intro ? q.ru : fragment}
          </Text>
        </Animated.View>
      </Pressable>

      <Muted testID="build-voice" size={12} style={{ textAlign: "center", marginTop: 8 }}>
        device voice
      </Muted>

      {/* What it heard, never a verdict on the learner (§30o). */}
      {heard ? (
        <Text testID="build-heard"
              style={{ color: heard.ok ? t.good : t.ink3, fontSize: 16, fontWeight: "600",
                       textAlign: "center", marginTop: 12 }}>
          {heard.ok ? `Heard «${q.ru}»`
            : heard.transcript ? `Heard «${heard.transcript}»` : "Did not catch that"}
        </Text>
      ) : listening && !heard ? (
        <View style={{ alignItems: "center", marginTop: 14 }}>
          <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} />
          <Text style={{ color: t.ink, fontSize: 18, marginTop: 12, minHeight: 24 }}>{rec.live}</Text>
        </View>
      ) : null}

      <Btn kind="pri" testID="build-next" style={{ marginTop: 18 }}
           label={intro ? "Start" : last ? "Next word" : "Add a syllable"}
           onPress={intro ? () => { token.current++; setIntro(false); } : advance} />

      {/* The word before and the word after. A mouth drill is the one run where
          going back is the method rather than a way round the mark, so the
          runner hands `back` only to this and to Shadowing (`allowBack`). */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Btn kind="ghost" label="◀ Previous" testID="build-prev" style={{ flex: 1 }}
             disabled={!r.back} onPress={r.back} />
        <Btn kind="ghost" label="Skip ▶" testID="build-skip" style={{ flex: 1 }}
             onPress={() => r.record(true, [], undefined, { credit: 1, note: null })} />
      </View>
    </View>
  );
}
