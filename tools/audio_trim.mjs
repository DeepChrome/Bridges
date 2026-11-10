/* How a bought clip is cleaned before it ships — one definition, used by the
 * words (build_word_assets.mjs) and the conversations (build_scene_tracks.mjs).
 *
 * Chirp3-HD pads both ends of every clip, and the pads are not always silent:
 * measured over 300 bought words on 2026-10-01, 67 carried a click inside the
 * leading pad and 86 one near the end — a burst of under 30 ms with silence on
 * both sides. The first trim stopped at the first sound it met, which was the
 * click, so the clip played a click, a third of a second of nothing, and then
 * the word: the owner's *"weird noises then long pauses before starting"*.
 *
 * So trimming stops only at sound that lasts (`start_duration`, 30 ms): a
 * click in the pad is trimmed with the silence around it. The tail is the same
 * filter run on the reversed clip. What is kept: 80 ms before the speech, so a
 * word does not start on a clipped consonant, and 150 ms after it, so a final
 * «т» or «к» — a short release after a short closure — is never mistaken for
 * a click and cut. A 10 ms fade at each end means neither edge can click.
 * Clicks inside the speech are left alone: a consonant's release looks exactly
 * like one, and a filter that cannot tell the two apart does not touch them.
 */
const FLOOR = "-45dB";
const lead = (keep) => `silenceremove=start_periods=1:start_duration=0.03:start_threshold=${FLOOR}:start_silence=${keep}`;

export const TRIM_FILTER = [
  lead(0.08),
  "areverse", lead(0.15), "afade=t=in:d=0.01", "areverse",
  "afade=t=in:d=0.01",
].join(",");

/* A pause *inside* the speech is capped too, for the few clips that have one
   — but in samples, not here: ffmpeg's `silenceremove` with a negative
   `stop_periods` left a 970 ms inner silence exactly as long at every
   threshold tried (2026-11-10). `capInnerGaps` in tools/mp3.mjs does it on
   the decoded clip; build_word_assets.mjs applies it to the clips
   tools/audio_gaps.mjs measures over GAP_MS. */
