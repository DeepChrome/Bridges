/* The motion system.
 *
 * The owner, 2026-09-10: *"How can we develop animations that smooth everything
 * out and make it look professional?"*
 *
 * The honest answer is that polish is not a layer added on top — it is the
 * absence of things snapping. Before this, a lesson's cards moved and nothing
 * else did: every press was instant, every question replaced the last one in a
 * single frame, every progress ring jumped to its new value, and the XP on the
 * path changed while you were not looking. The app read as correct and cheap at
 * the same time, and the two are unrelated.
 *
 * Four rules this file exists to keep:
 *
 *   1. **One set of durations.** They live in `theme.js` as `motion`, so a card
 *      that rises and a bar that fills agree with each other. A screen that
 *      invents its own timing is why an interface feels assembled.
 *   2. **Transform and opacity only, wherever possible**, so the native driver
 *      runs them off the JS thread. Width and SVG offsets cannot, and are used
 *      sparingly and one at a time.
 *   3. **Nothing waits on an animation to become usable.** §25: motion
 *      reinforces interaction and never delays study. Every control here is
 *      pressable on the first frame.
 *   4. **Reduced motion means the end state, immediately** — not a faster
 *      version of the same movement. Read once, in one place, and every hook
 *      below honours it.
 *
 * React Native's own `Animated`, not Reanimated: everything here is opacity and
 * transform with one width and one stroke, which the built-in driver handles.
 * A second animation library would be a runtime dependency earning nothing
 * (rule 20.5).
 */

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, AccessibilityInfo } from "react-native";
import { motion } from "./theme";

/* Whether the platform has been asked to cut animation. Read once and cached;
   the listener keeps it true if the learner changes it mid-session. */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => { reduceMotion = !!on; })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => { reduceMotion = !!on; });
export const motionOff = () => reduceMotion;

const OUT = Easing.out(Easing.cubic);

/* ---------------------------------------------------------------- arrival */

/* Fade up: the standard way anything new arrives. A short rise from below reads
   as "this is the next thing" where a plain fade reads as a repaint. `delay`
   staggers a list without needing a library. */
export function useEnter(deps = [], { delay = 0, distance = 10 } = {}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return undefined; }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1, duration: motion.enter, delay, easing: OUT, useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  };
}

/* A pop: overshoot slightly, then settle. For the one thing on a screen that is
   the reward — the score disc at the end of a lesson, Yuri on a clean answer. */
export function usePop(deps = [], { delay = 0 } = {}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return undefined; }
    v.setValue(0);
    const a = Animated.spring(v, {
      toValue: 1, delay, friction: 5, tension: 120, useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return {
    opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  };
}

/* ------------------------------------------------------------------ touch */

/* What a control does under a finger.
 *
 * This is the single biggest difference between an app that feels made and one
 * that feels assembled, and it was missing everywhere: `Btn` swapped a border
 * width and `Row` swapped a background colour, both instantly, which reads as a
 * redraw rather than as a thing being pushed.
 *
 * Down is immediate — a control that lags under the finger feels broken — and
 * up springs back, which is what gives it the sense of being physical. Scale
 * only, so it is on the native driver and cannot be delayed by work on the JS
 * thread, which is exactly when a press most needs to feel instant. */
export function usePress({ to = 0.97 } = {}) {
  const v = useRef(new Animated.Value(1)).current;
  const go = (toValue, fast) => {
    if (reduceMotion) { v.setValue(1); return; }
    if (fast) {
      Animated.timing(v, { toValue, duration: motion.quick * 0.5,
                           easing: OUT, useNativeDriver: true }).start();
    } else {
      Animated.spring(v, { toValue, friction: 4, tension: 180, useNativeDriver: true }).start();
    }
  };
  return {
    style: { transform: [{ scale: v }] },
    onPressIn: () => go(to, true),
    onPressOut: () => go(1, false),
  };
}

/* --------------------------------------------------------------- swapping */

/* One thing replacing another in the same place — the next question, the next
   card. A hard cut makes two different questions look like one question whose
   words changed, which is the specific way the runner felt cheap: eight
   questions in a row with no sense of moving through them.
 *
 * Out and back rather than a cross-fade, because the two never overlap in the
 * tree: the runner remounts its answer view by key, so there is only ever one.
 * The old one is gone before this runs; what it animates is the arrival. */
export function useSwap(key, { distance = 16 } = {}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return undefined; }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1, duration: motion.enter, easing: OUT, useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [key, v]);
  return {
    opacity: v,
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  };
}

/* ---------------------------------------------------------------- numbers */

/* A number that counts to its new value instead of changing while nobody is
   looking. The path's XP did the latter, so finishing a lesson and coming back
   to the map showed a figure that was simply different — the one moment the app
   has to say "that did something".
 *
 * Runs on the JS thread of necessity (there is no native driver for text), which
 * is why it is only ever used on a screen that is not otherwise busy. */
export function useCount(value, { duration = motion.settle } = {}) {
  const v = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (reduceMotion || first.current) {
      first.current = false;
      v.setValue(value);
      setShown(value);
      return undefined;
    }
    const id = v.addListener((x) => setShown(Math.round(x.value)));
    const a = Animated.timing(v, { toValue: value, duration, easing: OUT, useNativeDriver: false });
    a.start(() => setShown(value));
    return () => { a.stop(); v.removeListener(id); };
  }, [value, duration, v]);
  return shown;
}

/* ------------------------------------------------------------------- fill */

/* A bar that fills rather than jumps. Width cannot use the native driver, so
   this runs on the JS thread — one interpolation on one view, well inside what
   that can carry. */
export function useFill(value) {
  const v = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(value); return undefined; }
    const a = Animated.timing(v, {
      toValue: value, duration: motion.settle, easing: OUT, useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [value, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
}

/* A progress ring that sweeps to its new value. Same trade as `useFill`: an SVG
   stroke offset is not a transform, so it is not on the native driver. Returns
   the raw Animated.Value, since the caller has to hand it to an animated Circle
   rather than to a style. */
export function useSweep(value, { duration = motion.settle } = {}) {
  const v = useRef(new Animated.Value(reduceMotion ? value : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(value); return undefined; }
    const a = Animated.timing(v, { toValue: value, duration, easing: OUT, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [value, duration, v]);
  return v;
}
