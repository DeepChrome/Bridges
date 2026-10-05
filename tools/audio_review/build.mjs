#!/usr/bin/env node
/* The audio review site's catalogue and its sound (the owner, 2026-10-04:
 * "a standalone audio validation interface that I can use to just inspect,
 * approve, and flag any pronunciations that seem off… public facing too so I
 * can let natives access it and review… with the option to add notes").
 *
 * Every recording the app can play, with where it came from:
 *   word      a curriculum headword          (data/word_audio/manifest.json)
 *   sentence  a pool or example sentence     (the same manifest)
 *   form      a form in a word's tables      (data/word_audio/forms.json)
 *   ending    a word ending's respelling     (data/word_audio/endings.json)
 * each with the text the voice was handed (worked out from the clip's id —
 * a statement «Участвую.», the bare word, or a retry's spelling), the voice,
 * the clip id the verdict belongs to, and for a form what it is (formFlags).
 *
 * The sound is the files the app ships (native/assets/words), not the
 * purchase: a trimming fault is a fault a learner hears. Packed — ~20,000
 * files is past what the host takes one by one — into binary packs of about
 * 1.5 MB, grouped so one unit's words arrive together, with offsets in the
 * catalogue.
 *
 *   node tools/audio_review/build.mjs        -> tools/audio_review/site/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "../payload.mjs";
import { makeHydrator } from "../../core/entry.js";
import { formFlags } from "../../core/forms.js";
import { fold, bare } from "../../core/util.js";
import { clipId } from "../build_word_audio.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tools", "audio_review", "site");
const WORDS_DIR = path.join(ROOT, "native", "assets", "words");
const PACK_BYTES = 1.5e6;

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
/* `"key": require("../assets/words/file.mp3")` from a generated table. */
function table(file) {
  const src = fs.readFileSync(path.join(ROOT, "native", "src", file), "utf8");
  return new Map([...src.matchAll(/"((?:[^"\\]|\\.)+)":\s*require\("\.\.\/assets\/words\/([^"]+)"\)/g)]
    .map((m) => [JSON.parse(`"${m[1]}"`), m[2]]));
}

/* What the voice was handed, from the clip id: the renderings build_word_audio
   tries, in its order. */
function saidAs(text, id) {
  const cap = text.charAt(0).toUpperCase() + text.slice(1);
  for (const said of [cap + ".", text, cap]) if (clipId(said) === id) return said;
  return text;
}

const P = loadPayload(ROOT);
const hydrate = makeHydrator(P);
const L = P.lemmas;
const byFold = new Map();
L.forEach((l, i) => { if (l && l.u && !byFold.has(fold(l.b))) byFold.set(fold(l.b), i); });
const unitName = new Map(P.units.map((u) => [u.id, u.name]));
const unitOrder = new Map(P.units.map((u, k) => [u.id, k]));
const english = new Map();
for (const r of (P.speech && P.speech.rows) || []) english.set(fold(r[0]), [r[0], r[1]]);
for (const r of P.sent || []) if (r && !english.has(fold(r[0]))) english.set(fold(r[0]), [r[0], r[1]]);

const words = read("data/word_audio/manifest.json");
const forms = read("data/word_audio/forms.json");
const endings = read("data/word_audio/endings.json");
const VOICE = `Google Cloud TTS · ${words.voice || "Chirp3-HD"}`;

const items = [];
const wordTable = table("wordaudio.js");
for (const [key, file] of wordTable) {
  const id = words.files[key];
  if (!id) continue;
  const i = byFold.get(key);
  if (!/\s/.test(key) && i !== undefined) {
    const l = L[i];
    items.push({ kind: "word", key: `word:${key}`, text: l.w || l.b, en: l.e || "", unit: l.u, pos: l.p,
                 said: saidAs(key, id), id, file });
  } else {
    const [ru, en] = english.get(key) || [key, ""];
    items.push({ kind: "sentence", key: `sentence:${key}`, text: ru, en, unit: null, said: saidAs(bare(ru), id),
                 id, file });
  }
}
const formTable = table("formaudio.js");
const hydrated = new Map();
for (const [form, file] of formTable) {
  const id = forms.files[form];
  if (!id) continue;
  const owner = (P.index[fold(form)] || [])[0];
  const l = owner !== undefined ? (hydrated.get(owner) || hydrated.set(owner, hydrate(L[owner], owner)).get(owner)) : null;
  items.push({ kind: "form", key: `form:${form}`, text: form, of: l ? l.w || l.b : "",
               en: l ? (l.e || "").split(/[;,]/)[0] : "", flags: l ? formFlags(l, form) : [],
               unit: l ? l.u : null, said: saidAs(bare(form).normalize("NFC"), id), id, file });
}
/* The endings' clips live beside the words, under assets/endings. */
const endSrc = fs.readFileSync(path.join(ROOT, "native", "src", "endingaudio.js"), "utf8");
for (const m of endSrc.matchAll(/"([^"]+)":\s*\{\s*src:\s*require\("\.\.\/assets\/endings\/([^"]+)"\),\s*says:\s*"([^"]+)"/g)) {
  const [, k, file, says] = m;
  const e = endings[k];
  items.push({ kind: "ending", key: `ending:${k}`, text: says, en: `ending -${k}`, said: says,
               id: (e && e.id) || `ending-${k}`, unit: null, file: `../endings/${file}` });
}

/* Packs: by unit along the route, then kind, so a reviewer working through a
   unit's words fetches one or two packs. */
const rank = (it) => [unitOrder.has(it.unit) ? unitOrder.get(it.unit) : 999,
                      { word: 0, form: 1, sentence: 2, ending: 3 }[it.kind]];
items.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "packs"), { recursive: true });
let pack = 0, buf = [], size = 0;
const flush = () => {
  if (!buf.length) return;
  fs.writeFileSync(path.join(OUT, "packs", `${pack}.bin`), Buffer.concat(buf));
  pack++; buf = []; size = 0;
};
for (const it of items) {
  const bytes = fs.readFileSync(path.join(WORDS_DIR, it.file));
  if (size + bytes.length > PACK_BYTES) flush();
  it.p = [pack, size, bytes.length];
  buf.push(bytes); size += bytes.length;
  delete it.file;
}
flush();
fs.writeFileSync(path.join(OUT, "catalogue.json"), JSON.stringify({
  built: new Date().toISOString(), voice: VOICE, packs: pack, units: Object.fromEntries(unitName), items,
}));
fs.copyFileSync(path.join(ROOT, "tools", "audio_review", "index.html"), path.join(OUT, "index.html"));
const count = (k) => items.filter((it) => it.kind === k).length;
console.log(`${items.length} recordings (${count("word")} words, ${count("form")} forms, ${count("sentence")} sentences, `
            + `${count("ending")} endings) in ${pack} packs -> ${path.relative(ROOT, OUT)}`);
