/* Yuri on screen, and the motion primitives the lesson screens are built from.
 *
 * The art and the rules about when he speaks live in `core/guide.js`; this is
 * the React Native side of it plus two small animation helpers, which live here
 * because Yuri was the first thing that needed them and everything in the
 * redesigned lesson uses them now.
 *
 * `Animated` from React Native, not Reanimated: every animation here is opacity
 * and transform, which the native driver handles, so a second animation library
 * would be a runtime dependency earning nothing (rule 20.5).
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, Text, AccessibilityInfo } from "react-native";
import { SvgXml } from "react-native-svg";
import { guideSvg, VIEW_BOX, GUIDE } from "@core/guide";
import { useTheme, motion, radius, type as T } from "./theme";

/* Whether the platform has been asked to cut animation. Read once and cached:
   §25 lists reduced-motion under accessibility, and a learner who has turned
   motion off should get the end state immediately rather than a shorter
   version of the same movement. */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => { reduceMotion = !!on; })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => { reduceMotion = !!on; });
export const motionOff = () => reduceMotion;

/* ------------------------------------------------------------- primitives */

/* Fade up: the standard way anything new arrives. A short rise from below
   reads as "this is the next thing" where a plain fade reads as a repaint.
   `delay` staggers a list without needing a library. */
export function useEnter(deps = [], { delay = 0, distance = 10 } = {}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return undefined; }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1, duration: motion.enter, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
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
   the reward — the verdict's tick, the score disc at the end of a lesson. */
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

/* A bar that fills rather than jumps. Width cannot use the native driver, so
   this one runs on the JS thread — it is one interpolation on one view, which
   is well inside what that can carry. */
export function useFill(value) {
  const v = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(value); return undefined; }
    const a = Animated.timing(v, {
      toValue: value, duration: motion.settle,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [value, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
}

/* ------------------------------------------------------------------ Yuri */

/* The figure. `pose` is one of core/guide.js POSES; the scarf takes the theme's
   brand colour so he is the same character in both palettes. */
export function Guide({ pose = "idle", size = 72, style }) {
  const t = useTheme();
  const xml = `<svg viewBox="${VIEW_BOX}" xmlns="http://www.w3.org/2000/svg">${guideSvg(pose, t.brand)}</svg>`;
  return (
    <View testID={`guide-${pose}`} accessibilityLabel={GUIDE.name} style={style}>
      <SvgXml width={size} height={size} xml={xml} />
    </View>
  );
}

/* Yuri arriving — used where he is the reward rather than the furniture. */
export function GuidePop({ pose = "cheer", size = 72, delay = 0, style }) {
  const anim = usePop([pose], { delay });
  return (
    <Animated.View style={[anim, style]}>
      <Guide pose={pose} size={size} />
    </Animated.View>
  );
}

/* Yuri with something to say. He is silent nearly everywhere — see the note in
   core/guide.js — so this is deliberately not a general-purpose speech bubble:
   it takes one short line and has nowhere to put a second. */
export function GuideSays({ pose = "idle", line, size = 64 }) {
  const t = useTheme();
  const anim = useEnter([line]);
  if (!line) return null;
  return (
    <Animated.View style={[anim, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
      <Guide pose={pose} size={size} />
      <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.md,
                     paddingVertical: 10, paddingHorizontal: 13 }}>
        <Text testID="guide-line" style={{ color: t.ink2, fontSize: T.body, lineHeight: T.body + 5 }}>
          {line}
        </Text>
      </View>
    </Animated.View>
  );
}
