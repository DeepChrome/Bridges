/* How long an MP3 is — counted in frames, never read from the header.
 *
 * An MP3 header states the length the encoder meant to write; the file holds
 * whole frames, and at 24 kHz a frame is 24 ms. For speech from the API the two
 * agree, but a silence made with `ffmpeg -t 0.42` is 420 ms of intent stored as
 * 478 ms of frames — and after `-c copy` a player hears the frames. Believing
 * the header put every scenario gap 58 ms adrift (§23). Shared by the scenario
 * stitcher, the word-clip buyer and the audio QA so the three cannot disagree
 * about how long a clip is. */

import { execFileSync } from "node:child_process";

export function durationMs(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-count_packets",
    "-show_entries", "stream=nb_read_packets,sample_rate", "-of", "default=nw=1", file],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const get = (k) => Number((String(out).match(new RegExp(`${k}=(\\d+)`)) || [])[1]);
  const packets = get("nb_read_packets");
  const rate = get("sample_rate");
  if (!packets || !rate) throw new Error(`no frames in ${file}`);
  // MPEG-2/2.5 Layer III carries 576 samples a frame, MPEG-1 twice that.
  return Math.round((packets * (rate < 32000 ? 576 : 1152) * 1000) / rate);
}
