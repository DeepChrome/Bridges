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

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useTheme, radius } from "./theme";
import { Text, Muted, Chip } from "./ui";
import { linkable } from "./words";

export const PANEL_HEIGHT = 340;

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* Which line and word is being said, and the sound tags, are captions.js —
   pure, so the desktop's transcript reads the same line (§30cr). */
import { lineAt, wordAt, soundLabel, soundOnlyEnglish } from "./captions";
export { lineAt, wordAt, soundLabel, soundOnlyEnglish };

/* Every word the dictionary knows is a link, as Russian is everywhere else in
   the app (§30b): one press for the sheet, the same word again for the full
   entry (words.js). The owner, 2026-10-01: *"allow links to full entries for
   words found within the transcript… a small pop-up abridged"*. The underline
   is the hairline colour rather than the brand's: a transcript is nothing but
   links, and a page of brand underlines is louder than the words. Tapping the
   time, or the line around the words, still plays from there. */

const Line = memo(function Line({ line, k, active, word, onSeek, onPlace, onWord, en }) {
  const t = useTheme();
  const words = useMemo(() => {
    const tags = new Set(line[3] || []);
    /* `linkable`, not the course index alone: a caption word outside the
       course («пообщаемся», «научить») has a dictionary entry through the
       build's form map, and was plain text here while the same word in a
       sentence was a link (2026-10-20, 37,000 caption words). */
    return line[1].split(" ").map((w, n) => ({ w, sound: tags.has(n), link: !tags.has(n) && linkable(w) }));
  }, [line]);
  const english = soundOnlyEnglish(line) || en;
  return (
    <Pressable testID={`transcript-line-${k}`} onPress={() => onSeek(line[0])}
               onLayout={(e) => onPlace(k, e.nativeEvent.layout.y)}
               accessibilityRole="button" accessibilityLabel={`Play from ${clock(line[0])}`}
               style={({ pressed }) => ({ flexDirection: "row", gap: 10, paddingVertical: 7, paddingHorizontal: 10,
                                          borderRadius: radius.md, backgroundColor: active ? t.brandBg : "transparent",
                                          opacity: pressed ? 0.6 : 1 })}>
      <Muted size={12} style={{ width: 38, marginTop: 3 }}>{clock(line[0])}</Muted>
      <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 16, lineHeight: 23, color: active ? t.ink : t.ink2 }}>
        {words.map(({ w, link: known, sound }, n) => {
          const now = active && n === word;
          const link = known && onWord;
          if (sound) {
            return (
              <Text key={n} testID={`transcript-sound-${k}-${n}`} style={{ color: t.ink3, fontStyle: "italic" }}>
                {n ? " " : ""}{soundLabel(w)}
              </Text>
            );
          }
          return (
            <Text key={n}>
              {n ? " " : ""}
              <Text testID={now ? "transcript-word" : link ? `transcript-link-${k}-${n}` : undefined}
                    accessibilityRole={link ? "link" : undefined}
                    accessibilityLabel={link ? `${w}, open word` : undefined}
                    onPress={link ? () => onWord(w) : undefined}
                    style={[link ? { textDecorationLine: "underline", textDecorationColor: t.line } : null,
                            now ? { color: t.brandInk, fontWeight: "700" } : null]}>
                {w}
              </Text>
            </Text>
          );
        })}
      </Text>
      {/* The line's English under it (the owner, 2026-10-01: "English in
          line with the transcription too, also highlighted as it goes"):
          quiet, and lifted with the Russian on the line being said. */}
      {/* With the English switch on (`en` is null when it is off). */}
      {english && en != null ? (
        <Text testID={`transcript-en-${k}`}
              style={{ fontSize: 14, lineHeight: 20, marginTop: 2,
                       color: active ? t.ink2 : t.ink3, fontWeight: active ? "600" : "400" }}>
          {english}
        </Text>
      ) : null}
      </View>
    </Pressable>
  );
});

/* `fill`: the lower half of a maximised video, where it takes the space it is
   given rather than a capped panel inside a scrolling page. */
export function Transcript({ lines, position, onSeek, onWord, en, showEn, onToggleEn, fill }) {
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
    <View testID="transcript" style={fill ? { flex: 1, marginTop: 8 } : { marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center",
                     gap: 8, marginBottom: 6 }}>
        {/* Says where the English came from (rule 20.7's second allowance):
            a model translated YouTube's automatic captions. */}
        {en && showEn ? <Muted size={12} style={{ flex: 1 }}>Machine translation</Muted> : null}
        {en ? <Chip testID="transcript-en" on={!!showEn} label="English" onPress={onToggleEn} /> : null}
        <Chip testID="transcript-follow" on={follow} label="Follow" onPress={() => setFollow(!follow)} />
      </View>
      {/* flexShrink so it scrolls inside its cap rather than growing to its
          content (§23); nested, since the screen around it scrolls too. */}
      <ScrollView ref={scroller} nestedScrollEnabled testID="transcript-scroll"
                  style={fill ? { flex: 1 } : { maxHeight: PANEL_HEIGHT, flexShrink: 1 }}
                  onScrollBeginDrag={() => setFollow(false)}>
        {lines.map((ln, k) => (
          <Line key={k} line={ln} k={k} active={k === at} word={k === at ? word : -1}
                onSeek={onSeek} onPlace={onPlace} onWord={onWord}
                en={showEn && en ? en[k] : null} />
        ))}
      </ScrollView>
    </View>
  );
}
