#!/usr/bin/env node
/* The cast, drawn by an image model (2026-09-30).
 *
 * The owner: "Yuri is not as clean as he should be… If you can use another
 * picture generating AI that can work too" — and then, having seen the first
 * drawings: "Teddy is the main character… show him playing sports" for the
 * sports unit, with his family and the monkey. Who everyone is lives in
 * core/cast.js; this tool only draws them.
 *
 * Three steps, each buying only what is not already on disk:
 *
 *   node tools/build_cast_art.mjs --sheet teddy [--n 3]     candidates for a character
 *   node tools/build_cast_art.mjs --poses                   Teddy's five guide poses
 *   node tools/build_cast_art.mjs --scenes [--only sport]   one picture per unit
 *   node tools/build_cast_art.mjs --ship                    resize into the app
 *
 * **Consistency comes from references, not from prompts.** Every drawing is an
 * edit with images handed in: the style reference (the first monkey the owner
 * approved) for a character sheet, and the chosen sheets of everyone in the
 * frame for a pose or a scene. A prompt alone draws a different dog each time.
 * Teddy's sheet is also given the real dog's photographs (data/cast_art/ref,
 * cropped to him alone).
 *
 * A chosen sheet is copied by hand to data/cast_art/<id>.png — choosing is by
 * eye and the tool does not pretend otherwise. What is bought is committed
 * (data/cast_art/), because it cost money (§27). The key is read from
 * OPENAI_API_KEY in the environment and never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { castById } from "../core/cast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = path.join(ROOT, "data", "cast_art");
const STYLE_REF = path.join(ART, "yuri_draft", "base-2.png");
const MODEL = "gpt-image-2";
const POSES = ["idle", "wave", "point", "think", "cheer"];
const GUIDE_PX = 324;       // three times the largest size the guide is drawn (108 dp)
const SCENE_W = 900;        // a phone's width at 2.3x; the scene is a banner, not a poster
const HALO = 96;            // alpha below this is the model's haze, not the drawing
const FACE_PX = 192;        // an avatar is drawn at most 64 dp
const FACE_BOX = {
  teddy: "720:720:100:0", nezha: "330:330:350:120", yarik: "330:330:300:10",
  monka: "440:440:285:30", belka: "480:480:160:40",
};

const STYLE =
  "Modern flat vector illustration for a polished mobile language-learning app: clean confident shapes, " +
  "soft simple shading, the finish of a professionally designed app mascot, exactly the style of the " +
  "cartoon monkey in the style reference image. No text, no letters, no border.";

const POSE_TEXT = {
  idle: "Standing relaxed, a gentle happy smile.",
  wave: "Waving hello with one paw raised high, a warm open smile.",
  point: "Pointing to his side with one paw, as if showing the viewer something, an encouraging look.",
  think: "Thinking: one paw on his chin, eyes looking up, puzzled but cheerful.",
  cheer: "Celebrating: both paws raised in triumph, eyes closed with joy, a big smile.",
};

/* One picture a unit: the family doing the unit's subject, and Monka's scheme
   going wrong somewhere in the frame (docs/cast.md). Gentle throughout —
   Military, Law and Politics are played as games and neighbourhood life. */
