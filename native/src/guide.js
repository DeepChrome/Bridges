/* Yuri on screen.
 *
 * The art and the rules about when he speaks live in `core/guide.js`; this is
 * the React Native side of it. The animation helpers he was the first thing to
 * need have moved to `motion.js` now that the rest of the app needs them too —
 * a file named after a monkey is not where a press animation belongs.
 */

import React from "react";
import { Animated, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { guideSvg, VIEW_BOX, GUIDE } from "@core/guide";
import { useTheme } from "./theme";
import { usePop } from "./motion";

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

/* There was a `GuideSays` here — Yuri with a speech bubble — that nothing ever
   rendered: the four places he speaks (§30m) draw the line beside him
   themselves. Removed 2026-09-18 by the dead-export audit (tools/audit_dead.mjs),
   not kept "just in case" (§12). */
