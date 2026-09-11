/* The Bridges mark.
 *
 * The same suspension bridge as the app icon — two towers, the deck, the main
 * cable and its hangers — redrawn as SVG so the first screen carries the app's
 * own identity rather than a word in a heavy font. The geometry is lifted from
 * `tools/make_app_icon.py` (the `Bridge` class) at inset 0.08 of a 96-unit
 * square, so the launcher icon and the screen behind it are the same drawing.
 *
 * It draws itself once, on arrival: the cable is a single stroke whose dash
 * offset runs to zero, so the span appears to be strung between the towers. A
 * stroke offset is not a transform and cannot use the native driver, which is
 * why this is confined to the one screen that has nothing else to do (§25 —
 * motion reinforces, never delays).
 */

import React from "react";
import { Animated, View } from "react-native";
import Svg, { Path, Line } from "react-native-svg";
import { useTheme } from "./theme";
import { useDraw } from "./motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* Measured off the path below rather than guessed: the dash has to be at least
   as long as the stroke or the tail never leaves. */
const CABLE_LEN = 200;

/* Where the cable hangs at each hanger, on the parabola between the towers. */
const HANGERS = [
  [36, 34.6], [42.5, 42.7], [48, 44.8], [53.5, 42.7], [60, 34.6],
];

export function Mark({ size = 72, color, style }) {
  const t = useTheme();
  const ink = color || t.brand;
  const offset = useDraw(CABLE_LEN);
  return (
    <View testID="mark" accessibilityLabel="Bridges" style={style}>
      <Svg width={size} height={size} viewBox="0 0 96 96">
        {/* Hangers first, so the cable and deck sit over their ends. */}
        {HANGERS.map(([x, y]) => (
          <Line key={x} x1={x} y1={y} x2={x} y2={57.7} stroke={ink}
                strokeWidth={1.4} opacity={0.55} strokeLinecap="round" />
        ))}
        {/* The towers: up through the deck, a little past the cable. */}
        <Line x1={29.5} y1={16} x2={29.5} y2={62} stroke={ink} strokeWidth={4.2} strokeLinecap="round" />
        <Line x1={66.5} y1={16} x2={66.5} y2={62} stroke={ink} strokeWidth={4.2} strokeLinecap="round" />
        {/* The deck. */}
        <Line x1={7.7} y1={57.7} x2={88.3} y2={57.7} stroke={ink} strokeWidth={5} strokeLinecap="round" />
        {/* The main cable: side spans rising to each tower, a parabola between. */}
        <AnimatedPath
          d="M7.7 57.7 Q20 53 29.5 20.6 Q48 68 66.5 20.6 Q76 53 88.3 57.7"
          stroke={ink} strokeWidth={3} fill="none" strokeLinecap="round"
          strokeDasharray={`${CABLE_LEN},${CABLE_LEN}`}
          strokeDashoffset={offset}
        />
      </Svg>
    </View>
  );
}

/* The mark and the name, the way the app introduces itself. */
export function Wordmark({ size = 72, style }) {
  const t = useTheme();
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Mark size={size} />
      <Animated.Text
        testID="wordmark"
        style={{ color: t.ink, fontSize: size * 0.38, fontWeight: "700",
                 letterSpacing: -0.6, marginTop: 6 }}
      >
        Bridges
      </Animated.Text>
    </View>
  );
}
