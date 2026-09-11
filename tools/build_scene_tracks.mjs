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

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(ROOT, "data", "scenario_audio");
const SCRIPTS = join(ROOT, "data", "curated", "scripts");
const TRACKS = join(ROOT, "native", "assets", "scenes");
const MODULE = join(ROOT, "native", "src", "scenetracks.js");
const WORK = join(ROOT, "data", "_work", "scenes");

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
    const files = entry.lines.map((l) => join(CLIPS, `${l.id}.mp3`));
    if (files.some((f) => !existsSync(f))) { missing++; continue; }

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
