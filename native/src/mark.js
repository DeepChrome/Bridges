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
import { useTheme, faceFor } from "./theme";
import { APP_NAME, APP_TITLE, LOGO_CORAL } from "./brand";

export function Mark({ size = 72, style }) {
  return (
    <View testID="mark" accessibilityLabel={APP_NAME} style={style}>
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Rect x={0} y={0} width={96} height={96} rx={22} fill={LOGO_CORAL} />
        {/* Heavy and round, "almost like a bubble" (the owner, 2026-10-02).
            The stem, full height on the right, its ends rounded. */}
        <Rect x={56.5} y={21.9} width={12.4} height={52.2} rx={6.2} fill="#FFFFFF" />
        {/* The bowl: along the top, round the left, back along its foot. */}
        <Path d="M62.7 28.1 H43.8 A10.5 10.5 0 0 0 43.8 49.1 H62.7"
              stroke="#FFFFFF" strokeWidth={12.4} fill="none" />
        {/* The leg, from the bowl's foot to the bottom left, its foot rounded. */}
        <Path d="M49.6 49.1 L33.3 67.9" stroke="#FFFFFF" strokeWidth={12.4}
              strokeLinecap="round" fill="none" />
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
        style={{ color: t.ink, fontSize: size * 0.3, fontFamily: faceFor("700"), marginTop: 8 }}
      >
        {APP_TITLE}
      </Animated.Text>
    </View>
  );
}
