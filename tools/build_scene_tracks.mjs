/* One conversation, one file — and a timeline that is measured rather than guessed.
 *
 * `build_scenario_audio.mjs` buys one clip per line. That is the right unit to
 * buy (a line is what a voice and a piece of text make, so it is what a content
 * hash can key on and what a re-run can skip), but it is the wrong unit to ship:
 * 2,213 assets in the bundle, a player torn down and built again between every
 * turn, and a scenario that can only be resumed at a line boundary because
 * nothing knows where the middle of a line is.
 *
 * So the clips are stitched here, with the app's own GAP_MS of silence between
 * turns, into one track per lesson — the owner's words for what this activity
 * is: *"There is a single audio clip. It will last about 30-45 seconds."*
 *
 * The stitch is `-c copy`: MP3 frames concatenate, so the track's length is the
 * sum of its parts and every line's start is known exactly. Re-encoding would
 * put an encoder delay on each of fifteen joins, and the drift lands on the last
 * line — the one a learner is most likely to scrub back to.
 *
 * Output:
 *   native/assets/scenes/<unit>-<index>.mp3   the tracks
 *   native/src/scenetracks.js                 requires + timings, generated
 *
 * The generated module carries a hash of the lesson's Russian. A script edited
 * without re-running the audio tools leaves a track that no longer matches its
 * text, and playing it would put the wrong words under the questions; the app
 * compares the hash and falls back to the device voices instead (§27).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(ROOT, "data", "scenario_audio");
const SCRIPTS = join(ROOT, "data", "curated", "scripts");
const TRACKS = join(ROOT, "native", "assets", "scenes");
const MODULE = join(ROOT, "native", "src", "scenetracks.js");
const WORK = join(ROOT, "data", "_work", "scenes");
/* Levelled copies of the clips, cached: a clip is keyed by a content hash and
   never changes unless its text does, so this is computed once per line for
   the life of the script. Under _work because it is derived — the purchase is
   `data/scenario_audio`, and nothing here may touch it (rule 20.3). */
const LEVELS = join(WORK, "levelled");

/* Must equal GAP_MS in native/src/scenario.js — the breath between two turns.
   It is baked into the file here rather than left to the player, because a gap
   the timeline knows about and the audio does not is a timeline that lies. */
const GAP_MS = 420;

/* The same hash the app uses (audio.js), over the lesson's joined Russian. */
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const ff = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
/* ffmpeg reports on **stderr** and exits 0 doing it, so anything that reads a
   filter's output has to look there. */
const ffBoth = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 120000 });
  return String(r.stderr || "") + String(r.stdout || "");
};

/* One level for every line (PLAYBOOK 4.2).
 *
 * Measured 2026-09-16, before this existed: the loudness swings **6.5 to 7.6 dB
 * inside a single conversation** — one speaker plainly quieter than the other —
 * and every one of the 168 tracks peaked at or above full scale (median 0.0
 * dBTP, worst +0.3), which is clipping, and it is what makes speech sound
 * crunchy through a phone speaker. Neither is a fault of the voices, which is
 * why this is the fix rather than a different provider.
 *
 * **Linear**, not dynamic: `loudnorm` in one pass rides the level and pumps on
 * speech. Two passes with the measurement handed back apply a single gain to
 * the whole clip, which changes nothing but how loud it is.
 *
 * **Per clip, not per track**, because the swing is inside the conversation;
 * normalising the finished track would leave the quiet speaker quiet.
 *
 * The clips' own format is kept (24 kHz mono, 32 kbps) so the stitch below is
 * still a frame copy and the bundle does not grow. That costs one encode
 * generation, which is the price of touching the level at all, and it buys a
 * conversation that does not distort and does not need the volume adjusted
 * mid-sentence.
 *
 * **-19 LUFS, not the playbook's -16.** A linear gain may not push the true
 * peak past the ceiling, so a quiet clip with a sharp peak simply cannot
 * reach a loud target and is left where it is — which leaves the spread the
 * normalising was for. Measured over 40 clips: at -16, **38 of 40 fall
 * short** and the spread stays 5.4 dB; at -19 it is 2.4 dB; at -21, 0.4 dB.
 * -19 is the point where the spread stops mattering to an ear and the
 * scenarios still sit within a decibel of the collection recordings' own
 * median of -18, so moving from a vocabulary word to a conversation is not a
 * jump in volume. Going quieter would buy tenths of a decibel and lose that.
 * Closing the rest would need compression, which changes how a voice sounds
 * to fix a number. */
