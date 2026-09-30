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
import { createHash } from "node:crypto";
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
   going wrong somewhere in the frame (docs/cast.md). A spine's picture echoes
   its chapter's own conversations (docs/reviews/2026-09-30-content.md). Gentle throughout —
   Military, Law and Politics are played as games and neighbourhood life. */
export const SCENES = {
  core1: "Teddy and Nezha at Gena the crocodile's cosy café table with bowls of borscht and a pizza; Monka at the next table grimacing at his spoonful of borscht, the sugar bowl he swapped for the salt beside him.",
  family: "a family photo in the living room: Nezha, Yarik and Teddy posing on the sofa; Monka tries to photobomb from behind and topples off the back of the sofa.",
  food: "the family at a kitchen table with pancakes and tea; Monka, hiding under the table, has swapped the sugar for salt and is spluttering on his own stolen pancake.",
  core2: "outside a friendly town bank, Yarik and Teddy happily carrying pizza boxes; Monka looks on from the steps of a university across the street, empty-handed, his scheme backfired.",
  tech: "Teddy video-calling Belka on a tablet; Monka's remote-control drone, meant to spy on them, is tangled in his own space-suit cable.",
  home: "Nezha and Teddy arranging a cosy room with a rug and plants; Monka hiding in a cardboard box that Yarik is carrying out to the recycling.",
  core3: "the family ready to go out; Monka stuck on the roof of the house holding Teddy's little red hat, the ladder lying far away by the car.",
  city: "the family walking through a colourful town square with a fountain and shops; Monka's fake arrow sign points to a street where he himself has fallen into the fountain.",
  time: "Teddy and Yarik looking at a big wall clock and a calendar; Monka, who set all the clocks wrong, has overslept in a hammock.",
  core4: "a snowy bus stop with a big New Year tree glowing in the town behind; Monka sliding on the patch of ice he made himself, Yarik and Teddy stepping onto the bus.",
  travel: "the family at a train station with suitcases, Teddy holding the tickets; Monka's getaway scooter is on the wrong platform as the train leaves.",
  speech: "Teddy practising words with Belka, speech bubbles of hearts and stars (no letters); Monka with a megaphone that only blows his own helmet off.",
  clothes: "Nezha trying on elegant hats in a boutique while Teddy models a tiny scarf; Monka stuck in a jumper pulled over his helmet.",
  core5: "Teddy holding a bag of coins at the bank counter with Yarik; Monka offering one old rouble coin with a sly grin, the coin sparkling as if it were treasure.",
  work: "Yarik at his desk in a friendly office with Teddy visiting; Monka as a fake cleaner has mopped himself into a corner.",
  business: "Teddy and Belka running a lemonade stand with a queue of neighbours; Monka's rival stand next door has one customer, a sleepy turtle.",
  emotion: "Nezha hugging Teddy, who looks a little sad, then smiling; in the corner Monka looks on, lonely, holding a small flower behind his back.",
  core6: "a breakfast table: Belka serving porridge, Teddy happily eating; Monka pulling a face at his very salty bowl, the sugar and salt bags swapped behind him.",
  body: "the family doing morning stretches in the park; Monka copying them has tied himself in a knot.",
  animals: "Teddy at a petting farm with a goat, ducks and a pony; Monka chased by a goose.",
  science: "Teddy and Yarik with a telescope and a small rocket model at night; Monka's own rocket fizzles and he dangles from a parachute in a tree.",
  core7: "a forest path at dusk with a trail of white stones leading the wrong way; Yarik confidently leading Teddy home, Monka lost and sheepish holding a basket of mushrooms.",
  school: "Teddy at a school desk with a friendly bear teacher at the board; Monka's paper airplane has boomeranged into his own helmet.",
  art: "Teddy painting a portrait of Nezha while Yarik plays guitar; Monka, sneaking by, has walked through the wet paint and is covered in colourful paw prints.",
  nature: "the family on a picnic by a lake under a big sky with a rainbow; Monka's rain cloud machine is raining only on himself.",
  core8: "a kitchen with a slightly burnt chicken on a platter, Nezha laughing warmly with Teddy in an apron; Monka at the table peeling a mountain of potatoes.",
  sport: "Teddy playing football in a park, kicking the ball past goalkeeper Yarik while Nezha cheers; Monka's trick ball has bounced back and knocked him over.",
  politics: "a neighbourhood meeting in the park where the animals vote with raised paws for Teddy's idea of a new playground; Monka voting against, alone, holding his own banner upside down.",
  core9: "Teddy proudly wearing bright red trousers at a woodland party with Nezha and Belka; Monka in baggy trousers sitting in a muddy puddle.",
  religion: "the family painting Easter eggs and baking kulich at a festive table; Monka tries to swap an egg and it is a raw one cracked on his helmet.",
  medicine: "Teddy at a friendly doctor's with the bear doctor and a toy stethoscope, Nezha holding his paw; Monka in the waiting room with a bandage on his tail.",
  core10: "a picnic at the edge of a swamp in autumn; the family pulling Monka out of the swamp with a stick, Monka holding out a handful of berries for them.",
  law: "a neighbourhood court in the park with the old turtle as judge; Monka has been caught with a sack of stolen carrots, looking sheepish, while Teddy asks the judge to give him another chance.",
  military: "a friendly game of capture-the-flag in the park, Teddy and Yarik's team against Belka's; Monka camouflaged as a bush, the flag stuck to his own back.",
};

