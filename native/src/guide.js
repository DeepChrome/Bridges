/* Yuri on screen.
 *
 * The art and the rules about when he speaks live in `core/guide.js`; this is
 * the React Native side of it. The animation helpers he was the first thing to
 * need have moved to `motion.js` now that the rest of the app needs them too —
 * a file named after a monkey is not where a press animation belongs.
 */

import React from "react";
import { Animated, View } from "react-native";
import { Text } from "./ui";
import { SvgXml } from "react-native-svg";
import { guideSvg, VIEW_BOX, GUIDE } from "@core/guide";
import { useTheme, radius, type as T } from "./theme";
import { useEnter, usePop } from "./motion";

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
