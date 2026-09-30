/* The transcript under a video (2026-09-29, the owner: *"a transcript button
 * below the videos that will display an autoscrolling transcript that
 * highlights the word being said… Should also have the option to stop the
 * auto scroll and just view the whole transcript"*).
 *
 * The shape the good players use: whole caption lines with their time, the
 * line being said lifted out of the rest and the word being said inside it
 * picked out, the list following the video — and following stops the moment
 * the learner scrolls it themselves, because a list that scrolls back out from
 * under a reading finger is a list nobody can read. "Follow" puts it back.
 * Tapping a line plays the video from there.
 *
 * The position arrives from the player four times a second (youtube.js
 * `watch`), so the word lags by at most a quarter of a second. Lines are
 * memoised: a long video is a thousand of them and only two change a tick.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useTheme, radius } from "./theme";
import { Text, Muted, Chip } from "./ui";

export const PANEL_HEIGHT = 340;

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* The last line that has started by `pos`, by bisection: lines are in order. */
export function lineAt(lines, pos) {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid][0] <= pos) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/* The word of a line being said at `pos`. */
export function wordAt(line, pos) {
  const offs = line[2];
  let at = -1;
  for (let k = 0; k < offs.length; k++) if (line[0] + offs[k] * 10 <= pos) at = k;
  return at;
}

const Line = memo(function Line({ line, k, active, word, onSeek, onPlace }) {
  const t = useTheme();
  const words = line[1].split(" ");
  return (
    <Pressable testID={`transcript-line-${k}`} onPress={() => onSeek(line[0])}
               onLayout={(e) => onPlace(k, e.nativeEvent.layout.y)}
               accessibilityRole="button" accessibilityLabel={`Play from ${clock(line[0])}`}
               style={({ pressed }) => ({ flexDirection: "row", gap: 10, paddingVertical: 7, paddingHorizontal: 10,
                                          borderRadius: radius.md, backgroundColor: active ? t.brandBg : "transparent",
                                          opacity: pressed ? 0.6 : 1 })}>
      <Muted size={12} style={{ width: 38, marginTop: 3 }}>{clock(line[0])}</Muted>
      <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: active ? t.ink : t.ink2 }}>
        {words.map((w, i) => (
          <Text key={i} testID={active && i === word ? "transcript-word" : undefined}
                style={active && i === word ? { color: t.brandInk, fontWeight: "700" } : null}>
            {i ? " " : ""}{w}
          </Text>
        ))}
      </Text>
    </Pressable>
  );
});

export function Transcript({ lines, position, onSeek }) {
  const [follow, setFollow] = useState(true);
  const ys = useRef([]);
  const scroller = useRef(null);
  const at = lineAt(lines, position);
  const word = at >= 0 ? wordAt(lines[at], position) : -1;
  const onPlace = useCallback((k, y) => { ys.current[k] = y; }, []);

  // Keep the line being said a third of the way down, while following.
  useEffect(() => {
    if (!follow || at < 0 || ys.current[at] == null || !scroller.current) return;
    scroller.current.scrollTo({ y: Math.max(0, ys.current[at] - PANEL_HEIGHT / 3), animated: true });
  }, [at, follow]);

  return (
    <View testID="transcript" style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 6 }}>
        <Chip testID="transcript-follow" on={follow} label="Follow" onPress={() => setFollow(!follow)} />
      </View>
      {/* flexShrink so it scrolls inside its cap rather than growing to its
          content (§23); nested, since the screen around it scrolls too. */}
      <ScrollView ref={scroller} nestedScrollEnabled testID="transcript-scroll"
                  style={{ maxHeight: PANEL_HEIGHT, flexShrink: 1 }}
                  onScrollBeginDrag={() => setFollow(false)}>
        {lines.map((ln, k) => (
          <Line key={k} line={ln} k={k} active={k === at} word={k === at ? word : -1}
                onSeek={onSeek} onPlace={onPlace} />
        ))}
      </ScrollView>
    </View>
  );
}