/* Pictures for single words, drawn with the cast (the owner, 2026-09-30:
   "make him interact with the material"): where a word *is* a character, the
   character (мама → Nezha); where a photograph cannot show a word — a verb, a
   feeling, a food a beginner meets first — a character doing it. The briefs
   live in data/curated/word_art.json ({ who, what } or { skip: true } where no
   picture can show the word), drafted by a model and read by a person; `who`
   are the sheets handed in as references. A drawing wins over a photograph on
   the word's card (native/src/pictures.js). */
const WORD_ART_FILE = path.join(ROOT, "data", "curated", "word_art.json");
export const WORDS = Object.fromEntries(Object.entries(
  fs.existsSync(WORD_ART_FILE) ? JSON.parse(fs.readFileSync(WORD_ART_FILE, "utf8")) : {})
  .filter(([, v]) => !v.skip));

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) { console.error("OPENAI_API_KEY is not set"); process.exit(2); }
  return k;
}

async function edit(prompt, refs, file, { size = "1024x1024", transparent = true, quality = "high", waited = 0 } = {}) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("background", transparent ? "transparent" : "opaque");
  form.append("output_format", "png");
  for (const r of refs) form.append("image[]", new Blob([fs.readFileSync(r)], { type: "image/png" }), path.basename(r));
  // A connection that times out is the network, not the request: try again,
  // since a batch of thirty should not die on one blip.
  let res;
  for (let tries = 1; ; tries++) {
    try {
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form,
      });
      break;
    } catch (e) {
      if (tries >= 3) throw e;
      console.log(`  network (${e.cause ? e.cause.code : e.message}); retrying`);
      await new Promise((r) => setTimeout(r, 5000 * tries));
    }
  }
  const j = await res.json();
  /* The account's rate limit counts reference images a minute (five), and it
     says how long to wait; waiting is cheaper than losing a batch to it. */
  // …but a 429 that says the credit is spent will not clear by waiting.
  if (res.status === 429 && /quota|billing/i.test(JSON.stringify(j))) {
    console.error("OpenAI credit is used up — stopping; what was drawn is kept");
    process.exit(3);
  }
  if (res.status === 429 && waited < 10) {
    const s = +((JSON.stringify(j).match(/try again in ([\d.]+)s/) || [])[1] || 15);
    await new Promise((r) => setTimeout(r, (s + 2) * 1000));
    return edit(prompt, refs, file, { size, transparent, quality, waited: waited + 1 });
  }
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
  for (const [unit, what] of Object.entries(SCENES)) {
    if (only && !only.split(",").includes(unit)) continue;
    const file = path.join(dir, `${unit}.png`);
    if (fs.existsSync(file) && !has("--again")) { console.log(`kept ${rel(file)}`); continue; }
    /* Only the characters the scene names are handed over: given every sheet,
       the model draws every character, and Belka — a supporting character who
       comes and goes (docs/cast.md) — turned up in all of them. */
    const family = /\bthe (whole )?family\b/i.test(what) ? ["teddy", "nezha", "yarik"] : [];
    const who = cast.filter((id) => family.includes(id) || new RegExp(`\\b${castById[id].en}\\b`).test(what));
    const names = who.map((id, k) => `image ${k + 1} is ${castById[id].en} (${castById[id].species})`).join("; ");
    const prompt = `A wide cartoon scene for a language-learning app, starring the characters in the reference images (${names}); draw each exactly as in their reference — same design, colours and style, and no other character from the references. The scene: ${what} Warm, friendly and funny; the family is happy and Monka's mishap is comic, never cruel. Soft simple background, the characters large and clear. ${STYLE.replace("exactly the style of the cartoon monkey in the style reference image", "exactly the style of the reference images")}`;
    await edit(prompt, who.map(sheet), file, { size: "1536x1024", transparent: false });
  }
}

