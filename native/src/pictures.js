/* The one answer to "what picture does this word have?", and the one way a
   photograph is drawn. A word drawn with the cast (wordart.js,
   tools/build_cast_art.mjs --words) wins over a photograph: it is ours, needs
   no credit, and shows what a photograph of a verb cannot. */

import React, { useState } from "react";
import { View, Image } from "react-native";
import { IMAGES, CREDITS, SHAPES } from "./images";
import { WORD_ART } from "./wordart";

export function pictureOf(bare) {
  if (WORD_ART[bare]) return { source: WORD_ART[bare], credit: null, drawn: true };
  if (IMAGES[bare]) {
    const s = SHAPES[bare] || [4, 3, 0.5];
    return { source: IMAGES[bare], credit: CREDITS[bare] || null, drawn: false,
             ratio: s[0] / s[1], focus: s[2] };
  }
  return null;
}

/* Where a photo sits inside a box it must fill: its size and offset. Shown at
   its own shape where the box allows, and otherwise cropped around its
   subject (`focus`, read by eye into data/curated/image_focus.json) rather than
   around the middle — a centred crop cut a cat off at the neck (2026-10-01).
   Wider than the box, it is cropped at the sides, evenly. */
export function cropFor(ratio, focus, boxW, boxH) {
  if (boxW / boxH < ratio) {
    const w = boxH * ratio;
    return { width: w, height: boxH, left: -(w - boxW) / 2, top: 0 };
  }
  const h = boxW / ratio;
  const top = -Math.min(h - boxH, Math.max(0, h * focus - boxH / 2));
  return { width: boxW, height: h, left: 0, top };
}

/* A photograph in a box the width of its container. Its height follows the
   photo's own shape between `minH` and `maxH`, so a 4:3 photo is shown whole
   on a card and only a square or portrait one is cropped. `size` fixes a
   square box instead (the word-list thumbnail). A drawing is shown whole on
   `bg`, as it always was. */
export function Photo({ pic, minH = 160, maxH = 300, size, bg, testID, label, style }) {
  const [boxW, setBoxW] = useState(size || 0);
  if (pic.drawn) {
    return (
      <Image testID={testID} source={pic.source} resizeMode="contain" accessibilityLabel={label}
             style={[{ width: size || "100%", height: size || maxH, backgroundColor: bg }, style]} />
    );
  }
  const boxH = size || (boxW ? Math.max(minH, Math.min(maxH, boxW / pic.ratio)) : minH);
  const at = boxW ? cropFor(pic.ratio, pic.focus, boxW, boxH) : null;
  return (
    <View style={[{ width: size || "100%", height: boxH, overflow: "hidden" }, style]}
          onLayout={size ? undefined : (e) => setBoxW(e.nativeEvent.layout.width)}>
      {/* Until the box's width is known (the first frame) it fills as a
          plain centred cover, so nothing is ever empty. */}
      <Image testID={testID} source={pic.source} accessibilityLabel={label}
             resizeMode={at ? "stretch" : "cover"}
             style={at ? { position: "absolute", width: at.width, height: at.height,
                           left: at.left, top: at.top }
                       : { width: "100%", height: "100%" }} />

    </View>
  );
}
