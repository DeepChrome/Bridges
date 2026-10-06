#!/usr/bin/env node
/* Five questions about each video, asked after it (the owner, 2026-10-05:
 * "After the video summary, the user can continue and be asked 5 multiple
 * choice questions about the video. You have to generate these though for all
 * of the videos that are lesson content. You can also generate them for a lot
 * of the other videos too").
 *
 *   node tools/build_video_quiz.mjs                 every video without questions, units' first
 *   node tools/build_video_quiz.mjs --units         only the units' goal videos
 *   node tools/build_video_quiz.mjs --limit 20      at most this many
 *   node tools/build_video_quiz.mjs --again ID,ID   ask for these again
 *   node tools/build_video_quiz.mjs --refix         ask again for stored sets the wording rules refuse
 *   node tools/audit_video_quiz.mjs --sample 8      read them (do, after every run)
 *   node tools/build_video_quiz.mjs --dry-run       say what would be asked and what it costs
 *
 * Reads the shipped transcripts (native/assets/transcripts.json and its
 * English, line for line), so run it after build_site and rebuild after it.
 * Writes data/video_quiz.json, committed because the answers cost money (§27).
 *
 * **Mostly comprehension.** Three or four questions are about what happens or
 * is said — who, where, why, what next — the way the written scenarios' are
 * (§30l); one or two may ask about a word or a grammar point as the video uses
 * it (the owner: "a check on learning and check on understanding"). The
 * first twenty were written before that and are comprehension only. Each answer names the
 * line it is said in, so a miss can be played back where it happened.
 * Refused, and asked again: anything but five questions of four distinct
 * options, a line outside the transcript, or a right answer given away by
 * its length (§30t: 266 of 840 scenario options once were).
 *
 * Keyed by a hash of the transcript, so a re-harvested caption track is asked
 * again rather than shipped against lines it no longer has. The Anthropic key
 * is read from backend/.dev.vars and never printed. */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "video_quiz.json");
const MODEL = "claude-sonnet-5-5";
const PRICE = { in: 3, out: 15 };   // $ per million tokens
const N = 5;
const MAX_LINES = 600;              // a long video is read in its first 600 lines
const has = (n) => process.argv.includes(n);
const arg = (n) => { const k = process.argv.indexOf(n); return k > 0 ? process.argv[k + 1] : null; };

const SYSTEM = `You write listening-comprehension questions for learners of Russian who have just watched a short Russian YouTube video. You are given its transcript, line by line, with an English translation of each line.

Write exactly ${N} multiple-choice questions in plain, simple English. They are a check on understanding and on learning:
- three or four about what happens or is said in the video: who, what, where, when, why, what next, how someone feels;
- one or two about a word or a grammar point exactly as the video uses it — which Russian word she used for something, what a word in a particular line meant there, which form was used and why. Russian words may appear in these questions and their options, written in Cyrillic.

Rules:
- Never ask for a translation of a whole line.
- Every answer must be stated in the video, at one line you name. Spread the questions over the whole video, in the order things happen.
- Four options each, the right one FIRST. The three wrong ones must be plausible for this video and the same kind of thing as the answer (a place for a place, a reason for a reason), and about the same length as the answer — never make the right answer the longest or the most detailed.
- A learner who did not watch must not be able to guess the answer from common sense or general knowledge.
- The question must never contain the answer or its key word.
- Keep each question simple and direct: one thing asked, no negatives ("NOT"), no "wrongly", no tricks about what was misnamed.
- Never mention line numbers or timestamps: the learner watched a video, they did not read numbered lines. Point to a moment by what was happening ("when she shows the photo of her dad…").
- Vary how the questions are asked: not "What does she say…" five times. Ask about reasons, people, places, what happened next, feelings.
- Questions at most 18 words, options at most 10 words. No "all of the above", no "none of the above".

Answer with JSON only: {"questions":[{"q":"...","options":["right","wrong","wrong","wrong"],"line":12}, ...]}`;

function apiKey() {
  const vars = fs.readFileSync(path.join(ROOT, "backend", ".dev.vars"), "utf8");
  const m = vars.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) { console.error("no ANTHROPIC_API_KEY in backend/.dev.vars"); process.exit(2); }
  return m[1].trim();
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const transcripts = read("native/assets/transcripts.json");
const english = read("native/assets/transcripts_en.json");
const data = read("native/assets/data.json");
const videos = read("native/assets/videos.json");
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { videos: {} };

const hashOf = (lines) => createHash("sha1").update(lines.map((l) => `${l[0]}|${l[1]}`).join("\n")).digest("hex").slice(0, 16);
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const STOP = new Set(["they", "their", "that", "this", "with", "from", "what", "about", "there", "have", "were", "will", "into", "when", "where"]);

/* What is wrong with the wording of a set, or null — the rules that can be
   checked on a stored set as well as on a fresh reply (`--refix`). */