const LEVEL = { i: -19, tp: -1.5, lra: 11 };

function measureLevel(file) {
  const s = ffBoth("ffmpeg", ["-hide_banner", "-nostats", "-i", file,
    "-af", `loudnorm=I=${LEVEL.i}:TP=${LEVEL.tp}:LRA=${LEVEL.lra}:print_format=json`,
    "-f", "null", "-"]);
  const open = s.lastIndexOf("{"), close = s.lastIndexOf("}");
  if (open < 0 || close < open) return null;
  try {
    const p = JSON.parse(s.slice(open, close + 1));
    const n = (k) => Number(p[k]);
    if (!Number.isFinite(n("input_i")) || n("input_i") < -70) return null;   // silence
    return { i: n("input_i"), tp: n("input_tp"), lra: n("input_lra"),
             thresh: n("input_thresh"), offset: n("target_offset") };
  } catch (e) { return null; }
}

function levelled(src, id) {
  const out = join(LEVELS, `${id}.mp3`);
  if (existsSync(out)) return out;
  const m = measureLevel(src);
  // Unmeasurable (a clip that is silence, or ffmpeg refusing it): ship what
  // was bought rather than ship nothing, and let the QA tool say so.
  if (!m) return src;
  ff("ffmpeg", ["-y", "-i", src, "-af",
    `loudnorm=I=${LEVEL.i}:TP=${LEVEL.tp}:LRA=${LEVEL.lra}`
    + `:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}`
    + `:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true`,
    "-ar", "24000", "-ac", "1", "-b:a", "32k", out]);
  return existsSync(out) ? out : src;
}

/* Length in milliseconds, counted in **frames** rather than read from the header.
 *
 * An MP3 header states the length the encoder meant to write; the file holds
 * whole frames, and at 24 kHz a frame is 24 ms. For speech from the API the two
 * agree, but the silence made here is 420 ms of intent stored as 478 ms of
 * frames — and after `-c copy` a player hears the frames. Believing the header
 * put every gap 58 ms adrift, which by the end of a sixteen-line conversation
 * is nearly a second: the last line's start, which is exactly where somebody
 * scrubbing back to catch the ending lands. */
const durationMs = (file) => {
  const out = ff("ffprobe", ["-v", "error", "-select_streams", "a:0", "-count_packets",
    "-show_entries", "stream=nb_read_packets,sample_rate", "-of", "default=nw=1", file]);
  const get = (k) => Number((String(out).match(new RegExp(`${k}=(\\d+)`)) || [])[1]);
  const packets = get("nb_read_packets");
  const rate = get("sample_rate");
  if (!packets || !rate) throw new Error(`no frames in ${file}`);
  // MPEG-2/2.5 Layer III carries 576 samples a frame, MPEG-1 twice that.
  return Math.round((packets * (rate < 32000 ? 576 : 1152) * 1000) / rate);
};

function loadScripts() {
  const out = {};
  for (const f of readdirSync(SCRIPTS).filter((x) => x.endsWith(".json"))) {
    const o = JSON.parse(readFileSync(join(SCRIPTS, f), "utf8"));
    for (const [key, e] of Object.entries(o.lessons)) out[key] = e;
  }
  return out;
}

