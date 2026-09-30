/* Yuri on screen.
 *
 * The rules about when he speaks live in `core/guide.js`; the pictures are
 * bought by tools/build_guide_art.mjs (2026-09-30) and replaced a hand-written
 * SVG the owner found not clean enough. One picture a pose, each made from
 * the same base drawing. The animation helpers he was the first thing to need
 * live in `motion.js`.
 */

import React from "react";
import { Animated, Image, View } from "react-native";
import { POSES, GUIDE } from "@core/guide";
import { usePop } from "./motion";

const ART = {
  idle: require("../assets/guide/idle.png"),
  wave: require("../assets/guide/wave.png"),
  point: require("../assets/guide/point.png"),
  think: require("../assets/guide/think.png"),
  cheer: require("../assets/guide/cheer.png"),
};

/* The figure. `pose` is one of core/guide.js POSES; an unknown one is idle. */
export function Guide({ pose = "idle", size = 72, style }) {
  const p = POSES.includes(pose) ? pose : "idle";
  return (
    <View testID={`guide-${p}`} accessibilityLabel={GUIDE.name} style={style}>
      <Image source={ART[p]} style={{ width: size, height: size }} resizeMode="contain" />
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