const opener = (q) => q.toLowerCase().replace(/[^a-z\s']/g, "").split(/\s+/).slice(0, 3).join(" ");
export function wording(qs) {
  for (const [k, x] of qs.entries()) {
    // The learner watched a video; numbered lines and clock times are ours.
    if (/\blines? \d+|\b\d{1,2}:\d\d\b/i.test(x.q)) return `${k}: points at a line number or a time`;
  }
  const ops = {};
  for (const x of qs) ops[opener(x.q)] = (ops[opener(x.q)] || 0) + 1;
  if (Math.max(...Object.values(ops)) >= 3) return "three questions open the same way";
  return null;
}

/* What is wrong with a reply, or null. */
export function problem(qs, nLines) {
  if (!Array.isArray(qs) || qs.length !== N) return `wanted ${N} questions`;
  const w = qs.every((x) => x && typeof x.q === "string") ? wording(qs) : null;
  if (w) return w;
  for (const [k, x] of qs.entries()) {
    if (!x || typeof x.q !== "string" || !x.q.trim()) return `${k}: no question`;
    if (words(x.q) > 22) return `${k}: question too long`;
    if (!Array.isArray(x.options) || x.options.length !== 4) return `${k}: not four options`;
    const opts = x.options.map((o) => String(o || "").trim());
    if (opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== 4) return `${k}: options not distinct`;
    if (opts.some((o) => words(o) > 12)) return `${k}: option too long`;
    if (!Number.isInteger(x.line) || x.line < 0 || x.line >= nLines) return `${k}: line out of range`;
    // The answer printed in the question: «…saying it is doner? → Doner».
    const qWords = new Set(x.q.toLowerCase().match(/[a-zа-яё']+/g) || []);
    const key = (opts[0].toLowerCase().match(/[a-zа-яё']+/g) || []).filter((w) => w.length >= 4 && !STOP.has(w));
    if (key.length && key.every((w) => qWords.has(w))) return `${k}: the question contains its answer`;
    if (/\bnot\b|wrongly/i.test(x.q)) return `${k}: a negative or trick question`;
    // The length tell: the right answer clearly the longest of the four.
    const [right, ...wrong] = opts.map((o) => o.length);
    if (right > Math.max(...wrong) * 1.4 && right - Math.max(...wrong) > 8) return `${k}: answer given away by length`;
  }
  return null;
}

async function ask(id, lines, en) {
  const body = lines.map((l, k) => `${k} [${clock(l[0])}] ${l[1]}${en[k] ? `  — ${en[k]}` : ""}`).join("\n");
  const v = videos.find((x) => x.id === id) || {};
  let nudge = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: SYSTEM,
        messages: [{ role: "user", content: `Video: ${v.title || id}\n\n${body}${nudge}` }] }),
    });
    if (!res.ok) {
      const text = await res.text();
      // A spent balance or a bad key is not fixed by asking again (§30bo).
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    const out = await res.json();
    const cost = (out.usage.input_tokens * PRICE.in + out.usage.output_tokens * PRICE.out) / 1e6;
    const raw = (out.content || []).map((c) => c.text || "").join("");
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let qs = null;
    try { qs = JSON.parse(json).questions; } catch (e) { qs = null; }
    const why = problem(qs, lines.length);
    if (!why) return { qs, cost };
    nudge = `\n\nYour last answer was refused (${why}). Follow every rule.`;
    console.log(`  ${id}: refused (${why}), asking again`);
  }
  return { qs: null, cost: 0 };
}

const unitVideos = data.units.filter((u) => u.v && u.v.id).map((u) => u.v.id);
const again = new Set((arg("--again") || "").split(",").filter(Boolean));
/* --refix: ask again for every stored set the wording rules now refuse —
   the rules grew after the first sets were written. */
if (has("--refix")) {
  for (const [id, v] of Object.entries(store.videos)) if (wording(v.questions)) again.add(id);
  console.log(`${again.size} stored sets break the wording rules and will be asked again`);
}
const order = [...new Set(unitVideos.concat(has("--units") ? [] : videos.map((v) => v.id)))]
  .filter((id) => transcripts[id] && transcripts[id].length >= 20);
const todo = order.filter((id) => {
  const lines = transcripts[id].slice(0, MAX_LINES);
  const held = store.videos[id];
  return again.has(id) || !held || held.hash !== hashOf(lines);
}).slice(0, +(arg("--limit") || Infinity));

console.log(`${order.length} videos with a transcript, ${todo.length} to ask` +
            ` (${todo.filter((id) => unitVideos.includes(id)).length} of them units' videos)`);
if (has("--dry-run")) {
  const chars = todo.reduce((n, id) => n + transcripts[id].slice(0, MAX_LINES)
    .reduce((m, l, k) => m + l[1].length + ((english[id] || [])[k] || "").length + 12, 0), 0);
  console.log(`about ${(chars / 3.2 / 1e6 * PRICE.in + todo.length * 700 * PRICE.out / 1e6).toFixed(2)} dollars`);
  process.exit(0);
}

let spent = 0, done = 0, failed = 0;
const save = () => fs.writeFileSync(OUT, JSON.stringify(store, null, 1) + "\n");
const queue = todo.slice();
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const lines = transcripts[id].slice(0, MAX_LINES);
    const en = (english[id] || []).slice(0, MAX_LINES);
    try {
      const { qs, cost } = await ask(id, lines, en);
      spent += cost;
      if (!qs) { failed++; console.log(`  ${id}: no usable questions`); continue; }
      store.videos[id] = { hash: hashOf(lines), questions: qs.map((x) => ({
        q: x.q.trim(), options: x.options.map((o) => String(o).trim()), at: lines[x.line][0] })) };
      done++;
      if (done % 10 === 0) { save(); console.log(`  ${done} done, $${spent.toFixed(2)}`); }
    } catch (e) {
      console.error(`stopped: ${e.message}`);
      queue.length = 0;
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
save();
console.log(`${done} asked, ${failed} without questions, $${spent.toFixed(2)} spent; ` +
            `${Object.keys(store.videos).length} videos have questions -> data/video_quiz.json`);
