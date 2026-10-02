/* Teddy on screen.
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

/* The four score faces (core/guide.js reactionFor) are not drawn yet — the
   image account ran dry before they could be (2026-10-02). Until
   `build_cast_art.mjs --poses` draws them and they get a line in ART, each
   shows the nearest pose there is. The testID still names the reaction, so
   what the screen means is pinned now and only the picture changes later. */
const STAND_IN = { smile: "cheer", thumbs: "point", shrug: "think", wince: "think" };
const artOf = (p) => ART[p] || ART[STAND_IN[p]] || ART.idle;

/* The figure. `pose` is one of core/guide.js POSES; an unknown one is idle. */
export function Guide({ pose = "idle", size = 72, style }) {
  const p = POSES.includes(pose) ? pose : "idle";
  return (
    <View testID={`guide-${p}`} accessibilityLabel={GUIDE.name} style={style}>
      <Image source={artOf(p)}style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

/* Teddy arriving — used where he is the reward rather than the furniture. */
export function GuidePop({ pose = "cheer", size = 72, delay = 0, style }) {
  const anim = usePop([pose], { delay });
  return (
    <Animated.View style={[anim, style]}>
      <Guide pose={pose} size={size} />
    </Animated.View>
  );
}
