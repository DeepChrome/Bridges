/* The partial hint's two pieces on screen: the button that gives one more
 * piece of the answer, and the answer as given so far (core/hint.js holds the
 * rules — what a press shows, where a form's root ends). The full hint is the
 * bulb's reference; this is the smaller help beside it (the owner,
 * 2026-11-06), on every question with one answer and on a flashcard's front.
 */

import React from "react";
import { IconButton, Text } from "./ui";
import { useTheme } from "./theme";

/* A letter and a blank: what the button gives you. The bulb is the whole
   reference; this is one piece of the answer, and the glyph says so. */
export function PartialHintButton({ onPress, testID = "partial-hint", size = 40, on }) {
  const t = useTheme();
  return (
    <IconButton onPress={onPress} testID={testID} label="Partial hint" size={size} on={on}>
      <Text selectable={false}
            style={{ color: on ? t.brandInk : t.ink2, fontSize: Math.round(size * 0.36), fontWeight: "700" }}>
        a_
      </Text>
    </IconButton>
  );
}

/* The answer as far as it has been given: the letters in place, a blank for
   each one still to come. Spaced, so the blanks count. */
export function PartialHintLine({ mask, testID = "partial-hint-text", size = 22, style }) {
  const t = useTheme();
  if (!mask) return null;
  return (
    <Text testID={testID} selectable={false}
          style={[{ color: t.brandInk, fontSize: size, fontWeight: "700", letterSpacing: 3,
                    textAlign: "center" }, style]}>
      {mask}
    </Text>
  );
}
