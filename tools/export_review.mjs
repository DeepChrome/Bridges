/* Every authored string in one file, for a person to correct (PLAYBOOK 3.1).
 *
 * The rule the playbook sets is that no authored Russian ships without a
 * native-speaker read, and §30l records why: the level and the vocabulary of
 * the 168 scenarios are machine-checked on every build, but nothing checks
 * whether the Russian is *idiomatic*, and no machine can. This writes the
 * file that goes to the person who can.
 *
 * What it does not export: the dictionary. Glosses, example sentences and
 * paradigms come from OpenRussian, Wiktionary and Tatoeba under licence
 * (§30a, §30q) — they are someone else's work, already edited, and putting
 * 46,000 of them in front of a paid reviewer would bury the 2,213 lines that
 * are ours. What is ours is what is here.
 *
 *   node tools/export_review.mjs                 -> review/content_v1.csv
 *   node tools/export_review.mjs --speller       ...and run the free pre-pass
 *   node tools/export_review.mjs --out FILE
 *
 * The reviewer fills in two columns and sends it back: `fix` (the corrected
 * Russian or English, left empty when the row is right) and `note`.
 * `tools/import_review.mjs` applies it by id.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadScripts, NAME_KEYS } from "./check_scripts.mjs";
import { SCENARIOS } from "../core/scenarios.js";
import { LETTERS, VOWEL_PAIRS, TRAPS } from "../core/alphabet.js";
import { PEOPLE } from "../core/names.js";
import { fold } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const OUT = arg("--out", join(ROOT, "review", "content_v1.csv"));

/* Who has to read a row.
 *
 *   ru  a native Russian speaker: the line itself
 *   en  a careful English reader: a question, an option, a situation line
 *
 * Kept as a column because it is what decides the bill. The playbook budgets
 * for ~5,000 mixed rows; the rows that genuinely need a Russian native are
 * the Russian ones, and sending the rest to the same person at the same rate
 * is paying a translator to proofread English. */
const RU = "ru", EN = "en";

const rows = [];
const add = (r) => rows.push(Object.assign({ ru: "", en: "", context: "", audio: "", flags: "" }, r));

/* ------------------------------------------------- the 168 scenarios */

const scripts = loadScripts();
/* The lessons in path order, so the reviewer works from the first chapter
   forward and meets the vocabulary as a learner would. `briefs` is the same
   ordering the checker uses. */
const keys = Object.keys(scripts).sort((a, b) => {
  const [au, ai] = a.split(":"), [bu, bi] = b.split(":");
  return au === bu ? Number(ai) - Number(bi) : au.localeCompare(bu);
});

for (const key of keys) {
  const e = scripts[key];
  const [unit, index] = key.split(":");
  const where = `${e.title} (${unit} lesson ${Number(index) + 1})`;
  // The stitched track, which is what a reviewer listens to (§30l).
  const track = `native/assets/scenes/${unit}-${index}.mp3`;
  const who = Object.fromEntries((e.cast || []).map((c) => [c.id, c.ru]));

  add({ id: `script:${key}:title`, type: "situation", en: e.title, needs: EN,
        context: `The one-line situation shown above the audio. Cast: ${(e.cast || []).map((c) => c.ru).join(", ")}` });

  (e.lines || []).forEach((line, n) => {
    add({ id: `script:${key}:line:${n}`, type: "scenario_line", ru: line.ru, en: line.en, needs: RU,
          context: `${where} · ${who[line.s] || line.s} speaking, turn ${n + 1} of ${e.lines.length}`,
          audio: track });
  });

  (e.questions || []).forEach((q, n) => {
    add({ id: `script:${key}:q:${n}:ask`, type: "question", en: q.ask, needs: EN,
          context: `${where} · question ${n + 1}`, audio: track });
    (q.options || []).forEach((o, k) => {
      add({ id: `script:${key}:q:${n}:opt:${k}`, type: "option", en: o, needs: EN,
            context: `${where} · answer to "${q.ask}"${k === q.answer ? " · THIS IS THE RIGHT ONE" : ""}`,
            audio: track });
    });
  });
}

/* ------------------------------------------------------ Talk (§30f) */

for (const s of SCENARIOS) {
  add({ id: `talk:${s.id}:title`, type: "word", ru: s.title, en: s.en, needs: RU,
        context: `Talk situation, shown on the picker (unit ${s.unit})` });
  add({ id: `talk:${s.id}:prompt`, type: "ui_copy", en: s.prompt, needs: EN,
        context: `Talk: what the tutor is told to be. Never shown to the learner.` });
}

/* ------------------------------------------- the alphabet (§30j) */

for (const l of LETTERS) {
  add({ id: `alphabet:letter:${l.name}`, type: "word", ru: l.l, en: `${l.ipa} · like the ${l.like}`, needs: RU,
        context: `The letter as the Sounds screen teaches it${l.trap ? " (a Latin look-alike)" : ""}` });
}
for (const t of TRAPS) {
  add({ id: `alphabet:trap:${t.name}`, type: "ui_copy", en: t.note, needs: EN,
        context: `The warning shown on «${t.l}»` });
}
VOWEL_PAIRS.forEach((p) => {
  p.example.forEach((w, k) => {
    add({ id: `alphabet:pair:${p.hard}${p.soft}:ex:${k}`, type: "word", ru: w, en: p.gloss[k], needs: RU,
          context: `Minimal pair for ${p.hard}/${p.soft} ${p.sound}: «${p.example.join("» / «")}»` });
  });
});

