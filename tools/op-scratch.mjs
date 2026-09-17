import { loadPayload } from "./payload.mjs";
import { makeQuestions, DRILL_TYPES, SPEECH_MIX, FORM_MIX } from "../core/questions.js";
const data = loadPayload("C:/Users/jared/projects/russian-blocks");
const STAGES = (() => { const out = []; data.path.forEach((p) => {
  if (p.c === 0 || !out.length) out.push({ core: data.units[p.u], branches: [] });
  else out[out.length - 1].branches.push(data.units[p.u]); }); return out; })();
const Q = makeQuestions({ L: data.lemmas, IX: data.index, UN: data.units, STAGES,
  lessonWords: (u, i) => u.w.slice(i * 7, i * 7 + 7),
  lessonCount: (u) => Math.ceil(u.w.length / 7),
  SPEECH: data.speech, SCRIPTS: data.scripts || {}, hasVoice: () => true });
console.log("SPEECH_MIX = " + JSON.stringify(SPEECH_MIX));
console.log("FORM_MIX = " + JSON.stringify(FORM_MIX));
for (const d of DRILL_TYPES) { const at = Q.drillOpensAt(d.id);
  console.log("  drill " + d.id.padEnd(14) + (at < 0 ? "from the start" : "chapter " + (at + 1))); }
