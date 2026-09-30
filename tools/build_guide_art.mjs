#!/usr/bin/env node
/* Yuri, drawn by an image model (2026-09-30).
 *
 * The owner: "Yuri is not as clean as he should be… If you can use another
 * picture generating AI that can work too." The hand-written SVG in
 * core/guide.js read as computer-drawn. This buys a character from OpenAI's
 * image model instead: one base drawing, then each pose made *from* that
 * drawing as a reference, so the five read as one monkey rather than five.
 *
 *   node tools/build_guide_art.mjs --base [--n 3]   candidates for the base
 *   node tools/build_guide_art.mjs --poses --from data/guide_art/base-2.png
 *   node tools/build_guide_art.mjs --ship            resize the chosen set into the app
 *
 * The key is read from OPENAI_API_KEY in the environment and never printed.
 * What is bought goes to data/guide_art/ and is committed, because it cost
 * money (the rule the bought audio follows, §27). `--ship` writes
 * native/assets/guide/<pose>.png at SHIP_PX, which is three times the largest
 * size the app draws him (108 dp) so a 3x screen gets real pixels.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "guide_art");
const SHIP = path.join(ROOT, "native", "assets", "guide");
const SHIP_PX = 324;
const HALO = 96;
const MODEL = "gpt-image-2";
const POSES = ["idle", "wave", "point", "think", "cheer"];

const STYLE =
  "A friendly young monkey mascot named Yuri for a polished mobile language-learning app. " +
  "Modern flat vector illustration, clean confident shapes, soft simple shading, no outlines thicker than the " +
  "shapes need, the finish of a professionally designed app mascot. Warm brown fur, cream face, ears and belly, " +
  "large friendly dark eyes, a small indigo scarf (#4D45E6) around the neck. Full body, standing, centred, " +
  "facing the viewer, with generous empty space around him. Plain transparent background, no ground, " +
  "no shadow on the floor, no text, no border.";

const POSE_TEXT = {
  idle: "Standing relaxed, arms at his sides, a gentle smile.",
  wave: "Waving hello with one hand raised high, a warm open smile.",
  point: "Pointing to his side with one arm outstretched, as if showing the viewer something, an encouraging look.",
  think: "Thinking: one hand on his chin, eyes looking up, a small thoughtful expression — puzzled, not sad.",
  cheer: "Celebrating: both arms raised in triumph, eyes closed with joy, a big smile.",
};

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) { console.error("OPENAI_API_KEY is not set"); process.exit(2); }
  return k;
}

async function generate(prompt, file) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", quality: "high",
                           background: "transparent", output_format: "png", n: 1 }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, "base64"));
  return j.usage || null;
}

async function edit(prompt, ref, file) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("quality", "high");
  form.append("background", "transparent");
  form.append("output_format", "png");
  form.append("image[]", new Blob([fs.readFileSync(ref)], { type: "image/png" }), path.basename(ref));
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, "base64"));
  return j.usage || null;
}

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const has = (name) => process.argv.includes(name);

fs.mkdirSync(OUT, { recursive: true });

if (has("--base")) {
  const n = +(arg("--n") || 3);
  for (let k = 1; k <= n; k++) {
    const file = path.join(OUT, `base-${k}.png`);
    if (fs.existsSync(file)) { console.log(`kept ${path.relative(ROOT, file)}`); continue; }
    const u = await generate(`${STYLE} ${POSE_TEXT.idle}`, file);
    console.log(`bought ${path.relative(ROOT, file)}`, u ? JSON.stringify(u) : "");
  }
} else if (has("--poses")) {
  const from = arg("--from");
  if (!from || !fs.existsSync(from)) { console.error("--from <base.png> is required"); process.exit(2); }
  const only = arg("--only");
  for (const pose of POSES) {
    if (only && only !== pose) continue;
    const file = path.join(OUT, `${pose}.png`);
    if (fs.existsSync(file) && !has("--again")) { console.log(`kept ${path.relative(ROOT, file)}`); continue; }
    const prompt = `The same monkey character as in the image — identical design, colours, proportions, scarf ` +
                   `and drawing style. ${POSE_TEXT[pose]} ${STYLE}`;
    const u = await edit(prompt, from, file);
    console.log(`bought ${path.relative(ROOT, file)}`, u ? JSON.stringify(u) : "");
  }
} else if (has("--ship")) {
  fs.mkdirSync(SHIP, { recursive: true });
  for (const pose of POSES) {
    const src = path.join(OUT, `${pose}.png`);
    if (!fs.existsSync(src)) { console.error(`missing ${path.relative(ROOT, src)}`); process.exit(1); }
    const dst = path.join(SHIP, `${pose}.png`);
    /* The model paints a wide, faint halo into the alpha channel: invisible on
       white, an orange glow on the dark theme. Alpha under HALO goes to zero
       and the rest is stretched back to full, so the edge stays soft but the
       haze is gone. */
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src,
      "-vf", `format=rgba,lut=a='if(lt(val,${HALO}),0,min(255,(val-${HALO})*255/(255-${HALO})))',` +
             `scale=${SHIP_PX}:${SHIP_PX}:flags=lanczos`, "-pix_fmt", "rgba", dst]);
    console.log(`${path.relative(ROOT, dst)} ${fs.statSync(dst).size} bytes`);
  }
} else {
  console.log("usage: --base [--n 3] | --poses --from <png> [--only pose] [--again] | --ship");
}