/* The chapter tasks (§30o) were exported here until 2026-09-28, when they
   left the app (§30bb). */

/* ------------------------------------------ the grammar notes (§30e) */

const notes = JSON.parse(readFileSync(join(ROOT, "data", "curated", "grammar_notes.json"), "utf8")).notes || {};
for (const [unit, n] of Object.entries(notes)) {
  add({ id: `note:${unit}:title`, type: "ui_copy", en: n.title, needs: EN, context: `Grammar note for ${unit}` });
  add({ id: `note:${unit}:body`, type: "ui_copy", en: n.body, needs: EN, context: `Grammar note for ${unit}` });
  (n.examples || []).forEach(([ru, en], k) => {
    add({ id: `note:${unit}:ex:${k}`, type: "sentence", ru, en, needs: RU,
          context: `Example under the grammar note "${n.title}" (${unit})` });
  });
}

/* ------------------------------------------------- the people (§30l) */

for (const [ru, p] of Object.entries(PEOPLE)) {
  add({ id: `name:${ru}`, type: "word", ru, en: p.en, needs: RU,
        context: `A character in the scenarios. Sex on record: ${p.sex === "f" ? "female" : "male"} — it picks the voice.` });
}

/* ------------------------------------------------ the free pre-pass */

/* Yandex.Speller, free and keyless (PLAYBOOK 3.2). Two things have to be
   right or it reports nonsense:
 *
 *   - **the stress marks come off first.** Every headword and most scenario
 *     lines carry a combining acute (§23), and the speller does not know
 *     what to do with «Джа́ред» — it would flag the whole corpus. Only the
 *     accents go; ё stays ё, because whether ё was written as е is exactly
 *     what a later check looks for.
 *   - **names are not misspellings, in any case they take.** «Аня»,
 *     «Джаред», «Москва» are flagged by any dictionary, and so is «Маши»,
 *     which is what made the first run look noisier than it was. The set to
 *     compare against is `NAME_KEYS` — every declined form — and not the
 *     nominatives; check_scripts already builds it and validates the cast
 *     against core/names.js.
 */
const deaccent = (s) => String(s).normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");
const ENDPOINT = "https://speller.yandex.net/services/spellservice.json/checkTexts";
const BATCH = 40;

async function speller(list) {
  let flagged = 0, checked = 0, failed = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const body = new URLSearchParams();
    body.append("lang", "ru");
    /* 512 = ignore capitalisation. A line of dialogue starts with a capital
       and a name sits mid-sentence; neither is a spelling question. */
    body.append("options", "512");
    for (const r of chunk) body.append("text", deaccent(r.ru));
    let out;
    try {
      const res = await fetch(ENDPOINT, { method: "POST", body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      out = await res.json();
    } catch (e) {
      failed += chunk.length;
      process.stdout.write(`\n  speller failed on rows ${i}–${i + chunk.length}: ${e.message}\n`);
      continue;
    }
    chunk.forEach((r, k) => {
      checked++;
      const hits = (out[k] || []).filter((h) => !NAME_KEYS.has(fold(h.word)));
      if (!hits.length) return;
      flagged++;
      r.flags = hits.map((h) => `${h.word}?${h.s && h.s.length ? " → " + h.s.slice(0, 3).join("/") : ""}`).join("; ");
    });
    process.stdout.write(`\r  speller ${Math.min(i + BATCH, list.length)}/${list.length}`);
  }
  process.stdout.write("\n");
  return { checked, flagged, failed };
}

/* ------------------------------------------------------------- write */

const COLS = ["id", "type", "ru", "en", "context", "audio_file", "needs", "flags", "fix", "note"];
const cell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const main = async () => {
  const russian = rows.filter((r) => r.ru && /[а-яё]/i.test(r.ru));
  let pre = null;
  if (argv.includes("--speller")) {
    console.log(`pre-pass over ${russian.length} Russian rows…`);
    pre = await speller(russian);
  }

  const lines = [COLS.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.type, r.ru, r.en, r.context, r.audio, r.needs, r.flags, "", ""].map(cell).join(","));
  }
  mkdirSync(dirname(OUT), { recursive: true });
  // A BOM, because this is opened in Excel and Excel reads a UTF-8 CSV
  // without one as the system codepage — every Cyrillic cell becomes mojibake
  // and the reviewer "corrects" damage we did on the way out (§23).
  writeFileSync(OUT, "﻿" + lines.join("\r\n") + "\r\n", "utf8");

  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
  const need = { ru: rows.filter((r) => r.needs === RU).length, en: rows.filter((r) => r.needs === EN).length };
  console.log(`wrote ${OUT.replace(ROOT + "\\", "").replace(/\\/g, "/")}`);
  console.log(`  ${rows.length} rows: ` + Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(", "));
  console.log(`  a native Russian reader is needed for ${need.ru}; the other ${need.en} are English`);
  if (pre) {
    console.log(`  speller: ${pre.flagged} of ${pre.checked} Russian rows flagged`
                + (pre.failed ? `, ${pre.failed} not checked` : ""));
  }
  const dupes = rows.length - new Set(rows.map((r) => r.id)).size;
  if (dupes) { console.log(`  ${dupes} DUPLICATE IDS — import would apply the wrong row`); process.exit(1); }
};

main();