export const SCENES = {
  core1: "Teddy meeting the viewer for the first time, waving, with Nezha and Yarik behind him at the front door of their cosy home; Monka peeks from a bush, and the bush is full of bees.",
  family: "a family photo in the living room: Nezha, Yarik and Teddy posing on the sofa; Monka tries to photobomb from behind and topples off the back of the sofa.",
  food: "the family at a kitchen table with pancakes and tea; Monka, hiding under the table, has swapped the sugar for salt and is spluttering on his own stolen pancake.",
  core2: "Teddy and Yarik walking along a small town street with a bakery and a bus stop; Monka disguised as a lamp post, a pigeon sitting on his helmet.",
  tech: "Teddy video-calling Belka on a tablet; Monka's remote-control drone, meant to spy on them, is tangled in his own space-suit cable.",
  home: "Nezha and Teddy arranging a cosy room with a rug and plants; Monka hiding in a cardboard box that Yarik is carrying out to the recycling.",
  core3: "Teddy reading a picture book about little words with Nezha on a window seat; Monka outside the window, fogging the glass as he spies.",
  city: "the family walking through a colourful town square with a fountain and shops; Monka's fake arrow sign points to a street where he himself has fallen into the fountain.",
  time: "Teddy and Yarik looking at a big wall clock and a calendar; Monka, who set all the clocks wrong, has overslept in a hammock.",
  core4: "winter: the family decorating a New Year tree with gifts under it; Monka disguised as a present, the ribbon tied so tight he cannot move.",
  travel: "the family at a train station with suitcases, Teddy holding the tickets; Monka's getaway scooter is on the wrong platform as the train leaves.",
  speech: "Teddy practising words with Belka, speech bubbles of hearts and stars (no letters); Monka with a megaphone that only blows his own helmet off.",
  clothes: "Nezha trying on elegant hats in a boutique while Teddy models a tiny scarf; Monka stuck in a jumper pulled over his helmet.",
  core5: "Teddy counting coins into a piggy bank with Yarik; Monka's fishing line for the coins has hooked his own tail.",
  work: "Yarik at his desk in a friendly office with Teddy visiting; Monka as a fake cleaner has mopped himself into a corner.",
  business: "Teddy and Belka running a lemonade stand with a queue of neighbours; Monka's rival stand next door has one customer, a sleepy turtle.",
  emotion: "Nezha hugging Teddy, who looks a little sad, then smiling; in the corner Monka looks on, lonely, holding a small flower behind his back.",
  core6: "a before-and-after of the garden: Teddy and Yarik planting seeds, then sunflowers; Monka's seeds grew into a giant cactus next to him.",
  body: "the family doing morning stretches in the park; Monka copying them has tied himself in a knot.",
  animals: "Teddy at a petting farm with a goat, ducks and a pony; Monka chased by a goose.",
  science: "Teddy and Yarik with a telescope and a small rocket model at night; Monka's own rocket fizzles and he dangles from a parachute in a tree.",
  core7: "a stormy night: Teddy a little scared under a blanket fort with Nezha and a torch, being brave; Monka outside in a ghost sheet, himself scared by a hooting owl.",
  school: "Teddy at a school desk with a friendly bear teacher at the board; Monka's paper airplane has boomeranged into his own helmet.",
  art: "Teddy painting a portrait of Nezha while Yarik plays guitar; Monka, sneaking by, has walked through the wet paint and is covered in colourful paw prints.",
  nature: "the family on a picnic by a lake under a big sky with a rainbow; Monka's rain cloud machine is raining only on himself.",
  core8: "a birthday party in the garden with a big cake, balloons and Belka; Monka's plan to steal the cake has ended with his face in it.",
  sport: "Teddy playing football in a park, kicking the ball past goalkeeper Yarik while Nezha cheers; Monka's trick ball has bounced back and knocked him over.",
  politics: "a neighbourhood meeting in the park where the animals vote with raised paws for Teddy's idea of a new playground; Monka voting against, alone, holding his own banner upside down.",
  core9: "a little fashion show on the patio with Nezha, Belka and Teddy in stylish outfits; Monka's attempt to trip them with a banana peel has sent him sliding off the runway.",
  religion: "the family painting Easter eggs and baking kulich at a festive table; Monka tries to swap an egg and it is a raw one cracked on his helmet.",
  medicine: "Teddy at a friendly doctor's with the bear doctor and a toy stethoscope, Nezha holding his paw; Monka in the waiting room with a bandage on his tail.",
  core10: "an autumn forest walk with colourful leaves, the family collecting mushrooms; Monka buried to his helmet in a leaf pile he meant as a trap.",
  law: "a neighbourhood court in the park with the old turtle as judge; Monka has been caught with a sack of stolen carrots, looking sheepish, while Teddy asks the judge to give him another chance.",
  military: "a friendly game of capture-the-flag in the park, Teddy and Yarik's team against Belka's; Monka camouflaged as a bush, the flag stuck to his own back.",
};

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) { console.error("OPENAI_API_KEY is not set"); process.exit(2); }
  return k;
}