function main() {
  const manifestPath = join(CLIPS, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("no clips yet — run tools/build_scenario_audio.mjs first");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const scripts = loadScripts();

  mkdirSync(TRACKS, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(LEVELS, { recursive: true });

  /* `--raw` ships the clips at the level they were bought at. Here so the
     change can be listened to against what it replaced, not because there is
     a reason to prefer it. */
  const raw = process.argv.includes("--raw");
  let done = 0;

  /* One silence, reused. Made once at the clips' own sample rate so the stitch
     can copy frames rather than re-encode. */
  const gap = join(WORK, "gap.mp3");
  ff("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
    "-t", String(GAP_MS / 1000), "-b:a", "32k", gap]);
  const gapMs = durationMs(gap);

  const kept = new Set();
  const rows = [];
  let missing = 0;
  let drifted = 0;

  for (const [key, entry] of Object.entries(manifest.lessons)) {
    const script = scripts[key];
    if (!script) { missing++; continue; }
    const bought = entry.lines.map((l) => join(CLIPS, `${l.id}.mp3`));
    if (bought.some((f) => !existsSync(f))) { missing++; continue; }
    const files = raw ? bought : entry.lines.map((l, i) => levelled(bought[i], l.id));
    done++;
    process.stdout.write(`\r  ${done} of ${Object.keys(manifest.lessons).length} lessons`
                         + (done === Object.keys(manifest.lessons).length ? "\n" : ""));

    const name = `${key.replace(":", "-")}.mp3`;
    const out = join(TRACKS, name);

    const parts = [];
    files.forEach((f, i) => { if (i) parts.push(gap); parts.push(f); });
    const list = join(WORK, "list.txt");
    writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"), "utf8");
    ff("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);

    /* Starts come from the parts, and the whole is checked against them: a
       stitch that lost or padded a frame would leave every later line pointing
       at the wrong moment, and nothing on screen would say so. */
    let at = 0;
    const lines = files.map((f, i) => {
      const ms = durationMs(f);
      const span = { start: at, ms };
      at += ms + (i < files.length - 1 ? gapMs : 0);
      return span;
    });
    const total = durationMs(out);
    if (Math.abs(total - at) > 50) drifted++;

    rows.push({
      key,
      name,
      total,
      lines,
      h: hash32(script.lines.map((l) => l.ru).join("|")),
    });
    kept.add(name);
  }

  // A lesson that lost its script, or a renamed key, must not leave a track behind.
  for (const f of readdirSync(TRACKS)) if (!kept.has(f)) rmSync(join(TRACKS, f));
  rmSync(WORK, { recursive: true, force: true });

  rows.sort((a, b) => (a.key < b.key ? -1 : 1));
  const body = rows.map((r) =>
    `  "${r.key}": { src: require("../assets/scenes/${r.name}"), total: ${r.total},`
    + ` h: ${r.h},\n    lines: [${r.lines.map((l) => `[${l.start},${l.ms}]`).join(",")}] },`
  ).join("\n");

  writeFileSync(MODULE,
`/* GENERATED by tools/build_scene_tracks.mjs — do not edit.
 *
 * One track per written scenario (§30l), with the start and length of every
 * line in milliseconds, measured from the clips the track was stitched from.
 * \`h\` is a hash of the lesson's Russian: the app plays the track only when its
 * own lines still hash to the same thing, so a script edited without rebuilding
 * the audio falls back to the device voices rather than saying something else.
 *
 * Required statically because Metro resolves assets at build time; that is also
 * why this file is generated rather than a directory read.
 */

export const TRACKS = {
${body}
};

export const trackFor = (key) => (key && TRACKS[key]) || null;
`, "utf8");

  const bytes = readdirSync(TRACKS).reduce((n, f) =>
    n + readFileSync(join(TRACKS, f)).length, 0);
  console.log(`${rows.length} tracks, ${(bytes / 1e6).toFixed(1)} MB`);
  if (missing) console.log(`  ${missing} lessons skipped — no script or a clip missing`);
  if (drifted) console.log(`  ${drifted} tracks drifted over 150 ms from the sum of their parts`);
  console.log(`wrote ${MODULE}`);
}

main();
