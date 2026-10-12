/* Every unit along the route: its words in their groups, lesson by lesson,
 * with each word's class and first meaning — the course's vocabulary as a
 * table of contents, for reading the groupings and the pace end to end.
 *
 *   node tools/dump_units.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { lessonSize, lessonWordsOf, lessonCountOf } from "../core/questions.js";
import { firstSense } from "../core/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = loadPayload(ROOT);
const L = data.lemmas;
const STAGES = [];
data.path.forEach((p) => {
  if (p.c === 0 || !STAGES.length) STAGES.push({ core: data.units[p.u], branches: [], title: p.ch || "" });
  else STAGES[STAGES.length - 1].branches.push(data.units[p.u]);
});
const w = (i) => `${L[i].w} [${L[i].p || "?"}] ${firstSense(L[i]) || ""}`;
STAGES.forEach((s, si) => {
  console.log(`\n################ CHAPTER ${si + 1}: ${s.title}`);
  for (const u of [s.core].concat(s.branches)) {
    const size = lessonSize(si);
    const n = lessonCountOf(u, size);
    const kind = u.id === s.core.id ? "SPINE" : u.kind === "optional" || u.opt ? "OPTIONAL QUEST" : "QUEST";
    console.log(`\n== ${kind} ${u.id} — ${u.name}  (${u.w.length} words, ${n} lessons)`);
    const groupOf = {};
    (u.gr || []).forEach(([name, , words], gi) => (words || []).forEach((wi) => (groupOf[wi] = name || `group${gi}`)));
    for (let i = 0; i < n; i++) {
      const words = lessonWordsOf(u, i, size);
      const byGroup = {};
      words.forEach((wi) => { const g = groupOf[wi] || "(ungrouped)"; (byGroup[g] ||= []).push(w(wi)); });
      console.log(`  -- Lesson ${i + 1}/${n} (${words.length} words)`);
      for (const [g, ws] of Object.entries(byGroup)) console.log(`     ${g}: ${ws.join(" · ")}`);
    }
  }
});
