/* Reading a video's caption lines — which line and which word is being said
 * at a moment, and YouTube's sound tags. Pure, so the phone's transcript
 * (transcript.js) and the desktop's video workspace read the same line. A
 * line is [start ms, text, word offsets in cs, sound-tag word indices]
 * (build_site.py `video_transcripts`). */

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

/* YouTube's sound tags («[музыка]», «[смех]»), drawn as sounds, not speech
   (the owner, 2026-10-02: "YouTube just translates to music rather than
   indicating music… brackets and the music symbols"). The build marks which
   words they were (a line's fourth field). */
export const soundLabel = (w) => (/^музык/i.test(w) ? `[♪ ${w} ♪]` : `[${w}]`);
const SOUND_EN = { "музыка": "music", "смех": "laughter", "аплодисменты": "applause" };
/* A line that is only sound gets its English the same way, not the
   translator's bare "music". */
export function soundOnlyEnglish(line) {
  const words = line[1].split(" ");
  const tags = new Set(line[3] || []);
  if (!words.length || words.some((_, n) => !tags.has(n))) return null;
  return words.map((w) => {
    const en = SOUND_EN[w.toLowerCase()] || w;
    return en === "music" ? "[♪ music ♪]" : `[${en}]`;
  }).join(" ");
}
