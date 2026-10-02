/* The Ya mark: «Я», white on a coral tile.
 *
 * The launcher icon redrawn as SVG, from the same geometry
 * (`tools/make_app_icon.py`, the `Ya` class, at inset 0.16 of a 96-unit
 * square), so the first screen and the icon that opened it are one drawing.
 * Static: the screen that shows it already rises into place, and a letter that
 * draws itself would be motion for its own sake (§25).
 */

import React from "react";
import { Animated, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "./theme";
import { APP_NAME, LOGO_CORAL } from "./brand";

export function Mark({ size = 72, style }) {
  return (
    <View testID="mark" accessibilityLabel={APP_NAME} style={style}>
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Rect x={0} y={0} width={96} height={96} rx={22} fill={LOGO_CORAL} />
        {/* The stem, full height on the right. */}
        <Rect x={58.8} y={21.9} width={10.1} height={52.2} fill="#FFFFFF" />
        {/* The bowl: along the top, round the left, back along its foot. */}
        <Path d="M63.8 27 H41.7 A9.6 9.6 0 0 0 41.7 46.1 H63.8"
              stroke="#FFFFFF" strokeWidth={10.1} fill="none" />
        {/* The leg, from the bowl's foot to the baseline, cut flat there. */}
        <Path d="M51.2 48.8 L35.2 74.1 L23.2 74.1 L42.7 43.4 Z" fill="#FFFFFF" />
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
        style={{ color: t.ink, fontSize: size * 0.38, fontWeight: "800",
                 letterSpacing: -0.6, marginTop: 8 }}
      >
        {APP_NAME}
      </Animated.Text>
    </View>
  );
}