async function words() {
  const dir = path.join(ART, "words");
  fs.mkdirSync(dir, { recursive: true });
  const only = arg("--only");
  // `--part 2/4`: every fourth word from the second — parallel runs without
  // handing Cyrillic through a shell (§23).
  const [pk, pn] = (arg("--part") || "0/1").split("/").map(Number);
  for (const [k, [word, { who, what }]] of Object.entries(WORDS).entries()) {
    if (only && !only.split(",").includes(word)) continue;
    if (k % pn !== pk) continue;
    const file = path.join(dir, `${word}.png`);
    if (fs.existsSync(file) && !has("--again")) { console.log(`kept ${rel(file)}`); continue; }
    const refs = who.length ? who.map((id) => need(sheet(id))) : [STYLE_REF];
    const names = who.map((id, k) => `image ${k + 1} is ${castById[id].en} (${castById[id].species})`).join("; ");
    const prompt = `A picture for a language-learning vocabulary card: ${what}.` +
      (names ? ` The characters are exactly as in the reference images (${names}) — same design, colours and style.` : "") +
      ` The subject large and centred with only the props it needs, on a perfectly flat solid pure green (#00FF00) chroma-key background filling the whole frame: no ground, no shadow, no scenery, and nothing else bright green. Friendly and funny. ${STYLE.replace("exactly the style of the cartoon monkey in the style reference image", "exactly the style of the reference images")}`;
    await edit(prompt, refs, file, { transparent: false, quality: arg("--quality") || "medium" });
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
  // Word pictures: 400 px cut-outs as WebP with alpha (a PNG of each was
  // 230 KB, 45 MB for 197 — too much to carry in the app),
  // named by a short hash so the file name is ASCII (Android resources want it).
  const wdir = path.join(ROOT, "native", "assets", "wordart");
  fs.mkdirSync(wdir, { recursive: true });
  const wlines = [];
  for (const word of Object.keys(WORDS)) {
    const src = path.join(ART, "words", `${word}.png`);
    if (!fs.existsSync(src)) continue;
    const name = "w" + createHash("sha1").update(word).digest("hex").slice(0, 10);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf",
      // The model will not paint transparency, so the words are drawn on a
      // green screen and keyed out here.
      `chromakey=0x00FF00:0.13:0.06,despill=type=green,format=rgba,scale=400:400:flags=lanczos`,
      "-c:v", "libwebp", "-quality", "82", path.join(wdir, `${name}.webp`)]);
    wlines.push(`  ${JSON.stringify(word)}: require("../assets/wordart/${name}.webp"),`);
  }
  fs.writeFileSync(path.join(ROOT, "native", "src", "wordart.js"),
    "/* Generated by tools/build_cast_art.mjs --ship. Do not edit. Words drawn\n" +
    "   with the cast, preferred over a photograph (native/src/pictures.js). */\n" +
    `export const WORD_ART = {\n${wlines.join("\n")}\n};\n`);
  console.log(`${wlines.length} word pictures -> native/src/wordart.js`);

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
else if (has("--words")) await words();
else if (has("--ship")) ship();
else console.log("usage: --sheet <id> [--n 3] | --poses [--again] | --scenes [--only a,b] [--again] | --words [--only a,b] [--quality high] | --ship");