async function edit(prompt, refs, file, { size = "1024x1024", transparent = true } = {}) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", "high");
  form.append("background", transparent ? "transparent" : "opaque");
  form.append("output_format", "png");
  for (const r of refs) form.append("image[]", new Blob([fs.readFileSync(r)], { type: "image/png" }), path.basename(r));
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, "base64"));
  const u = j.usage || {};
  console.log(`bought ${path.relative(ROOT, file)}  out ${u.output_tokens || "?"} tokens`);
}

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const has = (name) => process.argv.includes(name);
const sheet = (id) => path.join(ART, `${id}.png`);
const need = (f) => { if (!fs.existsSync(f)) { console.error(`missing ${path.relative(ROOT, f)} — choose a sheet first`); process.exit(1); } return f; };
const rel = (f) => path.relative(ROOT, f);

async function sheets(id, n) {
  const c = castById[id];
  if (!c || !c.look) { console.error(`no character "${id}" with a look in core/cast.js`); process.exit(2); }
  const dir = path.join(ART, "sheets");
  fs.mkdirSync(dir, { recursive: true });
  const refs = [STYLE_REF];
  let who = `${c.en}, ${c.look}.`;
  if (id === "teddy") {
    const photos = fs.readdirSync(path.join(ART, "ref")).filter((f) => f.startsWith("teddy")).map((f) => path.join(ART, "ref", f));
    refs.push(...photos);
    who += " He is a cartoon of the real dog in the photographs: match his face, eyes, ear shape and colouring as closely as a cute cartoon can.";
  }
  if (id === "monka") who += " He is the same monkey as in the style reference image, now wearing the space suit.";
  for (let k = 1; k <= n; k++) {
    const file = path.join(dir, `${id}-${k}.png`);
    if (fs.existsSync(file)) { console.log(`kept ${rel(file)}`); continue; }
    await edit(`A character sheet drawing of ${who} Full body, standing, facing the viewer, centred, with generous empty space around. Plain transparent background, no ground, no shadow. ${STYLE}`, refs, file);
  }
}

async function poses() {
  const base = need(sheet("teddy"));
  const dir = path.join(ART, "guide");
  fs.mkdirSync(dir, { recursive: true });
  for (const pose of POSES) {
    const file = path.join(dir, `${pose}.png`);
    if (fs.existsSync(file) && !has("--again")) { console.log(`kept ${rel(file)}`); continue; }
    await edit(`The same dog character as in the image — identical design, colours, proportions and drawing style. ${POSE_TEXT[pose]} Full body, centred, generous empty space around, plain transparent background, no ground, no shadow. ${STYLE}`, [base], file);
  }
}

async function scenes() {
  const cast = ["teddy", "nezha", "yarik", "monka", "belka"].filter((id) => fs.existsSync(sheet(id)));
  if (!cast.includes("teddy")) need(sheet("teddy"));
  const dir = path.join(ART, "scenes");
  fs.mkdirSync(dir, { recursive: true });
  const only = arg("--only");
  const names = cast.map((id, k) => `image ${k + 1} is ${castById[id].en} (${castById[id].species})`).join("; ");
  for (const [unit, what] of Object.entries(SCENES)) {
    if (only && !only.split(",").includes(unit)) continue;
    const file = path.join(dir, `${unit}.png`);
    if (fs.existsSync(file) && !has("--again")) { console.log(`kept ${rel(file)}`); continue; }
    const prompt = `A wide cartoon scene for a language-learning app, starring the characters in the reference images (${names}); draw each exactly as in their reference — same design, colours and style. The scene: ${what} Warm, friendly and funny; the family is happy and Monka's mishap is comic, never cruel. Soft simple background, the characters large and clear. ${STYLE.replace("exactly the style of the cartoon monkey in the style reference image", "exactly the style of the reference images")}`;
    await edit(prompt, cast.map(sheet), file, { size: "1536x1024", transparent: false });
  }
}

