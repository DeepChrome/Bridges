/* How long an MP3 is, and how much of it is speech.
 *
 * How long — counted in frames, never read from the header.
 *
 * An MP3 header states the length the encoder meant to write; the file holds
 * whole frames, and at 24 kHz a frame is 24 ms. For speech from the API the two
 * agree, but a silence made with `ffmpeg -t 0.42` is 420 ms of intent stored as
 * 478 ms of frames — and after `-c copy` a player hears the frames. Believing
 * the header put every scenario gap 58 ms adrift (§23). Shared by the scenario
 * stitcher, the word-clip buyer and the audio QA so the three cannot disagree
 * about how long a clip is. */

import { execFileSync, spawnSync } from "node:child_process";

const LEVEL_RATE = 16000, LEVEL_WIN = 160;   // 10 ms frames
export const SPEECH_DB = -35;                // a 10 ms frame louder than this is speech

/* How much of a clip is speech, and how loud that speech is. Loudness in LUFS
   is the wrong instrument for a clip this short: EBU R128 gates on 400 ms
   blocks, and an ending cut from a word is often shorter than one block, so it
   reads −70 LUFS — "silence" — over a syllable that is plainly there. This
   measures 10 ms frames instead: `speechMs` is how many are above SPEECH_DB,
   `rms` their level in dBFS, `lead` the milliseconds before the first one, and
   `peak` the sample peak in dBFS. */
export function speechLevels(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(LEVEL_RATE), "-f", "s16le", "-"],
                      { maxBuffer: 64 << 20 });
  if (r.status !== 0) return null;
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const db = (x) => 20 * Math.log10(x / 32768 + 1e-9);
  let peak = 0, loud = 0, sum = 0, n = 0, lead = -1;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  for (let i = 0; i + LEVEL_WIN <= pcm.length; i += LEVEL_WIN) {
    let s = 0;
    for (let j = i; j < i + LEVEL_WIN; j++) s += pcm[j] * pcm[j];
    if (db(Math.sqrt(s / LEVEL_WIN)) <= SPEECH_DB) continue;
    if (lead < 0) lead = (i / LEVEL_RATE) * 1000;
    loud++; sum += s; n += LEVEL_WIN;
  }
  return {
    ms: Math.round((pcm.length / LEVEL_RATE) * 1000),
    speechMs: loud * 10,
    rms: n ? db(Math.sqrt(sum / n)) : -Infinity,
    peak: db(peak),
    lead: lead < 0 ? null : Math.round(lead),
  };
}

/* The longest silence inside the speech, in ms: the longest run of 10 ms
   frames under SPEECH_DB between the first and the last frame above it. Null
   when the clip cannot be decoded or holds no speech. A full stop's own pause
   from the voice measures 250–450 ms; what a learner hears as "a long pause"
   (a tester, 2026-10-25) starts around 600 (tools/audio_gaps.mjs GAP_MS). */
export function innerGap(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(LEVEL_RATE), "-f", "s16le", "-"],
                      { maxBuffer: 64 << 20 });
  if (r.status !== 0) return null;
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
  const db = (x) => 20 * Math.log10(x / 32768 + 1e-9);
  const loud = [];
  for (let i = 0; i + LEVEL_WIN <= pcm.length; i += LEVEL_WIN) {
    let s = 0;
    for (let j = i; j < i + LEVEL_WIN; j++) s += pcm[j] * pcm[j];
    loud.push(db(Math.sqrt(s / LEVEL_WIN)) > SPEECH_DB);
  }
  const first = loud.indexOf(true), last = loud.lastIndexOf(true);
  if (first < 0) return null;
  let best = 0, run = 0;
  for (let k = first; k <= last; k++) {
    if (loud[k]) { if (run > best) best = run; run = 0; } else run++;
  }
  return best * 10;
}

/* A pause inside the speech, capped. Chirp3-HD leaves a second or more of
   nothing at some full stops and sometimes where nothing is written (§30cf:
   1.36 s after «ты» in «я знаю, ты знаешь»; a tester, 2026-10-25, of «Спасибо,
   хорошо. А вы?»: "Long pause between the two fragments" — 1,030 ms). Every
   run of silent 10 ms frames between the first and the last speech frame that
   is GAP_CUT_MS or longer is shortened to GAP_KEEP_MS — a full stop's own
   pause from the voice (250–450 ms) — half kept from each end of the run, so
   the decay and the next onset are untouched and nothing clicks. Shorter
   pauses, and the ends, are left alone (the ends are tools/audio_trim.mjs's).
   Takes and returns 16-bit mono samples at `rate`. */
export const GAP_CUT_MS = 550;
export const GAP_KEEP_MS = 400;
export function capInnerGaps(pcm, rate, { cutMs = GAP_CUT_MS, keepMs = GAP_KEEP_MS, floorDb = SPEECH_DB } = {}) {
  const win = Math.round(rate / 100);                 // 10 ms
  const db = (x) => 20 * Math.log10(x / 32768 + 1e-9);
  const n = Math.floor(pcm.length / win);
  const loud = new Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let j = k * win; j < (k + 1) * win; j++) s += pcm[j] * pcm[j];
    loud[k] = db(Math.sqrt(s / win)) > floorDb;
  }
  const first = loud.indexOf(true), last = loud.lastIndexOf(true);
  if (first < 0) return pcm;
  const cut = Math.round(cutMs / 10), keep = Math.round(keepMs / 10);
  const drop = [];                                     // [fromFrame, toFrame) runs to remove
  let run = 0;
  for (let k = first; k <= last + 1; k++) {
    if (k <= last && !loud[k]) { run++; continue; }
    if (run >= cut) {
      const start = k - run;
      const half = Math.floor(keep / 2);
      drop.push([start + half, k - (keep - half)]);
    }
    run = 0;
  }
  if (!drop.length) return pcm;
  const out = new Int16Array(pcm.length - drop.reduce((s, [a, b]) => s + (b - a) * win, 0));
  let at = 0, from = 0;
  for (const [a, b] of drop) {
    out.set(pcm.subarray(from, a * win), at); at += a * win - from;
    from = b * win;
  }
  out.set(pcm.subarray(from), at);
  return out;
}

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