function ship() {
  const guide = path.join(ROOT, "native", "assets", "guide");
  fs.mkdirSync(guide, { recursive: true });
  for (const pose of POSES) {
    const src = need(path.join(ART, "guide", `${pose}.png`));
    const dst = path.join(guide, `${pose}.png`);
    /* The model paints a wide, faint halo into the alpha channel: invisible on
       white, an orange glow on the dark theme. Alpha under HALO goes to zero
       and the rest is stretched back to full, so the edge stays soft. */
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src,
      "-vf", `format=rgba,lut=a='if(lt(val,${HALO}),0,min(255,(val-${HALO})*255/(255-${HALO})))',` +
             `scale=${GUIDE_PX}:${GUIDE_PX}:flags=lanczos`, "-pix_fmt", "rgba", dst]);
    console.log(`${rel(dst)} ${fs.statSync(dst).size} bytes`);
  }
  /* The cast's avatar faces, cut from the chosen sheets. The boxes are
     crop=w:h:x:y on the 1024 px sheet, chosen by eye (a re-drawn sheet needs
     them re-read). Flattened onto the avatar's own background colour, since
     the avatar is drawn as a filled circle. */
  const faces = path.join(ROOT, "native", "assets", "faces");
  fs.mkdirSync(faces, { recursive: true });
  const faceLines = [];
  for (const [id, box] of Object.entries(FACE_BOX)) {
    const src = path.join(ART, `${id}.png`);
    if (!fs.existsSync(src)) continue;
    const av = castById[id] ? castById[id].avatar : id;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src,
      "-vf", `format=rgba,lut=a='if(lt(val,${HALO}),0,min(255,(val-${HALO})*255/(255-${HALO})))',crop=${box},scale=${FACE_PX}:${FACE_PX}:flags=lanczos`,
      "-pix_fmt", "rgba", path.join(faces, `${av}.png`)]);
    faceLines.push(`  ${JSON.stringify(av)}: require("../assets/faces/${av}.png"),`);
  }
  fs.writeFileSync(path.join(ROOT, "native", "src", "castfaces.js"),
    "/* Generated by tools/build_cast_art.mjs --ship. Do not edit. The cast's\n" +
    "   avatars, keyed by avatar id, drawn instead of the flat SVG face. */\n" +
    `export const CAST_FACES = {\n${faceLines.join("\n")}\n};\n`);
  console.log(`${faceLines.length} avatar faces -> native/src/castfaces.js`);

  const out = path.join(ROOT, "native", "assets", "episodes");
  fs.mkdirSync(out, { recursive: true });
  const shipped = [];
  for (const unit of Object.keys(SCENES)) {
    const src = path.join(ART, "scenes", `${unit}.png`);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(out, `${unit}.jpg`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `scale=${SCENE_W}:-2:flags=lanczos`, "-q:v", "4", dst]);
    shipped.push(unit);
  }
  const lines = shipped.map((u) => `  ${JSON.stringify(u)}: require("../assets/episodes/${u}.jpg"),`);
  fs.writeFileSync(path.join(ROOT, "native", "src", "sceneart.js"),
    "/* Generated by tools/build_cast_art.mjs --ship. Do not edit. One picture a\n" +
    "   unit: the cast doing the unit's subject (docs/cast.md). */\n" +
    `export const SCENE_ART = {\n${lines.join("\n")}\n};\n`);
  console.log(`${shipped.length} of ${Object.keys(SCENES).length} scenes shipped -> native/src/sceneart.js`);
}

if (has("--sheet")) await sheets(arg("--sheet"), +(arg("--n") || 3));
else if (has("--poses")) await poses();
else if (has("--scenes")) await scenes();
else if (has("--ship")) ship();
else console.log("usage: --sheet <id> [--n 3] | --poses [--again] | --scenes [--only a,b] [--again] | --ship");
